import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRules, parseThemes, type Tokens } from './tokens-css';
import { contrast } from './wcag';

/**
 * Contrato de CSS de la cabecera, el selector de idioma y el pie (ADR-0025 §7). Lo que no se puede probar sin un
 * navegador (la maquetación real a 320/393/1280 px) lo comprueba la suite E2E; aquí se fija lo que SÍ se puede leer
 * del código y que, si cambia, rompe a otros sin avisar:
 *  - la cabecera mide EXACTAMENTE `--header-height` (Explorar calcula `100dvh − esa altura`);
 *  - la hoja del agente de usuario para `[popover]` queda anulada cuando la navegación va en línea;
 *  - el menú desplegable solo existe con soporte de `:popover-open`;
 *  - los pares de color realmente usados cumplen WCAG en los TRES ámbitos (claro, oscuro, inmersivo);
 *  - solo propiedades lógicas y sin animaciones.
 */
const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const HEADER_CSS = read('src/components/SiteHeader.module.css');
const FOOTER_CSS = read('src/components/SiteFooter.module.css');
const LOCALE_CSS = read('src/components/LocaleSwitcher.module.css');
const BASE_CSS = read('src/styles/base.css');
const themes = parseThemes(read('src/styles/tokens.css'));

interface FlatRule {
  conditions: string[];
  selectors: string[];
  body: string;
}

/** Reglas con sus condiciones (`@media`, `@supports`) aplanadas; las listas de selectores se separan. */
function flatten(css: string, conditions: string[] = []): FlatRule[] {
  return parseRules(css).flatMap((rule) =>
    rule.prelude.startsWith('@media') || rule.prelude.startsWith('@supports')
      ? flatten(rule.body, [...conditions, rule.prelude])
      : [
          {
            conditions,
            selectors: rule.prelude.split(',').map((s) => s.trim()),
            body: rule.body,
          },
        ],
  );
}

/** `propiedad: valor;` de un cuerpo, en orden. Una propiedad repetida se queda con la última (cascada). */
function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(?:^|[\s;{])(-{0,2}[a-z][a-z0-9-]*)\s*:\s*([^;]+);/g)) {
    out.set(m[1] ?? '', (m[2] ?? '').trim());
  }
  return out;
}

/** Declaraciones de la regla cuyo selector (uno de la lista) y condiciones coinciden exactamente. */
function rule(css: string, selector: string, conditions: string[] = []): Map<string, string> {
  const found = flatten(css).filter(
    (r) =>
      r.selectors.includes(selector) &&
      r.conditions.length === conditions.length &&
      r.conditions.every((c, i) => c === conditions[i]),
  );
  if (found.length === 0) {
    throw new Error(`falta la regla «${selector}» con condiciones [${conditions.join(' ⊂ ')}]`);
  }
  return new Map(found.flatMap((r) => [...declarations(r.body)]));
}

const MEDIA_NARROW = '@media (max-width: 63.99rem)';
const SUPPORTS_POPOVER = '@supports selector(:popover-open)';

