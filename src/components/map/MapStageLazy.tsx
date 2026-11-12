'use client';

import dynamic from 'next/dynamic';
import { MapBlocked } from './MapBlocked';
import type { MapDestination } from './map-data';

/**
 * El lienzo (ciclo de vida de MapLibre, marcadores, URL ↔ cámara, su CSS y el de MapLibre) pesa más que todo el resto de
 * Explorar junto y no hace falta para pintar ni para hidratar el HUD: se carga DESPUÉS de hidratar, en su propio chunk
 * (`ssr: false`; el hueco ya lo reserva el CSS de la página, así que no hay salto de maquetación). MapLibre y PMTiles ya
 * iban aparte. Medido en docs/performance.md (M-08): −5,6 KB de JS y −2,9 KB de CSS en la carga inicial de Explorar.
 *
 * Bloqueado por derechos no hay mapa que cargar: ese aviso sí se pinta en el servidor (`MapBlocked`, sin MapLibre).
 */
const MapStage = dynamic(() => import('./MapStage').then((m) => m.MapStage), { ssr: false });

export function MapStageLazy({
  destinations,
  blocked,
  terrainAllowed,
}: {
  destinations: readonly MapDestination[];
  /** Los derechos no permiten mostrar el mapa base (p. ej. política provisional en producción). */
  blocked: boolean;
  terrainAllowed: boolean;
}) {
  if (blocked) return <MapBlocked />;
  return <MapStage destinations={destinations} terrainAllowed={terrainAllowed} />;
}
