import { DESTINATION_KEYS, type DestinationKey } from './destinations';

/**
 * Lugares cercanos SIN VERIFICAR de un destino (ADR-0027 A2): actividades, dónde comer y dónde dormir según Overture Places.
 *
 * Qué son y qué no: lugares que la fuente sitúa a menos de un radio DECLARADO del ancla del destino
 * (`pipelines/places/places.config.json`), relacionados por clave y distancia, nunca por nombre. No son un catálogo ni una
 * recomendación: pueden estar cerrados o mal situados, y nada de esto se ha comprobado (por eso no hay horarios, ni «abierto
 * ahora», ni teléfonos, correos o redes: E-102, L-04).
 *
 * Las listas cerradas de este módulo son las mismas que las de la configuración del pipeline (una prueba lo exige). El
 * validador está escrito a mano a propósito: este módulo viaja al navegador y zod viola la CSP (E-51). La respuesta de la API
 * es un dato de red: se valida antes de usarla, aunque sea nuestra.
 */
export const PLACE_GROUPS = ['activities', 'food', 'lodging'] as const;
export type PlaceGroup = (typeof PLACE_GROUPS)[number];

export const PLACE_KINDS = {
  activities: ['tour', 'water', 'nature', 'culture', 'family', 'adventure'],
  food: ['restaurant', 'cafe', 'sweets', 'bar', 'food_other'],
  lodging: ['hotel', 'hostel', 'resort', 'guesthouse', 'lodge', 'campground', 'lodging_other'],
} as const satisfies Record<PlaceGroup, readonly string[]>;
export type PlaceKind = (typeof PLACE_KINDS)[PlaceGroup][number];

/** Proveedores y licencias admitidos (por registro, como los trae `sources` de Overture). */
export const PLACE_DATASETS = [
  'Overture',
  'meta',
  'Foursquare',
  'Microsoft',
  'AllThePlaces',
  'PinMeTo',
] as const;
export type PlaceDataset = (typeof PLACE_DATASETS)[number];
export const PLACE_LICENSES = ['CDLA-Permissive-2.0', 'Apache-2.0', 'CC0-1.0'] as const;
export type PlaceLicense = (typeof PLACE_LICENSES)[number];

/** Nombre propio de cada proveedor tal como se escribe (no se traduce). */
export const DATASET_NAMES: Readonly<Record<PlaceDataset, string>> = {
  Overture: 'Overture Maps',
  meta: 'Meta',
  Foursquare: 'Foursquare',
  Microsoft: 'Microsoft',
  AllThePlaces: 'All the Places',
  PinMeTo: 'PinMeTo',
};

/** Tope duro por grupo que acepta el cliente (el pipeline publica 25; esto solo frena una respuesta desmesurada). */
export const MAX_PLACES_PER_GROUP = 50;
export const MAX_PLACE_NAME_LENGTH = 120;
/** Rectángulo de trabajo de Panamá (el mismo del pipeline: `PANAMA_BBOX`). No es un límite oficial. */
const WORKING_AREA = { west: -83.2, south: 6.9, east: -77.0, north: 9.8 } as const;

export interface PlaceSource {
  readonly dataset: PlaceDataset;
  readonly license: PlaceLicense;
}

export interface NearbyPlace {
  /** ID estable de Overture (GERS). */
  readonly id: string;
  /** Nombre tal como lo trae la fuente (limpio de caracteres de control): se pinta como TEXTO, sin `lang`. */
  readonly name: string;
  readonly kind: PlaceKind;
  readonly lon: number;
  readonly lat: number;
  /** Distancia en línea recta al punto de referencia del destino, en metros. */
  readonly distanceM: number;
  /** Última actualización que declara la fuente (AAAA-MM-DD) o `null` si no la declara. No es una verificación. */
  readonly sourceUpdated: string | null;
  readonly sources: readonly PlaceSource[];
}

export interface PlaceGroupBlock {
  /** Cuántos hay en el radio tras los filtros (puede ser mayor que `places.length`: se publica solo el tope). */
  readonly total: number;
  /** Del más cercano al más lejano. */
  readonly places: readonly NearbyPlace[];
}

export interface DestinationPlaces {
  readonly destination: DestinationKey;
  readonly release: string;
  readonly radiusKm: number;
  readonly groups: Readonly<Record<PlaceGroup, PlaceGroupBlock>>;
}

export function groupOfKind(kind: PlaceKind): PlaceGroup {
  for (const group of PLACE_GROUPS) {
    if ((PLACE_KINDS[group] as readonly string[]).includes(kind)) return group;
  }
  throw new Error(`Tipo sin grupo: ${kind}`);
}

// --- validación (entrada hostil) -------------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE = /^\d{4}-\d{2}-\d{2}\.\d+$/;
/** Caracteres de control o de formato (bidi, anchura cero): un nombre limpio no lleva ninguno. */
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/** ¿Es un nombre aceptable para pintar como texto? (no se «arregla»: si no lo es, la respuesta entera se rechaza) */
export function isCleanPlaceName(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length > 0 &&
    v.length <= MAX_PLACE_NAME_LENGTH &&
    v === v.trim() &&
    !CONTROL_OR_FORMAT.test(v) &&
    !/\s{2,}/.test(v)
  );
}

