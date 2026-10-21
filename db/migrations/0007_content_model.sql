-- 0007 · Modelo de contenido de la ficha: afirmaciones por campo con evidencia, vigencia y verificación humana
-- (ADR-0019, docs/data-model.md §content, docs/PROMPT-MAESTRO.md §12).
--
-- Principios:
--  · NO existe un booleano «verificado»: el estado público se DERIVA de evidencia y caducidad.
--  · Una afirmación verificada es INMUTABLE; corregirla es crear una versión nueva que reemplaza a la anterior.
--  · Las puertas de verificación se imponen AQUÍ (disparador) y se repiten en el dominio (src/domains/content/gates.ts);
--    una prueba de integración comprueba que ambas coinciden código por código.
--  · El público (rol `anon`) solo ve afirmaciones verificadas, vigentes y de destinos publicados, y NUNCA identidades
--    de personas ni notas internas (privilegios por columna).
--  · Los umbrales de `content_fields` son propuestas de ingeniería a validar con la persona responsable (backlog F4-1).

create type public.content_source_class as enum (
  'official', 'institutional', 'scientific', 'editorial_review', 'community', 'commercial');
create type public.assertion_status as enum (
  'draft', 'in_review', 'verified', 'disputed', 'rejected', 'retracted');
create type public.content_confidence as enum ('low', 'medium', 'high');
create type public.evidence_stance as enum ('supports', 'contradicts');
create type public.translation_provenance as enum ('human_translation', 'ai_translation');

-- «Hoy» es el día calendario de Panamá, igual que en la aplicación (src/lib/today.ts).
create function app.panama_today() returns date
  language sql stable
as $$ select (now() at time zone 'America/Panama')::date $$;

-- ---------------------------------------------------------------------------------------------------
-- Catálogo de campos. Semilla del registro de código (src/domains/content/fields.ts); una prueba de contrato
-- comprueba que coinciden. Solo cambia con una migración nueva: nadie lo edita en caliente.
-- ---------------------------------------------------------------------------------------------------
create table public.content_fields (
  key                   text primary key check (key ~ '^[a-z]+\.[a-z0-9_]+$'),
  field_group           text not null check (field_group in
                          ('overview', 'access', 'restrictions', 'safety', 'visit', 'facts')),
  value_kind            text not null check (value_kind in ('text', 'quantity')),
  sensitivity           text not null check (sensitivity in ('general', 'safety', 'restrictions', 'legal')),
  evidence_classes      public.content_source_class[] not null,
  evidence_min_count    int not null check (evidence_min_count >= 1),
  evidence_max_age_days int not null check (evidence_max_age_days >= 1),
  max_validity_days     int check (max_validity_days is null or max_validity_days >= 1),
  applies_to            text[] check (applies_to is null or cardinality(applies_to) > 0),
  unit                  text,
  -- Una fuente comunitaria o comercial NUNCA basta por sí sola para afirmar nada.
  constraint evidence_classes_reputable check (
    cardinality(evidence_classes) > 0
    and not (evidence_classes && array['community', 'commercial']::public.content_source_class[])),
  constraint quantity_has_unit check ((value_kind = 'quantity') = (unit is not null))
);

insert into public.content_fields
  (key, field_group, value_kind, sensitivity, evidence_classes, evidence_min_count, evidence_max_age_days,
   max_validity_days, applies_to, unit)
values
  ('overview.summary', 'overview', 'text', 'general', array['official', 'institutional', 'scientific', 'editorial_review']::public.content_source_class[], 1, 730, null, null, null),
  ('access.how_to_get_there', 'access', 'text', 'general', array['official', 'institutional', 'editorial_review']::public.content_source_class[], 1, 365, 365, null, null),
  ('restrictions.entry_rules', 'restrictions', 'text', 'restrictions', array['official']::public.content_source_class[], 1, 180, 180, null, null),
  ('restrictions.legal_status', 'restrictions', 'text', 'legal', array['official']::public.content_source_class[], 1, 365, 365, null, null),
  ('safety.hazards', 'safety', 'text', 'safety', array['official', 'institutional', 'scientific']::public.content_source_class[], 1, 90, 90, null, null),
  ('visit.best_season', 'visit', 'text', 'general', array['official', 'institutional', 'scientific', 'editorial_review']::public.content_source_class[], 1, 730, 365, null, null),
  ('visit.accessibility', 'visit', 'text', 'general', array['official', 'institutional', 'editorial_review']::public.content_source_class[], 1, 365, 365, null, null),
  ('facts.elevation_m', 'facts', 'quantity', 'general', array['official', 'institutional', 'scientific']::public.content_source_class[], 1, 3650, null, array['volcano'], 'm');

