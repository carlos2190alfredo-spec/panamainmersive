// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTour, type TourEnd, type TourMap } from '@/components/map/tour-runner';
import {
  REDUCED_HOLD_MS,
  TOUR_APPROACH_MS,
  TOUR_ORBIT_SEGMENTS,
  TOUR_ORBIT_SEGMENT_MS,
} from '@/domains/experience/tour';

/**
 * El ejecutor del recorrido 3D (ADR-0027 A1) contra un mapa SIMULADO que imita lo que hace MapLibre 6.15 y que importa aquí:
 * una animación pone `isMoving()` a `true`; al terminar lo pone a `false` y LUEGO emite `moveend` (`_afterEase`); con duración 0
 * termina al momento; un `resize` a mitad de animación emite `moveend` con `isMoving()` aún a `true`; `stop()` termina la animación
 * en curso emitiendo su `moveend`.
 * El vuelo real (WebGL) lo prueba la E2E; aquí, el orden de los pasos, las pausas, las paradas y las interrupciones.
 */
class FakeMap {
  moving = false;
  bearing = 0;
  maxZoom = 22;
  readonly calls: { kind: 'flyTo' | 'easeTo'; options: Record<string, unknown> }[] = [];
  stops = 0;
  private readonly listeners = new Set<() => void>();

