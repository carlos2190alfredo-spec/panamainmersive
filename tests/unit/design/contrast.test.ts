import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROTECTED_LABEL_HALO_WIDTH } from '@/domains/geography/layers';
import {
  PALETTE_KEYS,
  buildMapStyle,
  paletteCssVariable,
  type MapPalette,
} from '@/domains/geography/map-style';
import { MAP_LAYER_IDS } from '@/domains/geography/map-url-state';
import {
  SCOPE_SELECTORS,
  mutateAfter,
  onlyRule,
  parseRules,
  parseThemes,
  rawToken,
  type Tokens,
} from './tokens-css';
import { blend, contrast } from './wcag';

/**
 * WCAG 2.2 AA sobre los tokens REALES de src/styles/tokens.css (no sobre una copia), en TRES ámbitos:
 * claro (`:root`), oscuro (`@media (prefers-color-scheme: dark)`) e inmersivo (`:root:has([data-immersive])`,
 * siempre oscuro; ADR-0025). Texto normal ≥ 4,5:1; componentes de interfaz y gráficos ≥ 3:1 (1.4.11).
 * Cada ámbito se lee por separado (tokens-css.ts): un token roto en uno no puede taparlo otro bloque.
 */
const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const themes = parseThemes(css);

/** Razón de contraste de dos tokens de un ámbito; LANZA si falta alguno (un verde que no midió nada es peor que un rojo). */
function ratio(theme: Tokens, fg: string, bg: string): number {
  const f = theme[fg];
  const b = theme[bg];
  if (f === undefined) throw new Error(`falta --color-${fg}`);
  if (b === undefined) throw new Error(`falta --color-${bg}`);
  return contrast(f, b);
}

