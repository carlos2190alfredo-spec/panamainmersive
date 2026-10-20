import type {
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import type { MapLayerId } from './map-url-state';

/**
 * Estilo del mapa como función PURA (sin DOM ni MapLibre en ejecución): recibe la paleta ya resuelta, el idioma
 * y las capas activas, y devuelve una especificación de estilo validable. La paleta sale de los tokens CSS
 * (`--color-map-*`), así que tema claro/oscuro y contraste (probado) viven en un solo sitio.
 *
 * Las capas de origen (`source-layer`) son las que escribe `pipelines/basemap/build_basemap.py`; una prueba
 * comprueba que coinciden.
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

export type LabelLanguage = 'es' | 'en' | 'pt' | 'fr' | 'de';

export const FONT_REGULAR = 'NotoSans-Regular';
export const FONT_BOLD = 'NotoSans-Bold';

export const BASEMAP_ATTRIBUTION = '© OpenStreetMap contributors, Overture Maps Foundation';
export const TERRAIN_ATTRIBUTION = 'Relieve: AWS Terrain Tiles (SRTM, GMTED, ETOPO1)';

export interface MapStyleOptions {
  readonly language: LabelLanguage;
  readonly palette: MapPalette;
  /** URL del PMTiles (relativa o absoluta, sin el prefijo `pmtiles://`). */
  readonly basemapUrl: string;
  /** Plantilla de glifos, con `{fontstack}` y `{range}`. */
  readonly glyphsUrl: string;
  /** Plantilla de teselas de relieve (Terrarium); solo se usa si hay una capa de relieve activa. */
  readonly terrainTilesUrl: string;
  readonly layers: readonly MapLayerId[];
}

export const TERRAIN_SOURCE_ID = 'terrain-dem';
export const BASEMAP_SOURCE_ID = 'basemap';
export const TERRAIN_EXAGGERATION = 1.4;

const PLACE_KINDS = [
  { kind: 'city', minzoom: 5, size: 16, font: FONT_BOLD },
  { kind: 'town', minzoom: 8, size: 14, font: FONT_REGULAR },
  { kind: 'village', minzoom: 10, size: 12.5, font: FONT_REGULAR },
  { kind: 'hamlet', minzoom: 12, size: 11.5, font: FONT_REGULAR },
  { kind: 'locality', minzoom: 11, size: 12, font: FONT_REGULAR },
] as const;

const SORT_BY_PROMINENCE: ExpressionSpecification = [
  '*',
  -1,
  ['coalesce', ['get', 'prominence'], 0],
];

function nameExpression(language: LabelLanguage): ExpressionSpecification {
  // Nombre en el idioma solo si la FUENTE lo trae; si no, el nombre local. Nunca se traduce aquí.
  return ['coalesce', ['get', `name_${language}`], ['get', 'name']];
}

export function usesTerrain(layers: readonly MapLayerId[]): boolean {
  return layers.includes('hillshade') || layers.includes('terrain3d');
}

