import { LOCALES, type Locale } from '@/i18n/locales';

/**
 * Contrato de la API espacial (docs/gis.md §5, ADR-0016). Lógica pura: valida la entrada NO confiable de la
 * URL y devuelve códigos de máquina (la interfaz los traduce); nunca texto para la persona ni SQL.
 *
 * Reglas: parámetros conocidos, sin repetir, con longitud acotada; números con expresión regular estricta
 * (sin notación científica, `NaN`, hex ni `+`); rangos físicos y límites duros de tamaño.
 */

/**
 * Área de trabajo de DATOS (oeste, sur, este, norte; grados). Debe coincidir con el CHECK
 * `geometry_in_working_area` de la BD y con `WORKING_AREA` de `pipelines/ingest/validate.py`
 * (lo comprueba una prueba de contrato). Es un valor de INGENIERÍA, no un límite oficial.
 */
export const DATA_WORKING_AREA = { west: -85, south: 5, east: -75, north: 11 } as const;

export const SPATIAL_LIMITS = {
  /** Superficie máxima de la ventana (grados²), ya recortada al área de trabajo. Todo Panamá ≈ 15 grados². */
  maxBboxAreaDeg2: 25,
  zoomMin: 0,
  zoomMax: 18,
  /** Zoom de la ficha de un área cuando no se indica otro. */
  detailZoom: 12,
  defaultLimit: 100,
  maxLimit: 200,
  locateMaxResults: 20,
  maxLayers: 4,
  maxParamLength: 256,
  /** Presupuesto de bytes de la respuesta (se trunca de forma explícita, nunca en silencio). */
  maxResponseBytes: 1_500_000,
  statementTimeoutMs: 3_000,
} as const;

export const SPATIAL_LAYER_IDS = ['protected_areas', 'context_areas'] as const;
export type SpatialLayerId = (typeof SPATIAL_LAYER_IDS)[number];

export interface SpatialLayerDefinition {
  /** Tipos de `geographic_areas.kind` que contiene la capa. */
  readonly kinds: readonly string[];
  /** Sujeto de la política de derechos que gobierna la capa (`data/rights/policies.json`). */
  readonly rightsSubject: string;
}

/**
 * Registro mínimo de capas de la API (el Layer Engine declarativo de la Fase 3.c lo ampliará).
 * `editorial_area` queda fuera a propósito: una geometría editorial no se mezcla con las de fuente.
 */
export const SPATIAL_LAYERS: Readonly<Record<SpatialLayerId, SpatialLayerDefinition>> = {
  protected_areas: { kinds: ['protected_area'], rightsSubject: 'overture' },
  context_areas: {
    kinds: [
      'country',
      'region',
      'county',
      'locality',
      'island',
      'water_body',
      'historic_district',
      'infrastructure',
    ],
    rightsSubject: 'overture',
  },
};

export function kindsForLayers(layers: readonly SpatialLayerId[]): string[] {
  return [...new Set(layers.flatMap((id) => SPATIAL_LAYERS[id].kinds))];
}

export function layerForKind(kind: string): SpatialLayerId | null {
  return SPATIAL_LAYER_IDS.find((id) => SPATIAL_LAYERS[id].kinds.includes(kind)) ?? null;
}

export interface Bbox {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

export interface SpatialIssue {
  readonly field: string;
  readonly code: string;
}

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly SpatialIssue[] };

export interface AreasQuery {
  /** Ya recortado al área de trabajo. */
  readonly bbox: Bbox;
  readonly zoom: number;
  readonly layers: readonly SpatialLayerId[];
  readonly limit: number;
  readonly locale: Locale | null;
}

export interface LocateQuery {
  readonly lon: number;
  readonly lat: number;
  readonly layers: readonly SpatialLayerId[];
  readonly locale: Locale | null;
}

export interface AreaDetailQuery {
  readonly id: string;
  readonly zoom: number;
  readonly locale: Locale | null;
}

const COORD = /^-?\d{1,3}(?:\.\d{1,7})?$/;
const UINT = /^\d{1,3}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function coordinate(raw: string): number | null {
  if (!COORD.test(raw)) return null;
  const n = Number(raw);
  // `+ 0` convierte -0 en 0 (no hay «cero negativo» en la consulta ni en el ETag).
  return Number.isFinite(n) ? n + 0 : null;
}

interface Collected {
  readonly values: ReadonlyMap<string, string>;
  readonly issues: SpatialIssue[];
}

