import type { ReactNode } from 'react';
import type { DestinationKey, DestinationKind } from '@/domains/tourism/destinations';

/** Lo que el lienzo necesita de cada destino (todo serializable: viaja del servidor al cliente). */
export interface MapDestination {
  readonly key: DestinationKey;
  readonly name: string;
  /** Tipo del destino: el filtro por tipo retira del mapa los marcadores de los demás (su etiqueta traducida va en los chips). */
  readonly kind: DestinationKind;
  readonly lon: number;
  readonly lat: number;
  readonly bounds: readonly [number, number, number, number] | null;
  readonly defaultZoom: number;
}

/** Lo que muestra la tarjeta del destino seleccionado; `badge` ya viene renderizado en el servidor. */
export interface SelectedItem {
  readonly key: DestinationKey;
  readonly name: string;
  readonly kindLabel: string;
  readonly slug: string;
  readonly badge: ReactNode;
}