describe('cabecera: altura exacta', () => {
  /** Lo que haría que la cabecera dejara de medir exactamente el token. */
  const FORBIDDEN_ON_HEADER = [
    'min-block-size',
    'max-block-size',
    'height',
    'min-height',
    'max-height',
    'flex-wrap',
    'flex-flow',
    'overflow',
    'overflow-y',
    'padding-block',
    'padding-block-start',
    'padding-block-end',
    'margin-block',
    'aspect-ratio',
  ];

  function headerViolations(css: string): string[] {
    const out: string[] = [];
    const rules = flatten(css).filter((r) => r.selectors.includes('.header'));
    if (rules.length === 0) return ['no hay ninguna regla .header'];
    for (const r of rules) {
      const d = declarations(r.body);
      const where = r.conditions.join(' ⊂ ') || 'base';
      for (const prop of FORBIDDEN_ON_HEADER) if (d.has(prop)) out.push(`${where}: ${prop}`);
      // `block-size` solo en la regla base y siempre el token.
      if (
        d.has('block-size') &&
        (r.conditions.length > 0 || d.get('block-size') !== 'var(--header-height)')
      ) {
        out.push(`${where}: block-size ${d.get('block-size')}`);
      }
    }
    const base = rules.find((r) => r.conditions.length === 0);
    if (!base || declarations(base.body).get('block-size') !== 'var(--header-height)') {
      out.push('la regla base no fija block-size: var(--header-height)');
    }
    return out;
  }

  it('block-size es el token en TODOS los anchos y nada puede hacerla crecer o envolver', () => {
    expect(headerViolations(HEADER_CSS)).toEqual([]);
    const base = rule(HEADER_CSS, '.header');
    expect(base.get('display')).toBe('flex');
    expect(base.get('position')).toBe('sticky');
    expect(base.get('inset-block-start')).toBe('0');
    expect(base.get('z-index')).toBe('var(--z-header)');
    expect(base.get('align-items')).toBe('center');
  });

  it('control: la comprobación SÍ detecta min-block-size, flex-wrap, una altura propia o un cambio por media query', () => {
    const base = HEADER_CSS.replace(
      'block-size: var(--header-height);',
      'min-block-size: var(--header-height);',
    );
    expect(headerViolations(base).join('\n')).toMatch(/min-block-size/);
    const wrap = HEADER_CSS.replace(
      'display: flex;\n  align-items: center;\n  gap: var(--space-2);',
      'display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--space-2);',
    );
    expect(wrap).not.toBe(HEADER_CSS);
    expect(headerViolations(wrap).join('\n')).toMatch(/flex-wrap/);
    const media = HEADER_CSS.replace(
      '@media (min-width: 64rem) {\n  .header {\n    gap: var(--space-4);',
      '@media (min-width: 64rem) {\n  .header {\n    block-size: 5rem;\n    gap: var(--space-4);',
    );
    expect(media).not.toBe(HEADER_CSS);
    expect(headerViolations(media).join('\n')).toMatch(/block-size 5rem/);
  });

  it('el relleno y el borde cuentan dentro de la altura (box-sizing: border-box en todo)', () => {
    const star = parseRules(BASE_CSS).find((r) => r.prelude.startsWith('*, *::before'));
    expect(star, 'regla universal de base.css').toBeDefined();
    expect(declarations(star?.body ?? '').get('box-sizing')).toBe('border-box');
  });
});

