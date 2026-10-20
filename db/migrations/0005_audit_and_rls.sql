-- 0005 · Auditoría inmutable, privilegios mínimos y RLS en TODAS las tablas (docs/data-model.md, docs/security.md).
-- La autorización de aplicación se hace además en servidor; RLS es la última barrera.

-- ---------------------------------------------------------------------------------------------------
-- Auditoría: quién, qué, cuándo, antes y después. Solo inserción, también para el propietario.
-- ---------------------------------------------------------------------------------------------------
create table public.audit_events (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,
  action       text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  entity_table text not null,
  entity_id    text,
  before       jsonb,
  after        jsonb
);
create index audit_events_entity on public.audit_events (entity_table, entity_id, at desc);

create function app.audit_row() returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  b jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'geom' - 'extent' end;
  a jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'geom' - 'extent' end;
  r jsonb := coalesce(a, b);
  eid text;
begin
  eid := case tg_table_name
    when 'destination_translations' then (r ->> 'destination_id') || ':' || (r ->> 'locale')
    when 'destination_slugs'        then (r ->> 'locale') || ':' || (r ->> 'slug')
    when 'destination_areas'        then (r ->> 'destination_id') || ':' || (r ->> 'area_id') || ':' || (r ->> 'role')
    when 'user_roles'               then (r ->> 'user_id') || ':' || (r ->> 'role')
    else r ->> 'id'
  end;
  insert into public.audit_events (actor_id, action, entity_table, entity_id, before, after)
  values (app.current_user_id(), tg_op, tg_table_name, eid, b, a);
  return null;
end
$$;

create function app.audit_immutable() returns trigger
  language plpgsql
as $$
begin
  raise exception 'audit_events es de solo inserción' using errcode = 'insufficient_privilege';
end
$$;
create trigger audit_events_no_change before update or delete on public.audit_events
  for each row execute function app.audit_immutable();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function app.audit_immutable();

do $$
declare
  t text;
begin
  foreach t in array array[
    'data_sources', 'source_versions', 'geographic_areas', 'geometry_versions', 'geographic_relations',
    'destinations', 'destination_areas', 'destination_slugs', 'destination_translations',
    'visual_coverage', 'rights_policies', 'user_roles', 'profiles'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()',
      t || '_audit', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------------------------------
-- Privilegios mínimos: nada por defecto; después lo estrictamente necesario. RLS decide las filas.
-- ---------------------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on
  public.supported_locales, public.data_sources, public.source_versions, public.geographic_areas,
  public.geometry_versions, public.geographic_relations, public.destinations, public.destination_areas,
  public.destination_slugs, public.destination_translations, public.visual_coverage,
  public.current_visual_coverage
to anon, authenticated;

grant insert, update, delete on
  public.supported_locales, public.data_sources, public.source_versions, public.geographic_areas,
  public.geometry_versions, public.geographic_relations, public.destinations, public.destination_areas,
  public.destination_slugs, public.destination_translations, public.visual_coverage
to authenticated;

grant select, insert, update, delete on public.profiles, public.user_roles, public.rights_policies to authenticated;
grant select on public.audit_events to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- RLS en todas las tablas (una prueba de integración verifica que ninguna quede sin ella).
-- ---------------------------------------------------------------------------------------------------
alter table public.supported_locales        enable row level security;
alter table public.profiles                 enable row level security;
alter table public.user_roles               enable row level security;
alter table public.data_sources             enable row level security;
alter table public.source_versions          enable row level security;
alter table public.geographic_areas         enable row level security;
alter table public.geometry_versions        enable row level security;
alter table public.geographic_relations     enable row level security;
alter table public.destinations             enable row level security;
alter table public.destination_areas        enable row level security;
alter table public.destination_slugs        enable row level security;
alter table public.destination_translations enable row level security;
alter table public.visual_coverage          enable row level security;
alter table public.rights_policies          enable row level security;
alter table public.audit_events             enable row level security;

-- Idiomas: lectura pública; escritura solo admin.
create policy supported_locales_read on public.supported_locales for select to anon, authenticated using (true);
create policy supported_locales_admin on public.supported_locales for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Perfiles: cada persona ve y edita el suyo; el personal ve todos; admin gestiona.
create policy profiles_read on public.profiles for select to authenticated
  using (id = app.current_user_id() or app.is_staff());
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = app.current_user_id());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = app.current_user_id()) with check (id = app.current_user_id());
create policy profiles_admin on public.profiles for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Roles: NADIE puede editar sus propios privilegios; solo un admin los concede.
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = app.current_user_id() or app.is_admin());
create policy user_roles_admin on public.user_roles for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Fuentes y versiones: lectura pública (atribución); escritura editorial.
create policy data_sources_read on public.data_sources for select to anon, authenticated using (true);
create policy data_sources_write on public.data_sources for all to authenticated
  using (app.is_editor()) with check (app.is_editor());
create policy source_versions_read on public.source_versions for select to anon, authenticated using (true);
create policy source_versions_write on public.source_versions for all to authenticated
  using (app.is_editor()) with check (app.is_editor());

-- Áreas: públicas, o vinculadas a un destino publicado, o el personal. Un editor solo crea áreas
-- EDITORIALES (lo oficial u OSM entra por el pipeline/admin): una geometría editorial nunca se hace pasar por oficial.
create policy geographic_areas_read on public.geographic_areas for select to anon, authenticated using (
  is_public
  or app.is_staff()
  or exists (
    select 1 from public.destination_areas da
    join public.destinations d on d.id = da.destination_id
    where da.area_id = geographic_areas.id and d.status = 'published')
);
create policy geographic_areas_write on public.geographic_areas for insert to authenticated
  with check (app.is_admin() or (app.is_editor() and source_class = 'editorial'));