  on(type: string, listener: () => void): this {
    if (type === 'moveend') this.listeners.add(listener);
    return this;
  }
  off(type: string, listener: () => void): this {
    if (type === 'moveend') this.listeners.delete(listener);
    return this;
  }
  isMoving(): boolean {
    return this.moving;
  }
  getBearing(): number {
    return this.bearing;
  }
  getMaxZoom(): number {
    return this.maxZoom;
  }
  flyTo(options: Record<string, unknown>): this {
    this.calls.push({ kind: 'flyTo', options });
    this.moving = true;
    return this;
  }
  easeTo(options: Record<string, unknown>): this {
    this.calls.push({ kind: 'easeTo', options });
    if (options.duration === 0)
      this.emit(); // sin animación: `_ease` llama a `frame(1)` y termina al momento
    else this.moving = true;
    return this;
  }
  stop(): this {
    this.stops += 1;
    if (this.moving) this.arrive();
    return this;
  }
  /** La animación llega: `_moving = false` y DESPUÉS `moveend`. */
  arrive(): void {
    this.moving = false;
    this.emit();
  }
  /** Un `moveend` ajeno (el de un `resize`) a mitad de animación. */
  foreignMoveEnd(): void {
    this.emit();
  }
  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

const TARGET = { lon: -82.43482, lat: 8.77637, zoom: 12 };

function start(
  motion: 'animated' | 'reduced' = 'animated',
  map = new FakeMap(),
  offset: () => readonly [number, number] = () => [0, 0],
) {
  const container = document.createElement('div');
  const child = document.createElement('button'); // un marcador dentro del contenedor del mapa
  container.append(child);
  document.body.append(container);
  const steps: [number, number][] = [];
  const ends: TourEnd[] = [];
  const stop = runTour(
    map as unknown as TourMap,
    container,
    TARGET,
    motion,
    offset,
    (step, total) => steps.push([step, total]),
    (reason) => ends.push(reason),
  );
  return { map, container, child, steps, ends, stop };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('recorrido animado', () => {
  it('vuela al ancla, da los cuatro cuartos de vuelta (cada uno cuando LLEGA el anterior) y termina', () => {
    const { map, container, steps, ends } = start();
    expect(container.dataset.tour).toBe('running');
    expect(map.calls).toHaveLength(1);
    expect(map.calls[0]?.kind).toBe('flyTo');
    expect(map.calls[0]?.options).toMatchObject({
      center: [TARGET.lon, TARGET.lat],
      zoom: 12,
      duration: TOUR_APPROACH_MS,
    });
    for (let i = 1; i <= TOUR_ORBIT_SEGMENTS; i++) {
      map.arrive();
      vi.advanceTimersByTime(0);
      expect(map.calls).toHaveLength(1 + i);
      expect(map.calls[i]?.kind).toBe('easeTo');
      expect(map.calls[i]?.options).toMatchObject({
        duration: TOUR_ORBIT_SEGMENT_MS,
        bearing: (i * 90) % 360,
      });
      expect(container.dataset.tourStep).toBe(`${String(1 + i)}/5`);
    }
    expect(ends).toEqual([]);
    map.arrive();
    vi.advanceTimersByTime(0);
    expect(ends).toEqual(['done']);
    expect(container.dataset.tour).toBe('done');
    expect(steps).toEqual([1, 2, 3, 4, 5].map((n) => [n, 5]));
  });

  it('un `moveend` ajeno a mitad de giro (un `resize`) NO adelanta el paso', () => {
    const { map, container } = start();
    map.foreignMoveEnd();
    vi.advanceTimersByTime(10_000);
    expect(map.calls).toHaveLength(1);
    expect(container.dataset.tourStep).toBe('1/5');
    map.arrive();
    vi.advanceTimersByTime(0);
    expect(container.dataset.tourStep).toBe('2/5'); // control: la llegada de verdad sí lo adelanta
  });

  it('no pasa del zoom máximo del mapa', () => {
    const map = new FakeMap();
    map.maxZoom = 10;
    start('animated', map);
    expect(map.calls[0]?.options.zoom).toBe(10);
  });

  it('coloca el ancla en el desplazamiento que mide el visor AL EMPEZAR CADA PASO (el hueco libre puede cambiar)', () => {
    const offsets: (readonly [number, number])[] = [
      [-120, 80],
      [-60, 40],
    ];
    const map = new FakeMap();
    start('animated', map, () => offsets.shift() ?? [0, 0]);
    expect(map.calls[0]?.options.offset).toEqual([-120, 80]);
    map.arrive();
    vi.advanceTimersByTime(0);
    expect(map.calls[1]?.options.offset).toEqual([-60, 40]);
    expect(map.calls[1]?.options.center).toEqual([TARGET.lon, TARGET.lat]);
  });

  it('parte del rumbo actual del mapa', () => {
    const map = new FakeMap();
    map.bearing = 200;
    start('animated', map);
    expect(map.calls[0]?.options.bearing).toBe(200);
  });
});

describe('detener e interrumpir', () => {
  it('«detener» para la animación en curso, avisa una vez y no da ningún paso más', () => {
    const { map, container, ends, stop } = start();
    stop('stopped');
    expect(map.stops).toBe(1);
    expect(ends).toEqual(['stopped']);
    expect(container.dataset.tour).toBe('stopped');
    map.arrive();
    vi.advanceTimersByTime(60_000);
    expect(map.calls).toHaveLength(1);
    stop('stopped');
    expect(ends).toEqual(['stopped']); // una sola vez
  });

  it('detenerlo entre pasos (sin animación en curso) no llama a `stop()` del mapa', () => {
    const { map, ends, stop } = start('reduced');
    expect(map.moving).toBe(false);
    stop('stopped');
    expect(map.stops).toBe(0);
    expect(ends).toEqual(['stopped']);
  });

  it.each([
    ['pointerdown', () => new PointerEvent('pointerdown', { bubbles: true })],
    ['wheel', () => new WheelEvent('wheel', { bubbles: true })],
    ['touchstart', () => new Event('touchstart', { bubbles: true })],
    ['una flecha', () => new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })],
  ])(
    'un gesto de la persona (%s) dentro del mapa lo INTERRUMPE sin parar su propio gesto',
    (_name, event) => {
      const { map, child, container, ends } = start();
      child.dispatchEvent(event());
      expect(ends).toEqual(['interrupted']);
      expect(container.dataset.tour).toBe('interrupted');
      expect(map.stops).toBe(0);
      map.arrive();
      vi.advanceTimersByTime(60_000);
      expect(map.calls).toHaveLength(1);
    },
  );

  it('Tab (solo mueve el foco) no lo interrumpe; control: una flecha sí', () => {
    const { container, ends } = start();
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(ends).toEqual([]);
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(ends).toEqual(['interrupted']);
  });

  it('al terminar suelta sus oyentes: un gesto después no cambia nada', () => {
    const { container, ends, stop } = start();
    stop('stopped');
    container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(ends).toEqual(['stopped']);
    expect(container.dataset.tour).toBe('stopped');
  });
});

describe('recorrido con movimiento reducido', () => {
  it('son cortes (duración 0, sin animación) y cada vista se sostiene el tiempo declarado', () => {
    const { map, container, ends } = start('reduced', new FakeMap(), () => [0, -150]);
    expect(map.calls.map((c) => [c.kind, c.options.duration, c.options.offset])).toEqual([
      ['easeTo', 0, [0, -150]],
    ]);
    expect(container.dataset.tourStep).toBe('1/4');
    vi.advanceTimersByTime(REDUCED_HOLD_MS - 1);
    expect(container.dataset.tourStep).toBe('1/4');
    vi.advanceTimersByTime(1);
    expect(container.dataset.tourStep).toBe('2/4');
    vi.advanceTimersByTime(2 * REDUCED_HOLD_MS);
    expect(container.dataset.tourStep).toBe('4/4');
    expect(ends).toEqual([]);
    vi.advanceTimersByTime(REDUCED_HOLD_MS);
    expect(ends).toEqual(['done']);
    expect(map.calls.every((c) => c.options.duration === 0)).toBe(true);
    expect(map.calls).toHaveLength(4);
  });
});