const TEXT_PAIRS: [string, string][] = [
  ['ink', 'paper'],
  ['ink', 'surface'],
  ['ink', 'sunken'],
  ['ink-muted', 'paper'],
  ['ink-muted', 'surface'],
  ['ink-muted', 'sunken'],
  ['accent', 'paper'],
  ['accent', 'surface'],
  ['accent', 'sunken'],
  ['accent-strong', 'paper'],
  ['accent-strong', 'surface'],
  ['accent-strong', 'sunken'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-strong'],
  // Llamada a la acción (rojo SOLO como relleno con texto blanco), azul claro y verde con su texto.
  ['on-cta', 'cta'],
  ['on-cta', 'cta-strong'],
  ['on-sky', 'sky'],
  ['on-nature', 'nature'],
  ['nature', 'paper'],
  ['nature', 'surface'],
  // Bandas de marca (héroe, cabecera): ambas paradas del degradado.
  ['on-hero', 'hero-from'],
  ['on-hero', 'hero-to'],
  // Texto sobre la BASE OPACA del vidrio (el compuesto con opacidad se prueba aparte, sobre el peor fondo).
  ['ink', 'glass-base'],
  ['ink-muted', 'glass-base'],
  ['accent', 'glass-base'],
  ['accent-strong', 'glass-base'],
  ['verified-fg', 'verified-bg'],
  ['partial-fg', 'partial-bg'],
  ['unavailable-fg', 'unavailable-bg'],
  ['unknown-fg', 'unknown-bg'],
  ['error-fg', 'error-bg'],
  ['notice-fg', 'notice-bg'],
  // Etiquetas del mapa: sobre el halo y sobre cada relleno que pueden cruzar.
  ['map-label', 'map-halo'],
  ['map-label', 'map-land'],
  ['map-label', 'map-forest'],
  ['map-label', 'map-wetland'],
  ['map-label', 'map-sand'],
  ['map-label', 'map-protected-fill'],
  ['map-protected-line', 'map-halo'],
];

const UI_PAIRS: [string, string][] = [
  ['line-strong', 'paper'],
  ['line-strong', 'surface'],
  ['line-strong', 'sunken'],
  ['line-strong', 'glass-base'],
  ['focus', 'paper'],
  ['focus', 'surface'],
  ['focus', 'sunken'],
  ['focus', 'glass-base'],
  ['accent', 'surface'],
  // El rojo como relleno de botón frente a la superficie que lo rodea (el texto blanco lo da on-cta).
  ['cta', 'paper'],
  ['cta', 'surface'],
  // Foco sobre bandas de marca (héroe): anillo claro contra ambas paradas del degradado.
  ['hero-focus', 'hero-from'],
  ['hero-focus', 'hero-to'],
  // Anillo del marcador (--color-surface, 3 px) contra el mar: lo que lo separa del agua donde el relleno no basta.
  ['surface', 'map-water'],
  // Gráficos del mapa necesarios para entender el contenido (1.4.11): costa, fronteras y áreas protegidas.
  ['map-water', 'map-land'],
  ['map-boundary', 'map-land'],
  ['map-protected-line', 'map-land'],
  ['map-protected-line', 'map-protected-fill'],
];

const ALL_THEMES: [string, Tokens][] = [
  ['claro', themes.light],
  ['oscuro', themes.dark],
  ['inmersivo', themes.immersive],
];

describe.each(ALL_THEMES)('tema %s', (_name, theme) => {
  it('todos los tokens de color son hexadecimales válidos', () => {
    expect(Object.keys(theme).length).toBeGreaterThan(40);
    for (const [k, v] of Object.entries(theme)) expect(v, k).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(TEXT_PAIRS)('texto %s sobre %s ≥ 4,5:1', (fg, bg) => {
    expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)('componente %s sobre %s ≥ 3:1', (fg, bg) => {
    expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it('el anillo de foco contrasta con su halo', () => {
    expect(ratio(theme, 'focus', 'focus-halo')).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Etiquetas del mapa (r2:N1). El texto del LIENZO no es DOM: axe no lo mide. Las etiquetas de áreas protegidas son verdes
 * (`map-protected-line`) y muchas son MARINAS, es decir, se dibujan sobre el agua: ese par mide 2,16:1 en los temas oscuros.
 * Lo que las hace legibles es el halo oscuro que las rodea; esta prueba exige, para TODA etiqueta del estilo real, que si su
 * color no llega a 3:1 con el agua lleve un halo de al menos 2 px (con 1,6 px el agua se colaba entre los trazos finos).
 */
describe.each(ALL_THEMES)('tema %s: etiquetas del mapa sobre el agua', (_name, theme) => {
  const palette = Object.fromEntries(
    PALETTE_KEYS.map((key) => {
      const token = paletteCssVariable(key).replace(/^--color-/, '');
      const value = theme[token];
      if (value === undefined) throw new Error(`falta --color-${token}`);
      return [key, value];
    }),
  ) as unknown as MapPalette;
  const style = buildMapStyle({
    language: 'es',
    palette,
    basemapUrl: '/data/panama-basemap.pmtiles',
    glyphsUrl: '/map-assets/glyphs/{fontstack}/{range}.pbf',
    terrainTilesUrl: 'https://tiles.example/terrarium/{z}/{x}/{y}.png',
    layers: [...MAP_LAYER_IDS],
  });
  const labels = style.layers.filter((l) => l.type === 'symbol');

  it('el estilo trae etiquetas (la prueba no es vacía) y la de áreas protegidas es una de ellas', () => {
    expect(labels.length).toBeGreaterThan(3);
    expect(labels.map((l) => l.id)).toContain('protected-label');
  });

  it.each(labels.map((l) => [l.id, l] as const))(
    '%s: si su color no llega a 3:1 con el agua, lleva un halo de ≥ 2 px',
    (_id, layer) => {
      const paint = (layer as { paint?: Record<string, unknown> }).paint ?? {};
      const color = paint['text-color'];
      if (typeof color !== 'string') throw new Error(`${layer.id}: color de texto no literal`);
      const water = theme['map-water'];
      if (water === undefined) throw new Error('falta --color-map-water');
      if (contrast(color, water) < 3) {
        expect(
          Number(paint['text-halo-width']),
          `${layer.id} sobre el agua`,
        ).toBeGreaterThanOrEqual(2);
      }
    },
  );
});

describe('etiquetas de áreas protegidas sobre el agua (r2:N1)', () => {
  it.each([
    ['oscuro', themes.dark],
    ['inmersivo', themes.immersive],
  ] as const)(
    'control, tema %s: el verde de la etiqueta NO llega a 3:1 con el agua (por eso el halo importa) y con su halo sí',
    (_name, theme) => {
      const green = theme['map-protected-line'];
      const water = theme['map-water'];
      const halo = theme['map-halo'];
      if (!green || !water || !halo) throw new Error('faltan tokens del mapa');
      expect(contrast(green, water)).toBeLessThan(3);
      expect(contrast(green, halo)).toBeGreaterThanOrEqual(4.5);
      expect(PROTECTED_LABEL_HALO_WIDTH).toBeGreaterThanOrEqual(2);
    },
  );
});

describe('ningún token de color queda fuera del alcance de la prueba', () => {
  // El parser solo ve `--color-x: #rrggbb;`. Un `rgb()`, `color-mix()`, `var()` o `#rrggbbaa` NO se mediría y no daría
  // error: aquí se exige que TODO `--color-*` de cada ámbito sea un hexadecimal de 6 dígitos.
  const bodies = Object.entries(themes.bodies);
  it.each(bodies)('ámbito %s: todo --color-* es #rrggbb literal', (_scope, body) => {
    const declared = [...body.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)];
    expect(declared.length).toBeGreaterThan(0);
    const wrong = declared.filter((m) => !/^#[0-9a-fA-F]{6}$/.test((m[2] ?? '').trim()));
    expect(wrong.map((m) => m[0])).toEqual([]);
  });
});

describe('marca (tablero de marca: valores exactos)', () => {
  const BRAND = {
    'brand-red': '#d21034', // Rojo Panamá
    'brand-blue': '#0033a0', // Azul Panamá
    'brand-sky': '#00a3e0', // Azul Claro
    'brand-green': '#1b7f5a', // Verde Natural
    'brand-sand': '#f4e7d3', // Arena
    'brand-deep': '#002072', // Azul Profundo
  };

  it('los seis tokens de marca son EXACTAMENTE los hex del tablero', () => {
    for (const [name, hex] of Object.entries(BRAND)) expect(themes.own.light[name], name).toBe(hex);
  });

  it('la marca es constante: ni el oscuro ni el inmersivo la redefinen', () => {
    for (const scope of [themes.own.dark, themes.own.immersive]) {
      expect(Object.keys(scope).filter((k) => k.startsWith('brand-'))).toEqual([]);
    }
  });

  it('los semánticos de marca apuntan a su color en cada ámbito', () => {
    const l = themes.light;
    expect(l['accent']).toBe(BRAND['brand-blue']);
    expect(l['accent-strong']).toBe(BRAND['brand-deep']);
    expect(l['cta']).toBe(BRAND['brand-red']);
    expect(l['sky']).toBe(BRAND['brand-sky']);
    expect(l['nature']).toBe(BRAND['brand-green']);
    expect(l['sunken']).toBe(BRAND['brand-sand']);
    expect(l['hero-from']).toBe(BRAND['brand-blue']);
    expect(l['hero-to']).toBe(BRAND['brand-deep']);
    for (const dark of [themes.dark, themes.immersive]) {
      expect(dark['accent']).toBe(BRAND['brand-sky']);
      expect(dark['cta']).toBe(BRAND['brand-red']);
      expect(dark['sky']).toBe(BRAND['brand-sky']);
      expect(dark['focus']).toBe(BRAND['brand-sand']);
    }
  });

  it('límites medidos que las reglas de uso dan por ciertos (ADR-0025)', () => {
    const white = '#ffffff';
    expect(contrast(white, BRAND['brand-red'])).toBeGreaterThanOrEqual(4.5); // botón rojo con texto blanco
    expect(contrast(BRAND['brand-sand'], BRAND['brand-red'])).toBeLessThan(4.5); // rojo como texto sobre Arena: NO
    expect(contrast(BRAND['brand-sky'], white)).toBeLessThan(3); // azul claro sobre blanco: ni como borde
    expect(contrast(BRAND['brand-sky'], BRAND['brand-deep'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND['brand-red'], BRAND['brand-deep'])).toBeLessThan(3); // rojo sobre azul profundo: NO
  });
});

describe('ámbito inmersivo', () => {
  it('es IDÉNTICO al oscuro (mismos tokens, mismos valores): la copia no puede derivar', () => {
    expect(themes.own.immersive).toEqual(themes.own.dark);
    expect(themes.immersive).toEqual(themes.dark);
  });

  it('redefine todo lo que el oscuro cambia respecto del claro (no se filtra ningún valor claro)', () => {
    const leaked = Object.keys(themes.own.dark).filter((k) => !(k in themes.own.immersive));
    expect(leaked).toEqual([]);
  });

  it('fuerza esquema oscuro (controles nativos, barras de desplazamiento)', () => {
    expect(rawToken(themes.bodies.immersive, 'color-scheme')).toBe('dark');
    expect(rawToken(themes.bodies.light, 'color-scheme')).toBe('light dark');
  });
});

describe('vidrio: base opaca + opacidad, probado sobre el peor fondo posible', () => {
  const alphaOf = (source: string): number => {
    const value = rawToken(onlyRule(parseRules(source), ':root').body, '--glass-alpha');
    if (value === undefined) throw new Error('falta --glass-alpha en :root');
    return Number(value);
  };

  /**
   * Compone la base de vidrio con `alpha` sobre blanco puro y negro puro (el peor caso, independiente de lo que dibuje
   * el mapa debajo) y devuelve lo que no llega: texto ≥ 4,5:1 y línea ≥ 3:1.
   */
  function glassFailures(theme: Tokens, alpha: number): string[] {
    const base = theme['glass-base'];
    if (base === undefined) throw new Error('falta --color-glass-base');
    const failures: string[] = [];
    for (const back of ['#ffffff', '#000000']) {
      const composite = blend(base, back, alpha);
      for (const fg of ['ink', 'ink-muted', 'accent', 'accent-strong']) {
        const r = contrast(theme[fg] ?? '#ff00ff', composite);
        if (r < 4.5)
          failures.push(`${fg} sobre ${composite} (vidrio sobre ${back}): ${r.toFixed(2)}`);
      }
      const line = contrast(theme['line-strong'] ?? '#ff00ff', composite);
      if (line < 3)
        failures.push(`line-strong sobre ${composite} (vidrio sobre ${back}): ${line.toFixed(2)}`);
    }
    return failures;
  }

  it('la opacidad está entre 0,85 y 1 (por debajo, el texto depende del mapa que haya debajo)', () => {
    const alpha = alphaOf(css);
    expect(alpha).toBeGreaterThanOrEqual(0.85);
    expect(alpha).toBeLessThanOrEqual(1);
  });

  it.each(ALL_THEMES)(
    'ámbito %s: texto ≥ 4,5:1 y línea ≥ 3:1 sobre blanco y sobre negro',
    (_n, theme) => {
      expect(glassFailures(theme, alphaOf(css))).toEqual([]);
    },
  );

  it('sin transparencia, con contraste alto o con colores forzados el vidrio pasa a opaco y sin desenfoque', () => {
    const top = parseRules(css);
    // `:root:root` (0,2,0) en contraste alto: tiene que ganar también al ámbito inmersivo, que es `:root:has()` (0,2,0).
    const cases = [
      ['@media (prefers-reduced-transparency: reduce), (forced-colors: active)', ':root'],
      ['@media (prefers-contrast: more)', ':root:root'],
    ] as const;
    for (const [media, selector] of cases) {
      const root = onlyRule(parseRules(onlyRule(top, media).body), selector).body;
      expect(rawToken(root, '--glass-alpha'), media).toBe('1');
      expect(rawToken(root, '--glass-blur'), media).toBe('0px');
    }
  });

  it('control: con la opacidad por debajo de 0,85 la comprobación SÍ falla (no es un verde vacío)', () => {
    const broken = mutateAfter(css, '--glass-alpha: 0.88;', '0.88', '0.6');
    const alpha = alphaOf(broken);
    expect(alpha).toBe(0.6);
    const t = parseThemes(broken);
    // Al menos un ámbito deja de cumplir, y el fallo nombra el par que se rompe.
    const failing = [t.light, t.dark, t.immersive].flatMap((theme) => glassFailures(theme, alpha));
    expect(failing.length).toBeGreaterThan(0);
    expect(failing.join('\n')).toMatch(/accent/);
  });
});

describe('el cálculo de contraste es correcto (control)', () => {
  it('blanco sobre negro = 21:1 y color sobre sí mismo = 1:1', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('el rojo de marca con texto blanco da 5,43:1 (valor publicado en el ADR-0025)', () => {
    expect(contrast('#ffffff', '#d21034')).toBeCloseTo(5.43, 2);
  });

  it('la mezcla con opacidad redondea por canal (control del compuesto)', () => {
    expect(blend('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(blend('#061230', '#ffffff', 1)).toBe('#061230');
    expect(blend('#061230', '#ffffff', 0)).toBe('#ffffff');
  });
});

describe('el parser lee cada ámbito por separado (control con versiones ROTAS)', () => {
  /** Lo que hacía la prueba antigua: parte el CSS en el índice de la primera `@media` oscura. */
  function legacyDark(source: string): Tokens {
    const grab = (s: string): Tokens => {
      const out: Tokens = {};
      for (const m of s.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
        out[m[1] ?? ''] = (m[2] ?? '').toLowerCase();
      }
      return out;
    };
    const darkStart = source.indexOf('@media (prefers-color-scheme: dark)');
    return { ...grab(source.slice(0, darkStart)), ...grab(source.slice(darkStart)) };
  }

  // CSS mínimo con los tres ámbitos. El acento OSCURO está roto (#0b3c5d sobre #050f2a: 1,6:1); el inmersivo, correcto.
  const synthetic = (darkAccent: string, immersiveAccent: string) => `
    :root { --color-paper: #f9f6f0; --color-accent: #0033a0; }
    @media (prefers-color-scheme: dark) { :root { --color-paper: #050f2a; --color-accent: ${darkAccent}; } }
    :root:has([data-immersive]) { --color-paper: #050f2a; --color-accent: ${immersiveAccent}; }
  `;

  it('la versión antigua NO ve un acento oscuro roto si el bloque inmersivo, correcto, va después', () => {
    const css2 = synthetic('#0b3c5d', '#00a3e0');
    expect(
      contrast(legacyDark(css2)['accent'] ?? '', legacyDark(css2)['paper'] ?? ''),
    ).toBeGreaterThan(4.5);
  });

  it('la versión nueva SÍ lo ve en el ámbito oscuro y deja intactos el claro y el inmersivo', () => {
    const t = parseThemes(synthetic('#0b3c5d', '#00a3e0'));
    expect(ratio(t.dark, 'accent', 'paper')).toBeLessThan(4.5);
    expect(ratio(t.immersive, 'accent', 'paper')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t.light, 'accent', 'paper')).toBeGreaterThanOrEqual(4.5);
  });

  it('un token roto SOLO en el ámbito inmersivo hace fallar el inmersivo (y la igualdad con el oscuro)', () => {
    const t = parseThemes(synthetic('#00a3e0', '#0b3c5d'));
    expect(ratio(t.immersive, 'accent', 'paper')).toBeLessThan(4.5);
    expect(ratio(t.dark, 'accent', 'paper')).toBeGreaterThanOrEqual(4.5);
    expect(t.own.immersive).not.toEqual(t.own.dark);
  });

  it('lo mismo sobre el tokens.css REAL: romper el acento inmersivo lo detecta la prueba de contraste', () => {
    const broken = mutateAfter(
      css,
      SCOPE_SELECTORS.immersive,
      '--color-accent: #00a3e0;',
      '--color-accent: #0b3c5d;',
    );
    const t = parseThemes(broken);
    expect(ratio(t.immersive, 'accent', 'paper')).toBeLessThan(4.5);
    expect(ratio(t.immersive, 'accent', 'surface')).toBeLessThan(4.5);
    expect(ratio(t.dark, 'accent', 'paper')).toBeGreaterThanOrEqual(4.5); // el oscuro sigue bien: el fallo es del inmersivo
    expect(t.own.immersive).not.toEqual(t.own.dark);
  });

  it('lo mismo con el acento OSCURO roto en el tokens.css real (el inmersivo, correcto, no lo tapa)', () => {
    const broken = mutateAfter(
      css,
      SCOPE_SELECTORS.darkMedia,
      '--color-accent: #00a3e0;',
      '--color-accent: #0b3c5d;',
    );
    const t = parseThemes(broken);
    expect(ratio(t.dark, 'accent', 'paper')).toBeLessThan(4.5);
    expect(ratio(t.immersive, 'accent', 'paper')).toBeGreaterThanOrEqual(4.5);
    expect(legacyDark(broken)['accent']).toBe('#00a3e0'); // lo que la prueba antigua habría creído
  });

  it('un valor claro filtrado al inmersivo (token no redefinido) rompe la igualdad con el oscuro', () => {
    const broken = mutateAfter(css, SCOPE_SELECTORS.immersive, '--color-paper: #050f2a;', '');
    const t = parseThemes(broken);
    expect(t.immersive['paper']).toBe(t.light['paper']); // se filtró el valor claro
    expect(t.immersive).not.toEqual(t.dark);
  });

  it('LANZA (no da un verde vacío) si falta un ámbito, se repite o hay llaves sin cerrar', () => {
    expect(() => parseThemes(':root { --color-paper: #ffffff; }')).toThrow(/falta el bloque/);
    expect(() =>
      parseThemes(css.replace(':root:has([data-immersive])', ':root:has([data-x])')),
    ).toThrow(/falta el bloque «:root:has\(\[data-immersive\]\)»/);
    expect(() =>
      parseThemes(css + '\n:root:has([data-immersive]) { --color-paper: #000000; }'),
    ).toThrow(/aparece 2 veces/);
    expect(() =>
      parseThemes(
        css.replace('@media (prefers-color-scheme: dark)', '@media (prefers-color-scheme: dark'),
      ),
    ).toThrow();
    expect(() => parseThemes(css + '\n:root { --color-x: #000000;')).toThrow(/sin cerrar/);
    expect(() => parseThemes(css + '\n}')).toThrow(/sobrante/);
  });

  it('un comentario con llaves no descuadra el emparejado', () => {
    const t = parseThemes('/* } { */ ' + synthetic('#00a3e0', '#00a3e0') + ' /* { */');
    expect(t.light['accent']).toBe('#0033a0');
  });
});