create policy geographic_areas_update on public.geographic_areas for update to authenticated
  using (app.is_admin() or (app.is_editor() and source_class = 'editorial'))
  with check (app.is_admin() or (app.is_editor() and source_class = 'editorial'));
create policy geographic_areas_delete on public.geographic_areas for delete to authenticated using (app.is_admin());

-- Geometrías: el público solo ve la versión VIGENTE de un área visible; el personal ve todas.
create policy geometry_versions_read on public.geometry_versions for select to anon, authenticated using (
  app.is_staff()
  or (is_current and exists (select 1 from public.geographic_areas a where a.id = geometry_versions.area_id))
);
create policy geometry_versions_write on public.geometry_versions for insert to authenticated
  with check (
    app.is_admin()
    or (app.is_editor() and exists (
      select 1 from public.geographic_areas a where a.id = area_id and a.source_class = 'editorial'))
  );
create policy geometry_versions_update on public.geometry_versions for update to authenticated
  using (app.is_admin() or app.is_editor()) with check (
    app.is_admin()
    or (app.is_editor() and exists (
      select 1 from public.geographic_areas a where a.id = area_id and a.source_class = 'editorial'))
  );
create policy geometry_versions_delete on public.geometry_versions for delete to authenticated using (app.is_admin());

create policy geographic_relations_read on public.geographic_relations for select to anon, authenticated using (
  app.is_staff()
  or (exists (select 1 from public.geographic_areas a where a.id = subject_id)
      and exists (select 1 from public.geographic_areas a where a.id = object_id))
);
create policy geographic_relations_write on public.geographic_relations for all to authenticated
  using (app.is_editor()) with check (app.is_editor());

-- Destinos: el público solo ve los publicados. Un editor NO publica; publica un revisor o un admin.
create policy destinations_read on public.destinations for select to anon, authenticated
  using (status = 'published' or app.is_staff());
create policy destinations_editor_insert on public.destinations for insert to authenticated
  with check (app.is_editor() and status <> 'published');
create policy destinations_editor_update on public.destinations for update to authenticated
  using (app.is_editor()) with check (status <> 'published' or app.is_reviewer());
create policy destinations_reviewer_update on public.destinations for update to authenticated
  using (app.is_reviewer()) with check (app.is_reviewer());
create policy destinations_admin_delete on public.destinations for delete to authenticated using (app.is_admin());

create policy destination_areas_read on public.destination_areas for select to anon, authenticated using (
  app.is_staff() or exists (select 1 from public.destinations d where d.id = destination_id));
create policy destination_areas_write on public.destination_areas for insert to authenticated
  with check (app.is_editor());
create policy destination_areas_update on public.destination_areas for update to authenticated
  using (app.is_editor()) with check (app.is_editor());
create policy destination_areas_delete on public.destination_areas for delete to authenticated using (app.is_admin());

create policy destination_slugs_read on public.destination_slugs for select to anon, authenticated using (
  app.is_staff() or exists (select 1 from public.destinations d where d.id = destination_id));
create policy destination_slugs_write on public.destination_slugs for insert to authenticated
  with check (app.is_editor());
create policy destination_slugs_update on public.destination_slugs for update to authenticated
  using (app.is_editor()) with check (app.is_editor());
-- Los slugs NO se borran (alias): solo un admin, de forma excepcional.
create policy destination_slugs_delete on public.destination_slugs for delete to authenticated using (app.is_admin());

-- Traducciones: el público solo ve las PUBLICADAS de destinos publicados.
create policy destination_translations_read on public.destination_translations for select to anon, authenticated using (
  app.is_staff()
  or (translation_status = 'published'
      and exists (select 1 from public.destinations d where d.id = destination_id))
);
-- Un editor crea/edita borradores y traducciones automáticas, NUNCA revisadas ni con revisor.
create policy destination_translations_editor_insert on public.destination_translations for insert to authenticated
  with check (
    app.is_editor()
    and translation_status in ('draft', 'machine_translated')
    and reviewed_by is null and reviewed_at is null
  );
create policy destination_translations_editor_update on public.destination_translations for update to authenticated
  using (app.is_editor() and translation_status <> 'published')
  with check (
    app.is_editor()
    and translation_status in ('draft', 'machine_translated', 'outdated')
    and reviewed_by is null and reviewed_at is null
  );
-- Un revisor solo revisa/publica COMO SÍ MISMO (no puede firmar con el nombre de otra persona).
create policy destination_translations_reviewer_update on public.destination_translations for update to authenticated
  using (app.is_reviewer())
  with check (
    app.is_reviewer()
    and translation_status in ('reviewed', 'published')
    and reviewed_by = app.current_user_id()
  );
create policy destination_translations_admin on public.destination_translations for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy visual_coverage_read on public.visual_coverage for select to anon, authenticated using (
  app.is_staff() or exists (select 1 from public.destinations d where d.id = destination_id));
create policy visual_coverage_write on public.visual_coverage for all to authenticated
  using (app.is_editor()) with check (app.is_editor());

-- Derechos: solo el personal los lee; solo un admin los escribe (un `verified` exige evidencia y revisor).
create policy rights_policies_read on public.rights_policies for select to authenticated using (app.is_staff());
create policy rights_policies_admin on public.rights_policies for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Auditoría: solo la lee un admin; nadie escribe (los triggers SECURITY DEFINER insertan).
create policy audit_events_read on public.audit_events for select to authenticated using (app.is_admin());
