import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { TEXT_SPACING_CSS, applyCss, clippedText } from './a11y-probes';
import { LOCALES, PATHS, type Locale } from './helpers';
import { openSheet } from './map-helpers';

/**
 * Accesibilidad de los lugares cercanos sin verificar (ADR-0027 A2) con la lista ABIERTA, en escritorio y en móvil (este archivo
 * corre en los dos proyectos) y en los cinco idiomas: axe WCAG 2.2 AA, reflujo a 320 px y espaciado de texto (1.4.12). No necesita
 * el mapa dibujado (la lista es la alternativa del mapa): se le quita el mapa base para no gastar CPU en WebGL por software.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const placesLabel = (locale: Locale): string => {
  const messages = JSON.parse(
    readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'),
  ) as { Map: { places: { open: string } } };
  return messages.Map.places.open;
};

async function openPlaces(page: Page, locale: Locale): Promise<void> {
  await page.route('**/data/panama-basemap.pmtiles', (route) =>
    route.fulfill({ status: 404, body: 'sin mapa base en esta prueba' }),
  );
  await page.goto(`${PATHS.explore[locale]}?d=boquete`);
  // Por debajo de 56rem (896 px) la ficha vive en la hoja inferior, también en el proyecto de escritorio a 320 px.
  if ((page.viewportSize()?.width ?? 1280) < 896) await openSheet(page);
  await page.getByRole('button', { name: placesLabel(locale), exact: true }).click();
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });
  // La pestaña más larga (alojamiento: el tope de 25)
  await page.getByRole('tab').last().click();
  await expect(page.getByRole('tabpanel').getByRole('listitem').first()).toBeVisible();
}

test.describe('lugares cercanos abiertos: axe WCAG 2.2 AA en los cinco idiomas', () => {
  for (const locale of LOCALES) {
    test(`${locale}: sin violaciones`, async ({ page }) => {
      await openPlaces(page, locale);
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
      // Una sola lista de pestañas, un solo panel y un solo <aside>
      await expect(page.getByRole('tablist')).toHaveCount(1);
      await expect(page.getByRole('tabpanel')).toHaveCount(1);
      await expect(page.getByRole('complementary')).toHaveCount(1);
    });
  }
});

test.describe('lugares cercanos abiertos: reflujo y espaciado de texto', () => {
  for (const locale of LOCALES) {
    test(`${locale}: a 320 px no desborda y con el espaciado exigido nada se recorta`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await openPlaces(page, locale);
      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
      expect(await overflow(), `${locale}: desbordamiento horizontal`).toBeLessThanOrEqual(0);
      await applyCss(page, TEXT_SPACING_CSS);
      expect(await overflow(), `${locale}: desbordamiento con el espaciado`).toBeLessThanOrEqual(0);
      expect(await clippedText(page), `${locale}: texto recortado`).toEqual([]);
    });
  }
});
