import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WCAG 2.2 AA sobre los tokens REALES de src/styles/tokens.css (no sobre una copia).
 * Texto normal ≥ 4,5:1; componentes de interfaz y gráficos ≥ 3:1 (1.4.11).
 */
const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function block(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Solo tokens de color (`--color-*`); la clave omite el prefijo: `--color-ink` → `ink`.
  for (const m of source.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1] ?? ''] = (m[2] ?? '').toLowerCase();
  }
  return out;
}

const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const light = block(css.slice(0, darkStart));
const dark = { ...light, ...block(css.slice(darkStart)) };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
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
  ['accent-strong', 'paper'],
  ['accent-strong', 'surface'],
  ['on-accent', 'accent'],
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
  ['focus', 'paper'],
  ['focus', 'surface'],
  ['accent', 'surface'],
  // Gráficos del mapa necesarios para entender el contenido (1.4.11): costa, fronteras y áreas protegidas.
  ['map-water', 'map-land'],
  ['map-boundary', 'map-land'],
  ['map-protected-line', 'map-land'],
  ['map-protected-line', 'map-protected-fill'],
];

describe.each([
  ['claro', light],
  ['oscuro', dark],
])('tema %s', (_name, theme) => {
  it('todos los tokens de color son hexadecimales válidos', () => {
    for (const [k, v] of Object.entries(theme)) expect(v, k).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(TEXT_PAIRS)('texto %s sobre %s ≥ 4,5:1', (fg, bg) => {
    const f = theme[fg];
    const b = theme[bg];
    expect(f, `falta --${fg}`).toBeDefined();
    expect(b, `falta --${bg}`).toBeDefined();
    expect(contrast(f ?? '', b ?? '')).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)('componente %s sobre %s ≥ 3:1', (fg, bg) => {
    expect(contrast(theme[fg] ?? '', theme[bg] ?? '')).toBeGreaterThanOrEqual(3);
  });

  it('el anillo de foco contrasta con su halo', () => {
    expect(contrast(theme['focus'] ?? '', theme['focus-halo'] ?? '')).toBeGreaterThanOrEqual(3);
  });
});

describe('el cálculo de contraste es correcto (control)', () => {
  it('blanco sobre negro = 21:1 y color sobre sí mismo = 1:1', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#336699', '#336699')).toBeCloseTo(1, 5);
  });
});