-- ---------------------------------------------------------------------------------------------------
-- Fuentes citadas (documentos consultados). Solo inserción: corregir una cita es crear otra; así una verificación
-- nunca queda apuntando a un enlace que cambió después.
-- ---------------------------------------------------------------------------------------------------
create table public.source_records (
  id           uuid primary key default gen_random_uuid(),
  source_class public.content_source_class not null,
  institution  text not null check (btrim(institution) <> '' and char_length(institution) <= 300),
  title        text not null check (btrim(title) <> '' and char_length(title) <= 300),
  url          text not null check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 2048),
  published_on date,
  -- Instante en que se CONSULTÓ el documento (no cuándo se publicó). No puede estar en el futuro.
  retrieved_at timestamptz not null check (retrieved_at <= now() + interval '5 minutes'),
  license_name text not null check (btrim(license_name) <> '' and char_length(license_name) <= 300),
  license_url  text check (license_url is null or (license_url ~ '^https://[^[:space:]]+$' and char_length(license_url) <= 2048)),
  created_by   uuid not null default app.current_user_id() references public.profiles (id),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------------
-- Afirmaciones: una versión de un campo de un destino.
-- ---------------------------------------------------------------------------------------------------
create table public.field_assertions (
  id             uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations (id) on delete restrict,
  field_key      text not null references public.content_fields (key),
  -- La asigna el disparador (siguiente versión del campo); el cliente no la elige.
  version        int not null default 0 check (version >= 1),
  status         public.assertion_status not null default 'draft',
  source_locale  text not null references public.supported_locales (code),
  original_text  text check (original_text is null or (btrim(original_text) <> '' and char_length(original_text) <= 4000)),
  quantity_value numeric check (quantity_value is null or (quantity_value > 0 and quantity_value < 1e12)),
  quantity_unit  text check (quantity_unit is null or btrim(quantity_unit) <> ''),
  confidence     public.content_confidence,
  -- Los fija el disparador al verificar (la persona del JWT y la hora del servidor); el cliente no los elige.
  verified_by    uuid references public.profiles (id),
  verified_at    timestamptz,
  valid_from     date,
  -- Último día de vigencia (incluido), día calendario de Panamá.
  valid_until    date,
  -- Lo fija solo el sistema, al verificarse una versión posterior.
  superseded_at  timestamptz,
  -- Motivo obligatorio de una disputa, rechazo o retirada. Interno: nunca público.
  status_note    text check (status_note is null or char_length(status_note) <= 1000),
  created_by     uuid not null default app.current_user_id() references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint assertion_one_value_kind check (not (original_text is not null and quantity_value is not null)),
  constraint assertion_quantity_with_unit check ((quantity_value is null) = (quantity_unit is null)),
  constraint assertion_validity_order check (valid_from is null or valid_until is null or valid_from <= valid_until),
  constraint assertion_verified_complete check (
    status <> 'verified' or (verified_by is not null and verified_at is not null and confidence is not null)),
  -- Nadie verifica lo que redactó.
  constraint assertion_no_self_verification check (verified_by is null or verified_by <> created_by),
  constraint assertion_reason_required check (
    status not in ('disputed', 'rejected', 'retracted') or (status_note is not null and btrim(status_note) <> '')),
  constraint assertion_unique_version unique (destination_id, field_key, version)
);

-- A lo sumo UNA afirmación verificada y vigente por destino y campo.
create unique index field_assertions_one_current on public.field_assertions (destination_id, field_key)
  where status = 'verified' and superseded_at is null;
create index field_assertions_destination on public.field_assertions (destination_id, field_key);

