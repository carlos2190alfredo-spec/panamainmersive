import { useSyncExternalStore } from 'react';

/**
 * Hoja inferior móvil de Explorar (ADR-0025 §8, entrega 5j · E3). Almacén mínimo (sin librerías, como `hud-store.ts`)
 * con dos cosas que varios controles necesitan y la URL no puede decir:
 *  - si la hoja está abierta (la abren el asa, «Capas y leyenda» y la elección de un área; la cierran el asa y Escape),
 *  - si la pantalla usa la presentación MÓVIL (< 56rem: mapa a pantalla completa y hoja) o la de escritorio (HUD).
 *
 * En escritorio la hoja no existe como caja (`display: contents`): su estado «abierto» no se ve y no hace nada.
 */

/** Anchura desde la que el HUD es el de escritorio. La misma que usa el CSS (`@media (min-width: 56rem)`). */
export const DESKTOP_QUERY = '(min-width: 56rem)';

/** Lo que tarda la hoja en abrirse (ms): hasta entonces su contenido mide menos de lo que acabará midiendo. */
export const SHEET_TRANSITION_MS = 300;

/** El cuerpo desplazable de la hoja (lo marca `HudSheet`). */
export const SHEET_BODY_SELECTOR = '[data-sheet-body]';

let open = false;
const listeners = new Set<() => void>();

function emit(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const setSheetOpen = (value: boolean): void => {
  emit(value);
};
export const isSheetOpen = (): boolean => open;

/** Al salir de la pantalla la hoja vuelve a su detente cerrado (el estado no sobrevive a la visita). */
export function resetSheetStore(): void {
  emit(false);
}

export function useSheetOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}

const subscribeLayout = (notify: () => void): (() => void) => {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', notify);
  return () => {
    query.removeEventListener('change', notify);
  };
};

/** ¿Es la presentación móvil (< 56rem)? En el servidor y al hidratar es «no»: el HTML que llega es el mismo en los dos. */
export function useMobileLayout(): boolean {
  return useSyncExternalStore(
    subscribeLayout,
    () => !window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/** Lo mismo, leído fuera de React (en un manejador de evento). */
export const isMobileLayout = (): boolean => !window.matchMedia(DESKTOP_QUERY).matches;

/**
 * Trae a la vista, DENTRO de la hoja, un elemento de su contenido (un grupo de capas, la ficha de un área): su borde
 * superior queda arriba del cuerpo. En móvil abre la hoja si estaba cerrada y espera a que termine de abrirse (hasta
 * entonces su cuerpo mide casi nada y desplazar no serviría); en escritorio no hay hoja y no hace nada. Mueve SOLO el
 * desplazamiento del cuerpo de la hoja: `scrollIntoView` también desplazaría la PÁGINA (el mapa y la cabecera) hasta
 * alinear el elemento.
 */
export function revealInSheet(find: () => Element | null): void {
  if (!isMobileLayout()) return;
  const wasOpen = open;
  emit(true);
  const reveal = () => {
    const el = find();
    const body = el?.closest(SHEET_BODY_SELECTOR);
    if (!el || !body) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    body.scrollTo({
      top: body.scrollTop + el.getBoundingClientRect().top - body.getBoundingClientRect().top,
      behavior: reduced ? 'auto' : 'smooth',
    });
  };
  if (wasOpen) reveal();
  else window.setTimeout(reveal, SHEET_TRANSITION_MS);
}
