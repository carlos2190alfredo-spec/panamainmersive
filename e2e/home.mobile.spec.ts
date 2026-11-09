import { expect, test } from '@playwright/test';
import { PATHS } from './helpers';

/**
 * Portada en móvil (Pixel 5): sin tarjeta de marca (la marca ya está en la cabecera; empujaba la llamada principal fuera del
 * primer pliegue: r1:V-04), con la llamada principal a la vista, el buscador usable y nada que desborde.
 */
test.describe('portada en móvil', () => {
  test('la tarjeta de la marca no ocupa lugar, la llamada principal se ve sin desplazarse y nada desborda', async ({
    page,
  }) => {
    await page.goto(PATHS.home.es);
    await page.waitForLoadState('networkidle');
    // La marca sigue en la cabecera (y es la ÚNICA imagen visible); la del héroe está oculta con CSS
    expect((await page.locator('main img').boundingBox())?.width ?? 0).toBe(0);
    expect((await page.locator('header img').boundingBox())?.width ?? 0).toBeGreaterThan(20);
    const cta = await page.locator('main a[class*="cta"]').first().boundingBox();
    const viewport = page.viewportSize();
    expect(cta && viewport && cta.y + cta.height <= viewport.height - 40).toBe(true);
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
        // Por la misma razón, `offsetLeft` (posición de MAQUETACIÓN) y no `getBoundingClientRect().x`: una tarjeta aún
        // fuera de la pantalla está escalada y su `x` medido se corre ≈ 2 px respecto de las ya reveladas, sin que
        // haya dos columnas.
        return {
          x: (li as HTMLElement).offsetLeft,
          min: link ? parseFloat(getComputedStyle(link).minBlockSize) : 0,
        };
      }),
    );
    expect(rects).toHaveLength(9);
    expect(new Set(rects.map((r) => r.x)).size, 'una sola columna').toBe(1);
    for (const r of rects) expect(r.min).toBeGreaterThanOrEqual(44);
  });
});