create table public.assertion_evidence (
  id               uuid primary key default gen_random_uuid(),
  assertion_id     uuid not null references public.field_assertions (id) on delete cascade,
  source_record_id uuid not null references public.source_records (id) on delete restrict,
  stance           public.evidence_stance not null default 'supports',
  -- Dónde dentro de la fuente (sección, página) y una cita breve. La cita es opcional: solo si la licencia de la
  -- fuente permite citarla.
  locator          text check (locator is null or (btrim(locator) <> '' and char_length(locator) <= 300)),
  excerpt          text check (excerpt is null or (btrim(excerpt) <> '' and char_length(excerpt) <= 300)),
  created_at       timestamptz not null default now(),
  unique (assertion_id, source_record_id)
);
create index assertion_evidence_source on public.assertion_evidence (source_record_id);

-- Traducciones del texto de UNA versión de la afirmación (el original vive en `field_assertions.original_text`).
create table public.assertion_translations (
  assertion_id  uuid not null references public.field_assertions (id) on delete cascade,
  locale        text not null references public.supported_locales (code),
  text          text not null check (btrim(text) <> '' and char_length(text) <= 4000),
  provenance    public.translation_provenance not null,
  status        public.translation_status not null default 'draft',
  translated_by uuid references public.profiles (id),
  translated_at timestamptz not null default now(),
  reviewed_by   uuid references public.profiles (id),
  reviewed_at   timestamptz,
  primary key (assertion_id, locale),
  constraint reviewed_needs_reviewer check (
    status not in ('reviewed', 'published') or (reviewed_by is not null and reviewed_at is not null)),
  constraint machine_translation_has_no_reviewer check (status <> 'machine_translated' or reviewed_by is null),
  -- Una traducción automática NUNCA llega a revisada ni publicada; se publica una traducción humana revisada.
  constraint ai_translation_never_reviewed check (
    provenance <> 'ai_translation' or status in ('draft', 'machine_translated', 'outdated')),
  constraint human_translation_has_author check (provenance <> 'human_translation' or translated_by is not null),
  constraint human_translation_not_machine_status check (
    provenance <> 'human_translation' or status <> 'machine_translated'),
  constraint no_self_review check (reviewed_by is null or translated_by is null or reviewed_by <> translated_by)
);

-- ---------------------------------------------------------------------------------------------------
-- Puertas de verificación. Espejo EXACTO de `verificationIssues` (src/domains/content/gates.ts): mismos códigos,
-- mismas reglas, mismos bordes. Devuelve los códigos que impiden verificar (vacío = se puede).
-- Los días se cuentan en UTC (la aplicación exporta instantes en UTC).
-- ---------------------------------------------------------------------------------------------------
create function app.assertion_gate_issues(a public.field_assertions) returns text[]
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  f public.content_fields;
  dkind text;
  issues text[] := '{}';
  v_day date;
  contradicts boolean := false;
  after_verification boolean := false;
  n_supports int := 0;
  n_class int := 0;
  n_fresh int := 0;
  e record;
  age int;
