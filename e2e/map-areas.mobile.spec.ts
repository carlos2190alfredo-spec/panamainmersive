import { expect, test } from '@playwright/test';
import { PATHS } from './helpers';
import { MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON, openMap } from './map-helpers';

test.describe('selección de áreas en móvil', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  test('la lista es táctil (≥ 44 px), elegir abre la ficha y nada desborda en horizontal', async ({
    page,
  }) => {
    await openMap(page, `${PATHS.explore.es}?d=coiba`);
    const region = page.getByRole('region', { name: 'Áreas protegidas en esta vista' });
    await expect
      .poll(() => region.getByRole('button').count(), { timeout: 30_000 })
      .toBeGreaterThan(0);
    const first = region.getByRole('button').first();
    await first.scrollIntoViewIfNeeded();
    const box = await first.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await first.click();
    await expect(page.locator('#selected-area-name')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
