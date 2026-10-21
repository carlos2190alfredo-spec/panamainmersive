import {
  coordinateDecimals,
  simplifyToleranceDegrees,
  type AreaNameRow,
  type Bbox,
} from '@/domains/geography/spatial-query';
import type { AreaRow } from '@/domains/geography/spatial-response';
import type { Queryable } from './db';

/**
 * Consultas de la API espacial. Todas son PARAMETRIZADAS (ningún valor de la petición se concatena en el
 * SQL) y se ejecutan con el rol `anon` bajo RLS (ver `db.ts`).
 *
 * Semántica geométrica declarada:
 *  - ventana: `&&` (índice GiST) + `ST_Intersects`;
 *  - pertenencia de un punto: `ST_Covers` sobre la geometría ORIGINAL (un punto sobre el borde cuenta como
 *    dentro). Plano lon/lat, igual que GeoJSON y que lo que dibuja el mapa;
 *  - la geometría que se devuelve es una SIMPLIFICACIÓN DESCARTABLE para mostrar; la superficie
 *    (`area_m2`, `ST_Area(geography)`) se calculó al importar sobre el original;
 *  - solo la versión vigente y válida de cada área.
 */

const SELECT_COLUMNS = `
  a.id::text                                   as id,
  a.kind                                       as kind,
  a.source_class::text                         as source_class,
  a.external_ref ->> 'overture_id'             as overture_id,
  g.version                                    as geometry_version,
  g.area_m2                                    as area_m2,
  g.area_method                                as area_method,
  sv.id::text                                  as source_version_id,
  sv.version_label                             as version_label,
  to_char(sv.retrieved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as retrieved_at,
  sv.license_name                              as license_name,
  sv.license_url                               as license_url,
  sv.attribution                               as attribution,
  sv.rights_status                             as rights_status,
  ds.key                                       as source_key,
  ds.institution                               as institution,
  ds.kind                                      as source_kind`;

const FROM = `
  from public.geometry_versions g
  join public.geographic_areas a on a.id = g.area_id
  left join public.source_versions sv on sv.id = g.source_version_id
  left join public.data_sources ds on ds.id = sv.source_id`;

const CURRENT = "g.is_current and g.validity = 'valid'";

function geometryExpression(toleranceParam: string, decimalsParam: string): string {
  return `st_asgeojson(st_simplifypreservetopology(g.geom, ${toleranceParam}::float8), ${decimalsParam}::int)`;
}

export async function findAreas(
  q: Queryable,
  input: { bbox: Bbox; zoom: number; kinds: readonly string[]; limit: number },
): Promise<AreaRow[]> {
  const { bbox } = input;
  const { rows } = await q.query<AreaRow>(
    `select ${SELECT_COLUMNS},
            ${geometryExpression('$6', '$7')} as geometry_json
       ${FROM}
      where ${CURRENT}
        and a.kind = any($5::text[])
        and g.geom && st_makeenvelope($1::float8, $2::float8, $3::float8, $4::float8, 4326)
        and st_intersects(g.geom, st_makeenvelope($1::float8, $2::float8, $3::float8, $4::float8, 4326))
      order by g.area_m2 desc nulls last, a.id
      limit $8::int`,
    [
      bbox.west,
      bbox.south,
      bbox.east,
      bbox.north,
      [...input.kinds],
      simplifyToleranceDegrees(input.zoom),
      coordinateDecimals(input.zoom),
      // Una más que el límite: así se sabe si hubo truncado sin contar toda la tabla.
      input.limit + 1,
    ],
  );
  return rows;
}

export async function locateAreas(
  q: Queryable,
  input: { lon: number; lat: number; kinds: readonly string[]; limit: number },
): Promise<AreaRow[]> {
  const { rows } = await q.query<AreaRow>(
    `select ${SELECT_COLUMNS},
            null::text as geometry_json
       ${FROM}
      where ${CURRENT}
        and a.kind = any($3::text[])
        and st_covers(g.geom, st_setsrid(st_makepoint($1::float8, $2::float8), 4326))
      order by g.area_m2 asc nulls last, a.id
      limit $4::int`,
    [input.lon, input.lat, [...input.kinds], input.limit + 1],
  );
  return rows;
}

export async function findAreaById(
  q: Queryable,
  input: { id: string; zoom: number },
): Promise<AreaRow | null> {
  const { rows } = await q.query<AreaRow>(
    `select ${SELECT_COLUMNS},
            ${geometryExpression('$2', '$3')} as geometry_json
       ${FROM}
      where ${CURRENT} and a.id = $1::uuid`,
    [input.id, simplifyToleranceDegrees(input.zoom), coordinateDecimals(input.zoom)],
  );
  return rows[0] ?? null;
}

/**
 * Una área por su ID de Overture (lo que llevan las teselas en `ovid`); el índice único de `external_ref` la
 * resuelve. La identidad es el ID, nunca el nombre.
 */
export async function findAreaByOvertureId(
  q: Queryable,
  input: { overtureId: string; zoom: number },
): Promise<AreaRow | null> {
  const { rows } = await q.query<AreaRow>(
    `select ${SELECT_COLUMNS},
            ${geometryExpression('$2', '$3')} as geometry_json
       ${FROM}
      where ${CURRENT} and a.external_ref ->> 'overture_id' = $1::text`,
    [input.overtureId, simplifyToleranceDegrees(input.zoom), coordinateDecimals(input.zoom)],
  );
  return rows[0] ?? null;
}

export async function namesForAreas(
  q: Queryable,
  areaIds: readonly string[],
): Promise<AreaNameRow[]> {
  if (areaIds.length === 0) return [];
  const { rows } = await q.query<AreaNameRow>(
    `select area_id::text as area_id, locale, name, provenance
       from public.geographic_area_names
      where area_id = any($1::uuid[])
      order by area_id, provenance, locale nulls first`,
    [[...areaIds]],
  );
  return rows;
}