describe('navegación: popover nativo con degradación a enlaces en línea', () => {
  const UA_POPOVER_PROPS: Record<string, string> = {
    // La hoja del agente de usuario para [popover] los define todos: en línea hay que anularlos.
    position: 'static',
    'inset-block': 'auto',
    'inset-inline': 'auto',
    'inline-size': 'auto',
    'block-size': 'auto',
    margin: '0',
    padding: '0',
    border: '0',
    overflow: 'visible',
    background: 'transparent',
    color: 'inherit',
    display: 'flex',
  };

  it('.nav anula la hoja del agente de usuario de [popover] (si no, se centraría fija en el viewport)', () => {
    const nav = rule(HEADER_CSS, '.nav');
    for (const [prop, value] of Object.entries(UA_POPOVER_PROPS)) {
      expect(nav.get(prop), `.nav ${prop}`).toBe(value);
    }
  });

  it('el botón del menú está oculto por defecto: sin soporte de popover nunca se muestra', () => {
    expect(rule(HEADER_CSS, '.menuButton').get('display')).toBe('none');
    // Solo se muestra dentro de @media (< 64rem) Y de @supports selector(:popover-open).
    const shown = flatten(HEADER_CSS).filter(
      (r) =>
        r.selectors.includes('.menuButton') &&
        declarations(r.body).get('display') === 'inline-flex',
    );
    expect(shown).toHaveLength(1);
    expect(shown[0]?.conditions).toEqual([MEDIA_NARROW, SUPPORTS_POPOVER]);
  });

  it('el desplegable (< 64rem y con soporte): cerrado oculto; abierto fijo bajo la cabecera, a todo el ancho', () => {
    const closed = rule(HEADER_CSS, '.nav:not(:popover-open)', [MEDIA_NARROW, SUPPORTS_POPOVER]);
    expect(closed.get('display')).toBe('none');
    const open = rule(HEADER_CSS, '.nav:popover-open', [MEDIA_NARROW, SUPPORTS_POPOVER]);
    expect(open.get('position')).toBe('fixed');
    expect(open.get('inset-block-start')).toBe('var(--header-height)');
    expect(open.get('inset-inline')).toBe('0');
    expect(open.get('max-block-size')).toBe('calc(100dvh - var(--header-height))');
    expect(open.get('background')).toBe('var(--header-bg)');
    const list = rule(HEADER_CSS, '.nav:popover-open .list', [MEDIA_NARROW, SUPPORTS_POPOVER]);
    expect(list.get('flex-direction')).toBe('column');
  });

  it('sin soporte de popover (< 64rem) la fila de enlaces se desplaza en vez de desbordar la página', () => {
    const fallback = rule(HEADER_CSS, '.nav', [
      MEDIA_NARROW,
      '@supports not selector(:popover-open)',
    ]);
    expect(fallback.get('overflow-x')).toBe('auto');
  });

  it('no hay JavaScript ni <details> en el menú: el CSS no depende de [open] ni de clases puestas por script', () => {
    expect(HEADER_CSS).not.toMatch(/\[open\]|details|summary/);
  });
});

describe('llamada a la acción y objetivos táctiles', () => {
  it('«Abrir el mapa» está oculta en pantallas estrechas y aparece desde 48rem (el menú ya lleva «Explorar»)', () => {
    expect(rule(HEADER_CSS, '.header .cta').get('display')).toBe('none');
    expect(rule(HEADER_CSS, '.header .cta', ['@media (min-width: 48rem)']).get('display')).toBe(
      'inline-flex',
    );
  });

  it('todo lo interactivo mide al menos --target-min (44 px)', () => {
    const button = rule(HEADER_CSS, '.menuButton');
    expect(button.get('inline-size')).toBe('var(--target-min)');
    expect(button.get('block-size')).toBe('var(--target-min)');
    expect(rule(HEADER_CSS, '.brand').get('min-block-size')).toBe('var(--target-min)');
    expect(rule(HEADER_CSS, '.link').get('min-block-size')).toBe('var(--target-min)');
    expect(rule(FOOTER_CSS, '.link').get('min-block-size')).toBe('var(--target-min)');
    expect(rule(LOCALE_CSS, '.summary').get('min-block-size')).toBe('var(--target-min)');
    expect(rule(LOCALE_CSS, '.summary', ['@media (max-width: 35.99rem)']).get('inline-size')).toBe(
      'var(--target-min)',
    );
  });

  it('el rótulo no recorta ni fija su tamaño: puede crecer con el espaciado de texto (1.4.12) y los idiomas largos', () => {
    for (const selector of ['.brand', '.wordmark', '.primary', '.secondary']) {
      const d = rule(HEADER_CSS, selector);
      for (const forbidden of [
        'overflow',
        'block-size',
        'inline-size',
        'max-inline-size',
        'height',
        'width',
      ]) {
        expect(d.has(forbidden), `${selector} ${forbidden}`).toBe(false);
      }
    }
    expect(rule(HEADER_CSS, '.brand').get('min-inline-size')).toBe('0');
    expect(rule(HEADER_CSS, '.wordmark').get('overflow-wrap')).toBe('anywhere');
  });

  it('el selector de idioma oculta el nombre SIN quitarlo del árbol de accesibilidad', () => {
    const hidden = rule(LOCALE_CSS, '.summary > [lang]', ['@media (max-width: 35.99rem)']);
    expect(hidden.get('position')).toBe('absolute');
    expect(hidden.get('clip-path')).toBe('inset(50%)');
    for (const forbidden of ['display', 'visibility', 'content-visibility']) {
      expect(hidden.has(forbidden), forbidden).toBe(false);
    }
  });
});