export function buildMapStyle(options: MapStyleOptions): StyleSpecification {
  const { palette: c, language, layers } = options;
  const has = (id: MapLayerId) => layers.includes(id);

  const sources: Record<string, SourceSpecification> = {
    [BASEMAP_SOURCE_ID]: {
      type: 'vector',
      url: `pmtiles://${options.basemapUrl}`,
      attribution: BASEMAP_ATTRIBUTION,
    },
  };
  if (usesTerrain(layers)) {
    sources[TERRAIN_SOURCE_ID] = {
      type: 'raster-dem',
      tiles: [options.terrainTilesUrl],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 15,
      attribution: TERRAIN_ATTRIBUTION,
    };
  }

  const vector = (id: string, sourceLayer: (typeof BASEMAP_SOURCE_LAYERS)[number]) => ({
    id,
    source: BASEMAP_SOURCE_ID,
    'source-layer': sourceLayer,
  });

  const landcoverLayers = (
    [
      ['landcover', 'landcover', 8],
      ['landcover-detail', 'landcover_detail', 12],
    ] as const
  ).map(([id, sourceLayer, minzoom]): LayerSpecification => ({
    ...vector(id, sourceLayer),
    type: 'fill',
    minzoom,
    paint: {
      'fill-color': [
        'match',
        ['get', 'subtype'],
        'forest',
        c.forest,
        'wetland',
        c.wetland,
        'sand',
        c.sand,
        'reef',
        c.reef,
        c.land,
      ],
    },
  }));

  // Orden (de abajo arriba): tierra → cobertura → RELIEVE → fronteras → océano → agua → áreas protegidas → etiquetas.
  // El océano va ENCIMA del relieve a propósito: Terrarium devuelve batimetría ruidosa en el mar (E-25) y
  // sombrearla sería presentar como «relieve» lo que no lo es.
  const out: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': c.land } },
    { ...vector('land', 'land'), type: 'fill', paint: { 'fill-color': c.land } },
    ...landcoverLayers,
  ];

  if (has('hillshade') && usesTerrain(layers)) {
    out.push({
      id: 'hillshade',
      type: 'hillshade',
      source: TERRAIN_SOURCE_ID,
      paint: {
        'hillshade-exaggeration': 0.5,
        'hillshade-shadow-color': c.shade,
        'hillshade-highlight-color': c.highlight,
        'hillshade-accent-color': c.shade,
      },
    });
  }

  // Fronteras: se distinguen por TRAZO (continuo / guiones / puntos), no solo por color. Van BAJO el océano a
  // propósito: los polígonos de división siguen el litoral y, dibujados encima, trazarían líneas rectas sobre el mar.
  const boundary = (subtype: string, width: number, dash?: number[]): LayerSpecification => ({
    ...vector(`boundary-${subtype}`, 'boundaries'),
    type: 'line',
    filter: ['==', ['get', 'subtype'], subtype],
    paint: {
      'line-color': c.boundary,
      'line-width': width,
      ...(dash ? { 'line-dasharray': dash } : {}),
    },
  });
  out.push(
    boundary('country', 1.8),
    boundary('region', 1.2, [5, 2]),
    boundary('county', 0.9, [1, 2]),
  );

  out.push(
    { ...vector('ocean', 'ocean'), type: 'fill', paint: { 'fill-color': c.water } },
    { ...vector('water', 'water'), type: 'fill', paint: { 'fill-color': c.water } },
    {
      ...vector('water-detail', 'water_detail'),
      type: 'fill',
      minzoom: 10,
      paint: { 'fill-color': c.water },
    },
  );
  for (const [id, sourceLayer, minzoom] of [
    ['waterway', 'waterway', 7],
    ['waterway-detail', 'waterway_detail', 10],
  ] as const) {
    out.push({
      ...vector(id, sourceLayer),
      type: 'line',
      minzoom,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c.water,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          ['match', ['get', 'subtype'], 'canal', 1.6, 'river', 0.9, 0.5],
          14,
          ['match', ['get', 'subtype'], 'canal', 4, 'river', 2.4, 1.1],
        ],
      },
    });
  }

  if (has('protectedAreas')) {
    out.push(
      {
        ...vector('protected-fill', 'protected'),
        type: 'fill',
        paint: { 'fill-color': c.protectedFill, 'fill-opacity': 0.55 },
      },
      {
        ...vector('protected-line', 'protected'),
        type: 'line',
        // Trazo discontinuo: la señal NO depende solo del color (WCAG 1.4.1).
        paint: { 'line-color': c.protectedLine, 'line-width': 1.4, 'line-dasharray': [3, 2] },
      },
    );
  }

  if (has('protectedAreas')) {
    out.push({
      ...vector('protected-label', 'protected'),
      type: 'symbol',
      minzoom: 7,
      filter: ['has', 'name'],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': [FONT_REGULAR],
        'text-size': 12,
        'text-max-width': 9,
      },
      paint: { 'text-color': c.protectedLine, 'text-halo-color': c.halo, 'text-halo-width': 1.6 },
    });
  }

  for (const { kind, minzoom } of PLACE_KINDS) {
    out.push({
      ...vector(`place-dot-${kind}`, 'places'),
      type: 'circle',
      minzoom,
      filter: ['==', ['get', 'kind'], kind],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2, 12, 3.5],
        'circle-color': c.label,
        'circle-stroke-color': c.halo,
        'circle-stroke-width': 1.2,
      },
    });
  }

  out.push({
    ...vector('place-region', 'places'),
    type: 'symbol',
    filter: ['==', ['get', 'kind'], 'region'],
    layout: {
      'text-field': nameExpression(language),
      'text-font': [FONT_BOLD],
      'text-size': 12,
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.12,
      'text-max-width': 8,
    },
    paint: {
      'text-color': c.label,
      'text-halo-color': c.halo,
      'text-halo-width': 1.8,
      'text-opacity': 0.85,
    },
  });

  for (const { kind, minzoom, size, font } of PLACE_KINDS) {
    out.push({
      ...vector(`place-${kind}`, 'places'),
      type: 'symbol',
      minzoom,
      filter: ['==', ['get', 'kind'], kind],
      layout: {
        'text-field': nameExpression(language),
        'text-font': [font],
        'text-size': size,
        'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
        'text-radial-offset': 0.7,
        'text-max-width': 8,
        'symbol-sort-key': SORT_BY_PROMINENCE,
      },
      paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.6 },
    });
  }

  const style: StyleSpecification = {
    version: 8,
    name: 'panama-immersive',
    glyphs: options.glyphsUrl,
    projection: { type: 'mercator' },
    sources,
    layers: out,
  };
  if (has('terrain3d') && usesTerrain(layers)) {
    style.terrain = { source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION };
  }
  return style;
}

// --------------------------------------------------------------------------- leyenda
/** Clave de mensaje en `Map.legend.*`. */
export type LegendLabelKey =
  'water' | 'protectedAreas' | 'hillshade' | 'borderCountry' | 'borderRegion' | 'borderCounty';

export interface LegendEntry {
  readonly id: string;
  readonly labelKey: LegendLabelKey;
  readonly fill?: PaletteKey;
  readonly line?: { readonly color: PaletteKey; readonly pattern: 'solid' | 'dashed' | 'dotted' };
}

/**
 * La leyenda se DERIVA de las mismas reglas que el estilo: una entrada por cada capa visible, con la misma
 * clave de color y el mismo patrón de trazo. Cada entrada va con texto (no solo color).
 */
export function buildLegend(layers: readonly MapLayerId[]): readonly LegendEntry[] {
  const entries: LegendEntry[] = [{ id: 'water', labelKey: 'water', fill: 'water' }];
  if (layers.includes('protectedAreas')) {
    entries.push({
      id: 'protected',
      labelKey: 'protectedAreas',
      fill: 'protectedFill',
      line: { color: 'protectedLine', pattern: 'dashed' },
    });
  }
  if (layers.includes('hillshade')) {
    entries.push({ id: 'hillshade', labelKey: 'hillshade', fill: 'shade' });
  }
  entries.push(
    {
      id: 'border-country',
      labelKey: 'borderCountry',
      line: { color: 'boundary', pattern: 'solid' },
    },
    {
      id: 'border-region',
      labelKey: 'borderRegion',
      line: { color: 'boundary', pattern: 'dashed' },
    },
    {
      id: 'border-county',
      labelKey: 'borderCounty',
      line: { color: 'boundary', pattern: 'dotted' },
    },
  );
  return entries;
}
