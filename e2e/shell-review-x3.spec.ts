import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyCss, hiddenFocus } from './a11y-probes';
import { LOCALES, PATHS, type Locale } from './helpers';

/**
 * Revisión independiente de 5j · X3 (cáscara y páginas): texto agrandado, foco bajo los desplegables, portada en móvil, tablas,
 * pie y acciones, guionado y la 404. Nada de esto necesita el mapa base (no sube el presupuesto de pruebas omitidas).
 *
 * El texto agrandado se simula como lo hizo la revisión: `html { font-size: N % }` con una hoja CONSTRUIDA (la CSP prohíbe
 * `<style>` y `style=""`). Es el caso MÁS duro: sus `rem` valen N % pero las `@media` siguen midiendo en `rem` del navegador, así
 * que solo lo que reacciona al tamaño de letra REAL (consultas de contenedor, `rem` en la maquetación) se adapta.
 */
const MESSAGES = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf8')) as {
      Meta: { notFound: { title: string } };
    },
  ]),
) as Record<Locale, { Meta: { notFound: { title: string } } }>;

/** Tamaño de letra de la raíz: la misma hoja se REEMPLAZA en cada llamada (no se acumulan hojas). */
async function zoom(page: Page, percent: number): Promise<void> {
  await page.evaluate((p) => {
    const w = window as unknown as { __zoom?: CSSStyleSheet };
    if (!w.__zoom) {
      w.__zoom = new CSSStyleSheet();
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, w.__zoom];
    }
    w.__zoom.replaceSync(`html{font-size:${String(p)}%}`);
  }, percent);
  // Leer una medida fuerza la maquetación (y con ella las consultas de contenedor): no hace falta esperar a un cuadro.
  await page.evaluate(() => document.body.offsetHeight);
}

