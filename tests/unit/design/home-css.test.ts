import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRules, stripComments, type Rule } from './tokens-css';

/**
 * Contratos de CSS de la portada y de la rejilla de destinos (ADR-0025), leídos del código real. Son reglas que ninguna
 * herramienta comprueba sola y que se rompen sin avisar: movimiento solo con `no-preference` y sin `infinite`, sin
 * `opacity` en los `@keyframes` (axe mediría el contraste a mitad de animación), sin recortes ni alturas fijas en
 * elementos con texto (WCAG 1.4.12), solo propiedades lógicas, desenfoque solo como mejora progresiva y degradados solo
 * en adornos sin texto. Cada comprobación lleva su CONTROL: se alimenta con un CSS malo y debe detectarlo.
 */
const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

const FILES = {
  page: 'src/app/[locale]/page.module.css',
  grid: 'src/components/DestinationGrid.module.css',
  search: 'src/components/DestinationSearch.module.css',
  glyph: 'src/components/DestinationGlyph.module.css',
  travesia: 'src/components/Travesia.module.css',
  isthmus: 'src/components/IsthmusMap.module.css',
} as const;

const NO_PREFERENCE = '(prefers-reduced-motion: no-preference)';

interface Declaration {
  prop: string;
  value: string;
}
interface FlatRule {
  /** Selector de la regla (para `@keyframes`, `@keyframes nombre`). */
  selector: string;
  /** Condiciones de las `@media`/`@supports` que la envuelven, de fuera adentro. */
  context: string[];
  declarations: Declaration[];
  keyframes: boolean;
}

function declarationsOf(body: string): Declaration[] {
  return body
    .split(';')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.includes(':'))
    .map((chunk) => {
      const at = chunk.indexOf(':');
      return { prop: chunk.slice(0, at).trim().toLowerCase(), value: chunk.slice(at + 1).trim() };
    });
}

/** Aplana un CSS (con `@media`/`@supports` anidados) en reglas con su contexto. Lanza ante llaves sin emparejar. */
function flatten(css: string, context: string[] = []): FlatRule[] {
  return parseRules(css).flatMap((rule: Rule): FlatRule[] => {
    if (/^@(media|supports)\b/.test(rule.prelude)) {
      return flatten(rule.body, [...context, rule.prelude]);
    }
    if (rule.prelude.startsWith('@keyframes')) {
      // El cuerpo de un @keyframes son bloques `from { … }` / `to { … }`: sus declaraciones, todas juntas.
      const inner = parseRules(rule.body).flatMap((step) => declarationsOf(step.body));
      return [{ selector: rule.prelude, context, declarations: inner, keyframes: true }];
    }
    return [
      {
        selector: rule.prelude,
        context,
        declarations: declarationsOf(rule.body),
        keyframes: false,
      },
    ];
  });
}

const MS = (value: string): number =>
  value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;

