import { expect, test, type Page } from '@playwright/test';
import { PATHS, watchPage } from './helpers';
import {
  MAP_DATA_PRESENT,
  MAP_DATA_SKIP_REASON,
  TERRAIN_HOST,
  mapCanvas,
  openMap,
  routeTerrain,
} from './map-helpers';
import { isolatedTest } from './isolated-browser';

/**
 * «Recorrido 3D» de la ficha del destino (ADR-0027 A1): un vuelo de cámara alrededor del ancla sobre el relieve. Lo ejecuta el
 * lienzo, que deja su diagnóstico en el contenedor del mapa: `data-tour` (`running`, `done`, `stopped`, `interrupted`) y
 * `data-tour-step` («paso/total»: 5 pasos animado, 4 cortes con movimiento reducido). Se mira ese diagnóstico y no
 * `data-zoom`/`data-pitch`, que se escriben en `idle` y con WebGL por software llegan tarde (ver `PITCH_SETTLE_MS`).
 *
 * El relieve se sirve con el fixture plano (`routeTerrain`): ni un byte a AWS en las pruebas. Todas necesitan el mapa base.
 */
const EXPLORE = PATHS.explore.es;
const tourButton = (page: Page, name: 'Recorrido 3D' | 'Detener el recorrido' = 'Recorrido 3D') =>
  page.getByRole('button', { name, exact: true });
const tourState = (page: Page) => mapCanvas(page).getAttribute('data-tour');
/**
 * Plazo de las esperas sobre el diagnóstico del recorrido. Con WebGL por software y la máquina cargada el hilo principal pasa
 * segundos dibujando: estas cuatro pruebas, solas, pasaron con el plazo por defecto (5 s); dentro de la regresión de Explorar, con la máquina
 * a carga 40–60 por otras tareas, dos lo superaron (empezar y detener).
 */
const SETTLE = { timeout: 20_000 } as const;
const tourStep = (page: Page) => mapCanvas(page).getAttribute('data-tour-step');

test.describe('«Recorrido 3D» con el mapa dibujado', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  // Un vuelo con relieve y WebGL por software: la carga del mapa más el primer paso superan el plazo de 30 s por defecto.
  test.setTimeout(120_000);

  isolatedTest(
    'es OPT-IN y vuela: sin pulsar, nada a AWS; al pulsar escribe el relieve en `l`, avanza de paso y «Detener» lo para',
    async ({ page }) => {
      const watch = watchPage(page);
      const terrain = await routeTerrain(page, 'ok');
      await openMap(page, `${EXPLORE}?d=boquete`);
      await expect(tourButton(page)).toBeEnabled();
      // El aviso previo se ve ANTES de pulsar y describe al botón
      const notice = page.locator('[data-tour-notice]');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('Amazon Web Services');
      await expect(tourButton(page)).toHaveAccessibleDescription(/Amazon Web Services/);
      await page.waitForTimeout(1500);
      expect(terrain.requests, 'antes de pulsar: ni un byte a AWS').toEqual([]);
      expect(await tourState(page)).toBeNull();

      await tourButton(page).click();
      await expect(page).toHaveURL(/[?&]l=[^&]*hillshade,terrain3d(&|$)/);
      await expect(page).toHaveURL(/[?&]d=boquete(&|$)/); // el destino se conserva
      await expect.poll(() => terrain.requests.length, { timeout: 20_000 }).toBeGreaterThan(0);
      for (const url of terrain.requests) {
        expect(url).toMatch(new RegExp(`^https://${TERRAIN_HOST}/terrarium/\\d+/\\d+/\\d+\\.png$`));
      }
      await expect.poll(() => tourState(page), SETTLE).toBe('running');
      // El botón pasa a detenerlo y el aviso previo se retira (el relieve ya está en uso: lo dice el aviso de estado del mapa)
      await expect(tourButton(page, 'Detener el recorrido')).toBeVisible(SETTLE);
      await expect(notice).toHaveCount(0);
      // Avanza: tras la aproximación (3,5 s) empieza el primer cuarto de vuelta. Cinco pasos: es el guion animado.
      await expect.poll(() => tourStep(page), { timeout: 30_000 }).toMatch(/^[2-5]\/5$/);

      await tourButton(page, 'Detener el recorrido').click();
      await expect.poll(() => tourState(page), SETTLE).toBe('stopped');
      await expect(tourButton(page)).toBeVisible();
      // Detenerlo no apaga el relieve (lo apaga la persona con «Relieve en 3D») ni quita el destino
      await expect(page).toHaveURL(/[?&]l=[^&]*terrain3d(&|$)/);
      await expect(page.getByRole('button', { name: 'Relieve en 3D' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(await watch.violations()).toEqual([]);
      expect(watch.errors).toEqual([]);
    },
  );

  isolatedTest(
    'un gesto de la persona sobre el mapa lo INTERRUMPE (la cámara es suya desde ese momento)',
    async ({ page }) => {
      await routeTerrain(page, 'ok');
      await openMap(page, `${EXPLORE}?d=el-valle-de-anton`);
      await tourButton(page).click();
      await expect.poll(() => tourState(page), SETTLE).toBe('running');
      const box = await mapCanvas(page).boundingBox();
      if (!box) throw new Error('el lienzo del mapa no tiene caja');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 200);
      await expect.poll(() => tourState(page), SETTLE).toBe('interrupted');
      await expect(tourButton(page)).toBeVisible();
      // control: el paso no avanza más después de interrumpirlo
      const stepAfter = await tourStep(page);
      await page.waitForTimeout(8_000);
      expect(await tourStep(page)).toBe(stepAfter);
    },
  );

  isolatedTest(
    'elegir otro destino lo detiene (un recorrido es del destino elegido)',
    async ({ page }) => {
      await routeTerrain(page, 'ok');
      await openMap(page, `${EXPLORE}?d=boquete`);
      await tourButton(page).click();
      await expect.poll(() => tourState(page), SETTLE).toBe('running');
      await page.locator('li[data-destination="volcan-baru"] button').click();
      await expect(page).toHaveURL(/[?&]d=volcan-baru(&|$)/);
      await expect.poll(() => tourState(page), SETTLE).toBe('stopped');
      await expect(tourButton(page)).toBeVisible();
    },
  );

  isolatedTest(
    'con movimiento reducido son CORTES sostenidos (cuatro vistas, sin animación) y también se puede detener',
    async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await routeTerrain(page, 'ok');
      await openMap(page, `${EXPLORE}?d=coiba`);
      await tourButton(page).click();
      await expect.poll(() => tourState(page), SETTLE).toBe('running');
      // Cuatro pasos (no cinco): es el guion por cortes. El primero se sostiene 5 s y luego llega el segundo.
      await expect.poll(() => tourStep(page), SETTLE).toBe('1/4');
      await expect.poll(() => tourStep(page), { timeout: 20_000 }).toBe('2/4');
      await tourButton(page, 'Detener el recorrido').click();
      await expect.poll(() => tourState(page), SETTLE).toBe('stopped');
    },
  );
});