begin
  select * into f from public.content_fields where key = a.field_key;
  if not found then
    return array['unknown_field'];
  end if;
  select d.kind into dkind from public.destinations d where d.id = a.destination_id;
  if f.applies_to is not null and (dkind is null or not (dkind = any (f.applies_to))) then
    issues := array_append(issues, 'field_not_applicable');
  end if;

  if a.status <> 'verified' then issues := array_append(issues, 'status_not_verified'); end if;
  if a.superseded_at is not null then issues := array_append(issues, 'superseded'); end if;
  if a.verified_at is null then issues := array_append(issues, 'verified_at_invalid'); end if;
  if a.confidence is null then issues := array_append(issues, 'confidence_missing'); end if;
  if a.verified_by is null then
    issues := array_append(issues, 'verifier_missing');
  elsif a.created_by is not null and a.verified_by = a.created_by then
    issues := array_append(issues, 'verifier_is_author');
  end if;

  v_day := case when a.verified_at is null then null else (a.verified_at at time zone 'UTC')::date end;

  for e in
    select sr.source_class, sr.retrieved_at, ev.stance
      from public.assertion_evidence ev
      join public.source_records sr on sr.id = ev.source_record_id
     where ev.assertion_id = a.id
  loop
    if e.stance = 'contradicts' then
      contradicts := true;
    else
      n_supports := n_supports + 1;
      if e.source_class = any (f.evidence_classes) then
        n_class := n_class + 1;
        if v_day is not null then
          age := v_day - (e.retrieved_at at time zone 'UTC')::date;
          if age < 0 then
            after_verification := true;
          elsif age <= f.evidence_max_age_days then
            n_fresh := n_fresh + 1;
          end if;
        end if;
      end if;
    end if;
  end loop;

  if contradicts then issues := array_append(issues, 'evidence_contradicts'); end if;
  if n_supports = 0 then
    issues := array_append(issues, 'evidence_none');
  else
    if n_class < f.evidence_min_count then issues := array_append(issues, 'evidence_class_insufficient'); end if;
    if after_verification then issues := array_append(issues, 'evidence_after_verification'); end if;
    if v_day is not null and n_class >= f.evidence_min_count and n_fresh < f.evidence_min_count
       and not after_verification then
      issues := array_append(issues, 'evidence_stale');
    end if;
  end if;

  if f.max_validity_days is not null then
    if a.valid_until is null then
      issues := array_append(issues, 'validity_missing');
    elsif v_day is not null then
      if a.valid_until - v_day < 0 then
        issues := array_append(issues, 'validity_before_verification');
      elsif a.valid_until - v_day > f.max_validity_days then
        issues := array_append(issues, 'validity_too_long');
      end if;
    end if;
  end if;

  if f.value_kind = 'quantity' then
    if a.quantity_value is null then
      issues := array_append(issues, 'quantity_missing');
    elsif not (a.quantity_value > 0 and a.quantity_unit = f.unit) then
      issues := array_append(issues, 'quantity_invalid');
    end if;
  elsif a.original_text is null or btrim(a.original_text) = '' then
    issues := array_append(issues, 'original_text_missing');
  end if;

  return issues;
end
$$;
revoke all on function app.assertion_gate_issues(public.field_assertions) from public, anon;
grant execute on function app.assertion_gate_issues(public.field_assertions) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Flujo y protecciones de `field_assertions`.
-- Errores de regla de negocio = SQLSTATE 23514 (check_violation) con un código de máquina en el mensaje.
-- ---------------------------------------------------------------------------------------------------
create function app.assertion_before_insert() returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  f public.content_fields;
begin
  if new.status <> 'draft' then
    raise exception 'assertion_must_start_as_draft' using errcode = 'check_violation';
  end if;
  if new.verified_by is not null or new.verified_at is not null or new.superseded_at is not null
     or new.status_note is not null then
    raise exception 'assertion_workflow_fields_must_be_empty' using errcode = 'check_violation';
  end if;
  select * into f from public.content_fields where key = new.field_key;
  if (f.value_kind = 'text' and new.quantity_value is not null)
     or (f.value_kind = 'quantity' and new.original_text is not null) then
    raise exception 'assertion_value_kind_mismatch' using errcode = 'check_violation';
  end if;
  new.version := coalesce(
    (select max(a.version) from public.field_assertions a
      where a.destination_id = new.destination_id and a.field_key = new.field_key), 0) + 1;
  return new;
end
$$;
create trigger field_assertions_before_insert before insert on public.field_assertions
  for each row execute function app.assertion_before_insert();

