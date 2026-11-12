import { readFileSync } from 'node:fs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_SOURCE_ID,
  BASEMAP_SOURCE_LAYERS,
  PALETTE_KEYS,
  TERRAIN_ATTRIBUTION,
  TERRAIN_SOURCE_ID,
  buildLegend,
  buildMapStyle,
  paletteCssVariable,
  usesTerrain,
  type LabelLanguage,
  type MapPalette,
  type MapStyleOptions,
} from '@/domains/geography/map-style';
import {
  DEFAULT_MAP_LAYERS,
  MAP_LAYER_IDS,
  type MapLayerId,
} from '@/domains/geography/map-url-state';
import { SCOPE_SELECTORS, mutateAfter, parseThemes } from '../design/tokens-css';

const palette = Object.fromEntries(
  PALETTE_KEYS.map((key, i) => [
    key,
    `#${(0x102030 + i * 0x0a0b0c).toString(16).padStart(6, '0')}`,
  ]),
) as unknown as MapPalette;

function options(layers: readonly MapLayerId[], language: LabelLanguage = 'es'): MapStyleOptions {
  return {
    language,
    palette,
    basemapUrl: '/data/panama-basemap.pmtiles',
    glyphsUrl: '/map-assets/glyphs/{fontstack}/{range}.pbf',
    terrainTilesUrl: 'https://tiles.example/terrarium/{z}/{x}/{y}.png',
    layers,
  };
}

const combinations: MapLayerId[][] = [
  [],
  ['protectedAreas'],
  [...DEFAULT_MAP_LAYERS],
  ['hillshade'],
  ['terrain3d'],
  ['hillshade', 'terrain3d'],
  [...MAP_LAYER_IDS],
];

