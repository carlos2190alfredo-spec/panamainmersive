import { useSyncExternalStore } from 'react';
import type { AreaCandidate, Bounds } from '@/domains/geography/area-selection';

/**
 * Almacén mínimo (sin librerías) que comparten el lienzo del mapa, la lista de áreas en la vista y la ficha.
 * La SELECCIÓN vive en la URL (`a`); aquí solo está lo que el lienzo sabe y los demás no:
 *  - las áreas dibujadas en la vista actual (la alternativa por teclado al clic),
 *  - los nombres vistos (para titular la ficha antes de que llegue la API, o si no llega),
 *  - una petición de encuadre (la ficha pide al lienzo que muestre el área; no se mueve la cámara sola).
 */
export interface VisibleAreas {
  readonly items: readonly AreaCandidate[];
  readonly total: number;
  /** `false` hasta que el lienzo ha publicado una vista (la lista no dice «no hay áreas» antes de saberlo). */
  readonly ready: boolean;
  /** El mapa no se pudo inicializar (sin WebGL, sin datos, bloqueado por derechos): no habrá lista nunca. */
  readonly mapUnavailable: boolean;
}

export interface AreaStoreSnapshot {
  readonly visible: VisibleAreas;
  readonly known: ReadonlyMap<string, string | null>;
  readonly frameRequest: { readonly bounds: Bounds; readonly nonce: number } | null;
}

const EMPTY: AreaStoreSnapshot = {
  visible: { items: [], total: 0, ready: false, mapUnavailable: false },
  known: new Map(),
  frameRequest: null,
};

let snapshot: AreaStoreSnapshot = EMPTY;
const listeners = new Set<() => void>();

function emit(next: AreaStoreSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function remember(
  known: ReadonlyMap<string, string | null>,
  items: readonly AreaCandidate[],
): ReadonlyMap<string, string | null> {
  let changed = false;
  const next = new Map(known);
  for (const { id, name } of items) {
    const previous = next.get(id);
    // Se conserva un nombre ya visto aunque otra vista no lo traiga
    if (previous === undefined || (previous === null && name !== null)) {
      next.set(id, name);
      changed = true;
    }
  }
  return changed ? next : known;
}

const sameItems = (a: readonly AreaCandidate[], b: readonly AreaCandidate[]): boolean =>
  a.length === b.length && a.every((x, i) => x.id === b[i]?.id && x.name === b[i]?.name);

/** El lienzo publica las áreas de la vista; si no cambió nada, no se notifica (evita renders en cada `idle`). */
export function publishVisibleAreas(items: readonly AreaCandidate[], total: number): void {
  const known = remember(snapshot.known, items);
  const same =
    snapshot.visible.ready &&
    snapshot.visible.total === total &&
    sameItems(snapshot.visible.items, items);
  if (same && known === snapshot.known) return;
  emit({ ...snapshot, visible: { items, total, ready: true, mapUnavailable: false }, known });
}

/** Recuerda nombres vistos (p. ej. el del área sobre la que se hizo clic). */
export function rememberAreas(items: readonly AreaCandidate[]): void {
  const known = remember(snapshot.known, items);
  if (known !== snapshot.known) emit({ ...snapshot, known });
}

/** El mapa no está disponible: la lista lo dice en lugar de esperar para siempre. */
export function markMapUnavailable(): void {
  if (snapshot.visible.mapUnavailable) return;
  emit({ ...snapshot, visible: { items: [], total: 0, ready: false, mapUnavailable: true } });
}

export function requestFrame(bounds: Bounds): void {
  emit({ ...snapshot, frameRequest: { bounds, nonce: (snapshot.frameRequest?.nonce ?? 0) + 1 } });
}

/** Al desmontar el mapa: la lista no debe quedarse con áreas de un lienzo que ya no existe. */
export function resetAreaStore(): void {
  emit({ ...EMPTY, known: snapshot.known });
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useAreaStore(): AreaStoreSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
