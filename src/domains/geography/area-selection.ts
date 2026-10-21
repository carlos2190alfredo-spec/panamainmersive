/**
 * Selección de un área en el mapa (F3.d, ADR-0018). Lógica pura: todo lo que llega de una tesela o de la URL es
 * entrada NO confiable. La identidad de un área es su ID (el de Overture en las teselas), nunca su nombre.
 */

/** Los IDs de Overture (GERS) son UUID. */
const AREA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 200;

/** ID válido en minúsculas, o `null`. */
export function parseAreaId(raw: string): string | null {
  return raw.length <= 64 && AREA_ID.test(raw) ? raw.toLowerCase() : null;
}

export interface AreaCandidate {
  readonly id: string;
  /** Nombre LOCAL de la fuente (la tesela no lleva traducciones); `null` si la fuente no lo trae. */
  readonly name: string | null;
}

/** Lo mínimo que se usa de una entidad renderizada (compatible con `MapGeoJSONFeature`). */
export interface FeatureLike {
  readonly properties?: Readonly<Record<string, unknown>> | null;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Los caracteres de control (C0 y C1) se sustituyen por espacios; el texto se acota y se normaliza.
  const withoutControls = Array.from(value, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : ch;
  }).join('');
  const cleaned = withoutControls.replace(/\s+/g, ' ').trim();
  return cleaned === '' ? null : cleaned.slice(0, MAX_NAME_LENGTH);
}

/**
 * Candidatos únicos a partir de entidades renderizadas (una misma área aparece en varias teselas). Con nombre,
 * primero y en el orden del idioma de la persona; sin nombre, después y por ID (orden determinista).
 * `total` cuenta todos los únicos; `items` está acotado a `limit`.
 */
export function candidatesFromFeatures(
  features: readonly FeatureLike[],
  idProperty: string,
  locale: string,
  limit: number,
): { items: AreaCandidate[]; total: number } {
  const byId = new Map<string, AreaCandidate>();
  for (const feature of features) {
    const rawId = feature.properties?.[idProperty];
    const id = typeof rawId === 'string' ? parseAreaId(rawId) : null;
    if (!id) continue;
    const name = cleanName(feature.properties?.name);
    const known = byId.get(id);
    // Si otra tesela trae el nombre y esta no, se conserva el nombre.
    if (!known || (known.name === null && name !== null)) byId.set(id, { id, name });
  }
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const sorted = [...byId.values()].sort((a, b) => {
    if (a.name !== null && b.name !== null) {
      return collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
    }
    if (a.name !== null) return -1;
    if (b.name !== null) return 1;
    return a.id.localeCompare(b.id);
  });
  return { items: sorted.slice(0, Math.max(0, limit)), total: sorted.length };
}

export type Bounds = readonly [west: number, south: number, east: number, north: number];

/** Caja envolvente de una geometría GeoJSON desconocida (lon, lat); `null` si no hay coordenadas válidas. */
export function geometryBounds(geometry: unknown): Bounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (node: unknown, depth: number): void => {
    if (!Array.isArray(node) || depth > 6) return;
    const [lon, lat] = node as unknown[];
    if (typeof lon === 'number' && typeof lat === 'number') {
      if (
        Number.isFinite(lon) &&
        Number.isFinite(lat) &&
        Math.abs(lon) <= 180 &&
        Math.abs(lat) <= 90
      ) {
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
      return;
    }
    for (const child of node as unknown[]) visit(child, depth + 1);
  };
  if (typeof geometry === 'object' && geometry !== null && 'coordinates' in geometry) {
    visit(geometry.coordinates, 0);
  }
  return Number.isFinite(west) ? [west, south, east, north] : null;
}
