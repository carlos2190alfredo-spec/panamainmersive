import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRules, parseThemes, rawToken, stripComments } from './tokens-css';

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

describe('pie al fondo en páginas cortas (r1:V-01) y separación de las acciones (r1:V-02)', () => {
  it('el cuerpo es una columna a pantalla completa y `main` absorbe el sobrante (el pie queda abajo)', () => {
    const body = ruleBody(base, 'body');
    expect(rawToken(body, 'display')).toBe('flex');
    expect(rawToken(body, 'flex-direction')).toBe('column');
    expect(rawToken(body, 'min-block-size')).toBe('100dvh');
    expect(rawToken(ruleBody(base, 'main'), 'flex')).toBe('1 0 auto');
  });

  it('control: sin la columna o sin que `main` crezca la comprobación SÍ falla', () => {
    const noFlex = base.replace('flex: 1 0 auto;', 'flex: 0 0 auto;');
    expect(noFlex).not.toBe(base);
    expect(rawToken(ruleBody(noFlex, 'main'), 'flex')).not.toBe('1 0 auto');
    const noColumn = base.replace('flex-direction: column;', 'flex-direction: row;');
    expect(noColumn).not.toBe(base);
    expect(rawToken(ruleBody(noColumn, 'body'), 'flex-direction')).not.toBe('column');
  });

  it('`.actions` separa los botones con un hueco de token (no con el espacio de una palabra) y los aparta de lo anterior', () => {
    const actions = ruleBody(base, '.actions');
    expect(rawToken(actions, 'display')).toBe('flex');
    expect(rawToken(actions, 'flex-wrap')).toBe('wrap');
    expect(rawToken(actions, 'gap')).toBe('var(--space-3)');
    expect(rawToken(actions, 'margin-block-start')).toBe('var(--space-5)');
  });
});

describe('guionado (r1:V-03): manual por defecto; automático solo en párrafos de lectura y en palabras largas', () => {
  it('el cuerpo NO guioniza solo; titulares y tablas tampoco', () => {
    expect(rawToken(ruleBody(base, 'body'), 'hyphens')).toBe('manual');
    expect(rawToken(ruleBody(base, 'h1, h2, h3'), 'hyphens')).toBe('manual');
    expect(rawToken(ruleBody(base, 'table'), 'hyphens')).toBe('manual');
  });

  it('`.page` y `.hyphenate` (secciones de lectura) sí, y solo con palabras de ≥ 10 letras y ≥ 4 a cada lado', () => {
    const prose = ruleBody(base, '.page, .hyphenate');
    expect(rawToken(prose, 'hyphens')).toBe('auto');
    expect(rawToken(prose, 'hyphenate-limit-chars')).toBe('10 4 4');
  });

  it('no queda ningún `hyphens: auto` suelto en el resto del CSS (nada vuelve a guionizar celdas ni rótulos)', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.css') && path !== 'src/styles/base.css') {
          if (/hyphens:\s*auto/.test(stripComments(read(path)))) offenders.push(path);
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
});