/** Rechaza parámetros desconocidos, repetidos o demasiado largos (sin ambigüedad entre cachés y servidor). */
function collect(params: URLSearchParams, allowed: readonly string[]): Collected {
  const values = new Map<string, string>();
  const issues: SpatialIssue[] = [];
  for (const key of new Set(params.keys())) {
    if (!allowed.includes(key)) {
      issues.push({ field: key.slice(0, 32), code: 'param.unknown' });
      continue;
    }
    const all = params.getAll(key);
    const first = all[0] ?? '';
    if (all.length > 1) issues.push({ field: key, code: 'param.duplicate' });
    else if (first.length > SPATIAL_LIMITS.maxParamLength) {
      issues.push({ field: key, code: 'param.too_long' });
    } else values.set(key, first);
  }
  return { values, issues };
}

function parseBbox(raw: string | undefined, issues: SpatialIssue[]): Bbox | null {
  if (raw === undefined || raw === '') {
    issues.push({ field: 'bbox', code: 'param.missing' });
    return null;
  }
  const parts = raw.split(',');
  const nums = parts.map(coordinate);
  if (parts.length !== 4 || nums.some((n) => n === null)) {
    issues.push({ field: 'bbox', code: 'bbox.format' });
    return null;
  }
  const [west, south, east, north] = nums as [number, number, number, number];
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    issues.push({ field: 'bbox', code: 'bbox.range' });
    return null;
  }
  if (west >= east || south >= north) {
    issues.push({ field: 'bbox', code: 'bbox.order' });
    return null;
  }
  const w = DATA_WORKING_AREA;
  if (east <= w.west || west >= w.east || north <= w.south || south >= w.north) {
    // También atrapa lat/lon intercambiados: no se «adivina», se rechaza.
    issues.push({ field: 'bbox', code: 'bbox.outside_working_area' });
    return null;
  }
  const clamped: Bbox = {
    west: Math.max(west, w.west),
    south: Math.max(south, w.south),
    east: Math.min(east, w.east),
    north: Math.min(north, w.north),
  };
  const area = (clamped.east - clamped.west) * (clamped.north - clamped.south);
  if (area > SPATIAL_LIMITS.maxBboxAreaDeg2) {
    issues.push({ field: 'bbox', code: 'bbox.too_large' });
    return null;
  }
  return clamped;
}

function parseInteger(
  raw: string | undefined,
  field: string,
  min: number,
  max: number,
  issues: SpatialIssue[],
): number | null {
  if (raw === undefined) return null;
  if (!UINT.test(raw)) {
    issues.push({ field, code: `${field}.format` });
    return null;
  }
  const n = Number(raw);
  if (n < min || n > max) {
    issues.push({ field, code: `${field}.range` });
    return null;
  }
  return n;
}

function parseLayers(
  raw: string | undefined,
  fallback: readonly SpatialLayerId[],
  issues: SpatialIssue[],
): readonly SpatialLayerId[] {
  if (raw === undefined) return fallback;
  const parts = raw.split(',');
  if (raw === '' || parts.some((p) => p === '')) {
    issues.push({ field: 'layers', code: 'layers.empty' });
    return fallback;
  }
  const unique = [...new Set(parts)];
  if (unique.length > SPATIAL_LIMITS.maxLayers) {
    issues.push({ field: 'layers', code: 'layers.too_many' });
    return fallback;
  }
  const known = new Set<string>(SPATIAL_LAYER_IDS);
  if (unique.some((p) => !known.has(p))) {
    issues.push({ field: 'layers', code: 'layers.unknown' });
    return fallback;
  }
  return unique as SpatialLayerId[];
}

function parseLocale(raw: string | undefined, issues: SpatialIssue[]): Locale | null {
  if (raw === undefined) return null;
  if (!(LOCALES as readonly string[]).includes(raw)) {
    issues.push({ field: 'locale', code: 'locale.unsupported' });
    return null;
  }
  return raw as Locale;
}

function missing(values: ReadonlyMap<string, string>, field: string, issues: SpatialIssue[]) {
  if (!values.has(field) && !issues.some((i) => i.field === field)) {
    issues.push({ field, code: 'param.missing' });
  }
}