describe('el selector de idioma hereda las variables de la cabecera', () => {
  const VARIABLE = /var\(--header-[a-z-]+, var\(--color-[a-z-]+\)\)/;

  it.each([
    ['.summary', ['border', 'background', 'color']],
    ['.panel', ['background', 'border']],
    ['.option', ['color']],
    [".option[aria-current='true']", ['color']],
  ] as const)('%s usa --header-* con el token de siempre como reserva', (selector, props) => {
    const d = rule(LOCALE_CSS, selector);
    for (const prop of props) expect(d.get(prop) ?? '', `${selector} ${prop}`).toMatch(VARIABLE);
  });

  it('la posición ya no la decide el selector (sin margin-inline-start: auto): la cabecera lo reparte', () => {
    const root = rule(LOCALE_CSS, '.root');
    expect(root.has('margin-inline-start')).toBe(false);
    expect(root.get('flex')).toBe('none');
  });
});

describe('colores: los pares realmente usados cumplen WCAG en los tres ámbitos', () => {
  const SCOPES: [string, Tokens][] = [
    ['claro', themes.light],
    ['oscuro', themes.dark],
    ['inmersivo', themes.immersive],
  ];

  /** `var(--color-x)` → hexadecimal del ámbito. LANZA si el valor no es un token de color (nada se mide a medias). */
  function color(value: string | undefined, scope: Tokens): string {
    const m = /^var\(--color-([a-z0-9-]+)\)$/.exec((value ?? '').trim());
    if (!m) throw new Error(`no es un token de color: «${value}»`);
    const hex = scope[m[1] ?? ''];
    if (hex === undefined) throw new Error(`falta --color-${m[1]}`);
    return hex;
  }

  function headerFailures(css: string, scope: Tokens): string[] {
    const header = rule(css, '.header');
    const v = (name: string): string => color(header.get(name), scope);
    const bg = v('--header-bg');
    const sunken = scope['sunken'] ?? '#ff00ff';
    const checks: [string, number, number][] = [
      ['texto de la cabecera', contrast(v('--header-fg'), bg), 4.5],
      ['texto secundario del rótulo', contrast(v('--header-fg-muted'), bg), 4.5],
      ['texto sobre el hover del selector', contrast(v('--header-fg'), sunken), 4.5],
      // La página actual: barra inferior (componente, 1.4.11) y, en el selector de idioma, texto.
      ['marca de la página actual', contrast(v('--header-current'), bg), 3],
      ['texto «actual» del selector', contrast(v('--header-current'), bg), 4.5],
      ['texto «actual» sobre su hover', contrast(v('--header-current'), sunken), 4.5],
      ['borde de los controles', contrast(v('--header-control-line'), bg), 3],
      // El anillo de foco del ámbito (los tokens cambian con el tema) frente al fondo de la cabecera.
      ['anillo de foco', contrast(scope['focus'] ?? '#ff00ff', bg), 3],
    ];
    return checks
      .filter(([, ratio, min]) => ratio < min)
      .map(([what, ratio, min]) => `${what}: ${ratio.toFixed(2)} < ${min}`);
  }

  it.each(SCOPES)('cabecera en el ámbito %s', (_name, scope) => {
    expect(headerFailures(HEADER_CSS, scope)).toEqual([]);
  });

  it('control: con el texto de la cabecera igual a su fondo la comprobación SÍ falla', () => {
    const broken = HEADER_CSS.replace(
      '--header-fg: var(--color-ink);',
      '--header-fg: var(--color-surface);',
    );
    expect(broken).not.toBe(HEADER_CSS);
    for (const [, scope] of SCOPES)
      expect(headerFailures(broken, scope).join('\n')).toMatch(/texto de la cabecera/);
  });

  it('la marca de la página actual NO es el rojo (sobre fondo oscuro da 2,7:1) ni el azul claro', () => {
    const header = rule(HEADER_CSS, '.header');
    expect(header.get('--header-current')).not.toMatch(/cta|brand-red|sky/);
    expect(rule(HEADER_CSS, ".link[aria-current='page']").get('border-block-end-color')).toBe(
      'var(--header-current)',
    );
  });

  it.each(SCOPES)(
    'pie en el ámbito %s: Arena sobre Azul Profundo y anillo de foco propio',
    (_name, scope) => {
      const footer = rule(FOOTER_CSS, '.footer');
      expect(footer.get('--footer-bg')).toBe('var(--color-brand-deep)');
      expect(footer.get('--footer-fg')).toBe('var(--color-brand-sand)');
      expect(footer.get('background')).toBe('var(--footer-bg)');
      expect(footer.get('color')).toBe('var(--footer-fg)');
      const bg = color(footer.get('--footer-bg'), scope);
      const fg = color(footer.get('--footer-fg'), scope);
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      // El anillo del tema claro (azul) sobre Azul Profundo daría 1,4:1: el pie lo redefine con colores de marca.
      const ring = color(footer.get('--color-focus'), scope);
      const halo = color(footer.get('--color-focus-halo'), scope);
      expect(contrast(ring, bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(ring, halo)).toBeGreaterThanOrEqual(3);
      // Y el texto de cada elemento usa ese color (no el semántico del tema).
      expect(rule(FOOTER_CSS, '.link').get('color')).toBe('var(--footer-fg)');
      expect(rule(FOOTER_CSS, '.note').get('color')).toBe('var(--footer-fg)');
    },
  );

  it('control: el azul de foco del tema claro sobre Azul Profundo NO llega a 3:1 (por eso el pie lo redefine)', () => {
    expect(contrast(themes.light['focus'] ?? '', themes.light['brand-deep'] ?? '')).toBeLessThan(3);
  });
});

describe('solo propiedades lógicas, sin animaciones y cada clase usada existe', () => {
  const FILES: [string, string][] = [
    ['SiteHeader.module.css', HEADER_CSS],
    ['SiteFooter.module.css', FOOTER_CSS],
    ['LocaleSwitcher.module.css', LOCALE_CSS],
  ];
  // Propiedades físicas que tienen equivalente lógico (docs: «propiedades lógicas siempre»).
  const PHYSICAL =
    /(?:^|[\s;{])(?:top|right|bottom|left|width|height|min-width|min-height|max-width|max-height|margin-(?:top|right|bottom|left)|padding-(?:top|right|bottom|left)|border-(?:top|right|bottom|left)(?:-[a-z]+)?|overflow-x|overflow-y|text-align:\s*(?:left|right))\s*:/;

  it.each(FILES)('%s: ninguna propiedad física', (name, css) => {
    // `overflow-x/y` no tienen equivalente lógico en CSS: se permiten explícitamente.
    const stripped = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/overflow-[xy]\s*:/g, 'overflow-axis:');
    const hit = PHYSICAL.exec(stripped);
    expect(hit?.[0], name).toBeUndefined();
  });

  it.each(FILES)(
    '%s: sin transiciones ni animaciones (todo movimiento iría tras prefers-reduced-motion)',
    (name, css) => {
      expect(css, name).not.toMatch(/\b(?:transition|animation|@keyframes)\b/);
    },
  );

  it.each([
    ['src/components/SiteHeader.tsx', HEADER_CSS],
    ['src/components/SiteFooter.tsx', FOOTER_CSS],
  ])('%s usa solo clases que existen en su CSS', (path, css) => {
    const used = [...read(path).matchAll(/styles\.([A-Za-z]+)/g)].map((m) => m[1] ?? '');
    expect(used.length).toBeGreaterThan(5);
    const missing = used.filter((cls) => !new RegExp(`\\.${cls}\\b`).test(css));
    expect(missing).toEqual([]);
  });
});
