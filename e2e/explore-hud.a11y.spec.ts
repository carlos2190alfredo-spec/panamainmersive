import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { TEXT_SPACING_CSS, applyCss, clippedText, hiddenFocus } from './a11y-probes';
import { LOCALES, PATHS } from './helpers';
import { openLayers } from './map-helpers';

/**
 * Accesibilidad del HUD de Explorar COMPLETO (escritorio y móvil: este archivo corre en los dos proyectos): filtro por tipo,
 * buscador, herramientas y recuento del carrusel son islas que llegan tras hidratar, así que las comprobaciones generales
 * de `a11y.a11y.spec.ts` podrían medir la página ANTES de que existan. Aquí se espera a las cuatro, se despliegan «Capas» y
 * «Leyenda», se elige un tipo y se escribe en el buscador (el HUD en su estado más cargado) y se mide eso.
 *
 * No necesitan el mapa dibujado: se le quita el mapa base (404) para no gastar la CPU de WebGL por software; con el mapa
 * listo, axe, el foco no oculto y los marcadores se miden en `map.spec.ts` y `explore-hud.spec.ts`.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function loadedHud(page: Page, path: string): Promise<void> {
  await page.route('**/data/panama-basemap.pmtiles', (route) =>
    route.fulfill({ status: 404, body: 'sin mapa base en esta prueba' }),
  );
  await page.goto(path);
  await expect(page.locator('[data-hud-island]')).toHaveCount(4);
  await expect(page.locator('li[data-destination] button')).toHaveCount(9);
}

/** El HUD en su estado más cargado: capas y leyenda abiertas, un tipo elegido y texto en el buscador. */
async function crowdedHud(page: Page, path: string): Promise<void> {
  await loadedHud(page, path);
  await openLayers(page);
  await page.locator('[data-kind-filter]').nth(4).click(); // «Localidad» (tres destinos)
  await page.getByRole('searchbox').fill('a');
  await expect(page.locator('[data-filter-echo]')).toBeVisible();
}

test.describe('HUD de Explorar completo: axe WCAG 2.2 AA en los cinco idiomas', () => {
  for (const locale of LOCALES) {
    test(`${locale}: sin violaciones con las islas cargadas, capas abiertas, un tipo elegido y texto en el buscador`, async ({
      page,
    }) => {
      await crowdedHud(page, PATHS.explore[locale]);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(
        results.violations.map(
          (v) =>
            `${v.id} [${v.impact ?? '?'}] ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join(' | ')}`,
        ),
        locale,
      ).toEqual([]);
      // Un solo landmark de búsqueda y ninguno repetido sin nombre propio
      await expect(page.getByRole('search')).toHaveCount(1);
      await expect(page.getByRole('complementary')).toHaveCount(1);
    });
  }
});

test.describe('HUD de Explorar completo: reflow, espaciado y objetivos', () => {
  for (const locale of LOCALES) {
    test(`${locale}: a 320 px no desborda y con el espaciado de texto exigido nada se recorta`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await crowdedHud(page, PATHS.explore[locale]);
      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
      expect(
        await overflow(),
        `${locale}: desbordamiento horizontal de la página`,
      ).toBeLessThanOrEqual(0);
      await applyCss(page, TEXT_SPACING_CSS);
      expect(await overflow(), `${locale}: desbordamiento con el espaciado`).toBeLessThanOrEqual(0);
      expect(await clippedText(page), `${locale}: texto recortado`).toEqual([]);
    });
  }

  test('todo control del HUD mide al menos 24×24 px (WCAG 2.5.8) y los de las islas, 44 px (objetivo del proyecto)', async ({
    page,
  }) => {
    await crowdedHud(page, PATHS.explore.de);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      const measure = (selector: string, min: number) => {
        for (const el of document.querySelectorAll(selector)) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue; // plegado o no pintado
          if (r.width < min || r.height < min) {
            out.push(
              `${min}px: ${el.tagName} «${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 28)}» ${String(Math.round(r.width))}×${String(Math.round(r.height))}`,
            );
          }
        }
      };
      measure('[data-hud] a[href], [data-hud] button, [data-hud] summary, [data-hud] input', 24);
      measure('[data-hud-island] button, [data-hud-island] input, [data-hud] summary', 44);
      return out;
    });
    expect(small).toEqual([]);
  });

  for (const locale of ['es', 'de'] as const) {
    test(`${locale}: con Tab, ningún elemento del HUD completo queda ENTERO bajo otro (2.4.11)`, async ({
      page,
    }) => {
      await crowdedHud(page, PATHS.explore[locale]);
      const { checked, hidden } = await hiddenFocus(page, 100);
      expect(checked, 'casi nada se comprobó: la prueba no mediría nada').toBeGreaterThan(30);
      expect(hidden).toEqual([]);
    });
  }
});
