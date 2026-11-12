import type { Map as MapLibreMap } from 'maplibre-gl';
import { buildTour, type TourMotion } from '@/domains/experience/tour';

/**
 * Lo que el recorrido usa del mapa: SOLO métodos públicos de `Map` de MapLibre (un `Pick`, no una conversión de tipo). Así,
 * usar algo que `Map` no expone es un error de compilación y no un fallo en el navegador: `isEasing()` existe en la cámara
 * interna de MapLibre 6.15 pero no en `Map`, y con una conversión el build lo aceptaba y el recorrido se rompía al detenerse.
 */
export type TourMap = Pick<
  MapLibreMap,
  'on' | 'off' | 'isMoving' | 'stop' | 'flyTo' | 'easeTo' | 'getBearing' | 'getMaxZoom'
>;

/** Cómo terminó un recorrido: completo, detenido con su botón (u otra orden) o interrumpido por un gesto sobre el mapa. */
export type TourEnd = 'done' | 'stopped' | 'interrupted';

/** Teclas que NO mueven el mapa: con el foco en él, pulsarlas no interrumpe el recorrido (Tab solo cambia el foco). */
const NON_NAVIGATION_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'Escape']);
const TOUR_INPUTS = ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const;
const linear = (t: number): number => t;

/**
 * Ejecuta el guion del recorrido 3D (`buildTour`, ADR-0027 A1) sobre el mapa y devuelve con qué detenerlo. Cada paso empieza
 * cuando el anterior LLEGA (su `moveend` sin animación en curso: un `moveend` de un `resize` a mitad de giro no cuenta) y
 * tras su pausa. Cualquier gesto de la persona sobre el mapa (puntero, rueda, toque o una tecla de navegación con el foco en
 * él) lo interrumpe ANTES de que MapLibre lo atienda (escucha en captura en el contenedor), y la cámara se queda donde la
 * deja su gesto. Con movimiento reducido el guion son cortes sostenidos (sin animación: `easeTo` con duración 0, porque
 * `jumpTo` no admite `offset`).
 *
 * Dónde cae el ancla: en el punto que dice `offset()` (px respecto al centro del lienzo), que el visor mide al empezar cada paso
 * (el centro del hueco que el HUD deja libre). Se usa el `offset` de MapLibre, que coloca el ancla ahí al final de cada paso y
 * la mantiene ahí mientras gira (el centro se recalcula en cada cuadro sobre ese punto), y NO su `padding`, que persistiría en
 * el mapa y cambiaría lo que significa el centro escrito en la URL. Medido a 1024×768 con la ficha abierta: sin desplazamiento
 * el volcán quedaba en el borde de la ficha y el carrusel.
 */
export function runTour(
  map: TourMap,
  container: HTMLElement,
  target: { readonly lon: number; readonly lat: number; readonly zoom: number },
  motion: TourMotion,
  offset: () => readonly [x: number, y: number],
  onStep: (step: number, total: number) => void,
  onEnd: (reason: TourEnd) => void,
): (reason: Exclude<TourEnd, 'done'>) => void {
  const steps = buildTour({
    center: { lon: target.lon, lat: target.lat },
    zoom: Math.min(target.zoom, map.getMaxZoom()),
    startBearing: map.getBearing(),
    motion,
  });
  let index = 0;
  let ended = false;
  let timer: number | undefined;
  const listenerOptions = { capture: true, passive: true } as const;

  const interrupt = (event: Event): void => {
    if (event instanceof KeyboardEvent && NON_NAVIGATION_KEYS.has(event.key)) return;
    finish('interrupted');
  };
  const arrived = (): void => {
    // `isMoving()` es público: `_afterEase` lo pone a `false` ANTES de emitir el `moveend` final, y un `moveend` ajeno a mitad de
    // giro (el de un `resize`) llega con él aún a `true`. (`isEasing()` es de la cámara interna: `Map` no lo expone en 6.15.)
    if (ended || map.isMoving()) return;
    map.off('moveend', arrived);
    hold();
  };
  function finish(reason: TourEnd): void {
    if (ended) return;
    ended = true;
    window.clearTimeout(timer);
    map.off('moveend', arrived);
    for (const type of TOUR_INPUTS) container.removeEventListener(type, interrupt, listenerOptions);
    // Detenido con su botón (u otra orden), la cámara se para donde esté; interrumpido, el gesto de la persona ya la paró.
    if (reason === 'stopped' && map.isMoving()) map.stop();
    container.dataset.tour = reason;
    onEnd(reason);
  }
  function hold(): void {
    timer = window.setTimeout(() => {
      index += 1;
      go();
    }, steps[index]?.holdMs ?? 0);
  }
  function go(): void {
    if (ended) return;
    const step = steps[index];
    if (!step) {
      finish('done');
      return;
    }
    container.dataset.tourStep = `${String(index + 1)}/${String(steps.length)}`;
    onStep(index + 1, steps.length);
    const [x, y] = offset();
    const camera = {
      center: [step.center[0], step.center[1]] as [number, number],
      zoom: step.zoom,
      pitch: step.pitch,
      bearing: step.bearing,
      offset: [x, y] as [number, number],
    };
    if (step.durationMs === 0) {
      map.easeTo({ ...camera, duration: 0 });
      hold();
      return;
    }
    map.on('moveend', arrived);
    if (step.motion === 'fly') map.flyTo({ ...camera, duration: step.durationMs });
    else map.easeTo({ ...camera, duration: step.durationMs, easing: linear });
  }

  for (const type of TOUR_INPUTS) container.addEventListener(type, interrupt, listenerOptions);
  container.dataset.tour = 'running';
  go();
  return finish;
}
