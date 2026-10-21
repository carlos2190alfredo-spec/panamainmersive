import { createHash } from 'node:crypto';
import {
  SPATIAL_SERVE_ACTIONS,
  evaluateAll,
  type RightsPolicy,
  type SiteEnv,
} from '@/domains/geography/rights';
import {
  SPATIAL_LAYERS,
  SPATIAL_LAYER_IDS,
  SPATIAL_LIMITS,
  coordinateDecimals,
  kindsForLayers,
  parseAreaDetailQuery,
  parseAreasQuery,
  parseLocateQuery,
  simplifyToleranceDegrees,
  type SpatialIssue,
  type SpatialLayerId,
} from '@/domains/geography/spatial-query';
import { assembleAreas, type Assembled, type AreaRow } from '@/domains/geography/spatial-response';
import { DatabaseUnavailableError, type Queryable, type RunAnon } from './db';
import {
  findAreaById,
  findAreaByOvertureId,
  findAreas,
  locateAreas,
  namesForAreas,
} from './repository';

/**
 * Manejadores HTTP de la API espacial (ADR-0016). Reciben sus dependencias (entorno, políticas de derechos,
 * ejecutor de consultas) para poder probarse sin servidor ni base de datos.
 *
 * Orden: validar → derechos (deny-by-default) → consulta con rol `anon` bajo RLS → ensamblado → respuesta.
 * Los errores nunca devuelven SQL, rutas ni valores internos.
 */
export interface SpatialDeps {
  readonly siteEnv: SiteEnv;
  readonly policies: readonly RightsPolicy[];
  readonly runAnon: RunAnon;
}

const CACHE_OK = 'public, max-age=60, stale-while-revalidate=300';
const JSON_TYPE = 'application/json; charset=utf-8';
const GEOJSON_TYPE = 'application/geo+json; charset=utf-8';

function errorResponse(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ error: { code, ...extra } }), {
    status,
    headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': 'no-store' },
  });
}

function invalid(issues: readonly SpatialIssue[]): Response {
  return errorResponse(400, 'invalid_parameters', { issues });
}

function weak(tag: string): string {
  return tag.startsWith('W/') ? tag.slice(2) : tag;
}

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(',').some((candidate) => {
    const value = candidate.trim();
    return value === '*' || weak(value) === weak(etag);
  });
}

