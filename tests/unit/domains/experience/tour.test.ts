import { describe, expect, it } from 'vitest';
import {
  REDUCED_HOLD_MS,
  TOUR_APPROACH_MS,
  TOUR_ORBIT_SEGMENTS,
  TOUR_ORBIT_SEGMENT_MS,
  TOUR_PITCH_DEG,
  buildTour,
  tourDurationMs,
  type TourInput,
} from '@/domains/experience/tour';
import { DESTINATION_ANCHORS } from '@/lib/destination-anchors';

const input = (over: Partial<TourInput> = {}): TourInput => ({
  center: { lon: -82.43482, lat: 8.77637 },
  zoom: 12,
  startBearing: 0,
  motion: 'animated',
  ...over,
});

/** Giro (grados, en (−180, 180]) que el motor hará para ir de `from` a `to` por el camino más corto. */
const shortestTurn = (from: number, to: number): number => {
  const d = (((to - from) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
};

describe('recorrido animado', () => {
  it('es una aproximación seguida de una vuelta COMPLETA, toda sobre el ancla y al zoom pedido', () => {
    const steps = buildTour(input());
    expect(steps).toHaveLength(1 + TOUR_ORBIT_SEGMENTS);
    expect(steps[0]?.motion).toBe('fly');
    expect(steps.slice(1).every((s) => s.motion === 'orbit')).toBe(true);
    for (const step of steps) {
      expect(step.center).toEqual([-82.43482, 8.77637]);
      expect(step.zoom).toBe(12);
      expect(step.pitch).toBe(TOUR_PITCH_DEG);
    }
  });

  it('cada cuarto de vuelta gira +90° (el camino más corto es siempre el horario) y la vuelta termina en el rumbo inicial', () => {
    for (const startBearing of [0, 37, 179, 180, 271, -45, 725]) {
      const steps = buildTour(input({ startBearing }));
      const bearings = steps.map((s) => s.bearing);
      for (let i = 1; i < bearings.length; i++) {
        expect(shortestTurn(bearings[i - 1] as number, bearings[i] as number)).toBeCloseTo(90, 9);
      }
      expect(bearings.every((b) => b >= 0 && b < 360)).toBe(true);
      expect(shortestTurn(bearings[0] as number, bearings.at(-1) as number)).toBeCloseTo(0, 9);
    }
  });

  it('parte del rumbo actual: la vista no salta al norte al empezar', () => {
    expect(buildTour(input({ startBearing: 123 }))[0]?.bearing).toBe(123);
    expect(buildTour(input({ startBearing: -90 }))[0]?.bearing).toBe(270);
  });

  it('dura lo declarado (aproximación + cuatro cuartos de 6 s) y sin pausas: el giro es continuo', () => {
    const steps = buildTour(input());
    expect(steps.every((s) => s.holdMs === 0)).toBe(true);
    expect(tourDurationMs(steps)).toBe(
      TOUR_APPROACH_MS + TOUR_ORBIT_SEGMENTS * TOUR_ORBIT_SEGMENT_MS,
    );
    expect(tourDurationMs(steps)).toBe(27_500);
  });
});

describe('recorrido con movimiento reducido', () => {
  it('no anima nada: todos los pasos son cortes instantáneos', () => {
    const steps = buildTour(input({ motion: 'reduced' }));
    expect(steps.every((s) => s.motion === 'cut' && s.durationMs === 0)).toBe(true);
  });

  it('son las cuatro orientaciones, cada una sostenida el tiempo de mirarla; la vuelta al rumbo inicial no se repite', () => {
    const steps = buildTour(input({ motion: 'reduced', startBearing: 10 }));
    expect(steps.map((s) => s.bearing)).toEqual([10, 100, 190, 280]);
    expect(steps.every((s) => s.holdMs === REDUCED_HOLD_MS)).toBe(true);
    expect(tourDurationMs(steps)).toBe(4 * REDUCED_HOLD_MS);
  });

  it('enseña las MISMAS vistas que el animado (salvo el regreso final), no otras', () => {
    const animated = buildTour(input({ startBearing: 33 }));
    const reduced = buildTour(input({ startBearing: 33, motion: 'reduced' }));
    const view = (s: (typeof animated)[number]) => [s.center, s.zoom, s.pitch, s.bearing];
    expect(reduced.map(view)).toEqual(animated.slice(0, reduced.length).map(view));
  });
});

describe('entradas', () => {
  it.each([
    ['longitud no finita', { center: { lon: Number.NaN, lat: 8 } }],
    ['latitud fuera de rango', { center: { lon: -80, lat: 91 } }],
    ['longitud fuera de rango', { center: { lon: 181, lat: 8 } }],
    ['zoom negativo', { zoom: -1 }],
    ['zoom infinito', { zoom: Number.POSITIVE_INFINITY }],
    ['rumbo no finito', { startBearing: Number.NaN }],
  ] as const)('rechaza %s (no se adivina una cámara)', (_name, over) => {
    expect(() => buildTour(input(over as Partial<TourInput>))).toThrow(RangeError);
  });

  it('no modifica la entrada y da lo mismo con la misma entrada (determinista)', () => {
    const frozen = Object.freeze({
      ...input({ startBearing: 200 }),
      center: Object.freeze({ lon: -79.53472, lat: 8.95255 }),
    });
    expect(buildTour(frozen)).toEqual(buildTour(frozen));
  });

  it('funciona con el ancla real de cada uno de los nueve destinos (sin inventar paradas)', () => {
    for (const [key, anchor] of Object.entries(DESTINATION_ANCHORS.anchors)) {
      const steps = buildTour({
        center: { lon: anchor.lon, lat: anchor.lat },
        zoom: anchor.defaultZoom,
        startBearing: 0,
        motion: 'animated',
      });
      expect(
        steps.every((s) => s.center[0] === anchor.lon && s.center[1] === anchor.lat),
        key,
      ).toBe(true);
    }
  });
});