create function app.assertion_before_update() returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  issues text[];
begin
  -- `superseded_at` lo fija solo el sistema, desde el disparador de la versión que reemplaza (profundidad > 1).
  if new.superseded_at is distinct from old.superseded_at then
    if pg_trigger_depth() < 2 or old.superseded_at is not null or old.status not in ('verified', 'disputed') then
      raise exception 'assertion_superseded_is_system_managed' using errcode = 'check_violation';
    end if;
    -- Un reemplazo no toca nada más.
    if new.status is distinct from old.status or new.original_text is distinct from old.original_text then
      raise exception 'assertion_superseded_is_system_managed' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.destination_id <> old.destination_id or new.field_key <> old.field_key or new.version <> old.version
     or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'assertion_identity_is_immutable' using errcode = 'check_violation';
  end if;

  if new.status <> old.status and not (
       (old.status = 'draft'     and new.status = 'in_review')
    or (old.status = 'in_review' and new.status in ('draft', 'verified', 'rejected'))
    or (old.status = 'verified'  and new.status in ('disputed', 'retracted'))
    or (old.status = 'disputed'  and new.status = 'retracted')) then
    raise exception 'assertion_invalid_transition' using errcode = 'check_violation';
  end if;

  -- El contenido solo se edita en borrador. La confianza la fija quien verifica, en el mismo acto.
  if old.status <> 'draft' and (
       new.source_locale is distinct from old.source_locale
    or new.original_text is distinct from old.original_text
    or new.quantity_value is distinct from old.quantity_value
    or new.quantity_unit is distinct from old.quantity_unit
    or new.valid_from is distinct from old.valid_from
    or new.valid_until is distinct from old.valid_until
    or (new.confidence is distinct from old.confidence
        and not (old.status = 'in_review' and new.status = 'verified'))) then
    raise exception 'assertion_content_is_frozen' using errcode = 'check_violation';
  end if;

  if new.status_note is distinct from old.status_note and new.status = old.status then
    raise exception 'assertion_content_is_frozen' using errcode = 'check_violation';
  end if;

  if old.status <> 'verified' and new.status = 'verified' then
    -- Quién verifica y cuándo no los elige el cliente: son la persona del JWT y la hora del servidor.
    new.verified_by := app.current_user_id();
    new.verified_at := now();
    issues := app.assertion_gate_issues(new);
    if cardinality(issues) > 0 then
      raise exception 'verification_gates_failed' using errcode = 'check_violation',
        detail = array_to_string(issues, ',');
    end if;
    -- Reemplaza la versión vigente anterior ANTES de escribir esta (el índice único lo exige).
    update public.field_assertions
       set superseded_at = new.verified_at
     where destination_id = new.destination_id and field_key = new.field_key and id <> new.id
       and superseded_at is null and status in ('verified', 'disputed');
  elsif new.verified_by is distinct from old.verified_by or new.verified_at is distinct from old.verified_at then
    raise exception 'assertion_verification_is_immutable' using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end
$$;
create trigger field_assertions_before_update before update on public.field_assertions
  for each row execute function app.assertion_before_update();

create function app.assertion_before_delete() returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
begin
  if old.status <> 'draft' then
    raise exception 'assertion_not_deletable' using errcode = 'check_violation';
  end if;
  return old;
end
$$;
create trigger field_assertions_before_delete before delete on public.field_assertions
  for each row execute function app.assertion_before_delete();

-- Solo hay TRUNCATE para el propietario; lo bloqueamos igual que en la auditoría.
create function app.content_no_truncate() returns trigger
  language plpgsql
as $$
begin
  raise exception 'esta tabla no admite TRUNCATE' using errcode = 'insufficient_privilege';
end
$$;
create trigger field_assertions_no_truncate before truncate on public.field_assertions
  for each statement execute function app.content_no_truncate();
create trigger assertion_evidence_no_truncate before truncate on public.assertion_evidence
  for each statement execute function app.content_no_truncate();
create trigger source_records_no_truncate before truncate on public.source_records
  for each statement execute function app.content_no_truncate();

-- La evidencia solo cambia mientras la afirmación está en borrador (al pasar a revisión queda congelada).
create function app.evidence_guard() returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  parent public.assertion_status;
  pid uuid := case when tg_op = 'DELETE' then old.assertion_id else new.assertion_id end;
begin
  if tg_op = 'UPDATE' and new.assertion_id <> old.assertion_id then
    raise exception 'evidence_cannot_move' using errcode = 'check_violation';
  end if;
  select a.status into parent from public.field_assertions a where a.id = pid;
  -- Sin padre: es un borrado en cascada de un borrador (o el FK lo rechazará).
  if found and parent <> 'draft' then
    raise exception 'evidence_is_frozen' using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
create trigger assertion_evidence_guard before insert or update or delete on public.assertion_evidence
  for each row execute function app.evidence_guard();