function okResponse(request: Request, body: unknown): Response {
  const text = JSON.stringify(body);
  const etag = `W/"${createHash('sha256').update(text).digest('hex').slice(0, 32)}"`;
  const headers = { ETag: etag, 'Cache-Control': CACHE_OK };
  if (etagMatches(request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(text, { status: 200, headers: { ...headers, 'Content-Type': GEOJSON_TYPE } });
}

function mapError(error: unknown): Response {
  if (error instanceof DatabaseUnavailableError) return errorResponse(503, 'database_unavailable');
  const code = (error as { code?: unknown } | null)?.code;
  if (code === '57014') return errorResponse(504, 'query_timeout');
  if (
    typeof code === 'string' &&
    (code.startsWith('08') || code === '57P01' || code === '53300' || code === 'ECONNREFUSED')
  ) {
    return errorResponse(503, 'database_unavailable');
  }
  // Solo el nombre y el código: el mensaje de la BD puede contener datos.
  console.error(
    'spatial query failed',
    error instanceof Error ? error.name : typeof error,
    typeof code === 'string' ? code : '',
  );
  return errorResponse(500, 'internal_error');
}

export interface LayerAccess {
  readonly allowed: readonly SpatialLayerId[];
  readonly blocked: readonly { layer: SpatialLayerId; reason: string }[];
  readonly subjects: ReadonlySet<string>;
}

/** Derechos por capa: se sirve solo lo que la política permite mostrar, transformar y redistribuir. */
export function layerAccess(
  deps: Pick<SpatialDeps, 'siteEnv' | 'policies'>,
  layers: readonly SpatialLayerId[],
  registry: Readonly<Record<SpatialLayerId, { rightsSubject: string }>> = SPATIAL_LAYERS,
): LayerAccess {
  const allowed: SpatialLayerId[] = [];
  const blocked: { layer: SpatialLayerId; reason: string }[] = [];
  const subjects = new Set<string>();
  for (const layer of layers) {
    const subject = registry[layer].rightsSubject;
    const decision = evaluateAll(deps.policies, subject, SPATIAL_SERVE_ACTIONS, deps.siteEnv);
    if (decision.allowed) {
      allowed.push(layer);
      subjects.add(subject);
    } else blocked.push({ layer, reason: decision.reason });
  }
  return { allowed, blocked, subjects };
}

function rightsBlocked(access: LayerAccess): Response {
  return errorResponse(403, 'rights_blocked', { blocked: access.blocked });
}

function countsMeta(a: Assembled) {
  return {
    returned: a.returned,
    truncated: a.truncated,
    skippedTooLarge: a.skippedTooLarge,
    withheldByRights: a.withheldByRights,
  };
}

function simplificationMeta(zoom: number) {
  return {
    method: 'ST_SimplifyPreserveTopology',
    toleranceDegrees: simplifyToleranceDegrees(zoom),
    coordinateDecimals: coordinateDecimals(zoom),
    note: 'Geometría para MOSTRAR (derivada y descartable). La superficie y la pertenencia usan el original.',
  };
}

export async function handleAreas(request: Request, deps: SpatialDeps): Promise<Response> {
  const parsed = parseAreasQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return invalid(parsed.issues);
  const query = parsed.value;

  const access = layerAccess(deps, query.layers);
  if (access.allowed.length === 0) return rightsBlocked(access);

  try {
    const { rows, names } = await deps.runAnon(async (q) => {
      const found = await findAreas(q, {
        bbox: query.bbox,
        zoom: query.zoom,
        kinds: kindsForLayers(access.allowed),
        limit: query.limit,
      });
      // Los nombres solo de lo que se va a devolver (no de la fila extra que delata el truncado).
      const names = await namesForAreas(
        q,
        found.slice(0, query.limit).map((r) => r.id),
      );
      return { rows: found, names };
    });
    const assembled = assembleAreas({
      rows,
      names,
      locale: query.locale,
      limit: query.limit,
      allowedSubjects: access.subjects,
    });
    return okResponse(request, {
      type: 'FeatureCollection',
      features: assembled.features,
      sources: assembled.sources,
      meta: {
        bbox: [query.bbox.west, query.bbox.south, query.bbox.east, query.bbox.north],
        zoom: query.zoom,
        layers: access.allowed,
        blockedLayers: access.blocked,
        limit: query.limit,
        ...countsMeta(assembled),
        simplification: simplificationMeta(query.zoom),
      },
    });
  } catch (error) {
    return mapError(error);
  }
}

export async function handleLocate(request: Request, deps: SpatialDeps): Promise<Response> {
  const parsed = parseLocateQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return invalid(parsed.issues);
  const query = parsed.value;

  const access = layerAccess(deps, query.layers);
  if (access.allowed.length === 0) return rightsBlocked(access);

  try {
    const { rows, names } = await deps.runAnon(async (q) => {
      const found = await locateAreas(q, {
        lon: query.lon,
        lat: query.lat,
        kinds: kindsForLayers(access.allowed),
        limit: SPATIAL_LIMITS.locateMaxResults,
      });
      const names = await namesForAreas(
        q,
        found.slice(0, SPATIAL_LIMITS.locateMaxResults).map((r) => r.id),
      );
      return { rows: found, names };
    });
    const assembled = assembleAreas({
      rows,
      names,
      locale: query.locale,
      limit: SPATIAL_LIMITS.locateMaxResults,
      allowedSubjects: access.subjects,
    });
    return okResponse(request, {
      type: 'FeatureCollection',
      features: assembled.features,
      sources: assembled.sources,
      meta: {
        point: [query.lon, query.lat],
        // Declarado: el borde cuenta como dentro; las áreas se ordenan de la más pequeña (más específica) a la mayor.
        semantics: 'ST_Covers sobre la geometría original (el borde cuenta como dentro)',
        layers: access.allowed,
        blockedLayers: access.blocked,
        ...countsMeta(assembled),
      },
    });
  } catch (error) {
    return mapError(error);
  }
}

type AreaLookup = (q: Queryable, query: { id: string; zoom: number }) => Promise<AreaRow | null>;

async function serveArea(
  request: Request,
  id: string,
  field: string,
  deps: SpatialDeps,
  lookup: AreaLookup,
): Promise<Response> {
  const parsed = parseAreaDetailQuery(id, new URL(request.url).searchParams, field);
  if (!parsed.ok) return invalid(parsed.issues);
  const query = parsed.value;

  // Sin capa que indique la fuente de antemano: se autorizan los sujetos de todas las capas y la FILA decide.
  const access = layerAccess(deps, SPATIAL_LAYER_IDS);
  if (access.allowed.length === 0) return rightsBlocked(access);

  try {
    const { row, names } = await deps.runAnon(async (q) => {
      const row = await lookup(q, { id: query.id, zoom: query.zoom });
      return { row, names: row ? await namesForAreas(q, [row.id]) : [] };
    });
    // Misma respuesta para «no existe» y «no es visible»: no se revela la existencia de lo no público.
    if (!row) return errorResponse(404, 'not_found');
    const assembled = assembleAreas({
      rows: [row],
      names,
      locale: query.locale,
      limit: 1,
      allowedSubjects: access.subjects,
    });
    const feature = assembled.features[0];
    if (!feature) return errorResponse(403, 'rights_blocked', { blocked: access.blocked });
    return okResponse(request, {
      ...feature,
      properties: {
        ...feature.properties,
        // Todos los nombres de la fuente, para que la ficha muestre la procedencia de cada uno.
        names: names.map((n) => ({ locale: n.locale, name: n.name, provenance: n.provenance })),
      },
      sources: assembled.sources,
      meta: { zoom: query.zoom, simplification: simplificationMeta(query.zoom) },
    });
  } catch (error) {
    return mapError(error);
  }
}

/** Ficha por el ID interno (UUID de la BD). */
export function handleAreaDetail(
  request: Request,
  id: string,
  deps: SpatialDeps,
): Promise<Response> {
  return serveArea(request, id, 'id', deps, (q, query) => findAreaById(q, query));
}

/** Ficha por el ID de Overture (el que llevan las teselas en `ovid`). */
export function handleAreaByOvertureId(
  request: Request,
  overtureId: string,
  deps: SpatialDeps,
): Promise<Response> {
  return serveArea(request, overtureId, 'ovid', deps, (q, query) =>
    findAreaByOvertureId(q, { overtureId: query.id, zoom: query.zoom }),
  );
}
