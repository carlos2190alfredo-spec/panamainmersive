import { expect, test } from '@playwright/test';
import { PATHS } from './helpers';
import {
  MAP_DATA_PRESENT,
  MAP_DATA_SKIP_REASON,
  mapCanvas,
  mapState,
  openMap,
  openSheet,
} from './map-helpers';

const EXPLORE = PATHS.explore.es;

test.describe('mapa en móvil', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  test('el mapa ocupa toda la pantalla bajo la cabecera, la hoja cerrada solo asoma y nada desborda en horizontal', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    const map = await mapCanvas(page).boundingBox();
    const sheet = await page.locator('[data-hud-zone="sheet"]').boundingBox();
    const viewport = page.viewportSize();
    expect(map && sheet && viewport).toBeTruthy();
    if (!map || !sheet || !viewport) return;
    // Mapa a sangre: todo el ancho y todo el alto bajo la cabecera de 4 rem (64 px)
    expect(map.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(map.y).toBeCloseTo(64, 0);
    expect(map.y + map.height).toBeGreaterThanOrEqual(viewport.height - 1);
    // La hoja va ENCIMA del mapa (lo solapa por diseño) y cerrada ocupa poco: el mapa manda
    expect(sheet.y).toBeGreaterThan(map.y);
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(map.y + map.height + 1);
    expect(sheet.height).toBeLessThanOrEqual(map.height * 0.25);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    // Un único landmark complementario (el panel de información, DENTRO de la hoja) y un único buscador
    await expect(page.locator('aside')).toHaveCount(1);
    await expect(page.locator('[data-hud-zone="sheet"] aside')).toHaveCount(1);
    await expect(page.locator('[role="search"]')).toHaveCount(1);
  });

  test('sin gestos cooperativos (el mapa ocupa la pantalla y la página no tiene nada que desplazar bajo él): un dedo MUEVE el mapa y no desplaza la página', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    // Antes (mapa en una franja sobre un panel) un dedo desplazaba la página y dos el mapa: ya no
    await expect(page.locator('.maplibregl-cooperative-gestures')).toHaveCount(0);
    await expect(page.locator('.maplibregl-cooperative-gesture-screen')).toHaveCount(0);
    const before = await mapState(page);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const box = await mapCanvas(page).boundingBox();
    if (!box) throw new Error('sin lienzo');
    // Un dedo real (eventos táctiles del navegador), arrastrando hacia arriba y a la izquierda desde el centro del mapa
    const cdp = await page.context().newCDPSession(page);
    const start = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.45 };
    const end = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: start.x + ((end.x - start.x) * i) / 10, y: start.y + ((end.y - start.y) * i) / 10 },
        ],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect
      .poll(async () => (await mapState(page)).center[0], { timeout: 20_000 })
      .not.toBeCloseTo(before.center[0], 3);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test('«Ver en el mapa» se pulsa con el dedo, selecciona y muestra la tarjeta', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    // «Ver en el mapa» vive en el carrusel, DENTRO de la hoja: se abre con su asa (cerrada es inerte)
    await openSheet(page);
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
