-- 0006 · Nombres de áreas con procedencia y registro de importaciones (docs/gis.md §3, docs/data-model.md).
-- Las áreas importadas se identifican por su ID externo (p. ej. Overture), NUNCA por el nombre.

-- Una entidad de Overture es UNA fila: la importación es idempotente por ID.
create unique index geographic_areas_overture_id_uq
  on public.geographic_areas ((external_ref ->> 'overture_id'))
  where external_ref ? 'overture_id';

-- Nombres de un área. `locale` NULL = nombre original (local) de la fuente. Un nombre por idioma solo existe si
-- la FUENTE (o una persona, `editorial`) lo aporta: no se traducen topónimos automáticamente.
create table public.geographic_area_names (
  id                uuid primary key default gen_random_uuid(),
  area_id           uuid not null references public.geographic_areas (id) on delete cascade,
  locale            text references public.supported_locales (code),
  name              text not null check (char_length(name) between 1 and 300 and name !~ '[[:cntrl:]]'),
  provenance        text not null check (provenance in ('source_local', 'source_common', 'editorial')),
  source_version_id uuid references public.source_versions (id) on delete restrict,
  created_at        timestamptz not null default now(),
  constraint names_provenance_vs_locale check (
    (provenance = 'source_local' and locale is null)
    or (provenance = 'source_common' and locale is not null)
    or provenance = 'editorial'
  ),
  constraint source_names_need_source check (provenance = 'editorial' or source_version_id is not null)
);
create unique index geographic_area_names_local_uq on public.geographic_area_names (area_id)
  where provenance = 'source_local';
create unique index geographic_area_names_per_locale_uq on public.geographic_area_names (area_id, locale, provenance)
  where locale is not null;

-- Cada importación aplicada o repetida (sin cambios) queda registrada: qué fuente/versión, con qué hash y qué pasó.
create table public.import_runs (
  id                uuid primary key default gen_random_uuid(),
  dataset           text not null check (dataset ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  source_version_id uuid not null references public.source_versions (id) on delete restrict,
  content_sha256    text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  status            text not null check (status in ('applied', 'noop')),
  counts            jsonb not null,
  quarantine_count  int not null check (quarantine_count >= 0),
  published         boolean not null default false,
  created_at        timestamptz not null default now()
);
create index import_runs_dataset on public.import_runs (dataset, created_at desc);

create trigger geographic_area_names_audit after insert or update or delete on public.geographic_area_names
  for each row execute function app.audit_row();
create trigger import_runs_audit after insert or update or delete on public.import_runs
  for each row execute function app.audit_row();

-- Privilegios y RLS (una prueba comprueba que ninguna tabla de `public` quede sin RLS).
revoke all on public.geographic_area_names, public.import_runs from anon, authenticated;
grant select on public.geographic_area_names to anon, authenticated;
grant insert, update, delete on public.geographic_area_names to authenticated;
grant select on public.import_runs to authenticated;

alter table public.geographic_area_names enable row level security;
alter table public.import_runs            enable row level security;

-- El nombre es visible si lo es el área (la subconsulta se evalúa con la RLS de `geographic_areas`).
create policy geographic_area_names_read on public.geographic_area_names for select to anon, authenticated
  using (exists (select 1 from public.geographic_areas a where a.id = area_id));
create policy geographic_area_names_write on public.geographic_area_names for all to authenticated
  using (
    app.is_admin()
    or (app.is_editor() and provenance = 'editorial'
        and exists (select 1 from public.geographic_areas a where a.id = area_id and a.source_class = 'editorial'))
  )
  with check (
    app.is_admin()
    or (app.is_editor() and provenance = 'editorial'
        and exists (select 1 from public.geographic_areas a where a.id = area_id and a.source_class = 'editorial'))
  );

create policy import_runs_read on public.import_runs for select to authenticated using (app.is_staff());
