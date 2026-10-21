import { readFileSync } from 'node:fs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYER_IDS,
  LAYERS,
  LAYER_SOURCES,
  SELECTABLE_LAYER_IDS,
  THIRD_PARTY_LAYER_IDS,
  activeLayerDefinitions,
  layerDefinition,
  layerMessageKeys,
  legendFor,
  resolveLegend,
  ruleLayerIds,
  ruleLayers,
  styleLayersFor,
  type LayerDefinition,
  type LegendDeclaration,
  type SelectableLayerId,
} from '@/domains/geography/layers';
import {
  BASEMAP_SOURCE_LAYERS,
  PALETTE_KEYS,
  paletteClassSuffix,
  type MapPalette,
} from '@/domains/geography/map-core';
import { buildMapStyle, usesTerrain } from '@/domains/geography/map-style';
import { MAP_LAYER_IDS, parseLayers } from '@/domains/geography/map-url-state';
import { LOCALES } from '@/i18n/locales';

const defs = LAYERS as readonly LayerDefinition[];
const palette = Object.fromEntries(
  PALETTE_KEYS.map((k, i) => [k, `#${(0x102030 + i * 0x0a0b0c).toString(16).padStart(6, '0')}`]),
) as unknown as MapPalette;
const ctx = { palette, language: 'es' } as const;
const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const ids = (layers: readonly SelectableLayerId[]) => styleLayersFor(layers, ctx).map((l) => l.id);