/** Lo que está mal en la cabecera: altura distinta de `--header-height`, algo fuera de ella o encima de otra cosa, desbordamiento. */
async function headerProblems(page: Page, percent: number): Promise<string[]> {
  return page.evaluate((scale) => {
    const header = document.querySelector('header') as HTMLElement;
    const box = header.getBoundingClientRect();
    const expected = (64 * scale) / 100; // --header-height = 4rem y 1rem = 16 px × escala
    const out: string[] = [];
    if (Math.abs(box.height - expected) > 1)
      out.push(`altura ${String(box.height)} ≠ ${String(expected)}`);
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (overflow > 0) out.push(`la página desborda ${String(overflow)} px`);
    const label = (el: Element): string =>
      `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label') ?? ''}]` : ''}`;
    const visible = [...header.querySelectorAll('a, button, summary, span[aria-hidden]')].filter(
      (el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && el.checkVisibility();
      },
    );
    for (const el of visible) {
      const b = el.getBoundingClientRect();
      if (b.left < box.left - 0.5 || b.right > box.right + 0.5)
        out.push(
          `${label(el)} fuera de la cabecera en horizontal (${String(Math.round(b.left))}–${String(Math.round(b.right))})`,
        );
      if (b.top < box.top - 0.5 || b.bottom > box.bottom + 0.5)
        out.push(
          `${label(el)} fuera de la cabecera en vertical (${String(Math.round(b.top))}–${String(Math.round(b.bottom))} de ${String(Math.round(box.height))})`,
        );
    }
    const tops = visible.filter(
      (el) =>
        el.matches('a, button, summary') &&
        !el.closest('a, button, summary')?.parentElement?.closest('a'),
    );
    for (let i = 0; i < tops.length; i++) {
      for (let j = i + 1; j < tops.length; j++) {
        const a = tops[i];
        const c = tops[j];
        if (!a || !c || a.contains(c) || c.contains(a)) continue;
        const ra = a.getBoundingClientRect();
        const rc = c.getBoundingClientRect();
        if (
          Math.min(ra.right, rc.right) - Math.max(ra.left, rc.left) > 1 &&
          Math.min(ra.bottom, rc.bottom) - Math.max(ra.top, rc.top) > 1
        )
          out.push(`${label(a)} se solapa con ${label(c)}`);
      }
    }
    const wordmark = header.querySelector('a span[aria-hidden]');
    if (wordmark && wordmark.checkVisibility()) {
      const style = getComputedStyle(wordmark);
      if (style.whiteSpace !== 'nowrap') out.push(`el rótulo no es nowrap (${style.whiteSpace})`);
      for (const line of wordmark.querySelectorAll('span')) {
        const lines = line.getClientRects().length;
        if (lines !== 1) out.push(`«${line.textContent ?? ''}» ocupa ${String(lines)} líneas`);
      }
    }
    return out;
  }, percent);
}

const wordmarkShown = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const w = document.querySelector('header a span[aria-hidden]');
    return w !== null && w.checkVisibility() && w.getBoundingClientRect().width > 0;
  });

test.describe('cabecera con el texto agrandado (r2:F7, WCAG 1.4.4)', () => {
  test('control: al 100 % el rótulo se ve, en una línea, y la cabecera mide 4rem', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PATHS.home.es);
    expect(await wordmarkShown(page)).toBe(true);
    expect(await headerProblems(page, 100)).toEqual([]);
  });

  for (const locale of ['es', 'de'] as const) {
    for (const percent of [150, 175, 200]) {
      test(`${locale} a 390 px con el texto al ${String(percent)} %: la cabecera mide 4rem, el rótulo se oculta y la portada no desborda`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(PATHS.home[locale]);
        await zoom(page, percent);
        expect(await headerProblems(page, percent)).toEqual([]);
        // No cabe junto a menú y selector: se oculta (queda la marca P) en vez de partirse letra a letra
        expect(await wordmarkShown(page)).toBe(false);
        // El nombre accesible sigue siendo el del enlace (el rótulo es solo su forma visible)
        await expect(page.locator('header a').first()).toHaveAttribute(
          'aria-label',
          /Panamá Immersive/,
        );
        // La marca sigue siendo un objetivo de ≥ 44 px (de ≥ 2,75rem con el texto agrandado)
        const target = await page.locator('header a').first().boundingBox();
        expect(target?.width ?? 0).toBeGreaterThanOrEqual((44 * percent) / 100 - 1);
      });
    }
  }

  test('barrido: del móvil al escritorio, de 100 a 200 %: nada sale de la cabecera ni se solapa y el rótulo nunca se parte', async ({
    page,
  }) => {
    test.setTimeout(120_000); // 40 combinaciones de ancho × tamaño de letra sobre una misma carga
    await page.goto(PATHS.home.de);
    const failures: string[] = [];
    let checked = 0;
    for (const width of [360, 390, 480, 600, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const percent of [100, 125, 150, 175, 200]) {
        await zoom(page, percent);
        checked += 1;
        for (const problem of await headerProblems(page, percent)) {
          failures.push(`${String(width)} px × ${String(percent)} %: ${problem}`);
        }
      }
    }
    expect(checked).toBe(40);
    expect(failures).toEqual([]);
  });

  test('la consulta es de CONTENEDOR: a 768 px y 200 % el selector de idioma ya es solo un globo y no sale la llamada (con @media seguirían a 768 px)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(PATHS.home.es);
    const widths = async () =>
      page.evaluate(() => ({
        summary: document.querySelector('header summary')?.getBoundingClientRect().width ?? 0,
        cta: document.querySelector('header [class*="cta"]')?.getBoundingClientRect().width ?? 0,
      }));
    const normal = await widths();
    expect(
      normal.summary,
      'control: al 100 % el selector muestra el nombre del idioma',
    ).toBeGreaterThan(100);
    expect(normal.cta, 'control: al 100 % se ve «Abrir el mapa»').toBeGreaterThan(100);
    await zoom(page, 200);
    const big = await widths();
    expect(big.summary).toBeLessThan(100); // 2,75rem × 2 = 88 px: solo el globo
    expect(big.cta).toBe(0);
    expect(await headerProblems(page, 200)).toEqual([]);
  });

  for (const [name, path] of [
    ['inicio (es)', PATHS.home.es],
    ['inicio (de)', PATHS.home.de],
    ['destinos', PATHS.destinations.es],
    ['ficha (de)', PATHS.destination.de],
    ['fuentes (es)', PATHS.sources.es],
    ['fuentes (de)', PATHS.sources.de],
    ['accesibilidad', PATHS.accessibility.es],
    ['404', PATHS.notFound.de],
  ] as const) {
    test(`${name} a 390 px con el texto al 200 %: sin desplazamiento horizontal y el contenido empieza bajo la cabecera`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await zoom(page, 200);
      const result = await page.evaluate(() => {
        const header = (document.querySelector('header') as HTMLElement).getBoundingClientRect();
        const h1 = (document.querySelector('main h1') as HTMLElement).getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          h1Top: h1.top,
          headerBottom: header.bottom,
        };
      });
      expect(result.overflow).toBeLessThanOrEqual(0);
      expect(result.h1Top).toBeGreaterThanOrEqual(result.headerBottom - 1);
      expect(await headerProblems(page, 200)).toEqual([]);
    });
  }
});

test.describe('menú y selector de idioma abiertos: el foco no queda tapado (r2:F2, WCAG 2.4.11)', () => {
  /** ¿Lo enfocado se ve (el punto central es suyo o de un descendiente) o lo tapa otra cosa? */
  const focusCovered = (page: Page): Promise<string | null> =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return top && (el.contains(top) || top.contains(el))
        ? null
        : `${el.tagName} «${(el.textContent ?? '').trim().slice(0, 20)}» tapado por ${top?.tagName ?? '?'}.${String(top?.className ?? '').slice(0, 24)}`;
    });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // La ficha empieza con «Volver a destinos» justo bajo la cabecera: es lo que primero recibe el foco al salir
    await page.goto(PATHS.destination.es);
    await page.waitForLoadState('networkidle');
  });

  /** Lo que hacía antes: nadie cerraba el desplegable al perder el foco (se simula impidiendo que el aviso llegue). */
  const disableFocusOutClosing = (page: Page): Promise<void> =>
    page.evaluate(() => {
      window.addEventListener('focusout', (e) => e.stopImmediatePropagation(), true);
    });

  const menuOpen = (page: Page): Promise<boolean> =>
    page.locator('#site-menu').evaluate((n) => n.matches(':popover-open'));

  test('menú: al salir con Tab hacia lo que hay debajo se cierra y lo enfocado se ve', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /men/i }).focus();
    await page.keyboard.press('Enter');
    expect(await menuOpen(page)).toBe(true);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab'); // los tres enlaces: el menú sigue abierto
      expect(await menuOpen(page)).toBe(true);
    }
    await page.keyboard.press('Tab'); // selector de idioma (fuera del menú, visible en la cabecera)
    expect(await menuOpen(page)).toBe(false);
    await page.keyboard.press('Tab'); // «Volver a destinos»
    await expect(
      page.getByRole('link', { name: /destinos/i }).filter({ hasText: /volver/i }),
    ).toBeFocused();
    expect(await focusCovered(page)).toBeNull();
  });

  test('control: sin el cierre al perder el foco, «Volver a destinos» quedaba ENTERO bajo el menú (y la comprobación lo ve)', async ({
    page,
  }) => {
    await disableFocusOutClosing(page);
    await page.getByRole('button', { name: /men/i }).focus();
    await page.keyboard.press('Enter');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
    expect(await menuOpen(page)).toBe(true);
    expect(await focusCovered(page)).not.toBeNull();
  });

  test('menú: Tab entre sus enlaces y Mayús+Tab hasta su botón lo dejan abierto; Escape lo cierra y devuelve el foco al botón', async ({
    page,
  }) => {
    const button = page.getByRole('button', { name: /men/i });
    await button.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(button).toBeFocused();
    expect(await menuOpen(page)).toBe(true);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    expect(await menuOpen(page)).toBe(false);
    await expect(button).toBeFocused();
  });

  /**
   * La cabecera es del diseño `[locale]` y NO se vuelve a montar al navegar dentro de un idioma. La API Popover solo cierra con
   * Escape, un clic fuera, otro popover o `hidePopover()`: sin esto el menú seguía abierto sobre la página nueva (en Explorar,
   * tapando el carril y las herramientas del mapa) hasta tocar fuera. Una carga COMPLETA también deja el menú cerrado, así que
   * cada prueba marca la cabecera y comprueba que la marca sobrevive: es lo que dice que la navegación fue del cliente.
   */
  const markHeader = (page: Page): Promise<void> =>
    page.evaluate(() => {
      document.querySelector('header')?.setAttribute('data-persisted', 'yes');
    });
  const headerPersisted = (page: Page): Promise<boolean> =>
    page.evaluate(() => document.querySelector('header')?.getAttribute('data-persisted') === 'yes');

  test('menú: activar uno de sus enlaces lo cierra (navegación del cliente: la cabecera no se recrea)', async ({
    page,
  }) => {
    await markHeader(page);
    await page.getByRole('button', { name: /men/i }).click();
    expect(await menuOpen(page), 'control: el menú está abierto antes de pulsar').toBe(true);
    await page.locator('#site-menu').getByRole('link', { name: 'Fuentes' }).click();
    await expect(page).toHaveURL(new RegExp(`${PATHS.sources.es}$`));
    expect(await headerPersisted(page), 'la navegación fue del cliente').toBe(true);
    await expect.poll(() => menuOpen(page)).toBe(false);
  });

  test('menú: «Atrás» del navegador con el menú abierto también lo cierra', async ({ page }) => {
    await markHeader(page);
    const button = page.getByRole('button', { name: /men/i });
    await button.click();
    await page.locator('#site-menu').getByRole('link', { name: 'Fuentes' }).click();
    await expect(page).toHaveURL(new RegExp(`${PATHS.sources.es}$`));
    await button.click();
    expect(await menuOpen(page), 'control: el menú está abierto antes de volver').toBe(true);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${PATHS.destination.es}$`));
    expect(await headerPersisted(page), 'la navegación fue del cliente').toBe(true);
    await expect.poll(() => menuOpen(page)).toBe(false);
  });

  test('selector de idioma: al salir con Tab de la última opción se cierra y lo enfocado se ve', async ({
    page,
  }) => {
    const summary = page.locator('summary').first();
    await summary.focus();
    await page.keyboard.press('Enter');
    const details = page.locator('details').first();
    expect(await details.evaluate((d: HTMLDetailsElement) => d.open)).toBe(true);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab'); // las cinco lenguas: sigue abierto
      expect(await details.evaluate((d: HTMLDetailsElement) => d.open)).toBe(true);
    }
    await page.keyboard.press('Tab'); // «Volver a destinos»
    expect(await details.evaluate((d: HTMLDetailsElement) => d.open)).toBe(false);
    expect(await focusCovered(page)).toBeNull();
  });

  /**
   * Un botón de PRUEBA justo después del selector de idioma y DEBAJO de su lista (a la derecha, bajo la cabecera): es lo que
   * recibe el foco tras la última opción, como «Acercar» de Explorar en la revisión. La CSP prohíbe `style=""`: se coloca con
   * una hoja construida.
   */
  const addProbeBelowList = async (page: Page): Promise<void> => {
    await applyCss(
      page,
      '#x3-probe{position:fixed;inset-block-start:110px;inset-inline-end:24px;inline-size:60px;block-size:44px}',
    );
    await page.evaluate(() => {
      const probe = document.createElement('button');
      probe.id = 'x3-probe';
      probe.type = 'button';
      probe.textContent = 'probe';
      document.querySelector('header')?.after(probe);
    });
  };

  test('selector de idioma: al salir con Tab, lo que hay bajo su lista (a la derecha, como los controles de Explorar) recibe el foco VISIBLE', async ({
    page,
  }) => {
    await addProbeBelowList(page);
    await page.locator('summary').first().focus();
    await page.keyboard.press('Enter');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator('#x3-probe')).toBeFocused();
    expect(
      await page
        .locator('details')
        .first()
        .evaluate((d: HTMLDetailsElement) => d.open),
    ).toBe(false);
    expect(await focusCovered(page)).toBeNull();
  });

  test('control: sin el cierre al perder el foco, la lista de idiomas tapaba ese botón (y la comprobación lo ve)', async ({
    page,
  }) => {
    await disableFocusOutClosing(page);
    await addProbeBelowList(page);
    await page.locator('summary').first().focus();
    await page.keyboard.press('Enter');
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    await expect(page.locator('#x3-probe')).toBeFocused();
    expect(
      await page
        .locator('details')
        .first()
        .evaluate((d: HTMLDetailsElement) => d.open),
    ).toBe(true);
    expect(await focusCovered(page)).not.toBeNull();
  });

  test('selector de idioma: Escape lo cierra y devuelve el foco a su resumen, y sigue siendo el PRIMER <summary> del DOM', async ({
    page,
  }) => {
    const summary = page.locator('summary').first();
    await summary.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    expect(
      await page
        .locator('details')
        .first()
        .evaluate((d: HTMLDetailsElement) => d.open),
    ).toBe(false);
    await expect(summary).toBeFocused();
    expect(
      await page.evaluate(() => document.querySelector('summary')?.closest('header') !== null),
    ).toBe(true);
    await expect(page.locator('summary')).toHaveCount(1);
  });

  test('recorrido completo con el menú abierto: ningún elemento enfocado queda entero tapado (sonda de la suite)', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /men/i }).focus();
    await page.keyboard.press('Enter');
    const { checked, hidden } = await hiddenFocus(page, 14);
    expect(checked).toBeGreaterThan(8);
    expect(hidden).toEqual([]);
  });
});

