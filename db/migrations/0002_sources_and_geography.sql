-- 0002 · Fuentes con procedencia y geografía versionada (docs/data-model.md, docs/gis.md).

create table public.data_sources (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  institution text not null,
  url         text,
  kind        text not null check (kind in ('official', 'osm_derived', 'open_data', 'commercial', 'editorial')),
  created_at  timestamptz not null default now()
);

create table public.source_versions (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references public.data_sources (id) on delete restrict,
  version_label  text not null,
  retrieved_at   timestamptz not null,
  source_url     text,
  content_sha256 text check (content_sha256 ~ '^[0-9a-f]{64}$'),
  license_name   text not null,
  license_url    text,
  attribution    text not null,
  -- «verified» = licencia leída en la fuente primaria; «provisional» no se puede publicar a producción.
  rights_status  text not null check (rights_status in ('verified', 'provisional')),
  created_at     timestamptz not null default now(),
  unique (source_id, version_label)
);

create type public.geometry_source_class as enum ('official', 'osm_derived', 'editorial');

create table public.geographic_areas (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in (
                 'country', 'region', 'county', 'locality', 'protected_area', 'island',
                 'water_body', 'historic_district', 'infrastructure', 'editorial_area')),
  source_class public.geometry_source_class not null,
  external_ref jsonb not null default '{}'::jsonb,   -- p. ej. {"overture_id": "..."}; nunca se empareja por nombre
  is_public    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger geographic_areas_touch before update on public.geographic_areas
  for each row execute function app.touch_updated_at();

-- ORIGINAL versionado. Las simplificaciones para mostrar son derivados descartables y no viven aquí.
create table public.geometry_versions (
  id                uuid primary key default gen_random_uuid(),
  area_id           uuid not null references public.geographic_areas (id) on delete cascade,
  version           int  not null check (version >= 1),
  source_version_id uuid references public.source_versions (id) on delete restrict,
  geom              geometry(Geometry, 4326) not null,
  validity          text not null check (validity in ('valid', 'invalid')),
  validation_notes  text,
  area_m2           double precision,
  area_method       text,
  is_current        boolean not null default false,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  unique (area_id, version),
  constraint geometry_not_empty check (not st_isempty(geom)),
  -- Área de trabajo de Panamá (valor de ingeniería, NO un límite oficial): detecta lat/lon invertidos.
  constraint geometry_in_working_area check (
    st_within(st_envelope(geom), st_makeenvelope(-85, 5, -75, 11, 4326))
  )
);

create index geometry_versions_geom_gix on public.geometry_versions using gist (geom);
-- Una sola versión vigente por área.
create unique index geometry_versions_one_current on public.geometry_versions (area_id) where is_current;

create function app.geometry_before_insert() returns trigger
  language plpgsql
  set search_path = public, extensions, pg_temp
as $$
declare
  cls public.geometry_source_class;
begin
  select source_class into cls from public.geographic_areas where id = new.area_id;

  -- Lo oficial y lo derivado de OSM exigen su fuente versionada; solo lo editorial puede no tenerla.
  if cls in ('official', 'osm_derived') and new.source_version_id is null then
    raise exception 'La geometría % exige source_version_id (procedencia obligatoria)', cls
      using errcode = 'check_violation';
  end if;

  -- NO se repara en silencio (ST_MakeValid prohibido sobre datos oficiales): se registra la validez.
  if st_isvalid(new.geom) then
    new.validity := 'valid';
    new.validation_notes := null;
    -- Superficie con método identificado: geography (esferoide), nunca grados.
    if st_geometrytype(new.geom) in ('ST_Polygon', 'ST_MultiPolygon') then
      new.area_m2 := st_area(new.geom::geography);
      new.area_method := 'ST_Area(geography, EPSG:4326)';
    end if;
  else
    new.validity := 'invalid';
    new.validation_notes := st_isvalidreason(new.geom);
    new.area_m2 := null;
    new.area_method := null;
  end if;
  return new;
end
$$;

create trigger geometry_versions_before_insert before insert on public.geometry_versions
  for each row execute function app.geometry_before_insert();

-- No es un árbol: pertenencia administrativa, contención espacial, proximidad y acceso turístico.
create table public.geographic_relations (
  id                uuid primary key default gen_random_uuid(),
  subject_id        uuid not null references public.geographic_areas (id) on delete cascade,
  object_id         uuid not null references public.geographic_areas (id) on delete cascade,
  relation_type     text not null check (relation_type in ('administrative', 'contains', 'near', 'access_via')),
  evidence          text,
  source_version_id uuid references public.source_versions (id) on delete restrict,
  created_at        timestamptz not null default now(),
  check (subject_id <> object_id),
  unique (subject_id, object_id, relation_type)
);
