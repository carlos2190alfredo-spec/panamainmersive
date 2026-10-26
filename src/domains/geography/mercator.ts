/**
 * Proyección Web Mercator en coordenadas de «mundo» (0..1 por eje, el origen arriba a la izquierda), con las mismas
 * convenciones que MapLibre 5+: el zoom 0 es un mundo de 512 px. Lógica pura que comparten el encuadre del HUD y el
 * agrupamiento de marcadores para razonar en píxeles sin tocar el mapa.
 */

/** Lado del mundo (px) a zoom 0. */
export const WORLD_PX = 512;

const MAX_LAT = 85.0511287798;
const RAD = Math.PI / 180;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Longitud → x del mundo (0 = −180°, 1 = +180°). */
export const worldX = (lon: number): number => (lon + 180) / 360;

/** Latitud → y del mundo (0 = norte, 1 = sur). */
export const worldY = (lat: number): number => {
  const s = Math.sin(clamp(lat, -MAX_LAT, MAX_LAT) * RAD);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

/** x del mundo → longitud. */
export const lonAt = (x: number): number => x * 360 - 180;

/** y del mundo → latitud. */
export const latAt = (y: number): number => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / RAD;

/** Píxeles que mide el mundo a `zoom`. */
export const worldSize = (zoom: number): number => WORLD_PX * 2 ** zoom;