test.describe('portada en teléfono: la llamada principal sobre el pliegue y el buscador legible (r1:V-04, r1:V-10)', () => {
  for (const [width, height] of [
    [390, 844],
    [320, 640],
  ] as const) {
    for (const locale of LOCALES) {
      test(`${locale} a ${String(width)}×${String(height)}: «Abrir el mapa» entra holgada en el primer pliegue, el texto de ayuda cabe y nada desborda`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await page.goto(PATHS.home[locale]);
        await page.evaluate(() => document.fonts.ready); // con las tipografías ya cargadas (las de reserva miden otra cosa)
        const m = await page.evaluate(() => {
          const cta = document.querySelector('main a[class*="cta"]') as HTMLElement;
          const input = document.querySelector('input[type="search"]') as HTMLInputElement;
          const style = getComputedStyle(input);
          const canvas = document
            .createElement('canvas')
            .getContext('2d') as CanvasRenderingContext2D;
          canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const textWidth = canvas.measureText(input.placeholder).width;
          const room =
            input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          return {
            ctaBottom: cta.getBoundingClientRect().bottom,
            textWidth,
            room,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });
        // ≥ 40 px de holgura bajo la llamada (en la revisión quedaba a 817–861 px de 844: cortada por el borde)
        expect(
          m.ctaBottom,
          'la llamada principal debe verse ENTERA y con holgura sobre el pliegue',
        ).toBeLessThanOrEqual(height - 40);
        expect(m.textWidth, 'el texto de ayuda se recortaba a media palabra').toBeLessThan(m.room);
        expect(m.overflow).toBeLessThanOrEqual(0);
      });
    }
  }

  test('el istmo va DEBAJO del texto en teléfono y tablet (la llamada principal primero) y es la segunda columna desde 1024 px (ADR-0026)', async ({
    page,
  }) => {
    const layout = async (width: number, height: number) => {
      await page.setViewportSize({ width, height });
      await page.goto(PATHS.home.es);
      return page.evaluate(() => {
        const fig = (document.querySelector('main figure') as HTMLElement).getBoundingClientRect();
        const h1 = (document.querySelector('main h1') as HTMLElement).getBoundingClientRect();
        const cta = (
          document.querySelector('main a[class*="cta"]') as HTMLElement
        ).getBoundingClientRect();
        const input = (
          document.querySelector('input[type="search"]') as HTMLElement
        ).getBoundingClientRect();
        return {
          figTop: fig.top,
          figLeft: fig.left,
          figWidth: fig.width,
          ctaBottom: cta.bottom,
          h1Right: h1.right,
          inputWidth: input.width,
          viewport: window.innerHeight,
        };
      });
    };
    const phone = await layout(390, 844);
    expect(phone.ctaBottom, 'la llamada principal se ve sin desplazarse').toBeLessThanOrEqual(
      phone.viewport,
    );
    expect(phone.figTop, 'el istmo va después del texto').toBeGreaterThan(phone.ctaBottom);
    expect(phone.figWidth).toBeGreaterThan(300);
    const tablet = await layout(768, 1024);
    expect(tablet.figTop).toBeGreaterThan(tablet.ctaBottom);
    expect(
      tablet.inputWidth,
      'el formulario no queda apretado en una columna estrecha',
    ).toBeGreaterThan(400);
    const desktop = await layout(1024, 768);
    expect(desktop.figLeft, 'desde 1024 px el istmo es la segunda columna').toBeGreaterThan(
      desktop.h1Right - 1,
    );
  });

  test('el texto del héroe va sobre UNA superficie sólida sin desenfoque, y el crédito del istmo también (r1:V-11)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PATHS.home.es);
    const style = await page.evaluate(() => {
      const alpha = (c: string): number => {
        const m = /rgba?\(([^)]+)\)/.exec(c);
        const parts = (m?.[1] ?? '').split(/[ ,/]+/).filter(Boolean);
        return parts.length > 3 ? Number(parts[3]) : 1;
      };
      const copy = getComputedStyle(
        (document.querySelector('main h1') as HTMLElement).parentElement as HTMLElement,
      );
      const credit = getComputedStyle(document.querySelector('main figcaption') as HTMLElement);
      return {
        backdrop: copy.backdropFilter,
        copyAlpha: alpha(copy.backgroundColor),
        creditAlpha: alpha(credit.backgroundColor),
      };
    });
    expect(style.backdrop).toBe('none');
    expect(style.copyAlpha).toBe(1);
    expect(style.creditAlpha).toBe(1);
  });
});

