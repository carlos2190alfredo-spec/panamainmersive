import {
  SPATIAL_LIMITS,
  layerForKind,
  pickName,
  type AreaNameRow,
  type PickedName,
  type SpatialLayerId,
} from './spatial-query';
import type { Locale } from '@/i18n/locales';

/**
 * Ensamblado de la respuesta de la API espacial (ADR-0016). Lógica pura: recibe filas ya leídas con el rol
 * `anon` (la RLS decide la visibilidad) y produce GeoJSON honesto con procedencia, sin inventar nada:
 *  - la superficie solo se publica si se conoce su MÉTODO (un número sin método no es verificable);
 *  - el nombre es el de la fuente, sin traducir (`pickName`);
 *  - lo que no cabe en el presupuesto se omite de forma EXPLÍCITA (`truncated`, `skippedTooLarge`).
 */

export interface AreaRow {
  readonly id: string;
  readonly kind: string;
  readonly source_class: 'official' | 'osm_derived' | 'editorial';
  readonly overture_id: string | null;
  readonly geometry_version: number;
  readonly area_m2: number | null;
  readonly area_method: string | null;
  readonly source_version_id: string | null;
  readonly version_label: string | null;
  readonly retrieved_at: string | null;
  readonly license_name: string | null;
  readonly license_url: string | null;
  readonly attribution: string | null;
  readonly rights_status: 'verified' | 'provisional' | null;
  readonly source_key: string | null;
  readonly institution: string | null;
  readonly source_kind: string | null;
  /** GeoJSON de PostGIS (texto) o `null` cuando la consulta no pide geometría. */
  readonly geometry_json: string | null;
}

export interface SourceInfo {
  readonly ref: string;
  readonly key: string;
  readonly institution: string;
  readonly kind: string;
  readonly versionLabel: string;
  readonly retrievedAt: string;
  readonly license: { readonly name: string; readonly url: string | null };
  readonly attribution: string;
  readonly rightsStatus: 'verified' | 'provisional';
}

export interface AreaProperties {
  readonly id: string;
  readonly layer: SpatialLayerId | null;
  readonly kind: string;
  /** `official` | `osm_derived` | `editorial`: una geometría de OSM NUNCA se presenta como oficial. */
  readonly sourceClass: AreaRow['source_class'];
  readonly name: PickedName | null;
  /** Superficie geodésica del ORIGINAL; `null` si no se conoce el método. */
  readonly area: { readonly squareMeters: number; readonly method: string } | null;
  readonly geometryVersion: number;
  readonly overtureId: string | null;
  readonly sourceRef: string | null;
}

export interface AreaFeature {
  readonly type: 'Feature';
  readonly id: string;
  readonly geometry: unknown;
  readonly properties: AreaProperties;
}

export interface Assembled {
  readonly features: AreaFeature[];
  readonly sources: SourceInfo[];
  readonly returned: number;
  readonly truncated: boolean;
  readonly skippedTooLarge: number;
  readonly withheldByRights: number;
}

export interface AssembleInput {
  readonly rows: readonly AreaRow[];
  readonly names: readonly AreaNameRow[];
  readonly locale: Locale | null;
  readonly limit: number;
  readonly budgetBytes?: number;
  /** Sujetos de derechos con permiso de mostrar/transformar/redistribuir en este entorno. */
  readonly allowedSubjects: ReadonlySet<string>;
}

/** Bytes estimados de las propiedades de una entidad (holgura fija; el GeoJSON de PostGIS es ASCII). */
const FEATURE_OVERHEAD_BYTES = 700;

function sourceOf(row: AreaRow): SourceInfo | null {
  if (
    row.source_version_id === null ||
    row.source_key === null ||
    row.institution === null ||
    row.source_kind === null ||
    row.version_label === null ||
    row.retrieved_at === null ||
    row.license_name === null ||
    row.attribution === null ||
    row.rights_status === null
  ) {
    return null;
  }
  return {
    ref: row.source_version_id,
    key: row.source_key,
    institution: row.institution,
    kind: row.source_kind,
    versionLabel: row.version_label,
    retrievedAt: row.retrieved_at,
    license: { name: row.license_name, url: row.license_url },
    attribution: row.attribution,
    rightsStatus: row.rights_status,
  };
}

export function assembleAreas(input: AssembleInput): Assembled {
  const budget = input.budgetBytes ?? SPATIAL_LIMITS.maxResponseBytes;
  const namesByArea = new Map<string, AreaNameRow[]>();
  for (const n of input.names) {
    const list = namesByArea.get(n.area_id);
    if (list) list.push(n);
    else namesByArea.set(n.area_id, [n]);
  }

  const features: AreaFeature[] = [];
  const sources = new Map<string, SourceInfo>();
  let remaining = budget;
  let truncated = false;
  let skippedTooLarge = 0;
  let withheldByRights = 0;

  for (const row of input.rows) {
    // Defensa en profundidad: aunque la capa se haya autorizado, la FILA se comprueba contra su fuente.
    // Una geometría editorial es nuestra y no tiene fuente de terceros; cualquier otra sin fuente
    // identificable no se puede atribuir ni licenciar (la BD ya lo impide): no se sirve.
    const source = sourceOf(row);
    const permitted = source
      ? input.allowedSubjects.has(source.key)
      : row.source_class === 'editorial';
    if (!permitted) {
      withheldByRights++;
      continue;
    }
    if (features.length >= input.limit) {
      truncated = true;
      break;
    }
    const geometryBytes = row.geometry_json?.length ?? 0;
    const size = geometryBytes + FEATURE_OVERHEAD_BYTES;
    if (size > remaining) {
      skippedTooLarge++;
      truncated = true;
      continue;
    }
    remaining -= size;
    if (source) sources.set(source.ref, source);
    features.push({
      type: 'Feature',
      id: row.id,
      geometry: row.geometry_json === null ? null : (JSON.parse(row.geometry_json) as unknown),
      properties: {
        id: row.id,
        layer: layerForKind(row.kind),
        kind: row.kind,
        sourceClass: row.source_class,
        name: pickName(namesByArea.get(row.id) ?? [], input.locale),
        area:
          row.area_m2 !== null && row.area_method !== null
            ? { squareMeters: row.area_m2, method: row.area_method }
            : null,
        geometryVersion: row.geometry_version,
        overtureId: row.overture_id,
        sourceRef: source?.ref ?? null,
      },
    });
  }

  return {
    features,
    sources: [...sources.values()],
    returned: features.length,
    truncated,
    skippedTooLarge,
    withheldByRights,
  };
}
