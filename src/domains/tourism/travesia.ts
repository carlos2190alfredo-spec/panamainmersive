import isthmus from './isthmus.generated.json' with { type: 'json' };
import { DESTINATIONS, type DestinationEntry, type DestinationKey } from './destinations';

/**
 * «Travesía» (ADR-0026): el país se recorre de OESTE a ESTE, entre el Caribe (norte) y el Pacífico (sur), y cada destino
 * aparece en su posición real. La silueta y los puntos salen de `isthmus.generated.json` (pipelines/brand/make_isthmus.py,
 * contorno del país de Overture, ODbL, derechos provisionales: L-01). Lógica pura: sin UI, sin fecha, sin red.
 */
export interface IsthmusPoint {
  readonly x: number;
  readonly y: number;
  readonly lon: number;
  readonly lat: number;
}

export interface TravesiaStop {
  readonly entry: DestinationEntry;
  readonly point: IsthmusPoint;
  /** Posición a lo largo del istmo, de 0 (extremo oeste del dibujo) a 1 (extremo este). */
  readonly along: number;
}

const POINTS = isthmus.points as Readonly<Record<string, IsthmusPoint>>;

/** El dibujo del istmo: `viewBox` y ruta SVG (continente e islas de más de 25 km²). */
export const ISTHMUS_SHAPE = { viewBox: isthmus.viewBox, path: isthmus.path } as const;

const WIDTH = Number(isthmus.viewBox.split(' ')[2]);

/** El punto de un destino en el dibujo. Lanza si falta: un destino sin ancla no se coloca a ojo. */
export function isthmusPoint(key: DestinationKey): IsthmusPoint {
  const point = POINTS[key];
  if (!point) throw new Error(`Sin ancla en isthmus.generated.json para «${key}»`);
  return point;
}

/** Las paradas de la travesía, de oeste a este (longitud creciente; a igual longitud, por clave). */
export function travesiaStops(entries: readonly DestinationEntry[] = DESTINATIONS): TravesiaStop[] {
  return entries
    .map((entry) => {
      const point = isthmusPoint(entry.key);
      return { entry, point, along: Math.min(1, Math.max(0, point.x / WIDTH)) };
    })
    .sort((a, b) => a.point.lon - b.point.lon || a.entry.key.localeCompare(b.entry.key));
}

/** Hemisferio de una coordenada: la letra la pone el idioma (`Home.travesia.hemisphere.*`). */
export type Hemisphere = 'north' | 'south' | 'east' | 'west';

/** Grados absolutos con dos decimales en el formato del idioma, y su hemisferio. */
export function coordinateParts(
  value: number,
  axis: 'lat' | 'lon',
  locale: string,
): { degrees: string; hemisphere: Hemisphere } {
  const degrees = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  const hemisphere: Hemisphere =
    axis === 'lat' ? (value >= 0 ? 'north' : 'south') : value >= 0 ? 'east' : 'west';
  return { degrees, hemisphere };
}