test.describe('tablas de datos: avisan de que se desplazan y no se guionizan (r1:V-14, r1:V-03, r2:F1)', () => {
  const region = (page: Page) => page.locator('[role="region"][tabindex="0"]').first();
  const edges = (page: Page) =>
    region(page)
      .locator('..')
      .evaluate((root) => ({
        start: root.hasAttribute('data-more-start'),
        end: root.hasAttribute('data-more-end'),
      }));

  test('ficha en teléfono: queda contenido por el final y lo dice; al llegar al extremo avisa por el principio', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PATHS.destination.de);
    await expect(region(page).locator('..')).toHaveAttribute('data-ready', '');
    expect(await edges(page)).toEqual({ start: false, end: true });
    const sizes = await region(page).evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(sizes.scroll, 'la tabla no cabe: de ahí el aviso').toBeGreaterThan(sizes.client);
    await region(page).evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect.poll(() => edges(page)).toEqual({ start: true, end: false });
    // la sombra se PINTA (no es solo un atributo): el pseudo-elemento deja de estar oculto
    const shade = await region(page)
      .locator('..')
      .evaluate((root) => getComputedStyle(root, '::before').display);
    expect(shade).toBe('block');
  });

  test('control: en pantalla ancha la tabla cabe y no hay aviso', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PATHS.destination.de);
    await expect(region(page).locator('..')).toHaveAttribute('data-ready', '');
    expect(await edges(page)).toEqual({ start: false, end: false });
    const after = await region(page)
      .locator('..')
      .evaluate((root) => getComputedStyle(root, '::after').display);
    expect(after).toBe('none');
  });

  test('fuentes en francés a 320 px: columnas de texto con ancho propio, sin guionado en las celdas, y avisa por el final', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(PATHS.sources.fr);
    const cells = await page.evaluate(() => {
      const use = document.querySelector('tbody tr td:nth-child(2)') as HTMLElement;
      const all = [...document.querySelectorAll('tbody td, tbody th, thead th')] as HTMLElement[];
      return {
        useWidth: use.getBoundingClientRect().width,
        hyphens: [...new Set(all.map((c) => getComputedStyle(c).hyphens))],
      };
    });
    expect(cells.hyphens).toEqual(['manual']);
    expect(
      cells.useWidth,
      'la columna «Usage» medía ≈ 90 px y se leía en tiras',
    ).toBeGreaterThanOrEqual(13 * 16 - 1);
    expect(await edges(page)).toEqual({ start: false, end: true });
  });

  for (const locale of ['es', 'de'] as const) {
    for (const [name, path] of [
      ['fuentes', PATHS.sources[locale]],
      ['ficha', PATHS.destination[locale]],
    ] as const) {
      test(`${locale} ${name}: axe «landmark-unique» limpio (la región de la tabla y su sección ya no se llaman igual)`, async ({
        page,
      }) => {
        await page.goto(path);
        const results = await new AxeBuilder({ page }).withRules(['landmark-unique']).analyze();
        expect(results.violations.map((v) => v.id)).toEqual([]);
        // control: dos hitos con el mismo nombre SÍ los ve la regla
        await page.evaluate(() => {
          const h2 = document.querySelector('h2[id]') as HTMLElement;
          for (let i = 0; i < 2; i++) {
            const dup = document.createElement('section');
            dup.setAttribute('aria-labelledby', h2.id);
            dup.textContent = 'duplicado';
            document.querySelector('main')?.append(dup);
          }
        });
        const control = await new AxeBuilder({ page }).withRules(['landmark-unique']).analyze();
        expect(control.violations.map((v) => v.id)).toEqual(['landmark-unique']);
      });
    }
  }
});