-- Traducciones: nunca en el idioma del original; editar el texto de una revisada la deja sin revisar.
create function app.assertion_translation_guard() returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  src text;
begin
  select a.source_locale into src from public.field_assertions a where a.id = new.assertion_id;
  if new.locale = src then
    raise exception 'translation_in_source_locale' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    if new.assertion_id <> old.assertion_id or new.locale <> old.locale or new.provenance <> old.provenance then
      raise exception 'translation_identity_is_immutable' using errcode = 'check_violation';
    end if;
    if new.text is distinct from old.text and new.status in ('reviewed', 'published') then
      raise exception 'translation_edit_resets_review' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;
create trigger assertion_translations_guard before insert or update on public.assertion_translations
  for each row execute function app.assertion_translation_guard();

-- Una nueva traducción NO puede nacer ya revisada/publicada a través del disparador: lo exige también la RLS.

-- ---------------------------------------------------------------------------------------------------
-- Estado público de lo que NO se puede mostrar: vencido o en disputa. Solo estado, nunca el contenido (que podría
-- estar desactualizado o discutido). La vista corre con los derechos de su propietario a propósito (la RLS de
-- `anon` solo deja ver lo verificado y vigente): filtra por sí misma y expone solo las columnas de abajo.
-- ---------------------------------------------------------------------------------------------------
create view public.field_public_state as
  select d.key as destination_key,
         fa.field_key,
         case when fa.status = 'disputed' then 'DISPUTED' else 'EXPIRED' end as state,
         case when fa.status = 'verified' then fa.verified_at end as verified_at,
         case when fa.status = 'verified' then fa.valid_until end as valid_until
    from public.field_assertions fa
    join public.destinations d on d.id = fa.destination_id
   where d.status = 'published'
     and fa.superseded_at is null
     and (fa.status = 'disputed'
          or (fa.status = 'verified' and fa.valid_until is not null and fa.valid_until < app.panama_today()));

-- ---------------------------------------------------------------------------------------------------
-- Auditoría: quién, qué, cuándo, antes y después (las claves de estas tablas no siempre son `id`).
-- ---------------------------------------------------------------------------------------------------
create or replace function app.audit_row() returns trigger
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
    when 'assertion_translations'   then (r ->> 'assertion_id') || ':' || (r ->> 'locale')
    when 'destination_slugs'        then (r ->> 'locale') || ':' || (r ->> 'slug')
    when 'destination_areas'        then (r ->> 'destination_id') || ':' || (r ->> 'area_id') || ':' || (r ->> 'role')
    when 'user_roles'               then (r ->> 'user_id') || ':' || (r ->> 'role')
    when 'content_fields'           then r ->> 'key'
    else r ->> 'id'
  end;
  insert into public.audit_events (actor_id, action, entity_table, entity_id, before, after)
  values (app.current_user_id(), tg_op, tg_table_name, eid, b, a);
  return null;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'content_fields', 'source_records', 'field_assertions', 'assertion_evidence', 'assertion_translations'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()',
      t || '_audit', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------------------------------
-- Privilegios y RLS.
--  · `anon` (la API pública y el exportador): solo lo verificado y vigente, y solo las columnas públicas.
--  · `authenticated`: solo el personal ve filas (nadie más lee estas tablas, ni siquiera las públicas: no hay
--    caso de uso, y así no se filtran identidades a una persona autenticada que no sea personal).
-- ---------------------------------------------------------------------------------------------------
revoke all on public.content_fields, public.source_records, public.field_assertions,
  public.assertion_evidence, public.assertion_translations, public.field_public_state
  from anon, authenticated;

grant select (id, destination_id, field_key, version, status, source_locale, original_text, quantity_value,
              quantity_unit, confidence, verified_at, valid_from, valid_until, superseded_at)
  on public.field_assertions to anon;
grant select (assertion_id, locale, text, provenance, status) on public.assertion_translations to anon;
grant select (id, assertion_id, source_record_id, stance, locator, excerpt) on public.assertion_evidence to anon;
grant select (id, source_class, institution, title, url, published_on, retrieved_at, license_name, license_url)
  on public.source_records to anon;
grant select on public.field_public_state to anon, authenticated;

grant select on public.content_fields, public.source_records, public.field_assertions,
  public.assertion_evidence, public.assertion_translations to authenticated;
grant insert, update, delete on public.field_assertions, public.assertion_evidence,
  public.assertion_translations to authenticated;
grant insert, delete on public.source_records to authenticated;

