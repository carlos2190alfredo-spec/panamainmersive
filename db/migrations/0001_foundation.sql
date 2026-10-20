-- 0001 · Fundamentos: extensiones, esquema `app`, roles, identidad y roles de aplicación.
-- Portable a Supabase (ADR-0006): no depende de `auth.uid()`; lee los claims JWT que PostgREST/Supabase
-- establece en `request.jwt.claims`. pgvector NO se habilita (sin necesidad probada).

-- Las extensiones viven en el esquema `extensions` (como en Supabase), NO en `public`: así
-- `spatial_ref_sys` (tabla de sistema de PostGIS, sin RLS) no queda expuesta por la API de `public`.
create schema if not exists extensions;
create extension if not exists postgis  with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

create schema if not exists app;

-- `anon` y `authenticated` existen en Supabase; en local se crean solo si faltan.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

grant usage on schema public to anon, authenticated;
grant usage on schema app to anon, authenticated;
grant usage on schema extensions to anon, authenticated;

-- Claims JWT de la petición (vacío si no hay).
create function app.jwt_claims() returns jsonb
  language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- Usuario autenticado (uuid) o NULL. Un `sub` mal formado falla CERRADO (NULL), nunca lanza.
create function app.current_user_id() returns uuid
  language sql stable
as $$
  select case
    when s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then s::uuid
  end
  from (select coalesce(app.jwt_claims() ->> 'sub', nullif(current_setting('request.jwt.claim.sub', true), '')) as s) c
$$;

create function app.touch_updated_at() returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Roles de aplicación. `business_owner` queda sin políticas hasta la Fase 6.
create type public.app_role as enum ('editor', 'reviewer', 'admin', 'business_owner');

create table public.profiles (
  id           uuid primary key,
  display_name text,
  created_at   timestamptz not null default now()
);

create table public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.app_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Las funciones de rol son SECURITY DEFINER (leen `user_roles` aunque el llamante no pueda) con
-- `search_path` fijo para impedir secuestro de nombres.
create function app.has_role(r public.app_role) returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = app.current_user_id() and ur.role = r
  )
$$;

create function app.is_admin() returns boolean language sql stable as $$ select app.has_role('admin') $$;
create function app.is_editor() returns boolean language sql stable as $$ select app.has_role('editor') or app.has_role('admin') $$;
create function app.is_reviewer() returns boolean language sql stable as $$ select app.has_role('reviewer') or app.has_role('admin') $$;
create function app.is_staff() returns boolean
  language sql stable
as $$ select app.has_role('editor') or app.has_role('reviewer') or app.has_role('admin') $$;

revoke all on function app.has_role(public.app_role) from public;
grant execute on function app.has_role(public.app_role) to anon, authenticated;
grant execute on function app.jwt_claims(), app.current_user_id(), app.is_admin(), app.is_editor(),
  app.is_reviewer(), app.is_staff() to anon, authenticated;