test.describe('guionado: titulares, nombres y celdas no se parten; los párrafos largos sí, solo en palabras largas (r1:V-03)', () => {
  test('computado: h1 y h2 manual, celdas manual, párrafos de lectura auto con límite de letras, rótulos de marca sin guion', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(PATHS.sources.es);
    const sources = await page.evaluate(() => {
      const hy = (sel: string): string =>
        getComputedStyle(document.querySelector(sel) as Element).hyphens;
      const limit = getComputedStyle(document.querySelector('p.lead') as Element).getPropertyValue(
        'hyphenate-limit-chars',
      );
      return {
        h1: hy('main h1'),
        h2: hy('main h2'),
        td: hy('tbody td'),
        th: hy('thead th'),
        lead: hy('p.lead'),
        limit,
        header: hy('header'),
      };
    });
    expect(sources).toMatchObject({
      h1: 'manual',
      h2: 'manual',
      td: 'manual',
      th: 'manual',
      lead: 'auto',
      header: 'manual',
    });
    expect(sources.limit.trim()).toBe('10 4 4');
    await page.goto(PATHS.home.de);
    const home = await page.evaluate(() => ({
      h1: getComputedStyle(document.querySelector('main h1') as Element).hyphens,
      lead: getComputedStyle(document.querySelector('main p.lead') as Element).hyphens,
      principle: getComputedStyle(document.querySelector('main li p') as Element).hyphens,
    }));
    // el titular del héroe no se guioniza; los párrafos de las secciones de lectura sí
    expect(home).toEqual({ h1: 'manual', lead: 'manual', principle: 'auto' });
  });

  test('control: con «hyphens: auto» en el cuerpo (lo de antes) las celdas SÍ se guionizarían: la prueba lo detecta', async ({
    page,
  }) => {
    await page.goto(PATHS.sources.es);
    await applyCss(page, 'body{hyphens:auto}');
    const h1 = await page.evaluate(
      () => getComputedStyle(document.querySelector('main h1') as Element).hyphens,
    );
    expect(h1, 'el titular tiene su propia regla: no hereda').toBe('manual');
    const section = await page.evaluate(
      () => getComputedStyle(document.querySelector('header') as Element).hyphens,
    );
    expect(section, 'lo que hereda del cuerpo sí cambia: la regla SE aplica').toBe('auto');
  });
});

