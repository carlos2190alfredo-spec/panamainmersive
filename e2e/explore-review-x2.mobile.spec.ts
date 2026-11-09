import { expect, test } from '@playwright/test';
import { PATHS } from './helpers';
import { MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON, openMap, routeTerrain } from './map-helpers';

/**
 * Revisión independiente de 5j, paso X2, en el móvil (Pixel 5, táctil): sin cursor no hay «pasar el ratón», así que lo que se
 * ve SIN hacer nada es lo único que dice qué es cada punto (r1:V-15), y el aviso de privacidad del 3D llega al ENFOCAR el botón
 * (r3:F-01). Las dos necesitan el mapa dibujado: se omiten diciéndolo.
 */
const EXPLORE = PATHS.explore.es;

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

  test('«Relieve en 3D» sin cursor enseña de entrada que AWS recibirá la IP; el aviso cabe en la pantalla, no tapa el botón y NO se pide nada hasta tocar', async ({
    page,
  }) => {
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
  });
});
