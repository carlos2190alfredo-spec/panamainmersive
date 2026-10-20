import { z } from 'zod';
import { DESTINATION_KEYS, type DestinationKey } from '@/domains/tourism/destinations';
import { WORKING_BBOX } from './bounds';

/**
 * Puntos de referencia y encuadre de cada destino, derivados de entidades de Overture elegidas POR ID
 * (`pipelines/anchors/anchors.config.json`) y verificadas por `derive_anchors.py`.
 * NO son límites oficiales ni la geometría del destino: sirven para ubicar la cámara y colocar un marcador.
 */

const lon = z.number().min(WORKING_BBOX.west).max(WORKING_BBOX.east);
const lat = z.number().min(WORKING_BBOX.south).max(WORKING_BBOX.north);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const Bounds = z.tuple([lon, lat, lon, lat]);

const Source = z.object({
  role: z.enum(['anchor', 'anchor_point', 'bounds', 'corroboration']),
  id: z.string().optional(),
  release: z.string().min(1),
  theme: z.string().min(1),
  type: z.string().min(1),
  name: z.string().nullable(),
  geometryType: z.string().min(1),
});

const Anchor = z.object({
  anchor: z.object({
    lon,
    lat,
    method: z.enum(['point', 'division_point', 'representative_point']),
  }),
  bounds: Bounds.nullable(),
  defaultZoom: z.number().min(1).max(18),
  sources: z.array(Source).min(1),
  corroboration: z.array(Source.extend({ withinAnchor: z.literal(true) })),
  note: z.string().optional(),
});

const AnchorsDocument = z.object({
  release: z.string().min(1),
  sourceClass: z.literal('osm_derived'),
  license: z.string().min(1),
  attribution: z.string().min(1),
  disclaimer: z.string().min(1),
  destinations: z.record(z.string(), Anchor),
});

export interface DestinationAnchor {
  readonly lon: number;
  readonly lat: number;
  /** [oeste, sur, este, norte] o `null` si la fuente solo da un punto. */
  readonly bounds: readonly [number, number, number, number] | null;
  readonly defaultZoom: number;
}

export interface AnchorsDocumentInfo {
  readonly release: string;
  readonly license: string;
  readonly attribution: string;
  readonly disclaimer: string;
}

export interface ParsedAnchors {
  readonly info: AnchorsDocumentInfo;
  readonly anchors: Readonly<Record<DestinationKey, DestinationAnchor>>;
}

/**
 * Valida el documento: forma, rango de Panamá, que cada fuente sea de la misma release, que el ancla caiga
 * dentro de su encuadre y que haya exactamente un ancla por destino del registro (ni faltan ni sobran).
 * Lanza ante cualquier discrepancia: es preferible no arrancar a mostrar una ubicación no verificada.
 */
export function parseAnchors(raw: unknown): ParsedAnchors {
  const doc = AnchorsDocument.parse(raw);
  const keys = Object.keys(doc.destinations).sort();
  const expected = [...DESTINATION_KEYS].sort();
  if (keys.join('|') !== expected.join('|')) {
    throw new Error(`Las anclas no coinciden con el registro de destinos: ${keys.join(', ')}`);
  }
  const anchors = {} as Record<DestinationKey, DestinationAnchor>;
  for (const key of DESTINATION_KEYS) {
    const entry = doc.destinations[key];
    if (!entry) throw new Error(`Falta el ancla de ${key}`);
    for (const source of [...entry.sources, ...entry.corroboration]) {
      if (source.release !== doc.release) {
        throw new Error(
          `${key}: la fuente ${source.theme}/${source.type} es de la release ${source.release}`,
        );
      }
    }
    const anchorSource = entry.sources.find((source) => source.role === 'anchor');
    if (!anchorSource?.id || !UUID.test(anchorSource.id)) {
      throw new Error(`${key}: el ancla debe identificarse por ID de Overture, nunca por nombre`);
    }
    const { lon: aLon, lat: aLat } = entry.anchor;
    const b = entry.bounds;
    if (b) {
      if (!(b[0] < b[2] && b[1] < b[3])) throw new Error(`${key}: encuadre degenerado`);
      if (aLon < b[0] || aLon > b[2] || aLat < b[1] || aLat > b[3]) {
        throw new Error(`${key}: el ancla cae fuera de su propio encuadre`);
      }
    }
    anchors[key] = { lon: aLon, lat: aLat, bounds: b, defaultZoom: entry.defaultZoom };
  }
  return {
    info: {
      release: doc.release,
      license: doc.license,
      attribution: doc.attribution,
      disclaimer: doc.disclaimer,
    },
    anchors,
  };
}