test.describe('pie al fondo, acciones con aire y 404 con título (r1:V-01, r1:V-02, r1:V-12, r0:F-10)', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`404 a ${String(width)}×${String(height)}: el pie termina en el borde inferior (sin banda vacía) y los botones tienen separación`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const response = await page.goto(PATHS.notFound.es);
      expect(response?.status()).toBe(404);
      // El HTML de la 404 llega SIN cabecera ni pie (se pintan en el cliente: observado también antes de X3): se espera al pie
      await page.locator('footer').waitFor();
      await expect(page.locator('main a')).toHaveCount(2);
      const m = await page.evaluate(() => {
        const footer = (document.querySelector('footer') as HTMLElement).getBoundingClientRect();
        const buttons = [...document.querySelectorAll('main a')].map((a) =>
          a.getBoundingClientRect(),
        );
        return {
          footerBottom: footer.bottom,
          innerHeight,
          scrollHeight: document.documentElement.scrollHeight,
          gap: buttons.length > 1 ? (buttons[1]?.left ?? 0) - (buttons[0]?.right ?? 0) : -1,
          verticalGap: buttons.length > 1 ? (buttons[1]?.top ?? 0) - (buttons[0]?.bottom ?? 0) : -1,
        };
      });
      expect(
        Math.abs(m.footerBottom - m.innerHeight),
        'el pie no se pega al fondo',
      ).toBeLessThanOrEqual(1);
      expect(m.scrollHeight).toBeLessThanOrEqual(m.innerHeight + 1);
      // los dos botones: en fila con ≥ 8 px entre ellos, o en dos filas con ≥ 8 px entre ellas (antes: 4 px)
      expect(Math.max(m.gap, m.verticalGap)).toBeGreaterThanOrEqual(8);
    });
  }

  test('control: en una página larga el pie sigue DESPUÉS del contenido (no se superpone ni sube)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PATHS.destination.es);
    const m = await page.evaluate(() => ({
      footerTop:
        (document.querySelector('footer') as HTMLElement).getBoundingClientRect().top + scrollY,
      mainBottom:
        (document.querySelector('main') as HTMLElement).getBoundingClientRect().bottom + scrollY,
    }));
    expect(m.footerTop).toBeGreaterThanOrEqual(m.mainBottom - 1);
  });

  for (const locale of LOCALES) {
    test(`${locale}: la 404 tiene su propio título («${MESSAGES[locale].Meta.notFound.title}»)`, async ({
      page,
    }) => {
      await page.goto(PATHS.notFound[locale]);
      const expected = new RegExp(`^${MESSAGES[locale].Meta.notFound.title}`);
      await expect(page).toHaveTitle(expected);
      // Tras HIDRATAR el enrutador del cliente recalculaba la cabecera desde la ruta y volvía a poner el título del sitio:
      // la pestaña decía «Página no encontrada» un segundo y luego solo «Panamá Immersive». Se espera a la hidratación (React
      // marca los nodos con `__reactFiber$…`) y se comprueba que el título SE MANTIENE.
      await page.waitForFunction(() => {
        const summary = document.querySelector('summary');
        return summary !== null && Object.keys(summary).some((k) => k.startsWith('__reactFiber'));
      });
      for (let i = 0; i < 6; i++) {
        expect(await page.title(), `muestra ${String(i)}`).toMatch(expected);
        await page.waitForTimeout(250);
      }
    });
  }

  test('la ficha deja aire entre la tabla y «Ver en el mapa» (antes 0 px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PATHS.destination.es);
    const gap = await page.evaluate(() => {
      const table = (
        document.querySelector('[role="region"] table') as HTMLElement
      ).getBoundingClientRect();
      const link = [...document.querySelectorAll('main a')].at(-1) as HTMLElement;
      return link.getBoundingClientRect().top - table.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(24);
  });

  test('la silueta del país del pie va sobre una placa de Arena, en claro y en oscuro', async ({
    page,
  }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(PATHS.home.es);
      const plate = await page.locator('footer img').evaluate((img) => {
        const s = getComputedStyle(img);
        return { bg: s.backgroundColor, radius: s.borderRadius };
      });
      expect(plate.bg, scheme).toBe('rgb(244, 231, 211)'); // --color-brand-sand
      expect(parseFloat(plate.radius), scheme).toBeGreaterThan(4);
    }
  });
});

