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
    expect(decl('.dock', 'grid-column', DESKTOP)).toBe('1 / -1');
    // Desde 80rem: el carril cruza las filas 2 y 3 y el dock deja su columna
    expect(decl('.rail', 'grid-row', WIDE)).toBe('2 / -1');
    expect(decl('.dock', 'grid-column', WIDE)).toBe('2 / -1');
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
  });

  it('las zonas del buscador y de las herramientas existen; la del buscador RESERVA su alto (la isla llega tras hidratar) y las herramientas no ocupan sitio mientras están vacías', () => {
    expect(decl('.search', 'grid-column', DESKTOP)).toBe('2');
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

  it('los avisos del mapa flotan POR ENCIMA del HUD (hay que poder leerlos) y el aviso de estado queda debajo', () => {
    expect(valueOf(stage, '.notices', 'z-index', 'min-width: 56rem')).toBe(
      'calc(var(--z-hud) + 1)',
    );
    expect(Number(valueOf(stage, '.overlay', 'z-index'))).toBeLessThan(10);
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

/** Reglas aplanadas de un archivo del HUD (para otras pruebas). */
export type { FlatRule };
