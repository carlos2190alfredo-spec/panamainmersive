import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESTINATIONS } from '@/domains/tourism/destinations';
import { kindOptions } from '@/domains/tourism/explore-filter';
import { flatten, valueOf, type FlatRule } from './css-flat';

/**
 * Contratos de CSS del HUD de Explorar (ADR-0025 §5 y §8), leídos del código real. Son reglas que ninguna herramienta
 * comprueba sola y que se rompen sin avisar: como MÁXIMO tres superficies piden desenfoque (repinta en cada fotograma
 * de WebGL), el desenfoque solo con soporte + puntero fino + ≥ 56rem, el HUD por encima del aviso del mapa, sin
 * recortes ni alturas fijas en lo que lleva texto (WCAG 1.4.12), solo propiedades lógicas (salvo la piel de los
 * controles NATIVOS de MapLibre, cuya hoja es física), movimiento solo con `no-preference` y sin repeticiones infinitas.
 * Cada comprobación lleva su CONTROL: se alimenta con un CSS malo y debe detectarlo.
 */
const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

const HUD_FILES = {
  glass: 'src/styles/glass.module.css',
  page: 'src/app/[locale]/explore/page.module.css',
  carousel: 'src/components/map/HudCarousel.module.css',
  panel: 'src/components/map/HudPanel.module.css',
  featured: 'src/components/map/SelectedDestinationCard.module.css',
  group: 'src/components/HudGroup.module.css',
  layers: 'src/components/map/LayerControls.module.css',
  legend: 'src/components/map/MapLegend.module.css',
  showOnMap: 'src/components/map/ShowOnMapButton.module.css',
  list: 'src/components/DestinationList.module.css',
  glyph: 'src/components/DestinationGlyph.module.css',
  stage: 'src/components/map/MapStage.module.css',
  blocked: 'src/components/map/MapBlocked.module.css',
  chips: 'src/components/map/FilterChips.module.css',
  search: 'src/components/map/SearchBox.module.css',
  tools: 'src/components/map/MapTools.module.css',
  status: 'src/components/map/CarouselFilterStatus.module.css',
  sheet: 'src/components/map/HudSheet.module.css',
} as const;

const NO_PREFERENCE = '(prefers-reduced-motion: no-preference)';