test.describe('buscador de la portada sin JavaScript (r0:F-09)', () => {
  for (const locale of LOCALES) {
    test(`sin JavaScript (${locale}): el formulario no se muestra (un campo que no busca engaña) y no lleva ningún campo con nombre`, async ({
      browser,
      baseURL,
    }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        ...(baseURL ? { baseURL } : {}),
      });
      try {
        const page = await context.newPage();
        await page.goto(PATHS.home[locale]);
        const form = page.locator('form[role="search"]');
        await expect(form).toHaveAttribute('method', 'get');
        await expect(form).toHaveAttribute('action', PATHS.explore[locale]);
        await expect(form).toBeHidden();
        // si algún navegador lo mostrara y lo enviara, no viajaría nada en la URL
        await expect(form.locator('input[name]')).toHaveCount(0);
        // lo que sí hay: los dos botones del héroe y las nueve tarjetas, como enlaces reales
        await expect(page.locator(`main a[href="${PATHS.explore[locale]}"]`).first()).toBeVisible();
        await expect(page.locator('main li[data-destination]')).toHaveCount(9);
      } finally {
        await context.close();
      }
    });
  }

  test('con JavaScript el formulario se ve, y al pulsar «Buscar» no escribe la consulta en la URL', async ({
    page,
  }) => {
    await page.goto(PATHS.home.es);
    await page.waitForLoadState('networkidle');
    const form = page.getByRole('search');
    await expect(form).toBeVisible();
    await form.getByRole('searchbox').fill('zzzz sin resultados');
    await form.getByRole('button').click();
    expect(new URL(page.url()).search).toBe('');
  });
});
