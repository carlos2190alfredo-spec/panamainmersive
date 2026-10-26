import type { DestinationKey, DestinationKind } from './destinations';
import { matchDestinations, normalizeSearchQuery, type SearchIndexEntry } from './search';

/**
 * Filtro por tipo y búsqueda de Explorar: lógica PURA (sin UI, sin estado, sin red) que comparten el carrusel, los
 * marcadores del mapa y los controles del HUD. Reglas (ADR-0025 §8, AGENTS.md):
 *  - **Por CLAVE, nunca por nombre** (homonimias: distrito Barú ≠ Volcán Barú). La búsqueda es `matchDestinations`.
 *  - **Intersección**: un destino se muestra si coincide con el tipo elegido Y con la búsqueda (si hay).
 *  - **El destino SELECCIONADO nunca se oculta** aunque no coincida: sin ello la ficha quedaría sin marcador ni tarjeta.
 *    Por eso «los que coinciden» (lo que se cuenta y se anuncia) y «los que se ven» (con el seleccionado) son dos cosas.
 *  - Sin filtro (`kind: 'all'` y sin búsqueda) se ven los nueve, exactamente como antes de existir el filtro.
 *  - La consulta se normaliza igual que los nombres (sin acentos, mayúsculas ni puntuación): una consulta que no deja
 *    ningún carácter útil («  », «!!») es «sin búsqueda», no «ningún resultado».
 */

export type KindFilter = DestinationKind | 'all';

export interface ExploreFilter {
  readonly kind: KindFilter;
  /** Lo que la persona escribió (tal cual: es el valor del campo). */
  readonly query: string;
  /** Claves que coinciden con la búsqueda; `null` = no hay búsqueda (coincide todo). */
  readonly matches: readonly DestinationKey[] | null;
}

/** Lo mínimo que hace falta saber de un destino para filtrarlo (lo cumplen `MapDestination` y `SearchIndexEntry`). */
export interface FilterItem {
  readonly key: DestinationKey;
  readonly kind: DestinationKind;
}

export const NO_FILTER: ExploreFilter = { kind: 'all', query: '', matches: null };

/** ¿Hay algún filtro activo (tipo o búsqueda)? */
export function isFiltering(filter: ExploreFilter): boolean {
  return filter.kind !== 'all' || filter.matches !== null;
}

/** La misma búsqueda con otro texto: calcula las claves que coinciden (o ninguna búsqueda si no queda nada útil). */
export function withQuery(
  filter: ExploreFilter,
  query: string,
  index: readonly SearchIndexEntry[],
): ExploreFilter {
  const matches =
    normalizeSearchQuery(query) === '' ? null : matchDestinations(index, query).map((e) => e.key);
  return { ...filter, query, matches };
}

/** Claves que COINCIDEN con el tipo y la búsqueda, en el orden de `items` (no incluye al seleccionado por serlo). */
export function matchingKeys(
  filter: ExploreFilter,
  items: readonly FilterItem[],
): DestinationKey[] {
  const wanted = filter.matches === null ? null : new Set(filter.matches);
  return items
    .filter(
      (item) =>
        (filter.kind === 'all' || item.kind === filter.kind) &&
        (wanted === null || wanted.has(item.key)),
    )
    .map((item) => item.key);
}

/** Claves que SE VEN: las que coinciden y, además, el destino seleccionado aunque no coincida. */
export function visibleKeys(
  filter: ExploreFilter,
  items: readonly FilterItem[],
  selected?: DestinationKey,
): DestinationKey[] {
  const matching = new Set(matchingKeys(filter, items));
  return items
    .filter((item) => matching.has(item.key) || item.key === selected)
    .map((item) => item.key);
}

export interface KindOption {
  readonly kind: DestinationKind;
  /** Cuántos destinos de este tipo hay en total (no depende de la búsqueda: es un dato del registro). */
  readonly count: number;
}

/** Los tipos que de verdad existen, en el orden en que aparecen en `items`, con su recuento. */
export function kindOptions(items: readonly FilterItem[]): KindOption[] {
  const counts = new Map<DestinationKind, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return [...counts].map(([kind, count]) => ({ kind, count }));
}
