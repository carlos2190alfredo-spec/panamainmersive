import type { ExpressionSpecification, LayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_SOURCE_ID,
  FONT_BOLD,
  FONT_REGULAR,
  TERRAIN_ATTRIBUTION,
  TERRAIN_EXAGGERATION,
  TERRAIN_SOURCE_ID,
  type BasemapSourceLayer,
  type LabelLanguage,
  type MapPalette,
  type PaletteKey,
} from './map-core';

/**
 * Layer Engine y Legend Engine DECLARATIVOS (ADR-0017). Lógica pura.
 *
 * Cada capa declara su identidad, grupo, prioridad de dibujo, geometrías, fuente (con la política de derechos y
 * el origen de su versión), zoom, *picking*, reglas de estilo y entradas de leyenda. De ese único registro salen
 * el estilo de MapLibre (`buildMapStyle`) y la leyenda (`buildLegend`): una regla SIMBOLIZADA declara color de
 * paleta, grosor y trazo UNA vez, y de ella salen la capa de MapLibre y su muestra de leyenda; no pueden
 * desincronizarse. Las reglas que no se pueden expresar así (etiquetas, interpolaciones, relieve) son
 * `custom` y declaran explícitamente las capas que emiten.
 */

export type GeometryKind = 'polygon' | 'line' | 'point' | 'raster';

/** `base` siempre activa y no seleccionable · `firstParty` datos propios (cartografía derivada) · `thirdParty` datos de un tercero. */
export type LayerGroup = 'base' | 'firstParty' | 'thirdParty';

export interface FillSymbol {
  readonly color: PaletteKey;
  readonly opacity?: number;
}
export interface LineSymbol {
  readonly color: PaletteKey;
  readonly width: number;
  /** Trazo en múltiplos del grosor (`line-dasharray`); sin él, continuo. La señal no depende solo del color (WCAG 1.4.1). */
  readonly dash?: readonly number[];
}
export interface PointSymbol {
  readonly color: PaletteKey;
  readonly radius: number;
}
/** Símbolo compartido por el estilo y la leyenda. */
export interface Symbolizer {
  readonly fill?: FillSymbol;
  readonly line?: LineSymbol;
  readonly point?: PointSymbol;
}

export interface StyleContext {
  readonly palette: MapPalette;
  readonly language: LabelLanguage;
  /** ID de Overture del área seleccionada (se resalta); `null`/ausente = ninguna. */
  readonly selectedAreaId?: string | null;
}

/** Regla simbolizada: la capa de MapLibre y la muestra de leyenda salen del MISMO símbolo. */
export interface SymbolizedRule {
  readonly kind: 'symbolized';
  readonly id: string;
  readonly sourceLayer: BasemapSourceLayer;
  readonly symbolizer: { readonly fill?: FillSymbol; readonly line?: LineSymbol };
  readonly filter?: ExpressionSpecification;
  readonly minzoom?: number;
}

/** Regla a medida. `emits` declara los ids de capa que produce `build` (una prueba comprueba que coinciden). */
export interface CustomRule {
  readonly kind: 'custom';
  readonly id: string;
  readonly emits: readonly string[];
  readonly build: (ctx: StyleContext) => LayerSpecification[];
}

export type LayerRule = SymbolizedRule | CustomRule;

export type LegendLabelKey =
  | 'water'
  | 'protectedAreas'
  | 'hillshade'
  | 'borderCountry'
  | 'borderRegion'
  | 'borderCounty'
  | 'landcoverForest'
  | 'landcoverWetland'
  | 'landcoverSand'
  | 'landcoverReef'
  | 'waterways'
  | 'places';

export interface LegendDeclaration {
  readonly id: string;
  /** Clave de mensaje en `Map.legend.*`. */
  readonly labelKey: LegendLabelKey;
  /** `fromRule`: el símbolo sale de la regla que dibuja; `swatch`: símbolo propio (reglas `custom`). */
  readonly source: { readonly fromRule: string } | { readonly swatch: Symbolizer };
}

export interface LegendEntry {
  readonly id: string;
  readonly labelKey: LegendLabelKey;
  readonly swatch: Symbolizer;
}

