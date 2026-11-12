import type { MapLayerId } from './map-url-state';

/**
 * «Relieve en 3D» del HUD de Explorar (ADR-0025 §8): un modo que agrupa dos capas de terceros (AWS Terrain Tiles) ya
 * existentes en el registro. Lógica pura sobre la lista `l` de la URL.
 *  - `terrain3d` levanta el terreno; sin el sombreado (`hillshade`) casi no se distingue, así que el modo añade las dos.
 *  - Al apagarlo se quita `terrain3d` y también el sombreado SI lo añadió el propio modo: quien ya tenía el sombreado
 *    encendido por su cuenta lo conserva (`keepShading`). Nunca se toca ninguna otra capa.
 * Nada de esto carga datos por sí solo: solo describe qué escribir en la URL cuando la persona pulsa el botón.
 */
export const RELIEF_CAMERA_PITCH_DEG = 55;
/** Si la cámara ya está así de inclinada (o más) al encender el relieve, no se toca: la persona ya la inclinó. */
export const RELIEF_PITCH_ALREADY_TILTED_DEG = 45;
export const RELIEF_ANIMATION_MS = 900;

export const isRelief3dOn = (layers: readonly MapLayerId[]): boolean =>
  layers.includes('terrain3d');

/** Capas de `l` tras encender o apagar el relieve en 3D (sin duplicados; el orden canónico lo pone quien serializa). */
export function withRelief3d(
  layers: readonly MapLayerId[],
  on: boolean,
  options: { readonly keepShading: boolean },
): MapLayerId[] {
  const next = new Set(layers);
  if (on) {
    next.add('terrain3d');
    next.add('hillshade');
  } else {
    next.delete('terrain3d');
    if (!options.keepShading) next.delete('hillshade');
  }
  return [...next];
}
