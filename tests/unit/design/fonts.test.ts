import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRules, parseThemes, rawToken } from './tokens-css';

/**
 * Las tipografías de la marca (ADR-0025): Playfair Display (titulares) y Montserrat (texto), autoalojadas desde
 * `@fontsource-variable/*`. Un nombre de familia mal escrito NO da error en ningún sitio: el navegador cae a la fuente
 * del sistema en silencio. Aquí se exige que la primera familia de cada pila sea EXACTAMENTE la que declara el CSS del
 * paquete, que la segunda sea el respaldo con métricas ajustadas de `src/styles/fonts.css` y que las cuentas de ese
 * respaldo salgan de las métricas de las fuentes (no de un número escrito a ojo).
 */
const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

/** Métricas en peso regular (capsize-font-metrics.json de Next 16: unitsPerEm, xWidthAvg, ascent, descent). */
const METRICS = {
  montserrat: { upm: 1000, xWidthAvg: 503, ascent: 968, descent: 251 },
  playfair: { upm: 1000, xWidthAvg: 452, ascent: 1082, descent: 251 },
  arial: { upm: 2048, xWidthAvg: 913 },
  timesNewRoman: { upm: 2048, xWidthAvg: 832 },
} as const;

interface FontSetup {
  readonly packageName: string;
  readonly token: '--font-display' | '--font-text';
  readonly fallbackFamily: string;
  readonly system: string;
  readonly generic: string;
  readonly web: { upm: number; xWidthAvg: number; ascent: number; descent: number };
  readonly sys: { upm: number; xWidthAvg: number };
}

const SETUPS: readonly FontSetup[] = [
  {
    packageName: 'playfair-display',
    token: '--font-display',
    fallbackFamily: 'Playfair Display Fallback',
    system: 'Times New Roman',
    generic: 'serif',
    web: METRICS.playfair,
    sys: METRICS.timesNewRoman,
  },
  {
    packageName: 'montserrat',
    token: '--font-text',
    fallbackFamily: 'Montserrat Fallback',
    system: 'Arial',
    generic: 'sans-serif',
    web: METRICS.montserrat,
    sys: METRICS.arial,
  },
];

/** Familias de una pila (`'A', 'B', serif`) sin comillas, en orden. */
function families(stack: string): string[] {
  return stack
    .split(',')
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/** La ÚNICA `font-family` que declara el CSS de un paquete @fontsource-variable (lanza si hay otra cosa). */
function packageFamily(packageName: string): string {
  const css = read(`node_modules/@fontsource-variable/${packageName}/index.css`);
  const found = new Set([...css.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1] ?? ''));
  if (found.size !== 1)
    throw new Error(`${packageName}: se esperaba 1 familia y hay ${found.size}`);
  return [...found][0] as string;
}

const pct = (n: number): number => Math.round(n * 100 * 100) / 100;

/** Lo que el algoritmo de next/font calcularía para el respaldo de una fuente (en %). */
function expectedFallback(s: FontSetup) {
  const sizeAdjust = s.web.xWidthAvg / s.web.upm / (s.sys.xWidthAvg / s.sys.upm);
  return {
    sizeAdjust: pct(sizeAdjust),
    ascent: pct(s.web.ascent / s.web.upm / sizeAdjust),
    descent: pct(s.web.descent / s.web.upm / sizeAdjust),
  };
}

/** Problemas de las tipografías en los tres archivos que las definen (vacío = todo en orden). */
function fontProblems(sources: { tokens: string; fontsCss: string; layout: string }): string[] {
  const problems: string[] = [];
  const light = parseThemes(sources.tokens).bodies.light;
  const faces = parseRules(sources.fontsCss).filter((r) => r.prelude === '@font-face');

  for (const s of SETUPS) {
    const stack = families(rawToken(light, s.token) ?? '');
    const real = packageFamily(s.packageName);
    if (stack[0] !== real)
      problems.push(`${s.token}: la primera familia es «${stack[0]}», no «${real}»`);
    if (stack[1] !== s.fallbackFamily)
      problems.push(`${s.token}: la segunda familia es «${stack[1]}», no «${s.fallbackFamily}»`);
    if (stack[stack.length - 1] !== s.generic)
      problems.push(`${s.token}: debe acabar en la genérica «${s.generic}»`);

    const face = faces.find((f) => f.body.includes(`font-family: '${s.fallbackFamily}'`));
    if (!face) {
      problems.push(`fonts.css: falta el @font-face de «${s.fallbackFamily}»`);
    } else {
      const want = expectedFallback(s);
      const get = (prop: string): string | undefined => rawToken(face.body, prop);
      if (get('src') !== `local('${s.system}')`)
        problems.push(`${s.fallbackFamily}: src no es local('${s.system}')`);
      const checks: [string, number][] = [
        ['size-adjust', want.sizeAdjust],
        ['ascent-override', want.ascent],
        ['descent-override', want.descent],
      ];
      for (const [prop, expected] of checks) {
        const value = get(prop);
        const n = value === undefined ? Number.NaN : Number.parseFloat(value);
        if (!value?.endsWith('%') || Math.abs(n - expected) > 0.011)
          problems.push(`${s.fallbackFamily}: ${prop} es «${value}» y debería ser ${expected}%`);
      }
      if (get('line-gap-override') !== '0%')
        problems.push(`${s.fallbackFamily}: line-gap-override debe ser 0%`);
    }

    const importLine = `import '@fontsource-variable/${s.packageName}/index.css';`;
    if (!sources.layout.includes(importLine)) problems.push(`layout.tsx: falta ${importLine}`);
  }
  if (!sources.layout.includes("import '@/styles/fonts.css';"))
    problems.push("layout.tsx: falta import '@/styles/fonts.css';");
  if (/@fontsource(-variable)?\/(figtree|fraunces)/.test(sources.layout))
    problems.push('layout.tsx: sigue importando Figtree o Fraunces (retiradas por el ADR-0025)');
  return problems;
}

