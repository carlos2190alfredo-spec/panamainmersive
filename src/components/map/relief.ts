import { MAP_LAYER_IDS, type MapLayerId } from '@/domains/geography/map-url-state';
import { currentUrlLayers, writeLayers } from './use-map-url-state';

/**
 * Encender y apagar el relieve de AWS en la URL (`l`), compartido por «Relieve en 3D» (herramientas) y «Recorrido 3D» (ficha
 * del destino; ADR-0027 A1). Los dos lo piden SOLO al pulsar (opt-in: sin pulsar, cero peticiones a AWS).
 *
 * Al encender se añade también el sombreado, sin el cual el relieve en 3D casi no se distingue (el terreno se dibuja sin luz).
 * Al apagar se retira el sombreado SOLO si lo añadió el encendido: si la persona ya lo tenía (o llegó con él en un enlace) se
 * conserva. Esa memoria es del módulo (y no de un componente) porque quien enciende puede ser la ficha y quien apaga el botón
 * de las herramientas; `forgetReliefMemory` la borra al desmontar el mapa.
 */

/**
 * Capas que piden el relieve a AWS: las que usan la fuente de terreno en el registro de capas. Se nombran aquí (y no con
 * `usesTerrain` de `map-style`) para no llevar el registro de capas entero a la carga inicial de Explorar: una prueba
 * comprueba que coinciden con `usesTerrain` para cada capa.
 */
export const RELIEF_LAYER_IDS: readonly MapLayerId[] = ['hillshade', 'terrain3d'];

/** ¿Se está pidiendo el relieve de AWS con estas capas? (3D, o solo «Sombreado», que usa la misma fuente) */
export function reliefInUse(layers: readonly MapLayerId[]): boolean {
  return layers.some((id) => RELIEF_LAYER_IDS.includes(id));
}

let addedHillshade = false;

/** Enciende el relieve en 3D (con el sombreado). No hace nada si ya estaba encendido. Lee la URL de AHORA, no un render. */
export function enableRelief(terrainAllowed: boolean): void {
  const current = currentUrlLayers(terrainAllowed);
  if (current.includes('terrain3d')) return;
  addedHillshade = !current.includes('hillshade');
  writeLayers(
    MAP_LAYER_IDS.filter((id) => current.includes(id) || id === 'terrain3d' || id === 'hillshade'),
  );
}

/** Apaga el relieve en 3D y retira el sombreado solo si lo añadió el encendido. Conserva el resto de las capas. */
export function disableRelief(terrainAllowed: boolean): void {
  const current = currentUrlLayers(terrainAllowed);
  const dropHillshade = addedHillshade;
  addedHillshade = false;
  writeLayers(
    MAP_LAYER_IDS.filter(
      (id) => current.includes(id) && id !== 'terrain3d' && !(dropHillshade && id === 'hillshade'),
    ),
  );
}

/** Al desmontar el mapa: lo encendido en otra visita no decide qué se apaga en esta. */
export function forgetReliefMemory(): void {
  addedHillshade = false;
}
