import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRules, parseThemes, rawToken } from './tokens-css';

/**
 * Contratos de maquetación que comparten varias piezas (ADR-0025): la cabecera mide EXACTAMENTE `--header-height`
 * (el mapa mide `100dvh − esa altura`), el HUD de Explorar va por encima del aviso de estado del mapa y por debajo de
 * la hoja móvil, la cabecera y los menús, y el foco por teclado no queda bajo la cabecera fija ni en el ámbito inmersivo.
 */
const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const tokens = read('src/styles/tokens.css');
const light = parseThemes(tokens).bodies.light;
const immersive = parseThemes(tokens).bodies.immersive;
const base = read('src/styles/base.css');

/** Cuerpo de la PRIMERA regla de nivel superior cuyo preludio es exactamente `prelude`; lanza si no existe. */
function ruleBody(css: string, prelude: string): string {
  const rule = parseRules(css).find((r) => r.prelude === prelude);
  if (!rule) throw new Error(`falta la regla «${prelude}»`);
  return rule.body;
}

const numberToken = (name: string): number => {
  const value = rawToken(light, name);
  if (value === undefined) throw new Error(`falta ${name}`);
  return Number(value);
};

describe('--header-height', () => {
  it('es exactamente 4rem (cabecera de altura fija en todos los anchos)', () => {
    expect(rawToken(light, '--header-height')).toBe('4rem');
  });
});

describe('orden de capas', () => {
  const mapCss = read('src/components/map/MapStage.module.css');
  const overlayZ = Number(/\.overlay\s*\{[^}]*?z-index:\s*(\d+)/.exec(mapCss)?.[1] ?? Number.NaN);

  it('el aviso de estado del mapa (.overlay) tiene un z-index numérico que leer', () => {
    expect(Number.isFinite(overlayZ)).toBe(true);
  });

  /** Estrictamente creciente: cada capa por encima de la anterior y sin empates. */
  const ascending = (layers: readonly number[]): boolean =>
    layers.every((z, i) => i === 0 || z > (layers[i - 1] ?? Number.POSITIVE_INFINITY));

  it('aviso del mapa < HUD < hoja móvil < cabecera < menús', () => {
    expect(
      ascending([
        overlayZ,
        numberToken('--z-hud'),
        numberToken('--z-sheet'),
        numberToken('--z-header'),
        numberToken('--z-popover'),
      ]),
    ).toBe(true);
  });

  it('control: un HUD por debajo del aviso del mapa, o empatado con él, NO pasa la comprobación', () => {
    expect(ascending([overlayZ, overlayZ - 1, 20])).toBe(false);
    expect(ascending([overlayZ, overlayZ, 20])).toBe(false);
    expect(ascending([overlayZ, overlayZ + 1, 20])).toBe(true);
  });
});

describe('foco visible (doble anillo) y desplazamiento bajo la cabecera', () => {
  it('html reserva el alto de la cabecera más un respiro al desplazarse hasta un elemento enfocado', () => {
    const html = ruleBody(base, 'html');
    expect(rawToken(html, 'scroll-padding-block-start')).toBe(
      'calc(var(--header-height) + var(--space-3))',
    );
  });

  it(':focus-visible dibuja contorno + halo con los tokens de foco (que cambian con el tema)', () => {
    const focus = ruleBody(base, ':focus-visible');
    expect(rawToken(focus, 'outline')).toBe('3px solid var(--color-focus)');
    expect(rawToken(focus, 'box-shadow')).toBe('0 0 0 5px var(--color-focus-halo)');
  });

  it('el ámbito inmersivo redefine foco y halo (si no, heredaría el azul del tema claro sobre fondo oscuro)', () => {
    expect(immersive).toMatch(/--color-focus:\s*#[0-9a-f]{6};/);
    expect(immersive).toMatch(/--color-focus-halo:\s*#[0-9a-f]{6};/);
  });

  it('los titulares usan la tipografía de titulares', () => {
    const headings = parseRules(base).find((r) => r.prelude === 'h1, h2, h3');
    expect(headings, 'h1, h2, h3').toBeDefined();
    expect(rawToken(headings?.body ?? '', 'font-family')).toBe('var(--font-display)');
  });
});