describe('registro de capas', () => {
  it('ids y prioridades únicos (el orden de dibujo es determinista)', () => {
    expect(new Set(defs.map((l) => l.id)).size).toBe(defs.length);
    expect(new Set(defs.map((l) => l.priority)).size).toBe(defs.length);
    const rules = defs.flatMap((l) => l.rules.map((r) => r.id));
    expect(new Set(rules).size).toBe(rules.length);
  });

  it('las capas base no se pueden apagar; las demás son seleccionables, las propias antes que las de terceros', () => {
    expect(defs.filter((l) => l.group === 'base').map((l) => l.id)).toEqual(['land', 'water']);
    expect(SELECTABLE_LAYER_IDS).toEqual([
      'protectedAreas',
      'boundaries',
      'places',
      'waterways',
      'landcover',
      'hillshade',
      'terrain3d',
    ]);
    const groups = SELECTABLE_LAYER_IDS.map((id) => layerDefinition(id).group);
    expect(groups.lastIndexOf('firstParty')).toBeLessThan(groups.indexOf('thirdParty'));
    // sin capas seleccionables siguen estando las base
    expect(ids([])).toEqual(expect.arrayContaining(['background', 'land', 'ocean', 'water']));
  });

  it('los datos de un TERCERO nunca van activados por defecto; las capas propias, sí', () => {
    expect(THIRD_PARTY_LAYER_IDS).toEqual(['hillshade', 'terrain3d']);
    for (const id of THIRD_PARTY_LAYER_IDS) expect(layerDefinition(id).defaultOn).toBe(false);
    expect(DEFAULT_LAYER_IDS).toEqual([
      'protectedAreas',
      'boundaries',
      'places',
      'waterways',
      'landcover',
    ]);
    expect(usesTerrain([...DEFAULT_LAYER_IDS])).toBe(false);
  });

  it('el grupo «tercero» coincide con una fuente cuya política de derechos NO es la de la cartografía propia', () => {
    for (const layer of defs) {
      expect(layer.group === 'thirdParty').toBe(layer.source.rightsSubject !== 'overture');
    }
    const policies = JSON.parse(read('data/rights/policies.json')) as {
      policies: { subject: string }[];
    };
    const subjects = policies.policies.map((p) => p.subject);
    for (const source of Object.values(LAYER_SOURCES))
      expect(subjects).toContain(source.rightsSubject);
  });

  it('la fuente declara de dónde sale su versión (no se copia aquí)', () => {
    expect(LAYER_SOURCES.basemap.version).toEqual({ from: 'manifest', field: 'release' });
    // El campo existe de verdad en el manifiesto que escribe el pipeline
    expect(read('pipelines/basemap/build_basemap.py')).toContain('"release"');
    expect(LAYER_SOURCES['terrain-dem'].version.from).toBe('none');
  });

  it('cada regla a medida EMITE exactamente las capas que declara', () => {
    for (const layer of defs) {
      for (const rule of layer.rules) {
        const built = ruleLayers(rule, ctx).map((l) => l.id);
        expect(built, `${layer.id}/${rule.id}`).toEqual([...ruleLayerIds(rule)]);
      }
    }
  });

  it('los ids de las capas de MapLibre son únicos en todo el registro', () => {
    const all = styleLayersFor([...SELECTABLE_LAYER_IDS], ctx).map((l) => l.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('el zoom mínimo declarado de la capa es el menor de sus reglas (derivado, no copiado)', () => {
    for (const layer of defs.filter(
      (l) => l.rules.length > 0 && l.id !== 'land' && l.id !== 'water',
    )) {
      const zooms = layer.rules
        .flatMap((r) => ruleLayers(r, ctx))
        .map((l) => ('minzoom' in l && typeof l.minzoom === 'number' ? l.minzoom : 0));
      expect(layer.minzoom, layer.id).toBe(Math.min(...zooms));
      if (layer.maxzoom !== undefined) expect(layer.maxzoom).toBeGreaterThan(layer.minzoom);
    }
  });
});

describe('motor de estilo', () => {
  it('dibuja de abajo arriba por prioridad de capa, con el océano ENCIMA del relieve', () => {
    const all = [...SELECTABLE_LAYER_IDS];
    const emitted = activeLayerDefinitions(all).flatMap((l) =>
      l.rules.flatMap((r) => [...ruleLayerIds(r)]),
    );
    expect(ids(all)).toEqual(emitted);
    const order = activeLayerDefinitions(all).map((l) => l.id);
    expect(order).toEqual([
      'land',
      'landcover',
      'hillshade',
      'terrain3d',
      'boundaries',
      'water',
      'waterways',
      'protectedAreas',
      'places',
    ]);
    expect(order.indexOf('hillshade')).toBeLessThan(order.indexOf('water'));
  });

  it('apagar una capa quita EXACTAMENTE sus capas de MapLibre y no toca las demás', () => {
    const all = [...SELECTABLE_LAYER_IDS];
    for (const id of all) {
      const without = ids(all.filter((x) => x !== id));
      const removed = ids(all).filter((x) => !without.includes(x));
      const expected = layerDefinition(id).rules.flatMap((r) => [...ruleLayerIds(r)]);
      expect(removed, id).toEqual(expected);
      // el resto conserva su orden relativo
      expect(without).toEqual(ids(all).filter((x) => !expected.includes(x)));
    }
  });

  it('ids desconocidos en la selección se ignoran (no rompen ni añaden capas)', () => {
    expect(styleLayersFor(['nope'], ctx).map((l) => l.id)).toEqual(ids([]));
  });

  it('es una especificación VÁLIDA en las 128 combinaciones de capas seleccionables', () => {
    const all = SELECTABLE_LAYER_IDS;
    for (let mask = 0; mask < 2 ** all.length; mask++) {
      const layers = all.filter((_, i) => (mask & (1 << i)) !== 0);
      const style = buildMapStyle({
        language: 'es',
        palette,
        basemapUrl: '/data/panama-basemap.pmtiles',
        glyphsUrl: '/map-assets/glyphs/{fontstack}/{range}.pbf',
        terrainTilesUrl: 'https://tiles.example/terrarium/{z}/{x}/{y}.png',
        layers,
      });
      expect(
        validateStyleMin(style).map((e) => e.message),
        layers.join('+'),
      ).toEqual([]);
      // La fuente de relieve solo existe si alguna capa activa la necesita
      expect('terrain-dem' in style.sources).toBe(
        layers.some((l) => THIRD_PARTY_LAYER_IDS.includes(l)),
      );
    }
  });

  it('es determinista: misma entrada, mismo estilo', () => {
    expect(JSON.stringify(styleLayersFor([...SELECTABLE_LAYER_IDS], ctx))).toBe(
      JSON.stringify(styleLayersFor([...SELECTABLE_LAYER_IDS], ctx)),
    );
  });
});

describe('motor de leyenda', () => {
  it('va por prioridad descendente (la capa de más arriba primero) y los ids son únicos', () => {
    const legend = legendFor([...SELECTABLE_LAYER_IDS]);
    expect(new Set(legend.map((e) => e.id)).size).toBe(legend.length);
    expect(legend.map((e) => e.id)).toEqual([
      'places', // 80
      'protected', // 70
      'waterways', // 60
      'water', // 50 (base)
      'border-country', // 40
      'border-region',
      'border-county',
      'hillshade', // 30
      'landcover-forest', // 20
      'landcover-wetland',
      'landcover-sand',
      'landcover-reef',
    ]);
  });

  it('cada entrada con `fromRule` apunta a una regla simbolizada de SU capa', () => {
    for (const layer of defs) {
      for (const entry of layer.legend) {
        if ('fromRule' in entry.source) {
          const ruleId = entry.source.fromRule;
          expect(layer.rules.find((r) => r.id === ruleId)?.kind, `${layer.id}/${entry.id}`).toBe(
            'symbolized',
          );
        }
      }
    }
  });

  it('el símbolo de una entrada `fromRule` ES el de la regla (misma referencia: no hay copia que diverja)', () => {
    const boundaries = layerDefinition('boundaries');
    const entries = resolveLegend([boundaries]);
    for (const [i, rule] of boundaries.rules.entries()) {
      if (rule.kind !== 'symbolized') throw new Error('se esperaba una regla simbolizada');
      expect(entries[i]?.swatch).toBe(rule.symbolizer);
    }
  });

  it('una referencia a una regla inexistente, o a una a medida, falla en voz alta', () => {
    const withLegend = (source: LegendDeclaration['source']): LayerDefinition => ({
      ...layerDefinition('boundaries'),
      legend: [{ id: 'x', labelKey: 'borderCountry', source }],
    });
    expect(() => resolveLegend([withLegend({ fromRule: 'no-existe' })])).toThrow(/no-existe/);
    // `places` es una regla a medida: no tiene símbolo del que derivar la muestra
    const custom: LayerDefinition = {
      ...layerDefinition('places'),
      legend: [{ id: 'x', labelKey: 'places', source: { fromRule: 'places' } }],
    };
    expect(() => resolveLegend([custom])).toThrow(/places/);
  });
});

describe('textos, estilos CSS y selección', () => {
  const messages = Object.fromEntries(
    LOCALES.map((l) => [
      l,
      JSON.parse(read(`messages/${l}.json`)) as {
        Map: { layers: Record<string, Record<string, string>>; legend: Record<string, string> };
      },
    ]),
  );

  it('cada capa seleccionable tiene nombre y descripción en los cinco idiomas', () => {
    for (const id of SELECTABLE_LAYER_IDS) {
      const keys = layerMessageKeys(id);
      for (const locale of LOCALES) {
        const entry = messages[locale]?.Map.layers[id];
        expect(entry?.label, `${locale}.${keys.label}`).toBeTruthy();
        expect(entry?.hint, `${locale}.${keys.hint}`).toBeTruthy();
      }
    }
  });

  it('cada entrada de leyenda tiene texto en los cinco idiomas', () => {
    for (const layer of defs) {
      for (const entry of layer.legend) {
        for (const locale of LOCALES) {
          expect(
            messages[locale]?.Map.legend[entry.labelKey],
            `${locale}.${entry.labelKey}`,
          ).toBeTruthy();
        }
      }
    }
  });

  it('el CSS de la leyenda tiene la clase de color de CADA muestra (si no, el SVG se pintaría de negro)', () => {
    const css = read('src/components/map/MapLegend.module.css');
    const have = new Set([...css.matchAll(/^\.([A-Za-z0-9_]+)\s*\{/gm)].map((m) => m[1]));
    for (const entry of legendFor([...SELECTABLE_LAYER_IDS])) {
      const { fill, line, point } = entry.swatch;
      if (fill) expect(have, `${entry.id} fill`).toContain(`fill${paletteClassSuffix(fill.color)}`);
      if (point)
        expect(have, `${entry.id} point`).toContain(`fill${paletteClassSuffix(point.color)}`);
      if (line)
        expect(have, `${entry.id} line`).toContain(`stroke${paletteClassSuffix(line.color)}`);
    }
  });

  it('la selección por clic solo se declara donde hay datos reales: capas de MapLibre existentes y propiedad del pipeline', () => {
    const python = read('pipelines/basemap/build_basemap.py');
    for (const layer of defs) {
      if (!layer.picking) continue;
      const emitted = layer.rules.flatMap((r) => [...ruleLayerIds(r)]);
      for (const id of layer.picking.styleLayerIds) expect(emitted).toContain(id);
      for (const sourceLayer of layer.picking.sourceLayers) {
        expect(BASEMAP_SOURCE_LAYERS).toContain(sourceLayer);
        // la propiedad con el ID de Overture la escribe el pipeline para esa capa
        expect(python).toMatch(new RegExp(`"${layer.picking.idProperty}"`));
      }
    }
    expect(layerDefinition('protectedAreas').picking?.idProperty).toBe('ovid');
    // Solo las áreas protegidas son seleccionables hoy: ninguna otra capa promete una ficha que no existe
    expect(defs.filter((l) => l.picking).map((l) => l.id)).toEqual(['protectedAreas']);
  });
});

describe('estado de la URL con las capas del registro', () => {
  it('el orden canónico es el del registro, sin duplicados y marcando lo desconocido', () => {
    expect([...MAP_LAYER_IDS]).toEqual([...SELECTABLE_LAYER_IDS]);
    expect(parseLayers('terrain3d,hillshade,places,protectedAreas,places')).toEqual({
      layers: ['protectedAreas', 'places', 'hillshade', 'terrain3d'],
      unknown: false,
    });
    expect(parseLayers('places,rivers').unknown).toBe(true);
  });

  it('un enlace antiguo (`l=protectedAreas`) sigue válido, pero ahora significa «solo esas»', () => {
    // `l` es la lista COMPLETA de capas seleccionables activas: un enlace de antes de F3.c que traía solo
    // `protectedAreas` deja de mostrar fronteras, lugares, ríos y cobertura. No hay enlaces públicos aún.
    expect(parseLayers('protectedAreas')).toEqual({ layers: ['protectedAreas'], unknown: false });
    expect(ids(parseLayers('protectedAreas').layers)).not.toContain('boundary-country');
  });
});
