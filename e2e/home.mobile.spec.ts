import { expect, test } from '@playwright/test';
import { PATHS } from './helpers';

/** Portada en móvil (Pixel 5): la marca va ARRIBA del texto, sin desbordes y con el buscador usable. */
test.describe('portada en móvil', () => {
  test('la marca queda por encima del título y nada desborda', async ({ page }) => {
    await page.goto(PATHS.home.es);
    await page.waitForLoadState('networkidle');
    const [title, mark] = await Promise.all([
      page.locator('main h1').boundingBox(),
      page.locator('main img').boundingBox(),
    ]);
    expect(title && mark && mark.y + mark.height <= title.y + 1).toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('se puede buscar y abrir un resultado con el dedo', async ({ page }) => {
    await page.goto(PATHS.home.es);
    await page.waitForLoadState('networkidle');
    await page.getByRole('searchbox').fill('canal');
    const result = page.locator('[data-search-result="panama-canal"]');
    await expect(result).toBeVisible();
    const box = await result.locator('a').nth(1).boundingBox();
    expect(box && box.height >= 44 && box.width >= 44).toBe(true);
    await result.locator('a').nth(1).tap();
    await expect(page).toHaveURL(new RegExp(`${PATHS.explore.es}\\?d=panama-canal$`));
  });

  test('las nueve tarjetas se leen en una columna y sus enlaces tienen un objetivo ≥ 44 px', async ({
    page,
  }) => {
    await page.goto(PATHS.destinations.es);
    const rects = await page.evaluate(() =>
      [...document.querySelectorAll('li[data-destination]')].map((li) => {
        const link = li.querySelectorAll('a')[1];
        // `min-block-size` y no la altura medida: el revelado al desplazarse escala la tarjeta (0,97) mientras entra.
        return {
          x: Math.round(li.getBoundingClientRect().x),
          min: link ? parseFloat(getComputedStyle(link).minBlockSize) : 0,
        };
      }),
    );
    expect(rects).toHaveLength(9);
    expect(new Set(rects.map((r) => r.x)).size, 'una sola columna').toBe(1);
    for (const r of rects) expect(r.min).toBeGreaterThanOrEqual(44);
  });
});