export function parseAreasQuery(params: URLSearchParams): Parsed<AreasQuery> {
  const { values, issues } = collect(params, ['bbox', 'zoom', 'layers', 'limit', 'locale']);
  const bbox = parseBbox(values.get('bbox'), issues);
  const zoom = parseInteger(
    values.get('zoom'),
    'zoom',
    SPATIAL_LIMITS.zoomMin,
    SPATIAL_LIMITS.zoomMax,
    issues,
  );
  missing(values, 'zoom', issues);
  const layers = parseLayers(values.get('layers'), ['protected_areas'], issues);
  const limit =
    parseInteger(values.get('limit'), 'limit', 1, SPATIAL_LIMITS.maxLimit, issues) ??
    SPATIAL_LIMITS.defaultLimit;
  const locale = parseLocale(values.get('locale'), issues);
  if (issues.length > 0 || !bbox || zoom === null) return { ok: false, issues };
  return { ok: true, value: { bbox, zoom, layers, limit, locale } };
}

export function parseLocateQuery(params: URLSearchParams): Parsed<LocateQuery> {
  const { values, issues } = collect(params, ['lon', 'lat', 'layers', 'locale']);
  const w = DATA_WORKING_AREA;
  const point = (field: 'lon' | 'lat', min: number, max: number): number | null => {
    const raw = values.get(field);
    if (raw === undefined) {
      missing(values, field, issues);
      return null;
    }
    const n = coordinate(raw);
    if (n === null) {
      issues.push({ field, code: `${field}.format` });
      return null;
    }
    if (n < min || n > max) {
      issues.push({ field, code: 'point.outside_working_area' });
      return null;
    }
    return n;
  };
  const lon = point('lon', w.west, w.east);
  const lat = point('lat', w.south, w.north);
  const layers = parseLayers(values.get('layers'), SPATIAL_LAYER_IDS, issues);
  const locale = parseLocale(values.get('locale'), issues);
  if (issues.length > 0 || lon === null || lat === null) return { ok: false, issues };
  return { ok: true, value: { lon, lat, layers, locale } };
}

export function parseAreaDetailQuery(id: string, params: URLSearchParams): Parsed<AreaDetailQuery> {
  const { values, issues } = collect(params, ['zoom', 'locale']);
  if (!UUID.test(id)) issues.push({ field: 'id', code: 'id.format' });
  const zoom =
    parseInteger(
      values.get('zoom'),
      'zoom',
      SPATIAL_LIMITS.zoomMin,
      SPATIAL_LIMITS.zoomMax,
      issues,
    ) ?? SPATIAL_LIMITS.detailZoom;
  const locale = parseLocale(values.get('locale'), issues);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { id: id.toLowerCase(), zoom, locale } };
}

/**
 * Tolerancia de simplificación para MOSTRAR (grados): un píxel de una tesela de 512 px a ese zoom.
 * La superficie y la pertenencia NUNCA se calculan sobre la geometría simplificada.
 */
export function simplifyToleranceDegrees(zoom: number): number {
  return 360 / (512 * 2 ** zoom);
}

/** Decimales de las coordenadas: ≈ 1/10 de píxel (mín. 2, máx. 7 ≈ 1 cm). */
export function coordinateDecimals(zoom: number): number {
  const tolerance = simplifyToleranceDegrees(zoom);
  return Math.min(7, Math.max(2, Math.ceil(-Math.log10(tolerance / 10))));
}

export type NameProvenance = 'source_local' | 'source_common' | 'editorial';

export interface AreaNameRow {
  readonly area_id: string;
  readonly locale: Locale | null;
  readonly name: string;
  readonly provenance: NameProvenance;
}

export interface PickedName {
  readonly value: string;
  /** `null` = el nombre local de la fuente (en el idioma del propio lugar, sin traducir). */
  readonly locale: Locale | null;
  readonly provenance: NameProvenance;
}

/**
 * Elige el nombre a mostrar, sin inventar ni traducir: el del idioma pedido si existe (editorial antes que
 * de fuente) y, si no, el nombre LOCAL de la fuente. Nunca el de otro idioma distinto del pedido.
 */
export function pickName(rows: readonly AreaNameRow[], locale: Locale | null): PickedName | null {
  const toPicked = (r: AreaNameRow): PickedName => ({
    value: r.name,
    locale: r.locale,
    provenance: r.provenance,
  });
  if (locale) {
    const editorial = rows.find((r) => r.locale === locale && r.provenance === 'editorial');
    if (editorial) return toPicked(editorial);
    const common = rows.find((r) => r.locale === locale && r.provenance === 'source_common');
    if (common) return toPicked(common);
  }
  const local = rows.find((r) => r.locale === null && r.provenance === 'source_local');
  return local ? toPicked(local) : null;
}