export interface LayerSource {
  readonly id: typeof BASEMAP_SOURCE_ID | typeof TERRAIN_SOURCE_ID;
  /** Sujeto de la política de derechos (`data/rights/policies.json`). */
  readonly rightsSubject: string;
  readonly attribution: string;
  /** De dónde sale la versión: el manifiesto del artefacto, o ninguna (y por qué). La versión NO se copia aquí. */
  readonly version:
    | { readonly from: 'manifest'; readonly field: 'release' }
    | { readonly from: 'none'; readonly reason: string };
}

export const LAYER_SOURCES: Readonly<Record<LayerSource['id'], LayerSource>> = {
  [BASEMAP_SOURCE_ID]: {
    id: BASEMAP_SOURCE_ID,
    rightsSubject: 'overture',
    attribution: BASEMAP_ATTRIBUTION,
    version: { from: 'manifest', field: 'release' },
  },
  [TERRAIN_SOURCE_ID]: {
    id: TERRAIN_SOURCE_ID,
    rightsSubject: 'aws-terrain',
    attribution: TERRAIN_ATTRIBUTION,
    version: {
      from: 'none',
      reason: 'AWS Terrain Tiles no publica versiones (Last-Modified 2017-11-12, E-48)',
    },
  },
};

/** Selección por clic: qué capas de MapLibre responden y cómo se obtiene el ID estable del área. */
export interface Picking {
  readonly sourceLayers: readonly BasemapSourceLayer[];
  /** Capas de MapLibre sobre las que se consulta (`queryRenderedFeatures`). */
  readonly styleLayerIds: readonly string[];
  /** Propiedad de la entidad de la tesela con el ID de Overture (nunca el nombre). */
  readonly idProperty: string;
}

export interface LayerDefinition {
  /** Estable: es el valor del parámetro `l` de la URL y la base de las claves `Map.layers.<id>.*`. */
  readonly id: string;
  readonly group: LayerGroup;
  readonly defaultOn: boolean;
  /** Orden de dibujo: menor = debajo. */
  readonly priority: number;
  readonly geometry: readonly GeometryKind[];
  readonly source: LayerSource;
  /** Zoom mínimo al que la capa dibuja algo (el menor de sus reglas); una prueba lo comprueba. */
  readonly minzoom: number;
  readonly maxzoom?: number;
  readonly picking: Picking | null;
  readonly rules: readonly LayerRule[];
  readonly legend: readonly LegendDeclaration[];
  /** Relieve 3D del estilo (no es una capa de dibujo). */
  readonly terrain?: { readonly exaggeration: number };
}

// --------------------------------------------------------------------------- reglas a medida
const vector = (id: string, sourceLayer: BasemapSourceLayer) => ({
  id,
  source: BASEMAP_SOURCE_ID,
  'source-layer': sourceLayer,
});

/** Colores de la cobertura del suelo: los usa la expresión del estilo y las muestras de la leyenda. */
const LANDCOVER_COLORS = {
  forest: 'forest',
  wetland: 'wetland',
  sand: 'sand',
  reef: 'reef',
} as const satisfies Record<string, PaletteKey>;

const landcoverRule: CustomRule = {
  kind: 'custom',
  id: 'landcover',
  emits: ['landcover', 'landcover-detail'],
  build: ({ palette: c }) =>
    (
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
          c[LANDCOVER_COLORS.forest],
          'wetland',
          c[LANDCOVER_COLORS.wetland],
          'sand',
          c[LANDCOVER_COLORS.sand],
          'reef',
          c[LANDCOVER_COLORS.reef],
          c.land,
        ],
      },
    })),
};

const WATERWAY_SWATCH: Symbolizer = { line: { color: 'water', width: 2 } };

const waterwaysRule: CustomRule = {
  kind: 'custom',
  id: 'waterways',
  emits: ['waterway', 'waterway-detail'],
  build: ({ palette: c }) =>
    (
      [
        ['waterway', 'waterway', 7],
        ['waterway-detail', 'waterway_detail', 10],
      ] as const
    ).map(([id, sourceLayer, minzoom]): LayerSpecification => ({
      ...vector(id, sourceLayer),
      type: 'line',
      minzoom,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c[WATERWAY_SWATCH.line?.color ?? 'water'],
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
    })),
};

