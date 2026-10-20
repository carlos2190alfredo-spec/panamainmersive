-- 0004 · Cobertura visual con caducidad (estado DERIVADO) y política de derechos (ADR-0007).

create type public.coverage_status as enum ('UNKNOWN', 'VERIFIED', 'PARTIAL', 'UNAVAILABLE', 'ERROR');

create table public.visual_coverage (
  id               uuid primary key default gen_random_uuid(),
  destination_id   uuid not null references public.destinations (id) on delete cascade,
  capability       text not null check (capability in (
                     'geometry', 'terrain', 'google3d', 'streetView', 'streetImagery', 'openSatellite', 'officialGeometry')),
  provider         text not null,
  status           public.coverage_status not null,
  method           text not null,
  extent           geometry(Geometry, 4326),
  observed_quality text,
  observed_at      date not null,
  provider_version text,
  evidence         jsonb not null default '[]'::jsonb,
  expires_at       date not null,
  created_at       timestamptz not null default now(),
  check (expires_at > observed_at)
);
create index visual_coverage_destination on public.visual_coverage (destination_id, capability);

-- El estado EFECTIVO se deriva: una evidencia caducada pasa a UNKNOWN, NUNCA a UNAVAILABLE.
-- «Hoy» es el día calendario de Panamá, igual que en la aplicación (src/domains/tourism/coverage-evidence.ts).
create view public.current_visual_coverage with (security_invoker = true) as
  select vc.*,
         case
           when (now() at time zone 'America/Panama')::date >= vc.expires_at then 'UNKNOWN'::public.coverage_status
           else vc.status
         end as effective_status
    from public.visual_coverage vc;

create type public.rights_action as enum (
  'display', 'combine', 'cache', 'download', 'transform', 'redistribute', 'offline', 'ai_process');

create table public.rights_policies (
  id                  uuid primary key default gen_random_uuid(),
  subject             text not null unique,     -- proveedor o dataset (p. ej. 'overture')
  status              text not null check (status in ('verified', 'provisional')),
  allowed_actions     public.rights_action[] not null default '{}',
  license_name        text,
  source_url          text,
  source_retrieved_at date,
  excerpt             text,
  reviewed_by         uuid references public.profiles (id),
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  -- «verified» exige haber leído la fuente primaria: URL, fecha, extracto y una persona que lo revisó.
  constraint verified_needs_evidence check (
    status <> 'verified' or (
      source_url is not null and source_retrieved_at is not null and excerpt is not null
      and reviewed_by is not null and reviewed_at is not null))
);
