import { useSyncExternalStore } from 'react';
import type { DestinationKey } from '@/domains/tourism/destinations';
import type { PlaceGroup } from '@/domains/tourism/places';

/**
 * Lugares cercanos sin verificar (ADR-0027 A2). Almacén mínimo (sin librerías, como `hud-store.ts`) entre la ficha del destino,
 * la lista del panel (un trozo diferido) y el lienzo del mapa:
 *  - `open`: la persona pidió ver los lugares (con el botón de la ficha o el del panel). Hasta entonces no se pide nada a la
 *    API ni se pinta nada en el mapa. No va en la URL: es una consulta, no un estado que compartir.
 *  - `revealRequest`: la ficha pide además llevar a la persona hasta la lista (abrir el panel o la hoja). Una vez por `nonce`.
 *  - `view`: lo que la lista tiene abierto ahora (destino, grupo y puntos); el lienzo lo pinta. `null` = nada.
 *  - `highlight` y `showRequest`: «Ver en el mapa» de un lugar (resaltarlo y encuadrarlo). El encuadre, una vez por `nonce`.
 */
export interface PlacePoint {
  readonly id: string;
  readonly lon: number;
  readonly lat: number;
}

export interface PlacesSnapshot {
  readonly open: boolean;
  readonly revealRequest: number;
  readonly view: {
    readonly destination: DestinationKey;
    readonly group: PlaceGroup;
    readonly points: readonly PlacePoint[];
  } | null;
  readonly highlight: string | null;
  readonly showRequest: (PlacePoint & { readonly nonce: number }) | null;
}

const INITIAL: PlacesSnapshot = {
  open: false,
  revealRequest: 0,
  view: null,
  highlight: null,
  showRequest: null,
};

let snapshot: PlacesSnapshot = INITIAL;
const listeners = new Set<() => void>();

function emit(next: PlacesSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Abre la lista de lugares; con `reveal`, además lleva a la persona hasta ella (lo pide el botón de la ficha). */
export function openNearbyPlaces(reveal: boolean): void {
  emit({
    ...snapshot,
    open: true,
    revealRequest: reveal ? snapshot.revealRequest + 1 : snapshot.revealRequest,
  });
}

/** Cierra la lista: el mapa deja de pintar los puntos y se olvida el resaltado. */
export function closeNearbyPlaces(): void {
  if (!snapshot.open && snapshot.view === null) return;
  emit({ ...snapshot, open: false, view: null, highlight: null, showRequest: null });
}

/** La lista publica qué grupo tiene abierto (o `null` al desmontarse). Si no cambia nada, no se notifica. */
export function publishPlacesView(view: PlacesSnapshot['view']): void {
  const current = snapshot.view;
  if (
    current === view ||
    (current !== null &&
      view !== null &&
      current.destination === view.destination &&
      current.group === view.group &&
      current.points === view.points)
  ) {
    return;
  }
  // El resaltado es de un lugar de la vista anterior: con otra vista, se olvida.
  emit({ ...snapshot, view, highlight: null });
}

/** «Ver en el mapa» de un lugar: se resalta y el lienzo lo encuadra (si el mapa está listo). */
export function requestShowPlace(point: PlacePoint): void {
  emit({
    ...snapshot,
    highlight: point.id,
    showRequest: { ...point, nonce: (snapshot.showRequest?.nonce ?? 0) + 1 },
  });
}

/** Al salir de Explorar: nada de una visita sobrevive a la siguiente. */
export function resetPlacesStore(): void {
  emit(INITIAL);
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function usePlacesStore(): PlacesSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => INITIAL,
  );
}
