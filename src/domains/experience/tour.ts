import { normalizeHeading } from '@/domains/geography/camera';

/**
 * Recorrido 3D de un destino (ADR-0027 A1): el GUION de un vuelo de cámara sobre el relieve, como lógica pura. Sin reloj, sin
 * red y sin motor de mapa: el visor (`MapStage`) ejecuta los pasos y decide cuándo empieza cada uno.
 *
 * Qué es, dicho con honestidad: una aproximación al ancla del destino y una vuelta completa a su alrededor, inclinada, sobre el
 * relieve (≈ 30 m de detalle, sin edificios). NO es un paseo a pie de calle ni un recorrido por interiores. No inventa paradas:
 * solo usa el ancla y el zoom del destino, que ya tienen fuente (`data/anchors/destination-anchors.json`). Las paradas concretas
 * (miradores, playas, museos) llegarán cuando existan con fuente y clave estable.
 *
 * Con movimiento reducido no hay animación: las mismas vistas se suceden por CORTES (sin desplazamiento ni giro en pantalla) y
 * cada una se sostiene `REDUCED_HOLD_MS`, el tiempo de mirarla; la persona puede detenerlo en cualquier momento.
 */

/** Inclinación (grados) del recorrido: la que admite el mapa también sin relieve (`MAX_PITCH` = 60 en `MapStage`). */
export const TOUR_PITCH_DEG = 60;
/** Aproximación hasta el ancla (vuelo con la curva del motor). */
export const TOUR_APPROACH_MS = 3_500;
/** Cuartos de vuelta: la órbita se parte en giros de 90° para que el motor gire siempre en el mismo sentido. */
export const TOUR_ORBIT_SEGMENTS = 4;
/** Duración de cada cuarto de vuelta (velocidad angular constante: 15°/s, un giro lento). */
export const TOUR_ORBIT_SEGMENT_MS = 6_000;
/** Con movimiento reducido, cuánto se sostiene cada vista antes del siguiente corte. */
export const REDUCED_HOLD_MS = 5_000;

export type TourMotion = 'animated' | 'reduced';

export interface TourInput {
  /** Ancla del destino (lon/lat en grados). */
  readonly center: { readonly lon: number; readonly lat: number };
  /** Zoom del recorrido: el del destino, ya limitado por el visor a lo que admite el mapa. */
  readonly zoom: number;
  /** Rumbo de la cámara al empezar: la vuelta parte de él (la vista no salta al norte). */
  readonly startBearing: number;
  readonly motion: TourMotion;
}

export interface TourStep {
  readonly center: readonly [lon: number, lat: number];
  readonly zoom: number;
  readonly pitch: number;
  /** Rumbo en [0, 360): cada paso de la vuelta suma 90°, de modo que el giro más corto es siempre el horario. */
  readonly bearing: number;
  /** `fly`: aproximación; `orbit`: giro a velocidad constante; `cut`: cambio instantáneo (movimiento reducido). */
  readonly motion: 'fly' | 'orbit' | 'cut';
  /** Duración del movimiento hasta esta vista (0 = instantáneo). */
  readonly durationMs: number;
  /** Pausa en esta vista antes del paso siguiente. */
  readonly holdMs: number;
}

/**
 * Pasos del recorrido. Animado: aproximación + `TOUR_ORBIT_SEGMENTS` cuartos de vuelta, que terminan donde empezó el giro
 * (≈ 27,5 s). Por cortes: las cuatro orientaciones (0°, 90°, 180° y 270° desde la inicial), cada una sostenida (20 s). Lanza
 * `RangeError` ante una entrada no finita o fuera de rango (no se adivina una cámara).
 */
export function buildTour(input: TourInput): readonly TourStep[] {
  const { center, zoom, startBearing, motion } = input;
  if (
    !Number.isFinite(center.lon) ||
    !Number.isFinite(center.lat) ||
    Math.abs(center.lon) > 180 ||
    Math.abs(center.lat) > 90
  ) {
    throw new RangeError(
      `Ancla del recorrido inválida: ${String(center.lon)}, ${String(center.lat)}`,
    );
  }
  if (!Number.isFinite(zoom) || zoom < 0) {
    throw new RangeError(`Zoom del recorrido inválido: ${String(zoom)}`);
  }
  if (!Number.isFinite(startBearing)) {
    throw new RangeError(`Rumbo inicial inválido: ${String(startBearing)}`);
  }
  const reduced = motion === 'reduced';
  const at = [center.lon, center.lat] as const;
  const start = normalizeHeading(startBearing);
  const approach: TourStep = {
    center: at,
    zoom,
    pitch: TOUR_PITCH_DEG,
    bearing: start,
    motion: reduced ? 'cut' : 'fly',
    durationMs: reduced ? 0 : TOUR_APPROACH_MS,
    holdMs: reduced ? REDUCED_HOLD_MS : 0,
  };
  // Animado, la vuelta se completa (el último cuarto vuelve al rumbo inicial). Por cortes, esa última vista repetiría la
  // primera: se omite y el recorrido son las cuatro orientaciones, cada una sostenida.
  const segments = reduced ? TOUR_ORBIT_SEGMENTS - 1 : TOUR_ORBIT_SEGMENTS;
  const orbit = Array.from({ length: segments }, (_, i): TourStep => ({
    center: at,
    zoom,
    pitch: TOUR_PITCH_DEG,
    bearing: normalizeHeading(start + ((i + 1) * 360) / TOUR_ORBIT_SEGMENTS),
    motion: reduced ? 'cut' : 'orbit',
    durationMs: reduced ? 0 : TOUR_ORBIT_SEGMENT_MS,
    holdMs: reduced ? REDUCED_HOLD_MS : 0,
  }));
  return [approach, ...orbit];
}

/** Duración total del recorrido (movimientos + pausas), para decirla y para medir en las pruebas. */
export function tourDurationMs(steps: readonly TourStep[]): number {
  return steps.reduce((total, step) => total + step.durationMs + step.holdMs, 0);
}
