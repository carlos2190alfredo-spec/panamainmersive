import { TERRAIN_ORIGIN } from './security-headers';

/**
 * Direcciones de los datos del mapa. Función/constantes puras: las usan `next.config.ts` (CSP), `public-env.ts`
 * (cliente) y las pruebas. Toda dirección ABSOLUTA aporta su origen a `connect-src` (docs/security.md).
 */
export const BASEMAP_FILE = 'panama-basemap.pmtiles';
export const BASEMAP_MANIFEST_FILE = 'panama-basemap.manifest.json';

/** AWS Terrain Tiles (Terrarium). Forma «virtual-hosted»: CORS `*` verificado el 2026-10-20 (evidence-log E-25). */
export const DEFAULT_TERRAIN_TILES_URL = `${TERRAIN_ORIGIN}/terrarium/{z}/{x}/{y}.png`;

export const GLYPHS_URL_PATH = '/map-assets/glyphs/{fontstack}/{range}.pbf';

/** Origen (esquema + host + puerto) de una URL absoluta http(s); `null` si es relativa o inválida. */
export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function hasTileTemplate(url: string): boolean {
  return url.includes('{z}') && url.includes('{x}') && url.includes('{y}');
}

export function joinUrl(base: string, file: string): string {
  return `${base.replace(/\/+$/, '')}/${file}`;
}

export interface MapUrlInputs {
  readonly tilesBaseUrl?: string | undefined;
  readonly terrainTilesUrl?: string | undefined;
}

/** Orígenes externos a los que el navegador necesita conectarse para dibujar el mapa. */
export function mapConnectOrigins(input: MapUrlInputs): string[] {
  const terrain = input.terrainTilesUrl ?? DEFAULT_TERRAIN_TILES_URL;
  const origins = [originOf(terrain), originOf(input.tilesBaseUrl ?? '/data')];
  return [...new Set(origins.filter((o): o is string => o !== null))];
}
