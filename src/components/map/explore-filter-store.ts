import { useSyncExternalStore } from 'react';
import {
  NO_FILTER,
  withQuery,
  type ExploreFilter,
  type KindFilter,
} from '@/domains/tourism/explore-filter';
import type { SearchIndexEntry } from '@/domains/tourism/search';

/**
 * Almacén mínimo (sin librerías, como `hud-store.ts` y `area-selection-store.ts`) del filtro por tipo y la búsqueda de
 * Explorar. Es estado LOCAL de la pantalla, a propósito NO va en la URL: ni `map-url-state.ts` (d, c, l, a) ni los
 * enlaces compartidos cambian, y recargar o compartir vuelve a mostrar los nueve destinos.
 *
 * Lo leen tres consumidores a la vez: el carrusel (oculta tarjetas), el lienzo (retira marcadores y reagrupa) y los
 * propios controles (chips y campo de búsqueda). `lastChange` dice cuál de los dos controles se tocó último para que la
 * región `aria-live` anuncie el recuento con el mensaje adecuado.
 */
export type FilterChange = 'kind' | 'search' | null;

export interface ExploreFilterSnapshot extends ExploreFilter {
  readonly lastChange: FilterChange;
}

const INITIAL: ExploreFilterSnapshot = { ...NO_FILTER, lastChange: null };

let snapshot: ExploreFilterSnapshot = INITIAL;
const listeners = new Set<() => void>();

function emit(next: ExploreFilterSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Elige el tipo (`'all'` = todos). No hace nada si ya estaba elegido. */
export function setKindFilter(kind: KindFilter): void {
  if (snapshot.kind === kind) return;
  emit({ ...snapshot, kind, lastChange: 'kind' });
}

/** Cambia el texto de la búsqueda; las claves que coinciden salen del índice (por CLAVE, nunca por nombre). */
export function setSearchQuery(query: string, index: readonly SearchIndexEntry[]): void {
  if (snapshot.query === query) return;
  emit({ ...withQuery(snapshot, query, index), lastChange: 'search' });
}

/** Al salir de la pantalla: el filtro no sobrevive a la visita (es estado local, no un ajuste guardado). */
export function resetExploreFilter(): void {
  if (snapshot === INITIAL) return;
  emit(INITIAL);
}

/** Suscripción al almacén (la usa `useSyncExternalStore`; también las pruebas). Devuelve la función que la cancela. */
export const subscribeExploreFilter = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useExploreFilter(): ExploreFilterSnapshot {
  return useSyncExternalStore(
    subscribeExploreFilter,
    () => snapshot,
    () => INITIAL,
  );
}

/** Foto actual del almacén (para pruebas y para leer fuera de React). */
export const getExploreFilter = (): ExploreFilterSnapshot => snapshot;
