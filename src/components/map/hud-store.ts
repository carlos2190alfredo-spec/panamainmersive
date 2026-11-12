import { useSyncExternalStore } from 'react';
import type { DestinationKey } from '@/domains/tourism/destinations';

/**
 * Almacén mínimo (sin librerías, como `area-selection-store.ts`) entre el lienzo del mapa y los controles del HUD que
 * viven FUERA de él (ficha del destino, carrusel). Lo que hay aquí es lo que el HUD no puede saber por la URL:
 *  - en qué estado está el mapa (los controles que dependen de él no se ofrecen hasta que está listo, ni cuando no
 *    habrá mapa: sin WebGL, sin datos, bloqueado por derechos),
 *  - una orden de «volver a encuadrar este destino» (la cámara explícita `c` manda sobre `d`, así que volver a
 *    elegir el mismo destino no hace nada; esto sí vuela). Lleva un `nonce` para que dos órdenes iguales seguidas
 *    se distingan,
 *  - el recorrido 3D (ADR-0027 A1): la ficha lo pide o lo detiene (`tourRequest`) y el lienzo, que lo ejecuta, publica
 *    en qué punto va (`tour`). Un recorrido es una animación de la cámara, no un estado del enlace: no va en la URL.
 */
export type HudMapStatus = 'loading' | 'ready' | 'unavailable';

/** `id` del aviso visible «el mapa no está activo» del carrusel: los botones «Ver en el mapa» lo usan como descripción. */
export const CAROUSEL_UNAVAILABLE_ID = 'destinations-map-unavailable';

export interface HudSnapshot {
  readonly mapStatus: HudMapStatus;
  readonly frameRequest: { readonly key: DestinationKey; readonly nonce: number } | null;
  /** Orden de inclinar (o enderezar) la cámara, que da el botón «Relieve en 3D»; se atiende una vez por `nonce`. */
  readonly pitchRequest: { readonly pitch: number; readonly nonce: number } | null;
  /** Orden de empezar el recorrido de un destino (`key`) o de detener el que haya (`null`); una vez por `nonce`. */
  readonly tourRequest: { readonly key: DestinationKey | null; readonly nonce: number } | null;
  /** El recorrido en curso (lo publica el lienzo): de qué destino y en qué paso va. `null` = ninguno. */
  readonly tour: {
    readonly key: DestinationKey;
    readonly step: number;
    readonly total: number;
  } | null;
}

const INITIAL: HudSnapshot = {
  mapStatus: 'loading',
  frameRequest: null,
  pitchRequest: null,
  tourRequest: null,
  tour: null,
};

let snapshot: HudSnapshot = INITIAL;
const listeners = new Set<() => void>();

function emit(next: HudSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** El lienzo publica su estado; si no cambió, no se notifica. */
export function publishMapStatus(mapStatus: HudMapStatus): void {
  if (snapshot.mapStatus === mapStatus) return;
  emit({ ...snapshot, mapStatus });
}

/** La ficha pide al lienzo que vuelva a encuadrar un destino (no hace nada si el mapa no está listo). */
export function requestFrameDestination(key: DestinationKey): void {
  emit({ ...snapshot, frameRequest: { key, nonce: (snapshot.frameRequest?.nonce ?? 0) + 1 } });
}

/**
 * El botón «Relieve en 3D» pide al lienzo inclinar (o enderezar) la cámara a `pitch` grados. Solo la pide la persona al
 * pulsarlo: nada se inclina solo. El lienzo la ignora si el mapa no está listo y respeta el movimiento reducido.
 */
export function requestPitch(pitch: number): void {
  emit({ ...snapshot, pitchRequest: { pitch, nonce: (snapshot.pitchRequest?.nonce ?? 0) + 1 } });
}

/** La ficha pide el recorrido 3D de un destino (el lienzo lo ignora si el mapa no está listo). */
export function requestTour(key: DestinationKey): void {
  emit({ ...snapshot, tourRequest: { key, nonce: (snapshot.tourRequest?.nonce ?? 0) + 1 } });
}

/**
 * Detiene el recorrido en curso: lo pide la ficha («Detener el recorrido») y cualquier otra orden que mueva la cámara
 * (inclinar, volver a encuadrar). Sin recorrido en curso no emite nada.
 */
export function requestStopTour(): void {
  if (snapshot.tour === null && snapshot.tourRequest?.key == null) return;
  emit({ ...snapshot, tourRequest: { key: null, nonce: (snapshot.tourRequest?.nonce ?? 0) + 1 } });
}

/** El lienzo publica el paso del recorrido (o `null` al terminar, al detenerse o al interrumpirlo la persona). */
export function publishTour(tour: HudSnapshot['tour']): void {
  const current = snapshot.tour;
  if (
    current === tour ||
    (current !== null &&
      tour !== null &&
      current.key === tour.key &&
      current.step === tour.step &&
      current.total === tour.total)
  ) {
    return;
  }
  emit({ ...snapshot, tour });
}

/** Al desmontar el mapa: el HUD no debe quedarse con el estado ni con órdenes de un lienzo que ya no existe. */
export function resetHudStore(): void {
  emit(INITIAL);
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useHudStore(): HudSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => INITIAL,
  );
}
