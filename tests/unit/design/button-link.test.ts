import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRules, parseThemes, type Tokens } from './tokens-css';
import { contrast } from './wcag';

/**
 * `ButtonLink` (cuatro variantes) solo usa tokens de color, y esta prueba comprueba que cada par texto/fondo que sus
 * reglas ponen en pantalla (en reposo y con el puntero encima) cumple WCAG en los TRES ámbitos de tokens.css:
 * texto ≥ 4,5:1 y contorno ≥ 3:1. Un cambio de token en el CSS sin recalcular el contraste deja de pasar inadvertido.
 */
const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const themes = parseThemes(read('src/styles/tokens.css'));
const SCOPES: [string, Tokens][] = [
  ['claro', themes.light],
  ['oscuro', themes.dark],
  ['inmersivo', themes.immersive],
];

const VARIANTS = ['primary', 'secondary', 'cta', 'onBrand'] as const;

/** Sobre qué fondos puede estar un botón con fondo transparente (el de la página, o la banda de marca). */
const BEHIND: Record<(typeof VARIANTS)[number], string[]> = {
  primary: [],
  secondary: ['paper', 'surface', 'sunken'],
  cta: [],
  onBrand: ['hero-from', 'hero-to'],
};

type Declarations = Record<string, string>;

function declarationsOf(css: string, prelude: string): Declarations {
  const rule = parseRules(css).find((r) => r.prelude === prelude);
  if (!rule) return {};
  return Object.fromEntries(
    [...rule.body.matchAll(/([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]),
  );
}

/** Nombre de token de `var(--color-X)` o la palabra clave (`transparent`). */
function colorOf(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return /^var\(--color-([a-z0-9-]+)\)$/.exec(value)?.[1] ?? value;
}

/** Problemas de contraste de las variantes de un CSS (vacío = todo en orden). */
function buttonProblems(css: string): string[] {
  const problems: string[] = [];
  for (const variant of VARIANTS) {
    const rest = declarationsOf(css, `.${variant}`);
    if (Object.keys(rest).length === 0) {
      problems.push(`falta la clase .${variant}`);
      continue;
    }
    const states: [string, Declarations][] = [
      ['reposo', rest],
      ['hover', { ...rest, ...declarationsOf(css, `.${variant}:hover`) }],
    ];
    const base = declarationsOf(css, '.button');
    for (const [state, d] of states) {
      const fg = colorOf(d['color']);
      const bg = colorOf(d['background']);
      const border = colorOf(d['border-color'] ?? base['border-color']);
      for (const [scope, theme] of SCOPES) {
        const value = (name: string | undefined): string | undefined =>
          name ? theme[name] : undefined;
        const fgHex = value(fg);
        if (fgHex === undefined) {
          problems.push(`${variant} ${state}: el color «${fg}» no es un token de color (${scope})`);
          continue;
        }
        const backs = bg === 'transparent' ? BEHIND[variant] : [bg ?? ''];
        if (backs.length === 0)
          problems.push(`${variant} ${state}: fondo transparente sin superficie conocida`);
        for (const back of backs) {
          const backHex = theme[back];
          if (backHex === undefined) {
            problems.push(
              `${variant} ${state}: el fondo «${back}» no es un token de color (${scope})`,
            );
            continue;
          }
          const text = contrast(fgHex, backHex);
          if (text < 4.5)
            problems.push(
              `${variant} ${state} (${scope}): ${fg} sobre ${back} = ${text.toFixed(2)}`,
            );
          // Contorno frente a lo que lo rodea: el fondo del propio botón si lo hay, o la superficie de detrás.
          const edgeHex = value(border);
          if (edgeHex !== undefined && bg !== 'transparent') continue; // contorno del color del relleno: no separa nada
          if (edgeHex !== undefined) {
            const edge = contrast(edgeHex, backHex);
            if (edge < 3)
              problems.push(
                `${variant} ${state} (${scope}): contorno ${border} sobre ${back} = ${edge.toFixed(2)}`,
              );
          }
        }
      }
    }
  }
  return problems;
}

const real = read('src/components/ButtonLink.module.css');

describe('ButtonLink: contraste de cada variante en claro, oscuro e inmersivo', () => {
  it('todos los pares texto/fondo (reposo y hover) cumplen 4,5:1 y los contornos 3:1', () => {
    expect(buttonProblems(real)).toEqual([]);
  });

  it('el componente declara las cuatro variantes y cada una tiene su clase', () => {
    const tsx = read('src/components/ButtonLink.tsx');
    expect(tsx).toContain("'primary' | 'secondary' | 'cta' | 'onBrand'");
    for (const v of VARIANTS) expect(real, v).toMatch(new RegExp(`^\\.${v} \\{`, 'm'));
  });

  it('cta: fondo --color-cta, texto --color-on-cta y hover --color-cta-strong; onBrand: contorno claro de marca', () => {
    const cta = declarationsOf(real, '.cta');
    expect(cta['background']).toBe('var(--color-cta)');
    expect(cta['color']).toBe('var(--color-on-cta)');
    expect(declarationsOf(real, '.cta:hover')['background']).toBe('var(--color-cta-strong)');
    const onBrand = declarationsOf(real, '.onBrand');
    expect(onBrand['border-color']).toBe('var(--color-on-hero)');
    expect(onBrand['color']).toBe('var(--color-on-hero)');
    // Sobre una banda oscura el foco usa el anillo claro de la banda, no el azul de --color-focus.
    expect(declarationsOf(real, '.onBrand:focus-visible')['outline-color']).toBe(
      'var(--color-hero-focus)',
    );
  });

  it.each([
    [
      'el texto del CTA pasa a azul claro (2,87:1 sobre rojo)',
      real.replace('color: var(--color-on-cta);', 'color: var(--color-sky);'),
      /cta reposo .*sky sobre cta/,
    ],
    [
      'el CTA sin texto blanco en el hover',
      real.replace('background: var(--color-cta-strong);', 'background: var(--color-sky);'),
      /cta hover .*on-cta sobre sky/,
    ],
    [
      'onBrand con texto de acento sobre la banda',
      real.replace(
        /(\.onBrand \{[^}]*?)color: var\(--color-on-hero\);/,
        '$1color: var(--color-accent);',
      ),
      /onBrand reposo .*accent sobre hero-/,
    ],
    [
      'onBrand con contorno rojo (2,67:1 sobre azul profundo)',
      real.replace('border-color: var(--color-on-hero);', 'border-color: var(--color-cta);'),
      /onBrand reposo .*contorno cta/,
    ],
    [
      'una variante sin clase',
      real.replace(/^\.cta \{/m, '.cta-renombrada {'),
      /falta la clase \.cta/,
    ],
  ])('control: %s', (_name, broken, expected) => {
    expect(broken).not.toBe(real); // la mutación se aplicó
    expect(buttonProblems(broken).join('\n')).toMatch(expected);
  });
});
