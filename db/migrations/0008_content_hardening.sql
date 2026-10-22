-- 0008 · Endurecimiento del modelo de contenido tras la revisión independiente de la Fase 4 (ADR-0020).
-- 0007 es inmutable (ya está comprometida y tiene checksum): todo cambio va aquí.
--
-- Principio que ordena esta migración: la BD debe ser AL MENOS TAN ESTRICTA como el dominio y el exportador. Lo que
-- la BD acepta, ellos también lo aceptan; si no, una sola fila verificada (e inmutable) dejaba sin poder exportar todo.
-- Cada cambio nombra el hallazgo (R-n) cuya prueba de regresión vive en tests/integration/content-hardening.test.ts.

-- ---------------------------------------------------------------------------------------------------
-- R-4 · Funciones de validación compartidas. Inmutables: sirven en CHECK y se comparan con el dominio por prueba.
-- ---------------------------------------------------------------------------------------------------
-- «En blanco» EXACTAMENTE como `String.prototype.trim` de JavaScript (espacios Unicode y terminadores de línea).
-- `btrim` de PostgreSQL solo recorta U+0020: un NBSP pasaba la BD y el dominio lo rechazaba.
create function app.is_blank(t text) returns boolean
  language sql immutable parallel safe
as $$
  select t ~ '^[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*$'
$$;

-- Un enlace `https` que `new URL()` también acepta (el dominio lo comprueba así). Conservador a propósito: solo
-- ASCII imprimible; host de etiquetas alfanuméricas con guiones internos; puerto 1–65535; sin credenciales ni IPv6.
-- WHATWG trata como IPv4 un host cuya última etiqueta es numérica (o `0x…`): solo se admite un cuádruple decimal
-- estricto (sin ceros a la izquierda, que serían octales y pueden ser inválidos).
create function app.is_https_url(u text) returns boolean
  language sql immutable parallel safe
