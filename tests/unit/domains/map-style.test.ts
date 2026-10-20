import { readFileSync } from 'node:fs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import {
  BASEMAP_SOURCE_LAYERS,
  PALETTE_KEYS,
  TERRAIN_SOURCE_ID,
  buildLegend,
  buildMapStyle,
  paletteCssVariable,
  usesTerrain,
  type LabelLanguage,
  type MapPalette,
  type MapStyleOptions,
} from '@/domains/geography/map-style';
import { MAP_LAYER_IDS, type MapLayerId } from '@/domains/geography/map-url-state';

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
    const layers = buildMapStyle(options(['protectedAreas'])).layers;
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
      const style = buildMapStyle(options([], language));
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
    const ids = buildMapStyle(options(['hillshade'])).layers.map((l) => l.id);
    expect(ids.indexOf('land')).toBeLessThan(ids.indexOf('hillshade'));
    expect(ids.indexOf('hillshade')).toBeLessThan(ids.indexOf('ocean'));
    // Las fronteras siguen el litoral: bajo el océano no trazan líneas rectas sobre el mar.
    expect(ids.indexOf('boundary-county')).toBeLessThan(ids.indexOf('ocean'));
    expect(ids.indexOf('ocean')).toBeLessThan(ids.indexOf('water'));
    expect(ids.at(-1)?.startsWith('place-')).toBe(true); // las etiquetas van encima de todo
  });

  it('los puntos de lugares tienen el mismo minzoom que su etiqueta (no hay miles de puntos a zoom bajo)', () => {
    const layers = buildMapStyle(options([])).layers as { id: string; minzoom?: number }[];
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
  it('cada clave se corresponde con un token CSS REAL declarado en tokens.css (claro y oscuro)', () => {
    const css = readFileSync(new URL('../../../src/styles/tokens.css', import.meta.url), 'utf8');
    const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
    for (const key of PALETTE_KEYS) {
      const name = paletteCssVariable(key);
      expect(css.slice(0, darkStart), `claro: ${name}`).toContain(`${name}:`);
      expect(css.slice(darkStart), `oscuro: ${name}`).toContain(`${name}:`);
    }
  });

  it('paletteCssVariable convierte camelCase en kebab-case', () => {
    expect(paletteCssVariable('protectedFill')).toBe('--color-map-protected-fill');
    expect(paletteCssVariable('land')).toBe('--color-map-land');
  });
});

describe('leyenda', () => {
  it('se deriva de las capas activas y cada entrada usa una clave de paleta del estilo', () => {
    const on = buildLegend(['protectedAreas', 'hillshade']);
    expect(on.map((e) => e.labelKey)).toEqual(
      expect.arrayContaining([
        'water',
        'protectedAreas',
        'hillshade',
        'borderCountry',
        'borderRegion',
        'borderCounty',
      ]),
    );
    const off = buildLegend([]);
    expect(off.map((e) => e.labelKey)).not.toContain('protectedAreas');
    expect(off.map((e) => e.labelKey)).not.toContain('hillshade');
    for (const entry of on) {
      for (const key of [entry.fill, entry.line?.color]) {
        if (key) expect(PALETTE_KEYS).toContain(key);
      }
    }
  });

  it('las tres fronteras tienen patrón de trazo distinto (no solo color) y el mismo que el estilo', () => {
    const patterns = buildLegend([])
      .filter((e) => e.id.startsWith('border-'))
      .map((e) => e.line?.pattern);
    expect(new Set(patterns).size).toBe(3);
    const protectedEntry = buildLegend(['protectedAreas']).find((e) => e.id === 'protected');
    expect(protectedEntry?.line?.pattern).toBe('dashed');
  });
});
