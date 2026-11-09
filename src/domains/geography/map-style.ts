import type { SourceSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { legendFor, styleLayersFor, terrainFor, usesSource, type LegendEntry } from './layers';
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_SOURCE_ID,
  TERRAIN_ATTRIBUTION_CREDIT,
  TERRAIN_ATTRIBUTION_LABEL,
  TERRAIN_SOURCE_ID,
  type LabelLanguage,
  type MapPalette,
} from './map-core';
import type { MapLayerId } from './map-url-state';

/**
 * Estilo del mapa como función PURA (sin DOM ni MapLibre en ejecución): recibe la paleta ya resuelta, el idioma
 * y las capas activas, y devuelve una especificación de estilo validable. La paleta sale de los tokens CSS
 * (`--color-map-*`), así que tema claro/oscuro y contraste (probado) viven en un solo sitio.
 *
 * Las capas y sus reglas se DECLARAN en `layers.ts` (ADR-0017): de allí salen este estilo y la leyenda. Las capas
 * de origen (`source-layer`) son las que escribe `pipelines/basemap/build_basemap.py`; una prueba comprueba que
 * coinciden.
 */
export * from './map-core';
export type { LegendEntry, LegendLabelKey } from './layers';

export interface MapStyleOptions {
  readonly language: LabelLanguage;
  readonly palette: MapPalette;
  /** URL del PMTiles (relativa o absoluta, sin el prefijo `pmtiles://`). */
  readonly basemapUrl: string;
  /** Plantilla de glifos, con `{fontstack}` y `{range}`. */
  readonly glyphsUrl: string;
  /** Plantilla de teselas de relieve (Terrarium); solo se usa si hay una capa de relieve activa. */
  readonly terrainTilesUrl: string;
  /** Capas SELECCIONABLES activas (las base están siempre). */
  readonly layers: readonly MapLayerId[];
  /** ID de Overture del área seleccionada: se resalta en el mapa. */
  readonly selectedAreaId?: string | null;
}

/**
 * La atribución de una fuente la inyecta MapLibre TAL CUAL en su control de créditos (es HTML), y dentro de una página
 * en cinco idiomas esos créditos son inglés (nombres propios) o español («Relieve:»): sin `lang` un lector de pantalla los
 * lee con la voz del idioma de la interfaz (WCAG 3.1.2; r2:F6). Solo el HTML del ESTILO lleva las etiquetas: las constantes
 * `*_ATTRIBUTION` (las usan el registro de capas y la página de fuentes) siguen siendo texto plano.
 */
const inLanguage = (lang: string, text: string): string => `<span lang="${lang}">${text}</span>`;
export const BASEMAP_ATTRIBUTION_HTML = inLanguage('en', BASEMAP_ATTRIBUTION);
export const TERRAIN_ATTRIBUTION_HTML = `${inLanguage('es', TERRAIN_ATTRIBUTION_LABEL)} ${inLanguage('en', TERRAIN_ATTRIBUTION_CREDIT)}`;

export function usesTerrain(layers: readonly MapLayerId[]): boolean {
  return usesSource(layers, TERRAIN_SOURCE_ID);
}

export function buildMapStyle(options: MapStyleOptions): StyleSpecification {
  const { palette, language, layers, selectedAreaId } = options;

  const sources: Record<string, SourceSpecification> = {
    [BASEMAP_SOURCE_ID]: {
      type: 'vector',
      url: `pmtiles://${options.basemapUrl}`,
      attribution: BASEMAP_ATTRIBUTION_HTML,
    },
  };
  if (usesTerrain(layers)) {
    sources[TERRAIN_SOURCE_ID] = {
      type: 'raster-dem',
      tiles: [options.terrainTilesUrl],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 15,
      attribution: TERRAIN_ATTRIBUTION_HTML,
    };
  }

  const style: StyleSpecification = {
    version: 8,
    name: 'panama-immersive',
    glyphs: options.glyphsUrl,
    projection: { type: 'mercator' },
    sources,
    layers: styleLayersFor(layers, { palette, language, selectedAreaId: selectedAreaId ?? null }),
  };
  const terrain = terrainFor(layers);
  if (terrain) style.terrain = { source: terrain.source, exaggeration: terrain.exaggeration };
  return style;
}

/**
 * La leyenda se DERIVA del mismo registro que el estilo: una entrada por cada capa activa, con el mismo símbolo
 * (color, grosor y trazo) que la regla que dibuja. Cada entrada va con texto (no solo color).
 */
export function buildLegend(layers: readonly MapLayerId[]): readonly LegendEntry[] {
  return legendFor(layers);
}