const hillshadeRule: CustomRule = {
  kind: 'custom',
  id: 'hillshade',
  emits: ['hillshade'],
  build: ({ palette: c }) => [
    {
      id: 'hillshade',
      type: 'hillshade',
      source: TERRAIN_SOURCE_ID,
      paint: {
        'hillshade-exaggeration': 0.5,
        'hillshade-shadow-color': c.shade,
        'hillshade-highlight-color': c.highlight,
        'hillshade-accent-color': c.shade,
      },
    },
  ],
};

const backgroundRule: CustomRule = {
  kind: 'custom',
  id: 'background',
  emits: ['background'],
  build: ({ palette: c }) => [
    { id: 'background', type: 'background', paint: { 'background-color': c.land } },
  ],
};

const protectedLabelRule: CustomRule = {
  kind: 'custom',
  id: 'protected-label',
  emits: ['protected-label'],
  build: ({ palette: c }) => [
    {
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
    },
  ],
};

/**
 * Resalte del área seleccionada: contorno SÓLIDO y grueso (no depende solo del color, WCAG 1.4.1) con halo, sobre
 * el discontinuo y fino de las áreas protegidas. Sin selección el filtro no coincide con nada (`ovid` real nunca
 * es la cadena vacía). Cambiar la selección solo cambia este filtro: el diff de estilo no recrea nada más.
 */
/** Capas de MapLibre del resalte: su filtro es lo único que cambia al seleccionar. */
export const SELECTION_LAYER_IDS = ['protected-selected-halo', 'protected-selected'] as const;

/** Filtro del resalte: la entidad cuyo `ovid` es el área seleccionada (ninguna si no hay selección). */
export function selectionFilter(
  selectedAreaId: string | null | undefined,
): ExpressionSpecification {
  return ['==', ['get', 'ovid'], selectedAreaId ?? ''];
}

const protectedSelectedRule: CustomRule = {
  kind: 'custom',
  id: 'protected-selected',
  emits: SELECTION_LAYER_IDS,
  build: ({ palette: c, selectedAreaId }) => {
    const filter = selectionFilter(selectedAreaId);
    const line = { 'line-cap': 'round', 'line-join': 'round' } as const;
    return [
      {
        ...vector('protected-selected-halo', 'protected'),
        type: 'line',
        filter,
        layout: line,
        paint: { 'line-color': c.halo, 'line-width': 6.5 },
      },
      {
        ...vector('protected-selected', 'protected'),
        type: 'line',
        filter,
        layout: line,
        paint: { 'line-color': c.label, 'line-width': 3 },
      },
    ];
  },
};

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

const PLACE_DOT: PointSymbol = { color: 'label', radius: 3.5 };

