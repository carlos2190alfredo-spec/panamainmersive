/**
 * Constantes y tipos compartidos del mapa (sin lógica ni dependencias de otros módulos del mapa): los usan el
 * registro de capas (`layers.ts`) y el generador de estilo (`map-style.ts`) sin crear un ciclo de módulos.
 * `map-style.ts` lo reexporta, así que los imports externos no cambian.
 */
export const BASEMAP_SOURCE_LAYERS = [
  'land',
  'landcover',
  'landcover_detail',
  'protected',
  'boundaries',
  'ocean',
  'water',
  'water_detail',
  'waterway',
  'waterway_detail',
  'places',
] as const;

export const PALETTE_KEYS = [
  'land',
  'water',
  'forest',
  'wetland',
  'sand',
  'reef',
  'protectedFill',
  'protectedLine',
  'boundary',
  'label',
  'halo',
  'shade',
  'highlight',
] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type MapPalette = Readonly<Record<PaletteKey, string>>;

/** `protectedFill` → `--color-map-protected-fill`. */
export function paletteCssVariable(key: PaletteKey): string {
  return `--color-map-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/**
 * `protectedFill` → `ProtectedFill`: base de los nombres de clase `fill<Clave>` / `stroke<Clave>` de la leyenda
 * (`MapLegend.module.css`). Una prueba comprueba que el CSS tiene la clase de cada muestra del registro.
 */
export function paletteClassSuffix(key: PaletteKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export type LabelLanguage = 'es' | 'en' | 'pt' | 'fr' | 'de';

export const FONT_REGULAR = 'NotoSans-Regular';
export const FONT_BOLD = 'NotoSans-Bold';

export const BASEMAP_ATTRIBUTION = '© OpenStreetMap contributors, Overture Maps Foundation';
export const TERRAIN_ATTRIBUTION = 'Relieve: AWS Terrain Tiles (SRTM, GMTED, ETOPO1)';

export type BasemapSourceLayer = (typeof BASEMAP_SOURCE_LAYERS)[number];

export const TERRAIN_SOURCE_ID = 'terrain-dem';
export const BASEMAP_SOURCE_ID = 'basemap';
export const TERRAIN_EXAGGERATION = 1.4;
