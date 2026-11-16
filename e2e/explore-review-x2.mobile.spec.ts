import { expect, test, type Locator } from '@playwright/test';
import { applyCss } from './a11y-probes';
import { PATHS } from './helpers';
import {
  MAP_DATA_PRESENT,
  MAP_DATA_SKIP_REASON,
  openAreasPanel,
  openMap,
  panelToggle,
  routeTerrain,
} from './map-helpers';
import { isolatedTest } from './isolated-browser';

/**
 * Revisión independiente de 5j, paso X2, en el móvil (Pixel 5, táctil): sin cursor no hay «pasar el ratón», así que lo que se
 * ve SIN hacer nada es lo único que dice qué es cada punto (r1:V-15), y el aviso de privacidad del 3D llega al ENFOCAR el botón
 * (r3:F-01). Las dos necesitan el mapa dibujado: se omiten diciéndolo.
 */
const EXPLORE = PATHS.explore.es;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** ¿Se cruzan dos cajas (aunque sea un píxel)? */
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const boxOf = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('sin caja');
  return box;
};

test.describe('Explorar en móvil: nombres de los destinos y aviso previo del 3D (r1:V-15, r3:F-01; con el mapa)', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  test('al abrir, algún destino muestra su NOMBRE sin tocarlo, dentro de la pantalla y sin tapar la cabecera ni la hoja', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.querySelectorAll('button[data-destination][data-label-visible]').length,
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThanOrEqual(1);
    const labels = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>('button[data-destination][data-label-visible]'),
      ].map((button) => {
        const label = button.querySelector<HTMLElement>(':scope > span:last-child');
        const r = label?.getBoundingClientRect();
        const header = document.querySelector('header')?.getBoundingClientRect();
        const sheet = document.querySelector('[data-hud-zone="sheet"]')?.getBoundingClientRect();
        return {
          key: button.dataset.destination,
          shown: label ? getComputedStyle(label).clipPath === 'none' : false,
          text: label?.textContent?.trim() ?? '',
          left: r?.left ?? 0,
          right: r?.right ?? 0,
          top: r?.top ?? 0,
          bottom: r?.bottom ?? 0,
          width: window.innerWidth,
          headerBottom: header?.bottom ?? 0,
          sheetTop: sheet?.top ?? window.innerHeight,
        };
      }),
    );
    for (const label of labels) {
      expect(label.shown, `${label.key}: la etiqueta se ve`).toBe(true);
      expect(label.text.length, `${label.key}: con texto`).toBeGreaterThan(2);
      expect(label.left, `${label.key} izquierda`).toBeGreaterThanOrEqual(0);
      expect(label.right, `${label.key} derecha`).toBeLessThanOrEqual(label.width);
      expect(label.top, `${label.key} bajo la cabecera`).toBeGreaterThanOrEqual(
        label.headerBottom - 1,
      );
      expect(label.bottom, `${label.key} sobre la hoja`).toBeLessThanOrEqual(label.sheetTop + 1);
    }
  });

  isolatedTest(
    '«Relieve en 3D» sin cursor enseña de entrada que AWS recibirá la IP; el aviso cabe en la pantalla, no tapa el botón y NO se pide nada hasta tocar',
    async ({ page }) => {
      const terrain = await routeTerrain(page, 'ok');
      await openMap(page, EXPLORE);
      const button = page.getByRole('button', { name: 'Relieve en 3D' });
      await expect(button).toBeEnabled();
      await expect(button).toHaveAccessibleDescription(/Amazon Web Services.*dirección IP/);
      const notice = page.locator('[data-tool-notice="threeD"]');
      // Pixel 5: sin cursor (`hover: none`). El toque dispara hover, foco y clic en la misma tarea, así que no hay «antes» en el
      // que enseñar el aviso al pasar o enfocar: se VE desde el principio, sin tocar ni enfocar nada.
      expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
      await expect(notice).toBeVisible();
      await expect(button).not.toBeFocused();
      const box = await notice.boundingBox();
      const size = page.viewportSize();
      if (!box || !size) throw new Error('sin cajas');
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      // no tapa el propio botón
      const target = await button.boundingBox();
      if (!target) throw new Error('sin caja del botón');
      expect(box.y).toBeGreaterThanOrEqual(target.y + target.height - 1);
      await page.waitForTimeout(1200);
      expect(terrain.requests, 'verlo no es pedir: ni un byte a AWS').toEqual([]);
      // Al tocar se pide el relieve, y entonces el aviso previo se retira (lo dice el de estado de `MapStage`)
      await button.tap();
      await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
      await expect(notice).toBeHidden();
      await expect.poll(() => terrain.requests.length, { timeout: 30_000 }).toBeGreaterThan(0);
    },
  );

  // El aviso previo se ve SIEMPRE sin cursor (la única forma de leerlo antes de tocar): no puede tapar otros controles ni avisos.
  test('a 320 px el aviso previo del 3D no llega a los controles de zoom y brújula (a este ancho 17rem los tapaban en 30 de sus 46 px)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openMap(page, EXPLORE);
    const notice = page.locator('[data-tool-notice="threeD"]');
    await expect(notice).toBeVisible();
    const zoom = page.locator('.maplibregl-ctrl-top-right .maplibregl-ctrl-group').first();
    await expect(zoom).toBeVisible();
    expect(overlaps(await boxOf(notice), await boxOf(zoom)), 'el aviso no toca el zoom').toBe(
      false,
    );
    // control: con el ancho de antes SÍ se tocaban a este tamaño (la comprobación puede fallar)
    await applyCss(
      page,
      '[data-tool-notice="threeD"]{inline-size:min(17rem,calc(100vw - 2 * var(--hud-gap))) !important}',
    );
    expect(overlaps(await boxOf(notice), await boxOf(zoom)), 'control: antes se tocaban').toBe(
      true,
    );
  });

  isolatedTest(
    'con «Sombreado» activo (el relieve ya se pide a AWS) el aviso previo del 3D se retira y no tapa el aviso de estado del mapa',
    async ({ page }) => {
      await routeTerrain(page, 'ok');
      await openMap(
        page,
        `${EXPLORE}?l=protectedAreas,boundaries,places,waterways,landcover,hillshade`,
      );
      const status = page.locator('[role="status"]', { hasText: 'Amazon Web Services' });
      await expect(status).toBeVisible();
      const notice = page.locator('[data-tool-notice="threeD"]');
      await expect(notice).toBeHidden();
      // el botón sigue disponible y apagado: pulsarlo no suma ningún tercero
      const button = page.getByRole('button', { name: 'Relieve en 3D' });
      await expect(button).toBeEnabled();
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      // control: si el aviso previo se viera, taparía al de estado (lo que pasaba)
      await applyCss(page, '[data-tool-notice="threeD"]{visibility:visible !important}');
      expect(overlaps(await boxOf(notice), await boxOf(status)), 'control: antes se tapaban').toBe(
        true,
      );
    },
  );

  test('tableta táctil (≥ 56rem, sin cursor): el aviso previo del 3D espera mientras el panel de información está abierto (no lo tapa) y vuelve al plegarlo', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    await openMap(page, EXPLORE);
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
    const notice = page.locator('[data-tool-notice="threeD"]');
    const button = page.getByRole('button', { name: 'Relieve en 3D' });
    await expect(notice).toBeVisible(); // panel plegado: se ve de entrada
    await openAreasPanel(page);
    await expect(notice).toBeHidden();
    // sigue siendo la descripción accesible del botón (solo se aparta de la vista)
    await expect(button).toHaveAccessibleDescription(/Amazon Web Services.*dirección IP/);
    await panelToggle(page).click();
    await expect(panelToggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(notice).toBeVisible();
    // control: con el panel abierto y el aviso a la vista SÍ se tapaban a este tamaño
    await openAreasPanel(page);
    await expect(notice).toBeHidden();
    await applyCss(page, '[data-tool-notice="threeD"]{visibility:visible !important}');
    const panel = page.locator('[data-hud-zone="panel"]');
    expect(overlaps(await boxOf(notice), await boxOf(panel)), 'control: antes se tapaban').toBe(
      true,
    );
  });
});
