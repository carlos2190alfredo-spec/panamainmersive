'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useSyncExternalStore } from 'react';
import {
  applyMapUrlState,
  paramsFromSearch,
  parseMapUrlState,
  type MapLayerId,
  type MapUrlState,
  type ParsedMapUrlState,
} from '@/domains/geography/map-url-state';
import type { CameraState } from '@/domains/geography/camera';
import type { DestinationKey } from '@/domains/tourism/destinations';

/**
 * La URL ES el estado compartido del mapa (`d`, `c`, `l`): el lienzo, la lista, la tarjeta y las capas la leen y la
 * escriben, así que no hace falta un almacén aparte y todo enlace es reproducible. `pushState`/`replaceState`
 * se integran con `useSearchParams` de Next, que es lo que hace reaccionar a los consumidores.
 */
export type UrlWriteMode = 'push' | 'replace';

export function readMapUrlState(search: string): ParsedMapUrlState {
  return parseMapUrlState(paramsFromSearch(new URLSearchParams(search)));
}

function writeMapUrlState(change: (current: MapUrlState) => MapUrlState, mode: UrlWriteMode): void {
  const current = readMapUrlState(window.location.search).state;
  // Las comas no necesitan escape en una query y hacen legible `c=lon,lat,…`.
  const nextSearch = applyMapUrlState(new URLSearchParams(window.location.search), change(current))
    .toString()
    .replace(/%2C/gi, ',');
  if (nextSearch === window.location.search.replace(/^\?/, '')) return;
  const url = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
  // `null`, NO `window.history.state`: si el estado trae la marca interna `__NA` de Next, su parche se salta la
  // integración con el enrutador y `useSearchParams` no se entera (funciona el primer cambio y no los siguientes).
  // Con `null` Next conserva él mismo su estado interno.
  if (mode === 'push') window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

export function useMapUrlState(): ParsedMapUrlState {
  const text = useSearchParams().toString();
  return useMemo(() => readMapUrlState(text), [text]);
}

/** Elegir un destino: entrada de historial nueva (Atrás vuelve) y se descarta la cámara anterior. */
export function selectDestination(key: DestinationKey): void {
  writeMapUrlState(
    (current) => ({ destination: key, ...(current.layers ? { layers: current.layers } : {}) }),
    'push',
  );
}

export function clearDestination(): void {
  writeMapUrlState(
    (current) => ({
      ...(current.camera ? { camera: current.camera } : {}),
      ...(current.layers ? { layers: current.layers } : {}),
    }),
    'replace',
  );
}

export function writeCamera(camera: CameraState): void {
  writeMapUrlState((current) => ({ ...current, camera }), 'replace');
}

export function writeLayers(layers: readonly MapLayerId[]): void {
  writeMapUrlState((current) => ({ ...current, layers }), 'replace');
}

const noop = () => () => undefined;

/** `false` en el servidor y en la hidratación; `true` después. Evita desajustes de hidratación. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
