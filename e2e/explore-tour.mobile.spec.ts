import { expect, test, type Locator } from '@playwright/test';
import { PATHS } from './helpers';
import {
  MAP_DATA_PRESENT,
  MAP_DATA_SKIP_REASON,
  mapCanvas,
  openMap,
  openSheet,
  routeTerrain,
} from './map-helpers';

/**
 * «Recorrido 3D» en móvil (ADR-0027 A1). El botón vive en la hoja inferior, que abierta tapa más de la mitad del mapa: al
 * pulsarlo la hoja se pliega, el foco pasa al asa (el botón queda inerte) y el ancla del destino cae en el centro de lo que
 * queda VISIBLE del mapa. Medido antes del arreglo: la hoja tarda segundos en encogerse con WebGL por software y el primer paso
 * medía su borde a medio plegar, así que el ancla quedaba bajo el aviso de AWS (y = 165 en 812 px de alto).
 */
const EXPLORE = PATHS.explore.es;
const SETTLE = { timeout: 30_000 } as const;

const box = async (locator: Locator) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error('sin caja');
  return b;
};

test.describe('«Recorrido 3D» en móvil con el mapa dibujado', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  test.setTimeout(150_000);

  test('pliega la hoja, lleva el foco al asa y deja el destino a la vista (ni bajo la hoja ni bajo el aviso de AWS)', async ({
    page,
  }) => {
    await routeTerrain(page, 'ok');
    await openMap(page, `${EXPLORE}?d=boquete`);
    await openSheet(page);
    await page.getByRole('button', { name: 'Recorrido 3D', exact: true }).click();
    const handle = page.locator('[data-sheet-handle]');
    await expect(handle).toHaveAttribute('aria-expanded', 'false', SETTLE);
    await expect(handle).toBeFocused();
    // Tras la aproximación (paso 2 o posterior) el ancla ya está donde la dejó el primer paso.
    await expect
      .poll(() => mapCanvas(page).getAttribute('data-tour-step'), SETTLE)
      .toMatch(/^[2-5]\/5$/);
    const marker = await box(page.locator('button[data-destination="boquete"]'));
    const map = await box(mapCanvas(page));
    const notice = await box(
      page.getByRole('status').filter({ hasText: 'Con una capa de relieve activa' }),
    );
    const sheetHead = await box(handle);
    const center = marker.y + marker.height / 2;
    expect(center, 'el destino queda dentro del mapa').toBeGreaterThan(map.y);
    expect(center, 'el destino queda por encima de la hoja plegada').toBeLessThan(sheetHead.y);
    expect(
      marker.y > notice.y + notice.height || marker.y + marker.height < notice.y,
      'el destino no queda bajo el aviso de AWS',
    ).toBe(true);
  });
});