const placesRule: CustomRule = {
  kind: 'custom',
  id: 'places',
  emits: [
    ...PLACE_KINDS.map((p) => `place-dot-${p.kind}`),
    'place-region',
    ...PLACE_KINDS.map((p) => `place-${p.kind}`),
  ],
  build: ({ palette: c, language }) => {
    const out: LayerSpecification[] = [];
    for (const { kind, minzoom } of PLACE_KINDS) {
      out.push({
        ...vector(`place-dot-${kind}`, 'places'),
        type: 'circle',
        minzoom,
        filter: ['==', ['get', 'kind'], kind],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2, 12, PLACE_DOT.radius],
          'circle-color': c[PLACE_DOT.color],
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
    return out;
  },
};

// --------------------------------------------------------------------------- registro
const boundaryRule = (
  subtype: 'country' | 'region' | 'county',
  width: number,
  dash?: readonly number[],
): SymbolizedRule => ({
  kind: 'symbolized',
  id: `boundary-${subtype}`,
  sourceLayer: 'boundaries',
  filter: ['==', ['get', 'subtype'], subtype],
  symbolizer: { line: { color: 'boundary', width, ...(dash ? { dash } : {}) } },
});

const waterRule = (
  id: string,
  sourceLayer: BasemapSourceLayer,
  minzoom?: number,
): SymbolizedRule => ({
  kind: 'symbolized',
  id,
  sourceLayer,
  symbolizer: { fill: { color: 'water' } },
  ...(minzoom === undefined ? {} : { minzoom }),
});

/**
 * Orden del arreglo = orden de la interfaz y orden canónico de `l` en la URL (las capas de terceros al final).
 * El orden de DIBUJO lo da `priority`: tierra 10 → cobertura 20 → relieve 30 → fronteras 40 → agua 50 →
 * ríos 60 → áreas protegidas 70 → lugares 80. El océano va ENCIMA del relieve a propósito: Terrarium
 * devuelve batimetría ruidosa en el mar (E-25) y sombrearla sería presentar como «relieve» lo que no lo es.
 */
export const LAYERS = [
  {
    id: 'protectedAreas',
    group: 'firstParty',
    defaultOn: true,
    priority: 70,
    geometry: ['polygon'],
    source: LAYER_SOURCES[BASEMAP_SOURCE_ID],
    minzoom: 0,
    picking: {
      sourceLayers: ['protected'],
      styleLayerIds: ['protected-fill'],
      idProperty: 'ovid',
    },
    rules: [
      {
        kind: 'symbolized',
        id: 'protected',
        sourceLayer: 'protected',
        symbolizer: {
          fill: { color: 'protectedFill', opacity: 0.55 },
          // Trazo discontinuo: la señal NO depende solo del color (WCAG 1.4.1).
          line: { color: 'protectedLine', width: 1.4, dash: [3, 2] },
        },
      },
      protectedSelectedRule,
      protectedLabelRule,
    ],
    legend: [{ id: 'protected', labelKey: 'protectedAreas', source: { fromRule: 'protected' } }],
  },
  {
    id: 'boundaries',
    group: 'firstParty',
    defaultOn: true,
    priority: 40,
    geometry: ['line'],
    source: LAYER_SOURCES[BASEMAP_SOURCE_ID],
    minzoom: 0,
    picking: null,
    // Se distinguen por TRAZO (continuo / guiones / puntos), no solo por color. Van BAJO el océano a propósito:
    // los polígonos de división siguen el litoral y, dibujados encima, trazarían líneas rectas sobre el mar.
    rules: [
      boundaryRule('country', 1.8),
      boundaryRule('region', 1.2, [5, 2]),
      boundaryRule('county', 0.9, [1, 2]),
    ],
    legend: [
      { id: 'border-country', labelKey: 'borderCountry', source: { fromRule: 'boundary-country' } },
      { id: 'border-region', labelKey: 'borderRegion', source: { fromRule: 'boundary-region' } },
      { id: 'border-county', labelKey: 'borderCounty', source: { fromRule: 'boundary-county' } },
    ],
  },
  {
    id: 'places',
    group: 'firstParty',
    defaultOn: true,
    priority: 80,
    geometry: ['point'],
    source: LAYER_SOURCES[BASEMAP_SOURCE_ID],
    // Las etiquetas de región (provincias) se dibujan desde el zoom 0: una prueba lo deriva de las reglas.
    minzoom: 0,
    picking: null,
    rules: [placesRule],
    legend: [{ id: 'places', labelKey: 'places', source: { swatch: { point: PLACE_DOT } } }],
  },
  {
    id: 'waterways',
    group: 'firstParty',
    defaultOn: true,
    priority: 60,
    geometry: ['line'],
    source: LAYER_SOURCES[BASEMAP_SOURCE_ID],
    minzoom: 7,
    picking: null,
    rules: [waterwaysRule],
    legend: [{ id: 'waterways', labelKey: 'waterways', source: { swatch: WATERWAY_SWATCH } }],
  },
  {
    id: 'landcover',
    group: 'firstParty',
    defaultOn: true,
    priority: 20,
    geometry: ['polygon'],
    source: LAYER_SOURCES[BASEMAP_SOURCE_ID],
    minzoom: 8,
    picking: null,
    rules: [landcoverRule],
    legend: [
      {
        id: 'landcover-forest',
        labelKey: 'landcoverForest',
        source: { swatch: { fill: { color: LANDCOVER_COLORS.forest } } },
      },
      {
        id: 'landcover-wetland',
        labelKey: 'landcoverWetland',
        source: { swatch: { fill: { color: LANDCOVER_COLORS.wetland } } },
      },
      {
        id: 'landcover-sand',
        labelKey: 'landcoverSand',
        source: { swatch: { fill: { color: LANDCOVER_COLORS.sand } } },
      },
      {
        id: 'landcover-reef',
        labelKey: 'landcoverReef',
        source: { swatch: { fill: { color: LANDCOVER_COLORS.reef } } },
      },
    ],
  },
  {
    id: 'hillshade',
    group: 'thirdParty',
    defaultOn: false,
    priority: 30,
    geometry: ['raster'],
    source: LAYER_SOURCES[TERRAIN_SOURCE_ID],
    minzoom: 0,
    picking: null,
    rules: [hillshadeRule],
    legend: [
      {
        id: 'hillshade',
        labelKey: 'hillshade',
        source: { swatch: { fill: { color: 'shade', opacity: 0.45 } } },
      },
    ],
  },
  {
    id: 'terrain3d',
    group: 'thirdParty',
    defaultOn: false,
    priority: 35,
    geometry: ['raster'],
    source: LAYER_SOURCES[TERRAIN_SOURCE_ID],
    minzoom: 0,
    picking: null,
    rules: [],
    legend: [],
    terrain: { exaggeration: TERRAIN_EXAGGERATION },
  },
  // ---- base: siempre activas, no seleccionables
  {
    id: 'land',
    group: 'base',
    defaultOn: true,
    priority: 10,
    geometry: ['polygon'],
    source: LAYER_SOURCES[BASEMAP_SOURCE_ID],
    minzoom: 0,
    picking: null,
    rules: [
      backgroundRule,
      {
        kind: 'symbolized',
        id: 'land',
        sourceLayer: 'land',
        symbolizer: { fill: { color: 'land' } },
      },
    ],
    legend: [],
  },
  {
    id: 'water',
    group: 'base',
    defaultOn: true,
    priority: 50,
    geometry: ['polygon'],
    source: LAYER_SOURCES[BASEMAP_SOURCE_ID],
    minzoom: 0,
    picking: null,
    rules: [
      waterRule('ocean', 'ocean'),
      waterRule('water', 'water'),
      waterRule('water-detail', 'water_detail', 10),
    ],
    legend: [{ id: 'water', labelKey: 'water', source: { fromRule: 'water' } }],
  },
] as const satisfies readonly LayerDefinition[];

export type LayerId = (typeof LAYERS)[number]['id'];

const isSelectable = (l: LayerDefinition) => l.group !== 'base';

export type SelectableLayerId = Extract<
  (typeof LAYERS)[number],
  { readonly group: 'firstParty' | 'thirdParty' }
>['id'];

/** Capas que la persona puede activar/desactivar, en el orden de la interfaz y canónico de la URL. */
export const SELECTABLE_LAYER_IDS = LAYERS.filter(isSelectable).map(
  (l) => l.id,
) as readonly SelectableLayerId[];

/** Capas activas cuando la URL no trae `l`: las propias marcadas por defecto; los datos de terceros NUNCA. */
export const DEFAULT_LAYER_IDS: readonly SelectableLayerId[] = SELECTABLE_LAYER_IDS.filter(
  (id) => layerDefinition(id).defaultOn,
);

/** Capas que cargan datos de un tercero (hoy, el terreno de AWS). */
export const THIRD_PARTY_LAYER_IDS: readonly SelectableLayerId[] = SELECTABLE_LAYER_IDS.filter(
  (id) => layerDefinition(id).group === 'thirdParty',
);

export function layerDefinition(id: string): LayerDefinition {
  const found = (LAYERS as readonly LayerDefinition[]).find((l) => l.id === id);
  if (!found) throw new Error(`Capa desconocida: ${id}`);
  return found;
}

/** Capas activas: las base + las seleccionadas conocidas, de abajo arriba (prioridad ascendente). */
export function activeLayerDefinitions(selected: readonly string[]): LayerDefinition[] {
  return (LAYERS as readonly LayerDefinition[])
    .filter((l) => !isSelectable(l) || selected.includes(l.id))
    .sort((a, b) => a.priority - b.priority);
}

/** ¿Alguna capa activa necesita la fuente de relieve? */
export function usesSource(selected: readonly string[], sourceId: LayerSource['id']): boolean {
  return activeLayerDefinitions(selected).some((l) => l.source.id === sourceId);
}

/** Claves de mensaje (en `Map.layers`) del nombre y la descripción de una capa seleccionable. */
export function layerMessageKeys(id: string): { label: string; hint: string } {
  return { label: `${id}.label`, hint: `${id}.hint` };
}

// --------------------------------------------------------------------------- motor de estilo
/** Capas de MapLibre de una regla. Una regla simbolizada con relleno y trazo produce `<id>-fill` y `<id>-line`. */
export function ruleLayers(rule: LayerRule, ctx: StyleContext): LayerSpecification[] {
  if (rule.kind === 'custom') return rule.build(ctx);
  const { fill, line } = rule.symbolizer;
  const both = fill !== undefined && line !== undefined;
  const common = {
    source: BASEMAP_SOURCE_ID,
    'source-layer': rule.sourceLayer,
    ...(rule.filter ? { filter: rule.filter } : {}),
    ...(rule.minzoom === undefined ? {} : { minzoom: rule.minzoom }),
  };
  const out: LayerSpecification[] = [];
  if (fill) {
    out.push({
      id: both ? `${rule.id}-fill` : rule.id,
      type: 'fill',
      ...common,
      paint: {
        'fill-color': ctx.palette[fill.color],
        ...(fill.opacity === undefined ? {} : { 'fill-opacity': fill.opacity }),
      },
    });
  }
  if (line) {
    out.push({
      id: both ? `${rule.id}-line` : rule.id,
      type: 'line',
      ...common,
      paint: {
        'line-color': ctx.palette[line.color],
        'line-width': line.width,
        ...(line.dash ? { 'line-dasharray': [...line.dash] } : {}),
      },
    });
  }
  return out;
}

/** Ids de las capas de MapLibre que una regla produce, sin construirla (para verificar `emits`). */
export function ruleLayerIds(rule: LayerRule): readonly string[] {
  if (rule.kind === 'custom') return rule.emits;
  const { fill, line } = rule.symbolizer;
  const both = fill !== undefined && line !== undefined;
  return [
    ...(fill ? [both ? `${rule.id}-fill` : rule.id] : []),
    ...(line ? [both ? `${rule.id}-line` : rule.id] : []),
  ];
}

export function styleLayersFor(
  selected: readonly string[],
  ctx: StyleContext,
): LayerSpecification[] {
  return activeLayerDefinitions(selected).flatMap((layer) =>
    layer.rules.flatMap((rule) => ruleLayers(rule, ctx)),
  );
}

// --------------------------------------------------------------------------- motor de leyenda
function swatchOfRule(layer: LayerDefinition, ruleId: string): Symbolizer {
  const rule = layer.rules.find((r) => r.id === ruleId);
  if (rule?.kind !== 'symbolized') {
    throw new Error(
      `La leyenda de «${layer.id}» referencia una regla simbolizada inexistente: ${ruleId}`,
    );
  }
  return rule.symbolizer;
}

/** Leyenda de capas ya elegidas (de abajo arriba): la de más arriba va primero. */
export function resolveLegend(active: readonly LayerDefinition[]): LegendEntry[] {
  return [...active].reverse().flatMap((layer) =>
    layer.legend.map((d) => ({
      id: d.id,
      labelKey: d.labelKey,
      swatch: 'fromRule' in d.source ? swatchOfRule(layer, d.source.fromRule) : d.source.swatch,
    })),
  );
}

/** Leyenda de las capas activas (base + seleccionadas), con la capa de más arriba primero. Cada entrada lleva texto, no solo color. */
export function legendFor(selected: readonly string[]): LegendEntry[] {
  return resolveLegend(activeLayerDefinitions(selected));
}

/** Capas activas que admiten selección por clic, con las capas de MapLibre sobre las que consultar. */
export function pickableLayers(selected: readonly string[]): Picking[] {
  return activeLayerDefinitions(selected).flatMap((l) => (l.picking ? [l.picking] : []));
}

export function terrainFor(
  selected: readonly string[],
): { source: string; exaggeration: number } | null {
  const layer = activeLayerDefinitions(selected).find((l) => l.terrain);
  return layer?.terrain
    ? { source: TERRAIN_SOURCE_ID, exaggeration: layer.terrain.exaggeration }
    : null;
}
