import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mutateAfter, parseThemes } from '../design/tokens-css';

/**
 * `<meta name="theme-color">` y el manifiesto no pueden leer variables CSS: sus colores son hexadecimales repetidos.
 * Viven en UN solo sitio (`THEME_COLORS`, src/lib/seo.ts) y esta prueba exige que coincidan con el token que
 * representan en cada ámbito de tokens.css (la cabecera es `--color-surface`). Si un tema cambia de superficie y esto
 * no, el navegador mostraría una barra de otro color que la cabecera.
 */
vi.mock('@/config/env', () => ({
  getEnv: () => ({ SITE_ENV: 'staging', NEXT_PUBLIC_SITE_URL: 'https://example.org' }),
}));
vi.mock('@/i18n/navigation', () => ({ getPathname: () => '/' }));

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const css = read('src/styles/tokens.css');

let THEME_COLORS: { readonly light: string; readonly dark: string };
beforeAll(async () => {
  ({ THEME_COLORS } = await import('@/lib/seo'));
});

function mismatches(css: string): string[] {
  const t = parseThemes(css);
  return [
    ['light ≠ --color-surface (claro)', THEME_COLORS.light, t.light['surface']],
    ['dark ≠ --color-surface (oscuro)', THEME_COLORS.dark, t.dark['surface']],
    ['dark ≠ --color-surface (inmersivo)', THEME_COLORS.dark, t.immersive['surface']],
  ]
    .filter(([, color, token]) => color !== token)
    .map(([what, color, token]) => `${what}: ${color} frente a ${token}`);
}

describe('THEME_COLORS frente a tokens.css', () => {
  it('son hexadecimales de 6 dígitos y coinciden con la superficie de cada ámbito', () => {
    expect(THEME_COLORS.light).toMatch(/^#[0-9a-f]{6}$/);
    expect(THEME_COLORS.dark).toMatch(/^#[0-9a-f]{6}$/);
    expect(mismatches(css)).toEqual([]);
  });

  it('control: cambiar la superficie oscura (o la clara) de tokens.css SÍ rompe la paridad', () => {
    const darkBroken = mutateAfter(
      css,
      '@media (prefers-color-scheme: dark)',
      '--color-surface: #0a1b45;',
      '--color-surface: #0a1b46;',
    );
    expect(mismatches(darkBroken).join('\n')).toMatch(/oscuro/);
    const immersiveBroken = mutateAfter(
      css,
      ':root:has([data-immersive])',
      '--color-surface: #0a1b45;',
      '--color-surface: #0a1b46;',
    );
    expect(mismatches(immersiveBroken).join('\n')).toMatch(/inmersivo/);
    const lightBroken = mutateAfter(
      css,
      ':root {',
      '--color-surface: #ffffff;',
      '--color-surface: #fefefe;',
    );
    expect(mismatches(lightBroken).join('\n')).toMatch(/claro/);
  });
});

describe('el layout no tiene hexadecimales sueltos', () => {
  const layout = read('src/app/[locale]/layout.tsx');

  it('ningún #rrggbb en layout.tsx y themeColor sale de THEME_COLORS', () => {
    expect(layout).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(layout).toMatch(/color: THEME_COLORS\.light/);
    expect(layout).toMatch(/color: THEME_COLORS\.dark/);
    expect(layout).toMatch(/from '@\/lib\/seo'/);
  });

  it('cada color va con su media query de esquema de color', () => {
    expect(layout).toMatch(/media: '\(prefers-color-scheme: light\)', color: THEME_COLORS\.light/);
    expect(layout).toMatch(/media: '\(prefers-color-scheme: dark\)', color: THEME_COLORS\.dark/);
  });
});