function parseSource(v: unknown): PlaceSource | null {
  if (!isRecord(v) || !oneOf(PLACE_DATASETS, v.dataset) || !oneOf(PLACE_LICENSES, v.license)) {
    return null;
  }
  return { dataset: v.dataset, license: v.license };
}

function parsePlace(v: unknown, group: PlaceGroup, radiusKm: number): NearbyPlace | null {
  if (!isRecord(v)) return null;
  const { id, name, kind, lon, lat, distanceM, sourceUpdated, sources } = v;
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  if (!isCleanPlaceName(name)) return null;
  if (!oneOf(PLACE_KINDS[group], kind)) return null;
  if (!isFiniteNumber(lon) || lon < WORKING_AREA.west || lon > WORKING_AREA.east) return null;
  if (!isFiniteNumber(lat) || lat < WORKING_AREA.south || lat > WORKING_AREA.north) return null;
  if (!Number.isInteger(distanceM) || (distanceM as number) < 0) return null;
  if ((distanceM as number) > radiusKm * 1000 + 2) return null;
  if (
    sourceUpdated !== null &&
    (typeof sourceUpdated !== 'string' || !ISO_DATE.test(sourceUpdated))
  )
    return null;
  if (!Array.isArray(sources) || sources.length === 0 || sources.length > 10) return null;
  const parsedSources = sources.map(parseSource);
  if (parsedSources.some((s) => s === null)) return null;
  return {
    id,
    name,
    kind,
    lon,
    lat,
    distanceM: distanceM as number,
    sourceUpdated,
    sources: parsedSources as PlaceSource[],
  };
}

function parseGroup(v: unknown, group: PlaceGroup, radiusKm: number): PlaceGroupBlock | null {
  if (!isRecord(v) || !Array.isArray(v.places) || v.places.length > MAX_PLACES_PER_GROUP) {
    return null;
  }
  const { total } = v;
  if (!Number.isInteger(total) || (total as number) < v.places.length) return null;
  const places: NearbyPlace[] = [];
  let last = -1;
  const ids = new Set<string>();
  for (const raw of v.places) {
    const place = parsePlace(raw, group, radiusKm);
    // Ordenados del más cercano al más lejano y sin repetir: si no, la lista diría otra cosa de la que se anuncia.
    if (!place || place.distanceM < last || ids.has(place.id)) return null;
    last = place.distanceM;
    ids.add(place.id);
    places.push(place);
  }
  return { total: total as number, places };
}

/**
 * Valida la respuesta de `GET /api/places/{destino}` (o una entrada del archivo publicado). Devuelve `null` ante CUALQUIER
 * desajuste: no se aprovecha una parte (un lugar mal formado podría ser el síntoma de una respuesta manipulada).
 */
export function parseDestinationPlaces(
  json: unknown,
  expected: DestinationKey,
): DestinationPlaces | null {
  if (!isRecord(json) || json.status !== 'unverified') return null;
  const { destination, release, radiusKm, groups } = json;
  if (destination !== expected || !oneOf(DESTINATION_KEYS, destination)) return null;
  if (typeof release !== 'string' || !RELEASE.test(release)) return null;
  if (!isFiniteNumber(radiusKm) || radiusKm <= 0 || radiusKm > 50) return null;
  if (!isRecord(groups)) return null;
  const parsed: Partial<Record<PlaceGroup, PlaceGroupBlock>> = {};
  for (const group of PLACE_GROUPS) {
    const block = parseGroup(groups[group], group, radiusKm);
    if (!block) return null;
    parsed[group] = block;
  }
  return {
    destination,
    release,
    radiusKm,
    groups: parsed as Record<PlaceGroup, PlaceGroupBlock>,
  };
}

/**
 * Distancia que se ENSEÑA: redondeada a decenas de metros por debajo de 1 km (la posición de la fuente no da para más) y a
 * cien metros por encima. Es la distancia en línea recta al punto de referencia, no a pie ni en coche.
 */
export function displayDistanceM(distanceM: number): number {
  if (distanceM < 1000) return Math.max(10, Math.round(distanceM / 10) * 10);
  return Math.round(distanceM / 100) * 100;
}

/** Proveedores de un lugar sin el propio Overture (que está en todos): «Meta», «Foursquare y Microsoft»… */
export function contributingDatasets(place: NearbyPlace): readonly PlaceDataset[] {
  const seen = new Set<PlaceDataset>();
  for (const s of place.sources) if (s.dataset !== 'Overture') seen.add(s.dataset);
  return [...seen];
}

/** Licencias distintas de un lugar, en el orden de la lista cerrada. */
export function placeLicenses(place: NearbyPlace): readonly PlaceLicense[] {
  return PLACE_LICENSES.filter((l) => place.sources.some((s) => s.license === l));
}