const real = {
  tokens: read('src/styles/tokens.css'),
  fontsCss: read('src/styles/fonts.css'),
  layout: read('src/app/[locale]/layout.tsx'),
};

describe('tipografías de marca', () => {
  it('las pilas, el respaldo con métricas y las importaciones están en orden', () => {
    expect(fontProblems(real)).toEqual([]);
  });

  it('las familias reales de los paquetes son las que el diseño nombra (control del lector)', () => {
    expect(packageFamily('montserrat')).toBe('Montserrat Variable');
    expect(packageFamily('playfair-display')).toBe('Playfair Display Variable');
  });

  it('el cálculo del respaldo reproduce los valores publicados (control del cálculo)', () => {
    const [display, text] = SETUPS.map(expectedFallback);
    expect(display).toEqual({ sizeAdjust: 111.26, ascent: 97.25, descent: 22.56 });
    expect(text).toEqual({ sizeAdjust: 112.83, ascent: 85.79, descent: 22.25 });
  });

  it('las dependencias están fijadas a una versión exacta y no quedan las retiradas', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    for (const name of ['montserrat', 'playfair-display']) {
      expect(pkg.dependencies[`@fontsource-variable/${name}`], name).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect(Object.keys(pkg.dependencies).filter((d) => /figtree|fraunces/.test(d))).toEqual([]);
  });

  it('los paquetes conservan `font-display: swap` en todas sus caras (la marca no se oculta al cargar)', () => {
    for (const s of SETUPS) {
      const css = read(`node_modules/@fontsource-variable/${s.packageName}/index.css`);
      const faces = css.match(/@font-face/g)?.length ?? 0;
      const swaps = css.match(/font-display:\s*swap/g)?.length ?? 0;
      expect(faces, s.packageName).toBeGreaterThan(0);
      expect(swaps, s.packageName).toBe(faces);
    }
  });
});

describe('control: cada defecto se detecta con una versión ROTA', () => {
  const cases: [string, Partial<typeof real>, RegExp][] = [
    [
      'un nombre de familia sin «Variable» (cae al sistema sin avisar)',
      { tokens: real.tokens.replace("'Montserrat Variable'", "'Montserrat'") },
      /primera familia es «Montserrat»/,
    ],
    [
      'Playfair mal escrita',
      { tokens: real.tokens.replace("'Playfair Display Variable'", "'Playfair Variable'") },
      /primera familia es «Playfair Variable»/,
    ],
    [
      'falta el respaldo en la pila',
      { tokens: real.tokens.replace("'Montserrat Fallback', ", '') },
      /segunda familia/,
    ],
    [
      'un size-adjust escrito a ojo',
      { fontsCss: real.fontsCss.replace('112.83%', '100%') },
      /size-adjust es «100%»/,
    ],
    [
      'falta ascent-override',
      { fontsCss: real.fontsCss.replace(/ascent-override: 97\.25%;/, '') },
      /ascent-override es «undefined»/,
    ],
    [
      'se borra el respaldo de Playfair',
      { fontsCss: real.fontsCss.replace("'Playfair Display Fallback'", "'Otra'") },
      /falta el @font-face de «Playfair Display Fallback»/,
    ],
    [
      'el layout vuelve a importar Figtree',
      { layout: real.layout.replace('montserrat/index.css', 'figtree/index.css') },
      /falta import '@fontsource-variable\/montserrat\/index.css'/,
    ],
    [
      'el layout no carga fonts.css',
      { layout: real.layout.replace("import '@/styles/fonts.css';\n", '') },
      /falta import '@\/styles\/fonts.css'/,
    ],
  ];

  it.each(cases)('%s', (_name, patch, expected) => {
    const broken = { ...real, ...patch };
    // La mutación tiene que haberse APLICADO (un `replace` que no encuentra nada no cambia el archivo).
    expect(JSON.stringify(broken)).not.toBe(JSON.stringify(real));
    expect(fontProblems(broken).join('\n')).toMatch(expected);
  });
});
