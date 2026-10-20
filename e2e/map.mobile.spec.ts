import { expect, test } from '@playwright/test';
import { PATHS } from './helpers';
import { mapCanvas, mapState, openMap } from './map-helpers';

const EXPLORE = PATHS.explore.es;

test.describe('mapa en móvil', () => {
  test('el mapa se apila sobre el panel, ocupa el ancho y no desborda horizontalmente', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    const map = await mapCanvas(page).boundingBox();
    const panel = await page.getByRole('complementary').boundingBox();
    const viewport = page.viewportSize();
    expect(map && panel && viewport).toBeTruthy();
    if (!map || !panel || !viewport) return;
    expect(map.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(map.y + map.height).toBeLessThanOrEqual(panel.y + 1); // mapa arriba, panel debajo
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('gestos cooperativos: un dedo desplaza la página, dos dedos el mapa', async ({ page }) => {
    await openMap(page, EXPLORE);
    await expect(page.locator('.maplibregl-cooperative-gestures')).toHaveCount(1);
  });

  test('«Ver en el mapa» se pulsa con el dedo, selecciona y muestra la tarjeta', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    const before = (await mapState(page)).zoom;
    const button = page.getByRole('button', { name: /^Ver en el mapa: Coiba$/ });
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await button.tap();
    await expect(page).toHaveURL(/[?&]d=coiba/);
    await expect(page.locator('#selected-destination-name')).toHaveText('Coiba');
    await expect
      .poll(async () => (await mapState(page)).zoom, { timeout: 20_000 })
      .toBeGreaterThan(before);
  });

  test('marcadores y grupos tienen un objetivo táctil de al menos 44 px', async ({ page }) => {
    await openMap(page, EXPLORE);
    const sizes = await page
      .locator('button[data-cluster], button[data-destination]')
      .evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect()).map((r) => Math.min(r.width, r.height)),
      );
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(43.9);
  });
});