describe('estilo del mapa', () => {
  it.each(combinations.map((c) => [c.join('+') || 'ninguna', c] as const))(
    'es una especificación de estilo VÁLIDA con las capas: %s',
    (_name, layers) => {
      for (const language of ['es', 'en', 'pt', 'fr', 'de'] as const) {
        const errors = validateStyleMin(buildMapStyle(options(layers, language)));
        expect(errors.map((e) => e.message)).toEqual([]);
      }
    },
  );

  it('control positivo: el validador SÍ rechaza un estilo roto (no es una validación vacía)', () => {
    const style = buildMapStyle(options([]));
    const broken = { ...style, layers: [{ id: 'roto', type: 'fill', source: 'no-existe' }] };
    expect(validateStyleMin(broken as typeof style).length).toBeGreaterThan(0);
  });

  it('SIN capas de relieve no declara la fuente de terreno: no se contacta a terceros', () => {
    for (const layers of [[], ['protectedAreas']] as MapLayerId[][]) {
      const style = buildMapStyle(options(layers));
      expect(Object.keys(style.sources)).toEqual(['basemap']);
      expect(style.terrain).toBeUndefined();
      expect(style.layers.some((l) => l.type === 'hillshade')).toBe(false);
      expect(JSON.stringify(style)).not.toContain('tiles.example');
    }
  });

  it('con relieve declara la fuente raster-dem Terrarium con la plantilla configurada', () => {
    const style = buildMapStyle(options(['hillshade']));
    const dem = style.sources[TERRAIN_SOURCE_ID];
    expect(dem).toMatchObject({
      type: 'raster-dem',
      encoding: 'terrarium',
      tiles: ['https://tiles.example/terrarium/{z}/{x}/{y}.png'],
    });
    expect(style.layers.some((l) => l.type === 'hillshade')).toBe(true);
    expect(style.terrain).toBeUndefined();
    expect(usesTerrain(['terrain3d'])).toBe(true);
    expect(usesTerrain(['protectedAreas'])).toBe(false);
  });

  it('los créditos que MapLibre inyecta en su control llevan `lang` (inglés; «Relieve:» en español) y su texto no cambia (r2:F6)', () => {
    const style = buildMapStyle(options(['hillshade']));
    const attribution = (id: string): string =>
      (style.sources[id] as { attribution?: string } | undefined)?.attribution ?? '';
    const plain = (html: string): string => html.replace(/<[^>]+>/g, '');
    const base = attribution(BASEMAP_SOURCE_ID);
    expect(base).toBe(`<span lang="en">${BASEMAP_ATTRIBUTION}</span>`);
    expect(plain(base)).toBe(BASEMAP_ATTRIBUTION);
    const terrain = attribution(TERRAIN_SOURCE_ID);
    expect(terrain).toContain('<span lang="en">AWS Terrain Tiles (SRTM, GMTED, ETOPO1)</span>');
    expect(terrain).toContain('<span lang="es">Relieve:</span>');
    expect(plain(terrain)).toBe(TERRAIN_ATTRIBUTION);
    // Todo texto de los créditos está dentro de un elemento con `lang` (ninguno queda «suelto» en el idioma de la interfaz)
    for (const html of [base, terrain]) {
      expect(html.replace(/<span lang="[a-z]{2}">[^<]*<\/span>/g, '').trim()).toBe('');
    }
    // Las constantes de texto plano (registro de capas, página de fuentes) NO llevan marcas HTML
    for (const text of [BASEMAP_ATTRIBUTION, TERRAIN_ATTRIBUTION]) expect(text).not.toMatch(/[<>]/);
  });

  it('terrain3d activa el relieve en 3D del estilo', () => {
    const style = buildMapStyle(options(['terrain3d']));
    expect(style.terrain).toMatchObject({ source: TERRAIN_SOURCE_ID });
    expect(style.layers.some((l) => l.type === 'hillshade')).toBe(false);
  });

  it('la capa de áreas protegidas se omite entera cuando está desactivada', () => {
    const off = buildMapStyle(options([])).layers.map((l) => l.id);
    expect(off.filter((id) => id.startsWith('protected'))).toEqual([]);
    const on = buildMapStyle(options(['protectedAreas'])).layers.map((l) => l.id);
    expect(on).toEqual(
      expect.arrayContaining(['protected-fill', 'protected-line', 'protected-label']),
    );
  });

  it('el borde de áreas protegidas es DISCONTINUO y las fronteras se distinguen por trazo, no solo por color', () => {
    const layers = buildMapStyle(options([...DEFAULT_MAP_LAYERS])).layers;
    const dash = (id: string) =>
      (layers.find((l) => l.id === id) as { paint?: { 'line-dasharray'?: number[] } } | undefined)
        ?.paint?.['line-dasharray'];
    expect(dash('protected-line')).toBeDefined();
    expect(dash('boundary-country')).toBeUndefined();
    expect(dash('boundary-region')).toBeDefined();
    expect(dash('boundary-county')).toBeDefined();
    expect(dash('boundary-region')).not.toEqual(dash('boundary-county'));
  });

  it('las etiquetas usan el nombre del idioma SOLO si la fuente lo trae y, si no, el nombre local', () => {
    for (const language of ['es', 'en', 'pt', 'fr', 'de'] as const) {
      const style = buildMapStyle(options([...DEFAULT_MAP_LAYERS], language));
      const layer = style.layers.find((l) => l.id === 'place-town') as
        { layout?: Record<string, unknown> } | undefined;
      expect(layer?.layout?.['text-field']).toEqual([
        'coalesce',
        ['get', `name_${language}`],
        ['get', 'name'],
      ]);
    }
  });

  it('el océano va ENCIMA del relieve (Terrarium trae batimetría ruidosa en el mar) y bajo el agua dulce', () => {
    const ids = buildMapStyle(options([...DEFAULT_MAP_LAYERS, 'hillshade'])).layers.map(
      (l) => l.id,
    );
    expect(ids.indexOf('land')).toBeLessThan(ids.indexOf('hillshade'));
    expect(ids.indexOf('hillshade')).toBeLessThan(ids.indexOf('ocean'));
    // Las fronteras siguen el litoral: bajo el océano no trazan líneas rectas sobre el mar.
    expect(ids.indexOf('boundary-county')).toBeLessThan(ids.indexOf('ocean'));
    expect(ids.indexOf('ocean')).toBeLessThan(ids.indexOf('water'));
    expect(ids.at(-1)?.startsWith('place-')).toBe(true); // las etiquetas van encima de todo
  });

  it('los puntos de lugares tienen el mismo minzoom que su etiqueta (no hay miles de puntos a zoom bajo)', () => {
    const layers = buildMapStyle(options([...DEFAULT_MAP_LAYERS])).layers as {
      id: string;
      minzoom?: number;
    }[];
    for (const kind of ['city', 'town', 'village', 'hamlet', 'locality']) {
      const dot = layers.find((l) => l.id === `place-dot-${kind}`);
      const label = layers.find((l) => l.id === `place-${kind}`);
      expect(dot?.minzoom, kind).toBeDefined();
      expect(dot?.minzoom, kind).toBe(label?.minzoom);
    }
  });

  it('cada capa de origen usada existe en el pipeline (contrato entre Python y TypeScript)', () => {
    const python = readFileSync(
      new URL('../../../pipelines/basemap/build_basemap.py', import.meta.url),
      'utf8',
    );
    const pipelineLayers = [...python.matchAll(/^\s+Layer\("([a-z_]+)"/gm)].map((m) => m[1]);
    expect([...pipelineLayers].sort()).toEqual([...BASEMAP_SOURCE_LAYERS].sort());
    const used = new Set(
      buildMapStyle(options([...MAP_LAYER_IDS])).layers.flatMap((l) =>
        'source-layer' in l && typeof l['source-layer'] === 'string' ? [l['source-layer']] : [],
      ),
    );
    for (const sourceLayer of used) expect(pipelineLayers).toContain(sourceLayer);
  });

  it('todas las capas con fuente vectorial apuntan al PMTiles y los glifos a una ruta propia', () => {
    const style = buildMapStyle(options([...MAP_LAYER_IDS]));
    expect(style.glyphs).toBe('/map-assets/glyphs/{fontstack}/{range}.pbf');
    expect(style.sources.basemap).toMatchObject({
      type: 'vector',
      url: 'pmtiles:///data/panama-basemap.pmtiles',
    });
  });

  it('los identificadores de capa son únicos', () => {
    const ids = buildMapStyle(options([...MAP_LAYER_IDS])).layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('paleta', () => {
  const tokensCss = readFileSync(
    new URL('../../../src/styles/tokens.css', import.meta.url),
    'utf8',
  );

  /**
   * Las 13 claves de la paleta deben existir en CADA ámbito de tokens.css (claro, oscuro e inmersivo) y ser `#rrggbb`
   * de 6 dígitos: `readPalette()` lee `documentElement` y lanza si falta una, y e2e/map-helpers.ts parsea el valor
   * con `slice`. Se mira lo que declara CADA bloque (no el CSS partido por la primera `@media`: un bloque posterior
   * taparía la ausencia en el anterior).
   */
  function missingPaletteTokens(css: string): string[] {
    const { own } = parseThemes(css);
    const scopes = [
      ['claro', own.light],
      ['oscuro', own.dark],
      ['inmersivo', own.immersive],
    ] as const;
    return PALETTE_KEYS.flatMap((key) => {
      const name = paletteCssVariable(key);
      const token = name.replace(/^--color-/, '');
      return scopes.flatMap(([scope, tokens]) =>
        /^#[0-9a-f]{6}$/.test(tokens[token] ?? '') ? [] : [`${scope}: ${name}`],
      );
    });
  }

  it('cada clave se corresponde con un token CSS REAL (#rrggbb) en los TRES ámbitos de tokens.css', () => {
    expect(PALETTE_KEYS).toHaveLength(13);
    expect(missingPaletteTokens(tokensCss)).toEqual([]);
  });

  /** La declaración `--color-<token>: #rrggbb;` del primer bloque que sigue a `marker` (lanza si no está). */
  function declarationAfter(marker: string, token: string): string {
    const found = new RegExp(`--color-${token}: #[0-9a-f]{6};`).exec(
      tokensCss.slice(tokensCss.indexOf(marker)),
    );
    if (!found) throw new Error(`no hay --color-${token} después de «${marker}»`);
    return found[0];
  }

  it('control: un token que falta SOLO en el ámbito inmersivo (u oscuro) se detecta y se nombra', () => {
    const reef = declarationAfter(SCOPE_SELECTORS.immersive, 'map-reef');
    const noImmersive = mutateAfter(tokensCss, SCOPE_SELECTORS.immersive, reef, '');
    expect(missingPaletteTokens(noImmersive)).toEqual(['inmersivo: --color-map-reef']);

    const water = declarationAfter(SCOPE_SELECTORS.darkMedia, 'map-water');
    const noDark = mutateAfter(tokensCss, SCOPE_SELECTORS.darkMedia, water, '');
    expect(missingPaletteTokens(noDark)).toEqual(['oscuro: --color-map-water']);
  });

  it('control: un valor que no es #rrggbb de 6 dígitos (rgb, #rgb) tampoco pasa', () => {
    const land = declarationAfter(SCOPE_SELECTORS.immersive, 'map-land');
    const rgb = mutateAfter(
      tokensCss,
      SCOPE_SELECTORS.immersive,
      land,
      '--color-map-land: rgb(17 34 64);',
    );
    expect(missingPaletteTokens(rgb)).toEqual(['inmersivo: --color-map-land']);
  });

  it('paletteCssVariable convierte camelCase en kebab-case', () => {
    expect(paletteCssVariable('protectedFill')).toBe('--color-map-protected-fill');
    expect(paletteCssVariable('land')).toBe('--color-map-land');
  });
});

describe('leyenda', () => {
  const styleLayer = (layers: readonly MapLayerId[], id: string) =>
    buildMapStyle(options(layers)).layers.find((l) => l.id === id) as
      { paint?: Record<string, unknown> } | undefined;

  it('se deriva de las capas activas: lo que se apaga desaparece de la leyenda', () => {
    const on = buildLegend([...MAP_LAYER_IDS]).map((e) => e.labelKey);
    expect(on).toEqual(
      expect.arrayContaining([
        'water',
        'protectedAreas',
        'hillshade',
        'borderCountry',
        'borderRegion',
        'borderCounty',
        'places',
        'waterways',
        'landcoverForest',
      ]),
    );
    const off = buildLegend([]).map((e) => e.labelKey);
    expect(off).toEqual(['water']); // solo el agua (capa base) queda sin capas seleccionadas
    expect(buildLegend(['hillshade']).map((e) => e.labelKey)).toContain('hillshade');
    expect(buildLegend(['protectedAreas']).map((e) => e.labelKey)).not.toContain('hillshade');
  });

  it('cada color de cada muestra es una clave de paleta REAL del estilo', () => {
    for (const entry of buildLegend([...MAP_LAYER_IDS])) {
      const { fill, line, point } = entry.swatch;
      for (const key of [fill?.color, line?.color, point?.color]) {
        if (key) expect(PALETTE_KEYS).toContain(key);
      }
    }
  });

  it('el trazo y el color de la leyenda son LOS MISMOS que los de la capa que se dibuja (no una copia)', () => {
    const legend = buildLegend([...DEFAULT_MAP_LAYERS]);
    const byId = (id: string) => legend.find((e) => e.id === id);
    for (const [entryId, layerId] of [
      ['border-country', 'boundary-country'],
      ['border-region', 'boundary-region'],
      ['border-county', 'boundary-county'],
      ['protected', 'protected-line'],
    ] as const) {
      const line = byId(entryId)?.swatch.line;
      const paint = styleLayer(DEFAULT_MAP_LAYERS, layerId)?.paint;
      expect(line, entryId).toBeDefined();
      expect(paint?.['line-width'], entryId).toBe(line?.width);
      expect(paint?.['line-dasharray'], entryId).toEqual(line?.dash);
    }
    expect(styleLayer(DEFAULT_MAP_LAYERS, 'protected-fill')?.paint?.['fill-opacity']).toBe(
      byId('protected')?.swatch.fill?.opacity,
    );
  });

  it('las tres fronteras y el borde protegido se distinguen por patrón de trazo, no solo por color', () => {
    const legend = buildLegend([...DEFAULT_MAP_LAYERS]);
    const dashes = legend.filter((e) => e.id.startsWith('border-')).map((e) => e.swatch.line?.dash);
    expect(dashes[0]).toBeUndefined(); // país: continuo
    expect(dashes[1]).toBeDefined();
    expect(dashes[2]).toBeDefined();
    expect(dashes[1]).not.toEqual(dashes[2]);
    expect(legend.find((e) => e.id === 'protected')?.swatch.line?.dash).toBeDefined();
  });
});
