import isthmus from './isthmus.generated.json' with { type: 'json' };
import { DESTINATIONS, type DestinationEntry, type DestinationKey } from './destinations';

/**
 * «Travesía» (ADR-0026): el país se recorre de OESTE a ESTE, entre el Caribe (norte) y el Pacífico (sur), y cada destino
 * aparece en su PUNTO DE REFERENCIA (el ancla de data/anchors, elegida por un método documentado: no es la extensión del
 * destino). La silueta y los puntos salen de `isthmus.generated.json` (pipelines/brand/make_isthmus.py, contorno de
 * referencia del país de Overture, NO oficial; ODbL, derechos provisionales: L-01). Lógica pura: sin UI, sin fecha, sin red.
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
  /**
   * Lado de la escena en el que va el panel de texto para NO tapar el punto en su localizador (r:F1): un destino de la
   * mitad oeste del dibujo lleva el panel al este (`end`), y al revés. Antes se alternaba por posición en la lista y el
   * panel tapaba Boquete y Coiba.
   */
  readonly panelSide: 'start' | 'end';
  /** El punto está en la franja baja del dibujo (Coiba): en el teléfono el panel no puede subir sobre el localizador. */
  readonly low: boolean;
}

const POINTS = isthmus.points as Readonly<Record<string, IsthmusPoint>>;

/** El dibujo del istmo: `viewBox` y ruta SVG (continente e islas de más de 25 km²). */
export const ISTHMUS_SHAPE = { viewBox: isthmus.viewBox, path: isthmus.path } as const;

/** Procedencia del dibujo (versión de Overture, atribución, licencia y método): el crédito visible cita la versión. */
export const ISTHMUS_PROVENANCE = isthmus.provenance;

const WIDTH = Number(isthmus.viewBox.split(' ')[2]);
const HEIGHT = Number(isthmus.viewBox.split(' ')[3]);

/**
 * Desde qué altura relativa (0 arriba, 1 abajo) un punto cuenta como «bajo»: en el teléfono el panel sube 3rem sobre el
 * localizador (≈ el 20 % inferior del dibujo) y la separación de planos lo baja hasta 1,5rem más; con 0,7 el punto de
 * Santa Catalina (0,61, con el ancla equivocada de La Mesa) quedaba a 4 px del panel con movimiento (r2:H-12). Hoy: Coiba
 * (0,87) y Santa Catalina (0,81 desde E-106).
 */
export const LOW_POINT = 0.55;

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
      const along = Math.min(1, Math.max(0, point.x / WIDTH));
      return {
        entry,
        point,
        along,
        panelSide: along < 0.5 ? ('end' as const) : ('start' as const),
        low: point.y / HEIGHT > LOW_POINT,
      };
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