/** Todas las infracciones de las reglas de diseño en `css` (vacío = limpio). */
function violations(css: string): string[] {
  const out: string[] = [];
  const rules = flatten(css);
  for (const rule of rules) {
    const where = (d: Declaration): string => `${rule.selector} { ${d.prop}: ${d.value} }`;
    const motionSafe = rule.context.some((c) => c.includes(NO_PREFERENCE));
    for (const d of rule.declarations) {
      // Movimiento: solo con `no-preference`, finito, sin opacidad.
      if (/^animation(-|$)/.test(d.prop) && !rule.keyframes && !motionSafe) {
        out.push(`animación fuera de ${NO_PREFERENCE}: ${where(d)}`);
      }
      if (/infinite/i.test(d.value)) out.push(`animación infinita (WCAG 2.2.2): ${where(d)}`);
      if (
        d.prop === 'transform' &&
        /perspective|rotate|scale|translate/.test(d.value) &&
        !motionSafe
      ) {
        out.push(`transformación animable fuera de ${NO_PREFERENCE}: ${where(d)}`);
      }
      if (rule.keyframes && /^(opacity|visibility|filter)$/.test(d.prop)) {
        out.push(`${d.prop} en ${rule.selector} (axe mediría contraste a mitad de animación)`);
      }
      // Recortes y alturas fijas (1.4.12).
      if (/^overflow(-[xy]|-inline|-block)?$/.test(d.prop) && /hidden|clip/.test(d.value)) {
        out.push(`recorte de contenido: ${where(d)}`);
      }
      // Solo propiedades lógicas.
      if (
        /^(margin|padding)-(left|right|top|bottom)$/.test(d.prop) ||
        /^border-(left|right|top|bottom)(-|$)/.test(d.prop) ||
        /^(width|height|min-width|max-width|min-height|max-height|top|left|right|bottom|float)$/.test(
          d.prop,
        ) ||
        (d.prop === 'text-align' && /^(left|right)$/.test(d.value))
      ) {
        out.push(`propiedad física (usa la lógica): ${where(d)}`);
      }
      // Foco: nunca se suprime.
      if (/^outline(-style|-width)?$/.test(d.prop) && /^(none|0|0px)$/.test(d.value)) {
        out.push(`foco suprimido: ${where(d)}`);
      }
      // Desenfoque: solo con soporte, ≥ 56rem y puntero fino.
      if (/^(-webkit-)?backdrop-filter$/.test(d.prop)) {
        const ctx = rule.context.join(' ');
        if (
          !/@supports \((-webkit-)?backdrop-filter/.test(ctx) ||
          !/min-width: 56rem/.test(ctx) ||
          !/hover: hover/.test(ctx) ||
          !/pointer: fine/.test(ctx)
        ) {
          out.push(
            `backdrop-filter sin su condición (soporte + 56rem + puntero fino): ${where(d)}`,
          );
        }
      }
      // Rojo, azul claro y verde: relleno, nunca texto (ADR-0025).
      if (
        d.prop === 'color' &&
        /--color-(cta|cta-strong|sky|nature|brand-[a-z]+)\b/.test(d.value)
      ) {
        out.push(`color de texto no permitido (solo relleno): ${where(d)}`);
      }
    }
  }
  return out;
}

describe('CSS de la portada y de la rejilla', () => {
  for (const [name, path] of Object.entries(FILES)) {
    it(`${name}: sin infracciones de movimiento, recorte, propiedades físicas, foco ni desenfoque`, () => {
      expect(violations(read(path))).toEqual([]);
    });
  }

  it('control: el detector SÍ ve cada infracción (un CSS malo no pasa)', () => {
    const bad = (css: string): string[] => violations(css);
    expect(bad('.a { animation: x 1s infinite; }').join()).toMatch(/infinita/);
    expect(bad('.a { animation: x 1s; }').join()).toMatch(/fuera de/);
    expect(bad('.a { animation-timeline: view(); }').join()).toMatch(/fuera de/);
    expect(
      bad('@media (prefers-reduced-motion: no-preference) { .a { animation: x 1s; } }'),
    ).toEqual([]);
    expect(bad('@keyframes x { from { opacity: 0; } to { opacity: 1; } }').join()).toMatch(
      /opacity/,
    );
    expect(bad('.a { transform: rotateX(2deg); }').join()).toMatch(/transformación/);
    expect(bad('.a { overflow: hidden; }').join()).toMatch(/recorte/);
    expect(bad('.a { overflow-x: clip; }').join()).toMatch(/recorte/);
    expect(bad('.a { margin-left: 1rem; }').join()).toMatch(/física/);
    expect(bad('.a { width: 3rem; }').join()).toMatch(/física/);
    expect(bad('.a { text-align: left; }').join()).toMatch(/física/);
    expect(bad('.a:focus-visible { outline: none; }').join()).toMatch(/foco/);
    expect(bad('.a { backdrop-filter: blur(4px); }').join()).toMatch(/backdrop-filter/);
    expect(bad('.a { color: var(--color-cta); }').join()).toMatch(/texto/);
    expect(bad('.a { color: var(--color-sky); }').join()).toMatch(/texto/);
    expect(
      bad(
        '@media (min-width: 56rem) and (hover: hover) and (pointer: fine) { @supports (backdrop-filter: blur(1px)) { .a { backdrop-filter: blur(4px); } } }',
      ),
    ).toEqual([]);
    expect(() => flatten('.a { color: red;')).toThrow();
  });

  it('el CSS se lee entero (llaves emparejadas) y no está vacío', () => {
    for (const path of Object.values(FILES)) {
      expect(flatten(read(path)).length, path).toBeGreaterThan(0);
    }
  });
});

describe('portada: reglas que las herramientas no ven', () => {
  const page = flatten(read(FILES.page));
  const rule = (selector: string, context?: string): FlatRule => {
    const found = page.filter(
      (r) =>
        r.selector === selector && (context === undefined || r.context.join(' ').includes(context)),
    );
    if (found.length === 0) throw new Error(`falta la regla «${selector}»`);
    return found[0] as FlatRule;
  };
  const decl = (r: FlatRule, prop: string): string | undefined =>
    r.declarations.find((d) => d.prop === prop)?.value;

  it('los adornos del héroe son capas aparte (no pseudo-elementos de un antepasado del texto) sobre un color de fondo SÓLIDO', () => {
    const hero = rule('.hero');
    expect(decl(hero, 'background-color')).toBe('var(--color-brand-deep)');
    expect(decl(hero, 'isolation')).toBe('isolate');
    expect(decl(hero, 'background-image')).toBeUndefined();
    expect(decl(hero, 'background')).toBeUndefined();
    const deco = rule('.decor, .contours');
    expect(decl(deco, 'pointer-events')).toBe('none');
    expect(decl(deco, 'z-index')).toBe('0'); // nunca negativo: axe dejaría sin medir el texto del héroe
    expect(decl(rule('.heroInner'), 'z-index')).toBe('1');
    expect(decl(rule('.heroInner'), 'position')).toBe('relative');
    expect(decl(deco, 'position')).toBe('absolute');
  });

  it('ningún antepasado del texto lleva un pseudo-elemento absoluto (axe no medirá el contraste dentro de él)', () => {
    const pseudo = page.filter(
      (r) =>
        /::(before|after)/.test(r.selector) &&
        decl(r, 'position') === 'absolute' &&
        !/wordmarkSub/.test(r.selector),
    );
    expect(pseudo.map((r) => r.selector)).toEqual([]);
  });

  it('solo los adornos llevan degradado: ninguna regla de un elemento con texto lo usa', () => {
    const gradient = /gradient\(/;
    const withGradient = [...page, ...flatten(read(FILES.grid))]
      .filter((r) => r.declarations.some((d) => gradient.test(d.value)))
      .map((r) => r.selector);
    const allowed = new Set(['.decor', '.contours', '.media']);
    expect(withGradient.filter((s) => !allowed.has(s))).toEqual([]);
    expect(withGradient.length).toBeGreaterThan(0);
  });

  it('el texto del héroe va sobre UNA tarjeta SÓLIDA en todos los anchos (sin vidrio) y el crédito del istmo también es sólido (r1:V-11)', () => {
    const copy = rule('.copy');
    expect(decl(copy, 'background')).toBe('var(--color-glass-base)');
    expect(decl(copy, 'border-radius')).toBe('var(--radius-glass)');
    expect(decl(copy, 'border')).toBe('var(--glass-border)');
    expect(decl(rule('.credit'), 'background')).toBe('var(--color-glass-base)');
    // Ninguna regla de la portada vuelve translúcida una superficie con texto ni desenfoca lo de detrás
    expect(page.filter((r) => decl(r, 'background') === 'var(--surface-glass)')).toEqual([]);
    expect(page.filter((r) => r.declarations.some((d) => /backdrop-filter/.test(d.prop)))).toEqual(
      [],
    );
  });

  it('control: con la tarjeta translúcida la comprobación SÍ falla', () => {
    const glassy = read(FILES.page).replace(
      '.copy {\n  background: var(--color-glass-base);',
      '.copy {\n  background: var(--surface-glass);',
    );
    expect(glassy).not.toBe(read(FILES.page));
    expect(
      flatten(glassy).filter((r) => r.declarations.some((d) => d.value === 'var(--surface-glass)')),
    ).not.toEqual([]);
  });

  it('el istmo es la segunda columna SOLO desde 64rem (texto 5fr, istmo 7fr) y debajo del texto en pantallas menores (r1:V-10)', () => {
    expect(rule('.isthmus')).toBeDefined();
    const columns = page.filter(
      (r) => r.selector === '.heroInner' && decl(r, 'grid-template-columns'),
    );
    const two = columns.find((r) => /7fr/.test(decl(r, 'grid-template-columns') ?? ''));
    expect(decl(two as FlatRule, 'grid-template-columns')).toBe('minmax(0, 5fr) minmax(0, 7fr)');
    expect(two?.context.join(' ')).toContain('(min-width: 64rem)');
    expect(page.some((r) => /\(min-width: 48rem\)/.test(r.context.join(' ')))).toBe(false);
    // Sin `order`: el orden del DOM (texto y llamada principal primero) es el visual en un teléfono
    expect(page.filter((r) => decl(r, 'order') !== undefined).map((r) => r.selector)).toEqual([]);
  });

  it('en el héroe el título no se guioniza y el texto de apoyo se reduce en teléfonos para que la llamada principal entre en el pliegue', () => {
    expect(decl(rule('.title'), 'font-size')).toBe('clamp(1.65rem, 1.15rem + 2.6vw, 3.1rem)');
    expect(decl(rule('.lead'), 'font-size')).toBe('var(--text-m)');
    expect(decl(rule('.lead', '(min-width: 30rem)'), 'font-size')).toBe('var(--text-l)');
    expect(decl(rule('.hero'), 'padding-block')).toBe('var(--space-4) var(--space-6)');
  });

  it('la profundidad espacial: las capas `data-depth` del istmo solo se desplazan con `no-preference` y solo con translate', () => {
    const isthmus = flatten(read(FILES.isthmus));
    const moving = isthmus.filter((r) => /\[data-depth/.test(r.selector) && decl(r, 'translate'));
    expect(moving.map((r) => r.selector).sort()).toEqual([
      ".hero [data-depth='far']",
      ".hero [data-depth='mid']",
      ".hero [data-depth='near']",
    ]);
    for (const r of moving) {
      expect(r.context.join(' ')).toContain(NO_PREFERENCE);
      expect(decl(r, 'translate')).toMatch(/var\(--depth-x, 0\).*var\(--depth-y, 0\)/);
    }
    // Y el escenario solo publica la posición con puntero fino, hover y sin movimiento reducido
    const stage = read('src/components/DepthStage.tsx');
    expect(stage).toContain(
      "'(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'",
    );
    expect(page.filter((r) => decl(r, 'transform')?.includes('perspective'))).toEqual([]);
  });

  it('la entrada del héroe es finita: cada animación ≤ 1 s contando su retraso, y solo con translate/scale', () => {
    const entry = page.filter(
      (r) => r.context.join(' ').includes(NO_PREFERENCE) && /^\.(copy|isthmus)\b/.test(r.selector),
    );
    expect(entry.length).toBeGreaterThanOrEqual(7);
    let longest = 0;
    for (const r of entry) {
      const shorthand = decl(r, 'animation');
      const delay = decl(r, 'animation-delay');
      let duration = 0;
      let wait = delay ? MS(delay) : 0;
      if (shorthand) {
        const times = [...shorthand.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)].map((m) => MS(m[0]));
        duration = times[0] ?? 0;
        if (times[1] !== undefined) wait = times[1];
      }
      longest = Math.max(longest, duration + wait);
    }
    expect(longest).toBeGreaterThan(0);
    expect(longest).toBeLessThanOrEqual(1000);
    const keyframes = Object.fromEntries(
      page
        .filter((r) => r.keyframes)
        .map((k) => [k.selector, [...new Set(k.declarations.map((d) => d.prop))].sort()]),
    );
    expect(keyframes).toEqual({
      '@keyframes heroRise': ['scale', 'translate'],
      '@keyframes isthmusSettle': ['scale', 'translate'],
      '@keyframes sectionReveal': ['translate'],
    });
  });

  it('los seis hijos de `.copy` tienen su turno escalonado (la prueba de la página fija que son seis)', () => {
    const turns = page
      .filter((r) => /^\.copy > :nth-child\(\d\)$/.test(r.selector))
      .map((r) => Number(/\((\d)\)/.exec(r.selector)?.[1]));
    expect(turns).toEqual([2, 3, 4, 5, 6]);
  });

  it('el revelado por scroll solo existe con soporte de `animation-timeline` y bajo `no-preference`', () => {
    const reveal = page.filter((r) => r.declarations.some((d) => d.prop === 'animation-timeline'));
    expect(reveal.length).toBeGreaterThan(0);
    for (const r of reveal) {
      expect(r.context.join(' ')).toContain(NO_PREFERENCE);
      expect(r.context.join(' ')).toContain('@supports (animation-timeline: view())');
    }
  });

  it('sin altura fija ni aspect-ratio en lo que lleva texto (1.4.12): se usa min-block-size', () => {
    const textual =
      /^\.(hero|copy|frame|principle|principleList|section|wordmark|wordmarkMain|wordmarkSub|eyebrow|tagline|title)\b/;
    const bad = page
      .filter((r) => textual.test(r.selector) && !r.selector.includes('::'))
      .flatMap((r) =>
        r.declarations
          .filter((d) => /^(block-size|max-block-size|aspect-ratio)$/.test(d.prop))
          .map((d) => `${r.selector} { ${d.prop}: ${d.value} }`),
      );
    expect(bad).toEqual([]);
  });

  it('forced-colors: los adornos desaparecen y los bordes usan colores del sistema', () => {
    const forced = page.filter((r) => r.context.join(' ').includes('(forced-colors: active)'));
    expect(forced.some((r) => r.selector.includes('.decor') && decl(r, 'display') === 'none')).toBe(
      true,
    );
    expect(forced.some((r) => decl(r, 'border-color') === 'CanvasText')).toBe(true);
  });
});

describe('rejilla de destinos: reglas que las herramientas no ven', () => {
  const grid = flatten(read(FILES.grid));
  const find = (selector: string): FlatRule => {
    const r = grid.find((x) => x.selector === selector && x.context.length === 0);
    if (!r) throw new Error(`falta la regla «${selector}»`);
    return r;
  };
  const decl = (r: FlatRule, prop: string): string | undefined =>
    r.declarations.find((d) => d.prop === prop)?.value;

  it('rejilla fluida: 1 columna estrecha, más cuando hay sitio, sin desbordar (minmax(min(100%, 17rem), 1fr))', () => {
    expect(decl(find('.grid'), 'grid-template-columns')).toBe(
      'repeat(auto-fit, minmax(min(100%, 17rem), 1fr))',
    );
  });

  it('la tarjeta no tiene altura fija, aspect-ratio ni recorte; el texto va sobre la superficie SÓLIDA', () => {
    for (const selector of ['.card', '.body', '.link', '.name', '.kind', '.mapLink']) {
      const r = find(selector);
      for (const prop of ['height', 'block-size', 'max-block-size', 'aspect-ratio', 'overflow']) {
        expect(decl(r, prop), `${selector} ${prop}`).toBeUndefined();
      }
    }
    expect(decl(find('.card'), 'background')).toBe('var(--color-surface)');
    // El hueco de la foto tiene altura MÍNIMA y no lleva texto.
    expect(decl(find('.media'), 'min-block-size')).toBeDefined();
    expect(decl(find('.media'), 'block-size')).toBeUndefined();
  });

  it('enlace estirado: el principal cubre toda la tarjeta y «Ver en el mapa» queda por encima (≥ 44 px)', () => {
    const stretch = find('.link::after');
    expect(decl(stretch, 'position')).toBe('absolute');
    expect(decl(stretch, 'inset')).toBe('0');
    expect(decl(find('.card'), 'position')).toBe('relative');
    const map = find('.mapLink');
    expect(decl(map, 'position')).toBe('relative');
    expect(decl(map, 'z-index')).toBe('1');
    expect(decl(map, 'min-block-size')).toBe('var(--target-min)');
  });

  it('el primer `a` de cada tarjeta (.link) tiene transición con los tokens de movimiento (la prueba de movimiento reducido lo lee)', () => {
    expect(decl(find('.link'), 'transition')).toMatch(/var\(--motion-fast\)/);
  });

  it('el anillo de foco de la tarjeta se añade con :has(); nunca se quita el del enlace', () => {
    const ring = grid.find((r) => r.selector === '.card:has(.link:focus-visible)');
    expect(ring).toBeDefined();
    expect(decl(ring as FlatRule, 'outline')).toBe('3px solid var(--color-focus)');
  });

  it('la elevación al pasar el cursor y el revelado por scroll solo con `no-preference`', () => {
    const lift = grid.find((r) => r.selector === '.card:hover' && decl(r, 'transform'));
    expect(lift?.context.join(' ')).toContain(NO_PREFERENCE);
    const reveal = grid.find((r) => r.declarations.some((d) => d.prop === 'animation-timeline'));
    expect(reveal?.context.join(' ')).toContain(NO_PREFERENCE);
    expect(reveal?.context.join(' ')).toContain('@supports (animation-timeline: view())');
  });
});

describe('buscador: reglas que las herramientas no ven', () => {
  const search = flatten(read(FILES.search));
  const find = (selector: string): FlatRule => {
    const r = search.find((x) => x.selector === selector);
    if (!r) throw new Error(`falta la regla «${selector}»`);
    return r;
  };

  it('objetivos ≥ 44 px y el campo puede encoger (reflow a 320 px)', () => {
    for (const selector of ['.input', '.submit', '.resultLink', '.mapLink']) {
      expect(
        find(selector).declarations.find((d) => d.prop === 'min-block-size')?.value,
        selector,
      ).toBe('var(--target-min)');
    }
    expect(find('.input').declarations.find((d) => d.prop === 'min-inline-size')?.value).toBe('0');
    expect(find('.row').declarations.find((d) => d.prop === 'flex-wrap')?.value).toBe('wrap');
  });

  it('la región viva nunca se oculta con display:none (una región vacía oculta no anuncia su primer cambio)', () => {
    expect(stripComments(read(FILES.search))).not.toMatch(/\.status[^{]*\{[^}]*display:\s*none/);
  });

  it('el anillo de foco conserva el radio del campo y del botón (no «salta» al enfocar)', () => {
    for (const selector of [
      '.input:focus-visible',
      '.submit:focus-visible',
      '.mapLink:focus-visible',
    ]) {
      expect(find(selector).declarations.find((d) => d.prop === 'border-radius')?.value).toBe(
        'var(--radius-m)',
      );
    }
  });
});

describe('buscador de la portada: reglas que las herramientas no ven (r0:F-09, r1:V-04, r2:F7)', () => {
  const search = flatten(read(FILES.search));
  const find = (selector: string, context: string): FlatRule | undefined =>
    search.find((r) => r.selector === selector && r.context.join(' ').includes(context));
  const decl = (r: FlatRule | undefined, prop: string): string | undefined =>
    r?.declarations.find((d) => d.prop === prop)?.value;

  it('sin JavaScript el formulario se OCULTA entero: un campo que no puede buscar engaña', () => {
    expect(decl(find('.search', '(scripting: none)'), 'display')).toBe('none');
  });

  it('en teléfonos (< 30rem) el campo y el botón van en dos filas a todo el ancho: ningún texto de ayuda se recorta', () => {
    const phones = '(max-width: 29.99rem)';
    expect(decl(find('.row', phones), 'flex-direction')).toBe('column');
    expect(decl(find('.submit', phones), 'inline-size')).toBe('100%');
    expect(decl(find('.input', phones), 'inline-size')).toBe('100%');
    // y la regla va DESPUÉS de la base de `.input` y `.submit` (misma especificidad: manda el orden)
    const css = read(FILES.search);
    expect(css.indexOf(`@media ${phones}`)).toBeGreaterThan(css.indexOf('.submit:focus-visible'));
  });

  it('la columna del formulario puede encoger (`minmax(0, 1fr)`): con el texto al 200 % el campo no ensancha la página', () => {
    const base = search.find((r) => r.selector === '.search' && r.context.length === 0);
    expect(decl(base, 'grid-template-columns')).toBe('minmax(0, 1fr)');
  });

  it('va DESPUÉS de los botones del héroe: separación por arriba y no por abajo', () => {
    const base = search.find((r) => r.selector === '.search' && r.context.length === 0);
    expect(decl(base, 'margin-block-start')).toBe('var(--space-5)');
    expect(decl(base, 'margin-block-end')).toBeUndefined();
  });
});