as $$
  select u is not null
     and char_length(u) <= 2048
     and u ~ '^[!-~]+$'
     and u ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*(:[0-9]{1,5})?([/?#][^<>"\\^`{|}]*)?$'
     and coalesce(substring(u from '^https://[^/?#]*:([0-9]+)')::int, 1) between 1 and 65535
     and (
       substring(substring(u from '^https://([^/?#:]*)') from '[^.]*$') ~ '[A-Za-z]'
       and substring(substring(u from '^https://([^/?#:]*)') from '[^.]*$') !~* '^0x[0-9a-f]*$'
       or substring(u from '^https://([^/?#:]*)') ~
          '^(0|[1-9][0-9]?|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\.(0|[1-9][0-9]?|1[0-9]{2}|2[0-4][0-9]|25[0-5])){3}$'
     )
$$;

alter table public.source_records
  drop constraint source_records_url_check,
  add constraint source_records_url_check check (app.is_https_url(url)),
  drop constraint source_records_license_url_check,
  add constraint source_records_license_url_check check (license_url is null or app.is_https_url(license_url));

alter table public.field_assertions
  drop constraint field_assertions_original_text_check,
  add constraint field_assertions_original_text_check
    check (original_text is null or (not app.is_blank(original_text) and char_length(original_text) <= 4000));

alter table public.assertion_translations
  drop constraint assertion_translations_text_check,
  add constraint assertion_translations_text_check
    check (not app.is_blank(text) and char_length(text) <= 4000);

-- ---------------------------------------------------------------------------------------------------
-- R-7 · Tamaños y rangos: unidad corta, cantidad dentro de lo que `float8` representa, fechas en rango de 4 dígitos.
-- ---------------------------------------------------------------------------------------------------
alter table public.field_assertions
  drop constraint field_assertions_quantity_unit_check,
  add constraint field_assertions_quantity_unit_check
    check (quantity_unit is null or (btrim(quantity_unit) <> '' and char_length(quantity_unit) <= 8)),
  drop constraint field_assertions_quantity_value_check,
  add constraint field_assertions_quantity_value_check
    check (quantity_value is null or (quantity_value >= 0.000001 and quantity_value < 1e12)),
  add constraint assertion_dates_in_range check (
    (valid_from is null or valid_from between date '1900-01-01' and date '9999-12-31')
    and (valid_until is null or valid_until between date '1900-01-01' and date '9999-12-31'));

alter table public.source_records
  add constraint source_published_in_range
    check (published_on is null or published_on between date '1900-01-01' and date '9999-12-31'),
  add constraint source_retrieved_in_range
    check (retrieved_at >= timestamptz '1990-01-01 00:00:00+00');

-- ---------------------------------------------------------------------------------------------------
-- R-4 · El identificador lo asigna el sistema (un UUID no estándar elegido por el cliente rompería la instantánea).
-- ---------------------------------------------------------------------------------------------------
create function app.force_row_uuid() returns trigger
  language plpgsql
as $$
begin
  new.id := gen_random_uuid();
  return new;
end
$$;
create trigger source_records_force_id before insert on public.source_records
  for each row execute function app.force_row_uuid();
create trigger field_assertions_force_id before insert on public.field_assertions
  for each row execute function app.force_row_uuid();
create trigger assertion_evidence_force_id before insert on public.assertion_evidence
  for each row execute function app.force_row_uuid();

-- ---------------------------------------------------------------------------------------------------
-- R-4 · Un destino con afirmaciones no cambia de tipo ni de clave: la puerta de aplicabilidad leyó el tipo de ENTONCES.
-- ---------------------------------------------------------------------------------------------------
create function app.destination_identity_guard() returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
begin
  if (new.kind is distinct from old.kind or new.key is distinct from old.key)
     and exists (select 1 from public.field_assertions a where a.destination_id = new.id) then
    raise exception 'destination_identity_frozen' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger destinations_identity_guard before update on public.destinations
  for each row execute function app.destination_identity_guard();

-- ---------------------------------------------------------------------------------------------------
-- R-1 · Separación de funciones: solo quien redactó un borrador (contenido y evidencia) lo modifica.
-- Antes cualquier editor reescribía el borrador de otra persona y, con rol de revisor, lo verificaba: la puerta
-- «verificador ≠ autor» solo miraba `created_by`.
-- ---------------------------------------------------------------------------------------------------
drop policy field_assertions_editor_update on public.field_assertions;
create policy field_assertions_editor_update on public.field_assertions for update to authenticated
  using (app.is_editor() and status = 'draft' and created_by = app.current_user_id())
  with check (app.is_editor() and status in ('draft', 'in_review'));

drop policy assertion_evidence_editor on public.assertion_evidence;
create policy assertion_evidence_editor on public.assertion_evidence for all to authenticated
  using (app.is_editor() and exists (
    select 1 from public.field_assertions a
     where a.id = assertion_evidence.assertion_id and a.created_by = app.current_user_id()))
  with check (app.is_editor() and exists (
    select 1 from public.field_assertions a
     where a.id = assertion_evidence.assertion_id and a.created_by = app.current_user_id()));

-- Evidencia: solo la persona autora del borrador, y como mucho 20 fuentes por afirmación (el esquema de la
-- instantánea las limita igual). El guardián responde con el mismo error que la RLS si no eres del personal
-- (los disparadores `BEFORE` corren antes que la RLS y revelarían datos con otro código).
create or replace function app.evidence_guard() returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  parent public.assertion_status;
  creator uuid;
  n int;
  pid uuid := case when tg_op = 'DELETE' then old.assertion_id else new.assertion_id end;
begin
  if current_setting('role', true) in ('authenticated', 'anon') and not app.is_staff() then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and new.assertion_id <> old.assertion_id then
    raise exception 'evidence_cannot_move' using errcode = 'check_violation';
  end if;
  select a.status, a.created_by into parent, creator from public.field_assertions a where a.id = pid;
  -- Sin padre: es un borrado en cascada de un borrador (o el FK lo rechazará).
  if found then
    if parent <> 'draft' then
      raise exception 'evidence_is_frozen' using errcode = 'check_violation';
    end if;
    if app.current_user_id() is not null and app.current_user_id() <> creator then
      raise exception 'evidence_not_author' using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' then
      select count(*) into n from public.assertion_evidence e where e.assertion_id = pid;
      if n >= 20 then
        raise exception 'evidence_limit_exceeded' using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

-- ---------------------------------------------------------------------------------------------------
-- R-2 / R-3 · Traducciones: la autoría no se reescribe, una desactualizada no se «revive» sin texto nuevo, y el
-- guardián no revela nada a quien no es del personal.
-- ---------------------------------------------------------------------------------------------------
create or replace function app.assertion_translation_guard() returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  src text;
begin
  if current_setting('role', true) in ('authenticated', 'anon') and not app.is_staff() then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;
  select a.source_locale into src from public.field_assertions a where a.id = new.assertion_id;
  if new.locale = src then
    raise exception 'translation_in_source_locale' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    if new.assertion_id <> old.assertion_id or new.locale <> old.locale or new.provenance <> old.provenance
       or new.translated_by is distinct from old.translated_by or new.translated_at is distinct from old.translated_at then
      raise exception 'translation_identity_is_immutable' using errcode = 'check_violation';
    end if;
    if new.text is distinct from old.text and new.status in ('reviewed', 'published') then
      raise exception 'translation_edit_resets_review' using errcode = 'check_violation';
    end if;
    -- Una traducción desactualizada solo vuelve a revisarse tras reescribirla (pasa por borrador).
    if old.status = 'outdated' and new.status in ('reviewed', 'published') then
      raise exception 'translation_outdated_needs_new_text' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

-- La misma regla de autoría para las traducciones de destino (migración 0005).
create function app.destination_translation_identity_guard() returns trigger
  language plpgsql
as $$
begin
  if new.translated_by is distinct from old.translated_by then
    raise exception 'translation_identity_is_immutable' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger destination_translations_identity_guard before update on public.destination_translations
  for each row execute function app.destination_translation_identity_guard();

-- ---------------------------------------------------------------------------------------------------
-- R-9/R-10/R-8/R-5 · Puertas y flujo (espejo exacto de src/domains/content/gates.ts; paridad comprobada).
--  · una fuente repetida no cuenta como dos (se cuentan enlaces DISTINTOS, sin el fragmento y en minúsculas);
--  · la vigencia ya vencida al verificar se rechaza en TODOS los campos, no solo en los que caducan (R-10);
--  · algo que aún no rige (`valid_from` posterior a la verificación) no se verifica como vigente (R-8);
--  · «en blanco» como JavaScript.
-- ---------------------------------------------------------------------------------------------------
create or replace function app.assertion_gate_issues(a public.field_assertions) returns text[]
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
  class_urls text[] := '{}';
  fresh_urls text[] := '{}';
  n_class int;
  n_fresh int;
  e record;
  age int;
  span int;
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
    select sr.source_class, sr.retrieved_at, ev.stance,
           lower(regexp_replace(sr.url, '#.*$', '')) as norm_url
      from public.assertion_evidence ev
      join public.source_records sr on sr.id = ev.source_record_id
     where ev.assertion_id = a.id
  loop
    if e.stance = 'contradicts' then
      contradicts := true;
    else
      n_supports := n_supports + 1;
      if e.source_class = any (f.evidence_classes) then
        if not (e.norm_url = any (class_urls)) then
          class_urls := array_append(class_urls, e.norm_url);
        end if;
        if v_day is not null then
          age := v_day - (e.retrieved_at at time zone 'UTC')::date;
          if age < 0 then
            after_verification := true;
          elsif age <= f.evidence_max_age_days and not (e.norm_url = any (fresh_urls)) then
            fresh_urls := array_append(fresh_urls, e.norm_url);
          end if;
        end if;
      end if;
    end if;
  end loop;
  n_class := cardinality(class_urls);
  n_fresh := cardinality(fresh_urls);

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

  if a.valid_from is not null and v_day is not null and a.valid_from > v_day then
    issues := array_append(issues, 'validity_starts_after_verification');
  end if;
  if f.max_validity_days is not null and a.valid_until is null then
    issues := array_append(issues, 'validity_missing');
  elsif a.valid_until is not null and v_day is not null then
    span := a.valid_until - v_day;
    if span < 0 then
      issues := array_append(issues, 'validity_before_verification');
    elsif f.max_validity_days is not null and span > f.max_validity_days then
      issues := array_append(issues, 'validity_too_long');
    end if;
  end if;

  if f.value_kind = 'quantity' then
    if a.quantity_value is null then
      issues := array_append(issues, 'quantity_missing');
    elsif not (a.quantity_value > 0 and a.quantity_unit = f.unit) then
      issues := array_append(issues, 'quantity_invalid');
    end if;
  elsif a.original_text is null or app.is_blank(a.original_text) then
    issues := array_append(issues, 'original_text_missing');
  end if;

  return issues;
end
$$;

-- R-6 · La función de puertas ya no la ejecuta cualquier persona autenticada (aceptaba una fila fabricada y leía,
-- saltando la RLS, evidencia y fuentes de una afirmación oculta). La llaman los disparadores (definer); el personal
-- previsualiza con esta función, que comprueba que lo es.
revoke execute on function app.assertion_gate_issues(public.field_assertions) from authenticated;

create function app.preview_assertion_gates(p_id uuid) returns text[]
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  a public.field_assertions;
begin
  if not app.is_staff() then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.field_assertions where id = p_id;
  if not found then
    return null;
  end if;
  -- Como si se verificara AHORA y por quien pregunta (la confianza la fija quien verifica: puede faltar en un borrador).
  a.status := 'verified';
  a.verified_at := now();
  a.verified_by := app.current_user_id();
  a.superseded_at := null;
  return app.assertion_gate_issues(a);
end
$$;
revoke all on function app.preview_assertion_gates(uuid) from public, anon;
grant execute on function app.preview_assertion_gates(uuid) to authenticated;

create or replace function app.assertion_before_update() returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  issues text[];
  content_changed boolean;
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

  content_changed :=
       new.source_locale is distinct from old.source_locale
    or new.original_text is distinct from old.original_text
    or new.quantity_value is distinct from old.quantity_value
    or new.quantity_unit is distinct from old.quantity_unit
    or new.valid_from is distinct from old.valid_from
    or new.valid_until is distinct from old.valid_until;

  -- El contenido solo se edita en borrador. La confianza la fija quien verifica, en el mismo acto.
  if old.status <> 'draft' and (
       content_changed
    or (new.confidence is distinct from old.confidence
        and not (old.status = 'in_review' and new.status = 'verified'))) then
    raise exception 'assertion_content_is_frozen' using errcode = 'check_violation';
  end if;

  -- R-1 · Y lo edita solo quien lo redactó.
  if old.status = 'draft' and content_changed
     and app.current_user_id() is not null and app.current_user_id() <> old.created_by then
    raise exception 'assertion_edit_not_author' using errcode = 'check_violation';
  end if;

  if old.status = 'draft' and content_changed then
    -- R-2 · Cambiar el original deja desactualizadas las traducciones ya hechas (no se heredan de un texto distinto).
    if new.source_locale is distinct from old.source_locale and exists (
         select 1 from public.assertion_translations t
          where t.assertion_id = new.id and t.locale = new.source_locale) then
      raise exception 'assertion_source_locale_conflicts_translation' using errcode = 'check_violation';
    end if;
    if new.original_text is distinct from old.original_text
       or new.quantity_value is distinct from old.quantity_value
       or new.quantity_unit is distinct from old.quantity_unit
       or new.source_locale is distinct from old.source_locale then
      update public.assertion_translations
         set status = 'outdated'
       where assertion_id = new.id and status in ('machine_translated', 'reviewed', 'published');
    end if;
  end if;

  if new.status_note is distinct from old.status_note and new.status = old.status then
    raise exception 'assertion_content_is_frozen' using errcode = 'check_violation';
  end if;

  if old.status <> 'verified' and new.status = 'verified' then
    -- R-5 · Una versión anterior no reemplaza a una posterior ya verificada.
    if exists (
         select 1 from public.field_assertions o
          where o.destination_id = new.destination_id and o.field_key = new.field_key
            and o.version > new.version and o.status in ('verified', 'disputed')) then
      raise exception 'assertion_older_version' using errcode = 'check_violation';
    end if;
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

-- ---------------------------------------------------------------------------------------------------
-- R-6 · La vista de estado no deja que un predicado de `anon` se evalúe antes que su propio filtro.
-- ---------------------------------------------------------------------------------------------------
alter view public.field_public_state set (security_barrier = true);