/** Reglas donde se permite recortar: el contenedor del mapa y la etiqueta oculta de un marcador (no llevan texto de lectura). */
const CLIP_ALLOWED: Record<string, readonly string[]> = {
  page: ['.map'],
  stage: ['.stage', '.label'],
};
/** La piel de los controles nativos de MapLibre usa las propiedades físicas de SU hoja (top, right, margin…). */
const PHYSICAL_ALLOWED = /^\.stage :global\(\.maplibregl-/;

function violations(css: string, file = ''): string[] {
  const out: string[] = [];
  for (const rule of flatten(css)) {
    const where = (d: { prop: string; value: string }): string =>
      `${rule.selector} { ${d.prop}: ${d.value} }`;
    const motionSafe = rule.context.some((c) => c.includes(NO_PREFERENCE));
    for (const d of rule.declarations) {
      if (/^animation(-|$)/.test(d.prop) && !rule.keyframes && !motionSafe) {
        out.push(`animación fuera de ${NO_PREFERENCE}: ${where(d)}`);
      }
      if (/infinite/i.test(d.value)) out.push(`animación infinita (WCAG 2.2.2): ${where(d)}`);
      // `pulse` es el anillo DECORATIVO del marcador seleccionado (un pseudo-elemento sin texto, dos repeticiones): la
      // opacidad solo está permitida en capas sin texto.
      if (
        rule.keyframes &&
        rule.selector !== '@keyframes pulse' &&
        /^(opacity|visibility|filter)$/.test(d.prop)
      ) {
        out.push(`${d.prop} en ${rule.selector} (axe mediría el contraste a mitad de animación)`);
      }
      if (/^overflow(-[xy]|-inline|-block)?$/.test(d.prop) && /hidden|clip/.test(d.value)) {
        const allowed = CLIP_ALLOWED[file] ?? [];
        if (!allowed.includes(rule.selector)) out.push(`recorte de contenido: ${where(d)}`);
      }
      if (
        /^(margin|padding)-(left|right|top|bottom)$/.test(d.prop) ||
        /^border-(left|right|top|bottom)(-|$)/.test(d.prop) ||
        /^(width|height|min-width|max-width|min-height|max-height|top|left|right|bottom|float)$/.test(
          d.prop,
        ) ||
        (d.prop === 'text-align' && /^(left|right)$/.test(d.value))
      ) {
        if (!(file === 'stage' && PHYSICAL_ALLOWED.test(rule.selector))) {
          out.push(`propiedad física (usa la lógica): ${where(d)}`);
        }
      }
      if (/^outline(-style|-width)?$/.test(d.prop) && /^(none|0|0px)$/.test(d.value)) {
        out.push(`foco suprimido: ${where(d)}`);
      }
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

describe('CSS del HUD: reglas que las herramientas no ven', () => {
  for (const [name, path] of Object.entries(HUD_FILES)) {
    it(`${name}: sin infracciones de movimiento, recorte, propiedades físicas, foco ni desenfoque`, () => {
      expect(violations(read(path), name)).toEqual([]);
    });
  }

  it('la etiqueta de un marcador que solo se ve por el cursor o el foco respeta `data-label-dismissed` (Escape, WCAG 1.4.13); la que se ve por sitio o selección no depende de ello (r2:N4)', () => {
    const css = read(HUD_FILES.stage);
    expect(css).toMatch(/\.marker:hover:not\(\[data-label-dismissed\]\) \.label/);
    expect(css).toMatch(/\.marker:focus-visible:not\(\[data-label-dismissed\]\) \.label/);
    expect(css).toMatch(/\.marker\[data-label-visible\] \.label/);
    expect(css).toMatch(/\.markerSelected \.label/);
    // sin un `:hover`/`:focus-visible` desnudo que se salte el descarte
    expect(css).not.toMatch(/\.marker:hover \.label/);
    expect(css).not.toMatch(/\.marker:focus-visible \.label/);
    // y el descarte NO añade otra regla que recorte (la etiqueta oculta ya lo hace una vez: `.label`)
    expect(css.match(/data-label-dismissed/g)?.length).toBeLessThanOrEqual(4);
  });

  it('control: el detector SÍ ve cada infracción (un CSS malo no pasa)', () => {
    const bad = (css: string): string[] => violations(css);
    expect(bad('.a { animation: x 1s infinite; }').join()).toMatch(/infinita/);
    expect(bad('.a { animation: x 1s; }').join()).toMatch(/fuera de/);
    expect(bad('@keyframes x { from { opacity: 0; } to { opacity: 1; } }').join()).toMatch(
      /opacity/,
    );
    expect(bad('@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }')).toEqual([]);
    expect(bad('.a { overflow: hidden; }').join()).toMatch(/recorte/);
    expect(bad('.a { overflow-y: clip; }').join()).toMatch(/recorte/);
    expect(bad('.a { margin-left: 1rem; }').join()).toMatch(/física/);
    expect(bad('.a { inset-inline: 0; margin-inline: 1rem; }')).toEqual([]);
    expect(bad('.a:focus-visible { outline: none; }').join()).toMatch(/foco/);
    expect(bad('.a { backdrop-filter: blur(4px); }').join()).toMatch(/backdrop-filter/);
    expect(bad('.a { color: var(--color-cta); }').join()).toMatch(/texto/);
    // Lo permitido: la excepción de la piel de MapLibre y la de los recortes autorizados
    expect(violations('.stage :global(.maplibregl-ctrl-top-right) { top: 1px; }', 'stage')).toEqual(
      [],
    );
    expect(violations('.stage { top: 1px; }', 'stage').join()).toMatch(/física/);
    expect(violations('.map { overflow: hidden; }', 'page')).toEqual([]);
    expect(violations('.rail { overflow: hidden; }', 'page').join()).toMatch(/recorte/);
    expect(() => flatten('.a { color: red;')).toThrow();
  });
});

describe('vidrio: máximo tres superficies con desenfoque', () => {
  const glass = flatten(read(HUD_FILES.glass));

  it('`.surface` es SÓLIDA por defecto y translúcida solo desde 56rem; con colores forzados, Canvas', () => {
    expect(valueOf(glass, '.surface', 'background')).toBe('var(--color-glass-base)');
    expect(valueOf(glass, '.surface', 'border-radius')).toBe('var(--radius-glass)');
    expect(valueOf(glass, '.surface', 'border')).toBe('var(--glass-border)');
    expect(valueOf(glass, '.surface', 'background', 'min-width: 56rem')).toBe(
      'var(--surface-glass)',
    );
    expect(valueOf(glass, '.surface', 'background', 'forced-colors: active')).toBe('Canvas');
  });

  it('el desenfoque vive SOLO en `.blur`, con soporte, puntero fino con hover y ≥ 56rem', () => {
    const blurRules = glass.filter((r) =>
      r.declarations.some((d) => /backdrop-filter/.test(d.prop)),
    );
    expect(blurRules.map((r) => r.selector)).toEqual(['.blur']);
    const ctx = blurRules[0]?.context.join(' ') ?? '';
    expect(ctx).toMatch(/min-width: 56rem\) and \(hover: hover\) and \(pointer: fine/);
    expect(ctx).toMatch(/@supports \(backdrop-filter: blur\(1px\)\)/);
  });

  it('el radio de las superficies (--radius-glass) es de 12 px como máximo', () => {
    const tokens = read('src/styles/tokens.css');
    const radius = /--radius-glass:\s*([\d.]+)rem/.exec(tokens);
    expect(Number(radius?.[1]) * 16).toBeLessThanOrEqual(12);
  });

  /** `composes: surface blur …` de toda la interfaz de Explorar: cada uso es UNA superficie que repinta con el mapa. */
  function blurUsers(): string[] {
    const users: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (entry.endsWith('.module.css')) {
          const css = readFileSync(path, 'utf8');
          for (const m of css.matchAll(
            /([^{}]+)\{[^{}]*?composes:\s*([^;]*\bblur\b[^;]*)from\s*'[^']*glass\.module\.css'/g,
          )) {
            users.push(
              `${path.replace(`${process.cwd()}/`, '')} ${(m[1] ?? '').trim().split(/\s+/).pop() ?? ''}`,
            );
          }
        }
      }
    };
    walk(join(process.cwd(), 'src'));
    return users.sort();
  }

  it('exactamente tres superficies lo piden: el carril, el carrusel y la ficha (nadie más)', () => {
    expect(blurUsers()).toEqual([
      'src/app/[locale]/explore/page.module.css .rail',
      'src/components/map/HudCarousel.module.css .carousel',
      'src/components/map/SelectedDestinationCard.module.css .card',
    ]);
  });

  it('control: el contador SÍ cuenta una cuarta superficie (la prueba no es vacía)', () => {
    const sample = ".a { composes: surface blur from '../../styles/glass.module.css'; }";
    expect([
      ...sample.matchAll(
        /([^{}]+)\{[^{}]*?composes:\s*([^;]*\bblur\b[^;]*)from\s*'[^']*glass\.module\.css'/g,
      ),
    ]).toHaveLength(1);
    expect(blurUsers().length).toBeLessThanOrEqual(3);
  });
});

describe('maquetación del HUD (móvil: hoja inferior · escritorio ≥ 56rem: rejilla)', () => {
  const page = flatten(read(HUD_FILES.page));
  const DESKTOP = 'min-width: 56rem';
  const decl = (selector: string, prop: string, within?: string) =>
    valueOf(page, selector, prop, within);

  it('el mapa ocupa TODA la pantalla bajo la cabecera (móvil Y escritorio) y el HUD flota encima, por encima del aviso de estado', () => {
    // Es la BASE (sin `@media`): vale en los dos anchos. Antes, en móvil, el mapa era una franja sobre un panel.
    expect(decl('.shell', 'block-size')).toBe('calc(100dvh - var(--header-height))');
    expect(decl('.map', 'position')).toBe('absolute');
    expect(decl('.map', 'inset')).toBe('0');
    expect(decl('.hud', 'position')).toBe('absolute');
    expect(decl('.hud', 'inset')).toBe('0');
    expect(decl('.hud', 'z-index')).toBe('var(--z-hud)');
    expect(decl('.shell', 'min-block-size', DESKTOP)).toBe('30rem');
    // El HUD no intercepta el mapa: solo sus paneles piden punteros
    expect(decl('.hud', 'pointer-events')).toBe('none');
    expect(decl('.hud', 'pointer-events', DESKTOP)).toBe('none');
    for (const selector of ['.title', '.rail']) {
      expect(decl(selector, 'pointer-events', DESKTOP), selector).toBe('auto');
    }
  });

  it('el desenfoque no se escribe fuera de glass.module.css; el carril y el panel desplazan en vertical sin recortar', () => {
    for (const [name, path] of Object.entries(HUD_FILES)) {
      if (name === 'glass') continue;
      expect(read(path), name).not.toMatch(/backdrop-filter/);
    }
    expect(decl('.rail', 'overflow-y', DESKTOP)).toBe('auto');
    expect(decl('.rail', 'max-block-size', DESKTOP)).toBe('100%');
    const panel = flatten(read(HUD_FILES.panel));
    expect(valueOf(panel, '.body', 'overflow-y', DESKTOP)).toBe('auto');
    expect(valueOf(panel, '.panel', 'max-block-size', DESKTOP)).toBe('100%');
  });

  it('el dock inferior pone la ficha y el carrusel LADO A LADO (la altura del HUD no cambia al elegir un destino)', () => {
    expect(decl('.dock', 'display', DESKTOP)).toBe('flex');
    expect(decl('.dock', 'grid-row', DESKTOP)).toBe('3');
    expect(decl('.dock', 'display')).toBe('contents'); // móvil: no es una caja, ficha y carrusel son hijos de la pila
    expect(decl('.carousel', 'min-inline-size', DESKTOP)).toBe('0'); // sin él, empuja la página a 320 px
    // sin selección la región en vivo sigue en el DOM pero no ocupa sitio
    expect(decl('.featured:empty', 'flex-basis', DESKTOP)).toBe('0');
  });

  it('desde 80rem el carril baja hasta la franja inferior y el dock empieza a su derecha (F2-11: el filtro de ocho filas cabe entero a 1280×800); por debajo, el carril se queda en la fila del hueco', () => {
    const WIDE = 'min-width: 80rem';
    // Entre 56rem y 80rem: la rejilla de siempre (el carril solo en la fila del hueco, el dock a todo el ancho)
    expect(decl('.rail', 'grid-row', DESKTOP)).toBe('2');
    // (el dock llega hasta la columna del panel, la 3, y NO ocupa la de las herramientas, la 4: ver la prueba de F5 más abajo)
    expect(decl('.dock', 'grid-column', DESKTOP)).toBe('1 / 4');
    // Desde 80rem: el carril cruza las filas 2 y 3 y el dock deja su columna
    expect(decl('.rail', 'grid-row', WIDE)).toBe('2 / -1');
    expect(decl('.dock', 'grid-column', WIDE)).toBe('2 / 4');
    // …sin dejar de desplazar por dentro si aun así no cabe (portátiles bajos): nunca recorta
    expect(decl('.rail', 'overflow-y', DESKTOP)).toBe('auto');
    expect(decl('.rail', 'max-block-size', DESKTOP)).toBe('100%');
    // La ficha toma más ancho para que su nombre no se parta, y vacía sigue sin ocupar nada (gana por especificidad)
    expect(decl('.featured', 'flex-basis', WIDE)).toBe('min(34rem, 56%)');
    expect(decl('.featured:empty', 'flex-basis', DESKTOP)).toBe('0');
  });

  it('el hueco libre de HUD (`.safe`): en móvil es lo que la hoja deja sobre el mapa; desde 56rem, la celda central de la rejilla', () => {
    expect(decl('.safe', 'grid-column', DESKTOP)).toBe('2');
    expect(decl('.safe', 'grid-row', DESKTOP)).toBe('2');
    expect(decl('.safe', 'pointer-events', DESKTOP)).toBe('none');
    // Móvil: se pinta y CRECE con el espacio que sobra: sigue a la hoja cuando se abre o cambia de alto (el mapa lo mide al volar)
    expect(decl('.safe', 'display')).toBe('block');
    expect(decl('.safe', 'flex')).toBe('1 1 0');
    expect(decl('.hud', 'justify-content')).toBe('flex-end');
    expect(decl('.safe', 'pointer-events')).toBe('none');
    // y no se pisa con el zoom y la brújula (derecha) ni con las herramientas (arriba)
    expect(decl('.safe', 'margin-inline-end')).toContain('var(--target-min)');
    expect(decl('.safe', 'margin-block-start')).toContain('var(--target-min)');
    // …ni con la escala y los créditos, que se montan SOBRE la hoja (r1:V-18: a 320 px la «i» tapaba parte del grupo «3»)
    expect(decl('.safe', 'margin-block-end')).toBe('2.5rem');
  });

  it('las zonas del buscador y de las herramientas existen; la del buscador RESERVA su alto (la isla llega tras hidratar) y las herramientas no ocupan sitio mientras están vacías', () => {
    // El buscador abarca las columnas del centro y del panel (su suma no cambia al abrir el panel: no salta) y nunca la 4
    expect(decl('.search', 'grid-column', DESKTOP)).toBe('2 / 4');
    expect(decl('.tools', 'grid-column', DESKTOP)).toBe('4');
    expect(decl('.search', 'min-block-size')).toBe('var(--hud-search-h)');
    expect(decl('.tools:empty', 'display', DESKTOP)).toBe('none');
    // En móvil las herramientas flotan sobre el mapa (arriba a la izquierda: la derecha es del zoom y la brújula) y en escritorio vuelven a la rejilla
    expect(decl('.tools', 'position')).toBe('absolute');
    expect(decl('.tools', 'inset-inline-start')).toBe('var(--hud-gap)');
    expect(decl('.tools', 'position', DESKTOP)).toBe('static');
  });

  it('el filtro por tipo reserva el alto de sus filas: `--filter-rows` es «todos» + los tipos que EXISTEN (la isla llega tras hidratar)', () => {
    const rows = Number(valueOf(page, '.shell', '--filter-rows'));
    expect(rows).toBe(kindOptions(DESTINATIONS).length + 1);
    // Sin JavaScript no hay isla: el grupo y el buscador (controles sin función) se retiran
    const noScript = page.filter((r) => r.context.some((c) => c.includes('scripting: none')));
    expect(noScript.map((r) => r.selector).join()).toMatch(/\.filterGroup/);
    expect(noScript.map((r) => r.selector).join()).toMatch(/\.search/);
  });

  it('el HUD no usa `order` en ningún ancho: el orden del DOM (= el de tabulación) es el visual', () => {
    const ordered = page.filter((r) => r.declarations.some((d) => d.prop === 'order'));
    expect(ordered.map((r) => r.selector)).toEqual([]);
  });

  it('sin JavaScript no hay hoja que abrir: en móvil el HUD vuelve a ser una pila bajo el mapa que desplaza la página', () => {
    const noScript = 'scripting: none';
    expect(decl('.hud', 'position', noScript)).toBe('static');
    expect(decl('.map', 'position', noScript)).toBe('relative');
    expect(decl('.shell', 'block-size', noScript)).toBe('auto');
  });

  it('el HUD NO pinta degradados: pintaría POR ENCIMA de los controles de MapLibre y atenuaría la escala y los créditos', () => {
    // El velo inferior vive en la «atmósfera» del lienzo (z-index 0, bajo los controles, z-index 2)
    for (const [name, path] of Object.entries(HUD_FILES)) {
      if (name === 'stage' || name === 'glyph') continue;
      expect(read(path), `${name}: un degradado en el HUD tapa los créditos del mapa`).not.toMatch(
        /(linear|radial|conic)-gradient\(/,
      );
    }
    const stage = flatten(read(HUD_FILES.stage));
    expect(valueOf(stage, '.atmosphere', 'z-index')).toBe('0');
    expect(valueOf(stage, '.atmosphere', 'pointer-events')).toBe('none');
    // Los controles nativos (z-index 2 en la hoja de MapLibre) quedan por encima de la atmósfera
    expect(read('vendor/maplibre-gl.trimmed.css')).toMatch(
      /\.maplibregl-ctrl-bottom-right[^{]*\{[^}]*z-index:2/,
    );
  });
});

describe('zona de herramientas, panel y dock con poca altura o texto agrandado (r2:F5, r1:V-07)', () => {
  const page = flatten(read(HUD_FILES.page));
  const panelCss = flatten(read(HUD_FILES.panel));
  const DESKTOP = 'min-width: 56rem';
  const decl = (selector: string, prop: string, within?: string) =>
    valueOf(page, selector, prop, within);

  it('la píldora «Información del mapa» y el panel abierto van SIEMPRE en la columna 3 (nunca en la de las herramientas, la 4) y no cambian de columna al plegarse', () => {
    expect(decl('.panel', 'grid-column', DESKTOP)).toBe('3');
    expect(decl('.panel', 'grid-row', DESKTOP)).toBe('2');
    expect(decl('.panel', 'justify-self', DESKTOP)).toBe('end');
    expect(decl('.panel', 'align-self', DESKTOP)).toBe('end');
    // Ninguna regla del panel vuelve a mandarlo a la columna de las herramientas
    const toTools = page.filter(
      (r) =>
        r.selector.includes('.panel') &&
        r.declarations.some((d) => d.prop === 'grid-column' && /(^|\s)4$/.test(d.value)),
    );
    expect(toTools.map((r) => r.selector)).toEqual([]);
    // El panel pegado abajo a ras del dock y, plegado, solo del ancho de su rótulo
    expect(decl(".panel[data-state='closed']", 'inline-size', DESKTOP)).toBe('max-content');
  });

  it('la columna del panel mide 0 plegado y `--hud-panel-w` abierto: la píldora desborda hacia la izquierda sin ocupar sitio y el centro cede lo que el panel gana', () => {
    expect(decl('.shell', '--hud-panel-col')).toBe('0px');
    expect(decl('.hud', 'grid-template-columns', DESKTOP)).toBe(
      'var(--hud-rail-w) minmax(0, 1fr) var(--hud-panel-col) var(--hud-tools-w)',
    );
    expect(
      decl(".hud:has([data-hud-zone='panel'][data-state='open'])", '--hud-panel-col', DESKTOP),
    ).toBe('var(--hud-panel-w)');
    // El panel abierto mide lo mismo que su columna (el ancho de HudPanel.module.css es `--hud-panel-w`)
    expect(valueOf(panelCss, '.panel', 'inline-size', DESKTOP)).toBe('var(--hud-panel-w)');
    // 16rem entre 56rem y 80rem (a 1024 px uno más ancho tapaba la etiqueta del destino: r1:V-16) y 18rem desde 80rem
    expect(decl('.shell', '--hud-panel-w')).toBe('16rem');
    expect(decl('.shell', '--hud-panel-w', 'min-width: 80rem')).toBe('18rem');
  });

  it('el dock NO ocupa la columna de las herramientas: esa columna baja ≈ 15rem desde arriba y con poca altura o texto agrandado tapaba el botón «Ocultar los destinos»', () => {
    // El final de `grid-column` es EXCLUSIVO: `1 / 4` y `2 / 4` terminan en la columna 3
    for (const [within, start] of [
      [DESKTOP, '1'],
      ['min-width: 80rem', '2'],
    ] as const) {
      const column = decl('.dock', 'grid-column', within);
      expect(column, within).toBe(`${start} / 4`);
    }
    expect(decl('.tools', 'grid-column', DESKTOP)).toBe('4');
  });

  it('`--sheet-body-h` tiene un SUELO: con muy poca altura la hoja abierta cubre el mapa en lugar de abrirse con 0 px de cuerpo (r2:F4)', () => {
    const value = decl('.shell', '--sheet-body-h') ?? '';
    expect(value).toMatch(/^max\(/);
    // El segundo término es el suelo: depende de la altura (nunca ≤ 0 mientras haya cabecera) y no pasa de 8rem
    expect(value).toMatch(/min\(calc\(100dvh - var\(--header-height\) - 7rem\), 8rem\)/);
  });

  it('el HUD no guiona palabras (r1:V-06): `hyphens: manual` en el contenedor de toda la pantalla', () => {
    expect(decl('.shell', 'hyphens')).toBe('manual');
  });

  it('el carril y el cuerpo del panel avisan de que hay más contenido (sombra sticky, sin degradados) y su lista no recorta el anillo de foco (r1:V-08, r2:N5)', () => {
    expect(read(HUD_FILES.page)).toMatch(/composes: surface blur scroll cue from/);
    expect(read(HUD_FILES.panel)).toMatch(/composes: scroll cue from/);
    const glass = flatten(read(HUD_FILES.glass));
    expect(valueOf(glass, '.cue::after', 'position', 'container-type: scroll-state')).toBe(
      'sticky',
    );
    expect(valueOf(glass, '.cue::after', 'box-shadow', 'container-type: scroll-state')).toMatch(
      /var\(--color-glass-base\)/,
    );
    // Solo se pinta cuando el panel puede desplazar hacia abajo
    expect(valueOf(glass, '.cue::after', 'opacity', 'scrollable: bottom')).toBe('1');
    const base = glass.find((r) => r.selector === '.cue::after' && r.context.length === 1);
    expect(base?.declarations.find((d) => d.prop === 'opacity')?.value).toBe('0');
    // La lista de áreas desplaza: su relleno (y el margen negativo que lo compensa) deja sitio al anillo de ≈ 8 px
    const areas = flatten(read('src/components/map/AreasInView.module.css'));
    expect(valueOf(areas, '.list', 'padding')).toBe('var(--space-2)');
    expect(valueOf(areas, '.list', 'margin')).toBe('calc(-1 * var(--space-2))');
    // …y la fila de tipos (que desplaza en móvil) también: su caja recortaba el anillo del primer y del último chip
    const chips = flatten(read(HUD_FILES.chips));
    expect(valueOf(chips, '.list', 'margin')).toBe('calc(-1 * var(--space-2))');
    expect(valueOf(chips, '.list', 'margin', 'min-width: 56rem')).toBe('0'); // en escritorio no desplaza: sin relleno ni margen
    // (su caja contenedora es `flow-root`: sin ello el margen negativo se colapsaba con el de la caja y el carril subía 8 px)
    expect(valueOf(flatten(read(HUD_FILES.page)), '.filterSlot', 'display')).toBe('flow-root');
    expect(valueOf(chips, '.list', 'padding')).toBe(
      'var(--space-2) var(--space-2) calc(var(--space-1) + var(--space-2))',
    );
    expect(valueOf(panelCss, '.body', 'padding-inline')).toBe('var(--space-2)');
    expect(valueOf(panelCss, '.body', 'margin-inline')).toBe('calc(-1 * var(--space-2))');
  });

  it('el eco del filtro tiene su sitio en el carrusel estrecho: rejilla de dos filas con posiciones explícitas (sin `order`), y la caja del carrusel pide el desplazamiento con holgura para el anillo', () => {
    const carousel = flatten(read(HUD_FILES.carousel));
    const NARROW = 'max-width: 40rem';
    expect(valueOf(carousel, '.head', 'display', NARROW)).toBe('grid');
    expect(valueOf(carousel, '.head', 'grid-template-areas', NARROW)).toBe(
      "'title toggle' 'echo arrows'",
    );
    expect(valueOf(carousel, '.head [data-filter-echo]', 'grid-area', NARROW)).toBe('echo');
    expect(valueOf(carousel, '.head > .controls', 'display', NARROW)).toBe('contents');
    expect(carousel.filter((r) => r.declarations.some((d) => d.prop === 'order'))).toEqual([]);
    expect(valueOf(carousel, '.body', 'scroll-padding-inline')).toBe('var(--space-2)');
  });
});

describe('hoja inferior móvil (HudSheet.module.css)', () => {
  const sheet = flatten(read(HUD_FILES.sheet));
  const DESKTOP = 'min-width: 56rem';
  const MOBILE = 'max-width: 55.999rem';

  it('es la SUPERFICIE de vidrio sólida del móvil (sin desenfoque), por encima del HUD y por debajo de la cabecera, y no recorta', () => {
    expect(read(HUD_FILES.sheet)).toMatch(/composes:\s*surface from/);
    expect(read(HUD_FILES.sheet)).not.toMatch(/composes:[^;]*\bblur\b/);
    expect(valueOf(sheet, '.sheet', 'z-index')).toBe('var(--z-sheet)');
    expect(valueOf(sheet, '.sheet', 'position')).toBe('relative');
    expect(valueOf(sheet, '.sheet', 'pointer-events')).toBe('auto');
  });

  it('cerrada, el cuerpo MIDE 0 y está oculto con `visibility` (no se ve, no se tabula, no se lee); abierta mide `--sheet-body-h` y desplaza por dentro', () => {
    expect(valueOf(sheet, '.body', 'block-size')).toBe('0');
    expect(valueOf(sheet, '.body', 'visibility')).toBe('hidden');
    expect(valueOf(sheet, ".sheet[data-state='open'] .body", 'block-size')).toBe(
      'var(--sheet-body-h)',
    );
    expect(valueOf(sheet, ".sheet[data-state='open'] .body", 'visibility')).toBe('visible');
    expect(valueOf(sheet, '.body', 'overflow-y')).toBe('auto');
    // Con 0 de alto, un relleno propio ya mediría: el cuerpo no lleva ninguno
    expect(valueOf(sheet, '.body', 'padding')).toBeUndefined();
    expect(valueOf(sheet, '.body', 'padding-block')).toBeUndefined();
  });

  it('el cuerpo no encadena el desplazamiento a la página y la hoja respeta la zona segura de abajo', () => {
    expect(valueOf(sheet, '.body', 'overscroll-behavior')).toBe('contain');
    expect(valueOf(sheet, '.sheet', 'padding-block-end')).toContain('env(safe-area-inset-bottom');
  });

  it('el asa es un botón de 44 px con el área de pulsación sobre TODA la cabecera y sin gesto del navegador encima', () => {
    expect(valueOf(sheet, '.handle', 'min-block-size')).toBe('var(--target-min)');
    expect(valueOf(sheet, '.handle', 'touch-action')).toBe('none');
    expect(valueOf(sheet, '.handle::after', 'position')).toBe('absolute');
    expect(valueOf(sheet, '.handle::after', 'inset')).toBe('0');
    expect(valueOf(sheet, '.head', 'position')).toBe('relative');
    // El botón NO está posicionado (si lo estuviera, el `::after` se estiraría solo sobre el botón)
    expect(valueOf(sheet, '.handle', 'position')).toBeUndefined();
  });

  it('con colores forzados el asa se dibuja con un color del sistema (su fondo se volvería «Canvas» e invisible)', () => {
    expect(valueOf(sheet, '.grip', 'background', 'forced-colors: active')).toBe('ButtonText');
  });

  it('solo se anima el alto del cuerpo y solo con `no-preference` (con movimiento reducido, de golpe)', () => {
    const animated = sheet.filter((r) => r.declarations.some((d) => d.prop === 'transition'));
    expect(animated.length).toBeGreaterThan(0);
    for (const rule of animated) {
      expect(rule.context.join(' '), rule.selector).toContain(NO_PREFERENCE);
    }
    const body = animated.find((r) => r.selector === '.body');
    expect(body?.declarations.find((d) => d.prop === 'transition')?.value).toMatch(/block-size/);
    expect(body?.declarations.find((d) => d.prop === 'transition')?.value).toMatch(/visibility/);
  });

  it('desde 56rem la hoja NO es una caja: sus zonas son celdas de la rejilla del HUD; no hay asa, flecha ni resumen', () => {
    const contents = sheet.find(
      (r) => r.context.join(' ').includes(DESKTOP) && r.selector.includes('.sheet'),
    );
    expect(contents?.selector).toBe('.sheet, .head, .body');
    expect(contents?.declarations.find((d) => d.prop === 'display')?.value).toBe('contents');
    const hidden = sheet.find(
      (r) => r.context.join(' ').includes(DESKTOP) && r.selector.includes('.handle'),
    );
    expect(hidden?.declarations.find((d) => d.prop === 'display')?.value).toBe('none');
    expect(hidden?.selector).toMatch(/\.chevron/);
    expect(hidden?.selector).toMatch(/\.summary/);
    // `visibility: hidden` del cuerpo cerrado SE HEREDA aunque `display: contents` quite la caja: en escritorio hay que anularlo
    // (descubierto en el primer E2E de escritorio: el HUD entero desapareció)
    expect(valueOf(sheet, '.body', 'visibility', DESKTOP)).toBe('visible');
  });

  it('lo que va dentro se aplana SOLO en móvil (en escritorio esas zonas son las tarjetas flotantes)', () => {
    const flatten_ = sheet.filter((r) => r.selector.includes('[data-hud-zone'));
    expect(flatten_.length).toBeGreaterThan(0);
    for (const rule of flatten_) {
      expect(rule.context.join(' '), rule.selector).toContain(MOBILE);
    }
  });

  it('sin JavaScript no hay asa y el cuerpo se muestra entero (es la alternativa completa al mapa)', () => {
    expect(valueOf(sheet, '.handle', 'display', 'scripting: none')).toBe('none');
    expect(valueOf(sheet, '.body', 'block-size', 'scripting: none')).toBe('auto');
    expect(valueOf(sheet, '.body', 'visibility', 'scripting: none')).toBe('visible');
    // y el título no queda a caballo sobre el borde de la caja (su margen negativo lo subía hasta el asa, que ya no existe)
    expect(valueOf(sheet, ".head [data-hud-zone='title']", 'margin', 'scripting: none')).toBe('0');
  });
});

describe('piel de los controles nativos y de los marcadores', () => {
  const stage = flatten(read(HUD_FILES.stage));

  it('el lienzo del mapa tiene un indicador de foco INTERIOR (r2:F3): el anillo global quedaba fuera de su caja y lo recortaban el mapa y la ventana', () => {
    const canvas = '.stage :global(.maplibregl-canvas:focus-visible)';
    expect(valueOf(stage, canvas, 'outline')).toBe('3px solid var(--color-focus)');
    // Separación NEGATIVA: el anillo se dibuja dentro de la caja del lienzo, donde nada lo recorta
    expect(valueOf(stage, canvas, 'outline-offset')).toBe('-3px');
    expect(valueOf(stage, canvas, 'border-radius')).toBe('0');
    // …y un segundo anillo, del color del halo, junto al primero (un `box-shadow` sobre un <canvas> queda DEBAJO de su contenido)
    const halo = '.stage .canvas:has(:global(.maplibregl-canvas:focus-visible))::after';
    expect(valueOf(stage, halo, 'border')).toBe('2px solid var(--color-focus-halo)');
    expect(valueOf(stage, halo, 'pointer-events')).toBe('none');
  });

  it('los avisos del mapa flotan POR ENCIMA del HUD (hay que poder leerlos) y el aviso de estado queda debajo', () => {
    expect(valueOf(stage, '.notices', 'z-index', 'min-width: 56rem')).toBe(
      'calc(var(--z-hud) + 1)',
    );
    expect(Number(valueOf(stage, '.overlay', 'z-index'))).toBeLessThan(10);
  });

  it('los avisos del mapa usan la MISMA columna y el mismo ancho que el buscador y el lenguaje del vidrio (r1:V-09)', () => {
    const wide = 'min-width: 56rem';
    expect(valueOf(stage, '.notices', 'inline-size', wide)).toBe('min(32rem, 100%)');
    expect(valueOf(stage, '.notices', 'inset-inline', wide)).toBe(
      'calc(var(--hud-rail-w, 0px) + var(--hud-gap) * 2) calc(var(--hud-tools-w, var(--target-min)) + var(--hud-gap) * 2)',
    );
    expect(valueOf(stage, '.notices', 'margin-inline', wide)).toBe('auto');
    expect(valueOf(stage, '.notices > div', 'border-radius', wide)).toBe('var(--radius-glass)');
    expect(valueOf(stage, '.notices > div', 'box-shadow', wide)).toBe('var(--shadow-depth-2)');
  });

  it('el estado de carga lleva una barra con un destello FINITO (tres vueltas, < 5 s) solo con movimiento permitido (r1:V-19, WCAG 2.2.2)', () => {
    const animation = valueOf(stage, '.loading::after', 'animation', NO_PREFERENCE) ?? '';
    // duración · función · retraso · repeticiones (el retraso es el de la prueba siguiente)
    expect(animation).toMatch(/^shimmer 1\.4s linear 2s 3$/);
    expect(animation).not.toMatch(/infinite/);
    // 3 × 1,4 s = 4,2 s: por debajo de los 5 s a partir de los cuales una animación necesita pausa
    expect(3 * 1.4).toBeLessThan(5);
    expect(valueOf(stage, '.loading::after', 'animation')).toBeUndefined();
  });

  it('la pantalla de carga no pinta degradados y su relleno ESPERA (≥ 1,5 s) y se mueve con `transform`: con WebGL por software le quitaban el turno al mapa (X4: `ready` 3,6 s → 4,7 s)', () => {
    const delay = (css: string): number => {
      const animation = valueOf(flatten(css), '.loading::after', 'animation', NO_PREFERENCE) ?? '';
      // tiempos de la declaración, en orden: duración y, si lo hay, retraso
      const times = [...animation.matchAll(/(\d+(?:\.\d+)?)s\b/g)].map((m) => Number(m[1]));
      return times[1] ?? 0;
    };
    const css = read(HUD_FILES.stage);
    expect(delay(css)).toBeGreaterThanOrEqual(1.5);
    // control: sin retraso (como estaba) el detector lo ve
    expect(
      delay(
        '@media (prefers-reduced-motion: no-preference) { .loading::after { animation: shimmer 1.4s linear 3; } }',
      ),
    ).toBe(0);

    // Sin degradados: ni en el fondo del aviso (`.overlay`) ni en la pista y el relleno (`.loading`)
    const rules = flatten(css);
    const gradients = (all: ReturnType<typeof flatten>): string[] =>
      all
        .filter((r) => /^\.(overlay|loading)\b/.test(r.selector))
        .flatMap((r) =>
          r.declarations
            .filter((d) => /gradient\(/.test(d.value))
            .map((d) => `${r.selector} { ${d.prop}: ${d.value} }`),
        );
    expect(gradients(rules)).toEqual([]);
    // control: el detector SÍ ve un degradado en esos selectores
    expect(
      gradients(flatten('.overlay { background: radial-gradient(circle, red, blue); }')),
    ).toHaveLength(1);
    expect(
      gradients(flatten('.loading::after { background: linear-gradient(red, blue); }')),
    ).toHaveLength(1);

    // El destello solo mueve `transform` (no repinta nada por cuadro)
    const keyframes = rules.filter((r) => r.selector === '@keyframes shimmer');
    expect(keyframes.length).toBeGreaterThan(0);
    expect([...new Set(keyframes.flatMap((r) => r.declarations.map((d) => d.prop)))]).toEqual([
      'transform',
    ]);
  });

  it('los iconos nativos se invierten SOLO en su span (el botón no, o se invertiría el anillo de foco)', () => {
    expect(valueOf(stage, '.stage :global(.maplibregl-ctrl-icon)', 'filter')).toBe('invert(1)');
    expect(
      stage.filter((r) => r.declarations.some((d) => d.prop === 'filter')).map((r) => r.selector),
    ).toEqual(['.stage :global(.maplibregl-ctrl-icon)', '.stage :global(.maplibregl-ctrl-icon)']);
    expect(valueOf(stage, '.stage :global(.maplibregl-ctrl-icon)', 'filter', 'forced-colors')).toBe(
      'none',
    );
  });

  it('el marcador no depende del rojo ni del color: relleno de acento, aro de tinta y estado seleccionado con forma propia', () => {
    const css = read(HUD_FILES.stage);
    expect(css).not.toMatch(/--color-(cta|brand-red)/);
    expect(valueOf(stage, '.pin', 'background')).toBe('var(--color-accent)');
    expect(valueOf(stage, '.marker:hover .pin, .markerSelected .pin', 'transform')).toMatch(
      /scale/,
    );
    expect(valueOf(stage, '.markerSelected .pin', 'background')).toBe('var(--color-ink)');
  });

  it('los objetivos táctiles de marcadores, grupos y controles son de 44 px (--target-min)', () => {
    expect(valueOf(stage, '.marker', 'inline-size')).toBe('var(--target-min)');
    expect(valueOf(stage, '.marker', 'block-size')).toBe('var(--target-min)');
    expect(valueOf(stage, '.cluster', 'inline-size')).toBe('var(--target-min)');
    expect(valueOf(stage, '.stage :global(.maplibregl-ctrl-group button)', 'inline-size')).toBe(
      'var(--target-min)',
    );
  });
});

describe('sin estilos en línea', () => {
  it("ningún componente del HUD escribe `style=` (la CSP style-src 'self' lo bloquea): clases y atributos data-*", () => {
    const files = [
      'src/app/[locale]/explore/page.tsx',
      'src/components/HudGroup.tsx',
      'src/components/DestinationList.tsx',
      'src/components/DestinationGlyph.tsx',
      'src/components/map/HudCarousel.tsx',
      'src/components/map/HudPanel.tsx',
      'src/components/map/HudSheet.tsx',
      'src/components/map/SelectedDestinationCard.tsx',
      'src/components/map/ShowOnMapButton.tsx',
      'src/components/map/LayerControls.tsx',
      'src/components/map/MapLegend.tsx',
      'src/components/map/MapStage.tsx',
      'src/components/map/FilterChips.tsx',
      'src/components/map/SearchBox.tsx',
      'src/components/map/MapTools.tsx',
      'src/components/map/CarouselFilterStatus.tsx',
      'src/components/map/HudIslandsLazy.tsx',
    ];
    for (const file of files) expect(read(file), file).not.toMatch(/\sstyle=[{"']/);
  });
});

describe('aviso previo de «Relieve en 3D» en pantalla táctil (privacidad)', () => {
  const NOTICE = ".root:has(.threeD:not([aria-pressed='true'], :disabled)) .notice";

  it('sin cursor (hover: none) el aviso se VE sin pasar ni enfocar, y no captura toques: el toque dispara hover, foco y clic en la misma tarea y pediría el relieve a AWS antes de poder leerlo', () => {
    const tools = flatten(read(HUD_FILES.tools));
    expect(valueOf(tools, NOTICE, 'visibility', '(hover: none), (any-pointer: coarse)')).toBe(
      'visible',
    );
    // Sin esa condición el aviso seguiría oculto (solo hover/foco lo muestran): la regla de arriba es la única que lo enseña sin cursor
    expect(valueOf(tools, '.notice', 'visibility')).toBe('hidden');
    expect(valueOf(tools, '.notice', 'pointer-events')).toBe('none');
  });

  it('control: si la regla no está bajo (hover: none), la lectura no la encuentra', () => {
    const mutated = read(HUD_FILES.tools).replace('@media (hover: none)', '@media (hover: hover)');
    expect(mutated).not.toBe(read(HUD_FILES.tools));
    expect(valueOf(flatten(mutated), NOTICE, 'visibility', '(hover: none)')).toBeUndefined();
  });
});

/** Reglas aplanadas de un archivo del HUD (para otras pruebas). */
export type { FlatRule };