alter table public.content_fields          enable row level security;
alter table public.source_records          enable row level security;
alter table public.field_assertions        enable row level security;
alter table public.assertion_evidence      enable row level security;
alter table public.assertion_translations  enable row level security;

create policy content_fields_staff_read on public.content_fields for select to authenticated
  using (app.is_staff());

-- Afirmaciones. El público solo ve lo verificado, no reemplazado, vigente y de un destino publicado.
create policy field_assertions_public_read on public.field_assertions for select to anon
  using (
    status = 'verified'
    and superseded_at is null
    and (valid_until is null or valid_until >= app.panama_today())
    and exists (select 1 from public.destinations d where d.id = field_assertions.destination_id)
  );
create policy field_assertions_staff_read on public.field_assertions for select to authenticated
  using (app.is_staff());
-- Un editor redacta borradores y los envía a revisión; NUNCA los verifica.
create policy field_assertions_editor_insert on public.field_assertions for insert to authenticated
  with check (app.is_editor() and status = 'draft' and created_by = app.current_user_id());
create policy field_assertions_editor_update on public.field_assertions for update to authenticated
  using (app.is_editor() and status = 'draft')
  with check (app.is_editor() and status in ('draft', 'in_review'));
-- Un revisor verifica, devuelve, rechaza, disputa o retira. No edita contenido (el disparador lo congela).
create policy field_assertions_reviewer_update on public.field_assertions for update to authenticated
  using (app.is_reviewer() and status in ('in_review', 'verified', 'disputed'))
  with check (app.is_reviewer() and status in ('draft', 'verified', 'disputed', 'rejected', 'retracted'));
create policy field_assertions_admin_delete on public.field_assertions for delete to authenticated
  using (app.is_admin());

-- Evidencia y fuentes: públicas solo las de afirmaciones públicas.
create policy assertion_evidence_public_read on public.assertion_evidence for select to anon
  using (exists (select 1 from public.field_assertions a where a.id = assertion_evidence.assertion_id));
create policy assertion_evidence_staff_read on public.assertion_evidence for select to authenticated
  using (app.is_staff());
create policy assertion_evidence_editor on public.assertion_evidence for all to authenticated
  using (app.is_editor()) with check (app.is_editor());

create policy source_records_public_read on public.source_records for select to anon
  using (exists (select 1 from public.assertion_evidence e where e.source_record_id = source_records.id));
create policy source_records_staff_read on public.source_records for select to authenticated
  using (app.is_staff());
create policy source_records_editor_insert on public.source_records for insert to authenticated
  with check (app.is_editor() and created_by = app.current_user_id());
create policy source_records_admin_delete on public.source_records for delete to authenticated
  using (app.is_admin());

-- Traducciones: el público solo ve las PUBLICADAS y HUMANAS de afirmaciones públicas.
create policy assertion_translations_public_read on public.assertion_translations for select to anon
  using (
    status = 'published'
    and provenance = 'human_translation'
    and exists (select 1 from public.field_assertions a where a.id = assertion_translations.assertion_id)
  );
create policy assertion_translations_staff_read on public.assertion_translations for select to authenticated
  using (app.is_staff());
-- Un editor crea/edita borradores y traducciones automáticas, NUNCA revisadas ni con revisor.
create policy assertion_translations_editor_insert on public.assertion_translations for insert to authenticated
  with check (
    app.is_editor()
    and status in ('draft', 'machine_translated')
    and reviewed_by is null and reviewed_at is null
    and (provenance = 'ai_translation' or translated_by = app.current_user_id())
  );
create policy assertion_translations_editor_update on public.assertion_translations for update to authenticated
  using (app.is_editor() and status <> 'published')
  with check (
    app.is_editor()
    and status in ('draft', 'machine_translated', 'outdated')
    and reviewed_by is null and reviewed_at is null
  );
-- Un revisor solo revisa/publica COMO SÍ MISMO.
create policy assertion_translations_reviewer_update on public.assertion_translations for update to authenticated
  using (app.is_reviewer())
  with check (
    app.is_reviewer()
    and status in ('reviewed', 'published')
    and reviewed_by = app.current_user_id()
  );
create policy assertion_translations_admin_delete on public.assertion_translations for delete to authenticated
  using (app.is_admin());
