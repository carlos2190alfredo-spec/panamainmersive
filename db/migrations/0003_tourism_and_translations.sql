-- 0003 · Destinos, slugs con alias, traducciones tipadas con estado editorial (ADR-0008, docs/i18n.md).

create table public.supported_locales (
  code      text primary key check (code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  endonym   text not null,
  html_lang text not null,
  is_default boolean not null default false
);
create unique index supported_locales_one_default on public.supported_locales (is_default) where is_default;

insert into public.supported_locales (code, endonym, html_lang, is_default) values
  ('es', 'Español',   'es', true),
  ('en', 'English',   'en', false),
  ('pt', 'Português', 'pt', false),
  ('fr', 'Français',  'fr', false),
  ('de', 'Deutsch',   'de', false);

create type public.destination_status as enum ('draft', 'in_review', 'published');
create type public.translation_status as enum ('draft', 'machine_translated', 'reviewed', 'published', 'outdated');

-- `key` es la identidad estable e inmutable: no se deriva del nombre mostrado.
create table public.destinations (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind       text not null check (kind in (
               'city', 'historic_district', 'infrastructure', 'locality', 'volcano', 'archipelago', 'island')),
  status     public.destination_status not null default 'draft',
  version    int not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger destinations_touch before update on public.destinations
  for each row execute function app.touch_updated_at();

-- Destino ↔ área con ROL. Nunca por coincidencia de nombre (homonimia: Barú ≠ Volcán Barú).
create table public.destination_areas (
  destination_id uuid not null references public.destinations (id) on delete cascade,
  area_id        uuid not null references public.geographic_areas (id) on delete restrict,
  role           text not null check (role in ('primary', 'context', 'access')),
  evidence       text,
  primary key (destination_id, area_id, role)
);

create table public.destination_slugs (
  destination_id uuid not null references public.destinations (id) on delete cascade,
  locale         text not null references public.supported_locales (code),
  slug           text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_current     boolean not null default true,
  created_at     timestamptz not null default now(),
  primary key (locale, slug)   -- (idioma, slug) único: una URL = un destino
);
create unique index destination_slugs_one_current on public.destination_slugs (destination_id, locale) where is_current;

-- Un slug nuevo vigente convierte el anterior en ALIAS (nunca se borra): las URLs antiguas siguen resolviendo.
create function app.slug_demote_previous() returns trigger
  language plpgsql
as $$
begin
  if new.is_current then
    update public.destination_slugs
       set is_current = false
     where destination_id = new.destination_id and locale = new.locale and is_current
       and slug <> new.slug;
  end if;
  return new;
end
$$;
create trigger destination_slugs_demote before insert on public.destination_slugs
  for each row execute function app.slug_demote_previous();

create table public.destination_translations (
  destination_id     uuid not null references public.destinations (id) on delete cascade,
  locale             text not null references public.supported_locales (code),
  name               text not null check (btrim(name) <> ''),
  summary            text,
  source_language    text not null references public.supported_locales (code),
  source_version     int  not null check (source_version >= 1),
  translation_status public.translation_status not null default 'draft',
  translated_at      timestamptz,
  reviewed_at        timestamptz,
  translated_by      uuid references public.profiles (id),
  reviewed_by        uuid references public.profiles (id),
  provenance         text not null,
  primary key (destination_id, locale),
  -- Revisado/publicado ⇒ una PERSONA con nombre y fecha.
  constraint reviewed_needs_reviewer check (
    translation_status not in ('reviewed', 'published') or (reviewed_by is not null and reviewed_at is not null)),
  -- Una máquina nunca figura como revisora.
  constraint machine_translation_has_no_reviewer check (
    translation_status <> 'machine_translated' or reviewed_by is null),
  -- Nadie revisa su propia traducción.
  constraint no_self_review check (reviewed_by is null or translated_by is null or reviewed_by <> translated_by)
);

-- Si cambia el original (sube la versión del destino), las traducciones afectadas pasan a `outdated`.
-- La fila en el idioma fuente ES el original: no se marca.
create function app.mark_translations_outdated() returns trigger
  language plpgsql
as $$
begin
  if new.version > old.version then
    update public.destination_translations
       set translation_status = 'outdated'
     where destination_id = new.id
       and locale <> source_language
       and source_version < new.version
       and translation_status <> 'outdated';
  end if;
  return new;
end
$$;
create trigger destinations_outdate_translations after update of version on public.destinations
  for each row execute function app.mark_translations_outdated();
