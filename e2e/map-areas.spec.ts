import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PATHS, watchPage } from './helpers';
import { MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON, mapCanvas, openMap } from './map-helpers';

/**
 * Selección de áreas protegidas (F3.d, ADR-0018) con el mapa REAL y SIN base de datos: se prueba lo que no
 * depende de ella (clic, lista por teclado, resalte, URL, estados honestos). La ficha con datos de la BD se
 * prueba en `e2e-db/` (suite aparte, necesita PostgreSQL).
 */
const EXPLORE = PATHS.explore.es;
const COIBA = `${EXPLORE}?d=coiba`;
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const AREA_PARAM = /[?&]a=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(&|$)/;

const listRegion = (page: Page) =>
  page.getByRole('region', { name: 'Áreas protegidas en esta vista' });
const listButtons = (page: Page) => listRegion(page).getByRole('button');
const selectedName = (page: Page) => page.locator('#selected-area-name');
const selectedId = (page: Page) => AREA_PARAM.exec(page.url())?.[1] ?? null;

async function openCoiba(page: Page): Promise<void> {
  await openMap(page, COIBA);
  await expect.poll(() => listButtons(page).count(), { timeout: 30_000 }).toBeGreaterThan(0);
}

test.describe('selección de áreas protegidas', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  test('la lista por teclado ofrece las áreas dibujadas y elegir una equivale al clic (Enter alterna)', async ({
    page,
  }) => {
    const watch = watchPage(page);
    await openCoiba(page);
    await expect(listRegion(page).getByText(/^Mostrando \d+ de \d+\.$/)).toBeVisible();

    const first = listButtons(page).first();
    const name = ((await first.textContent()) ?? '').trim();
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await first.focus();
    await page.keyboard.press('Enter');

    await expect.poll(() => selectedId(page)).not.toBeNull();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(selectedName(page)).toHaveText(name);
    await expect(page.locator('[data-selected-area]')).toHaveAttribute(
      'data-selected-area',
      selectedId(page) ?? '',
    );
    // Sin base de datos la ficha lo dice y SOLO muestra lo que lleva el mapa
    await expect(page.locator('[data-area-status]')).toHaveAttribute(
      'data-area-status',
      'unavailable',
    );
    await expect(page.getByText('La ficha ampliada no está disponible ahora')).toBeVisible();
    await expect(
      page.getByText('El mapa base deriva de OpenStreetMap vía Overture; no es un límite oficial.'),
    ).toBeVisible();
    await expect(
      page.getByText(
        'No hay datos verificados de actividades, restricciones de acceso ni cómo llegar para esta área.',
      ),
    ).toBeVisible();
    // La superficie, la fuente y la licencia NO se inventan cuando no hay datos de la BD
    await expect(page.getByText(/^Superficie$/)).toHaveCount(0);
    await expect(page.getByText(/Licencia:/)).toHaveCount(0);

    // Enter otra vez: se quita la selección
    await first.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => selectedId(page)).toBeNull();
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await expect(selectedName(page)).toHaveCount(0);
    expect(await watch.violations()).toEqual([]);
    // Sin BD, Chrome registra como error de consola el 503 de la API: es el estado que se está probando, y debe
    // ser el ÚNICO error (nada más falla en silencio).
    expect(watch.errors).toHaveLength(1);
    expect(watch.errors[0]).toMatch(
      /status of 503.*\/api\/spatial\/areas\/by-overture\/[0-9a-f-]{36}\?locale=es&zoom=6$/,
    );
  });

  test('un clic en el mapa elige el área y la resalta con un contorno sólido (no solo color)', async ({
    page,
  }) => {
    await openCoiba(page);
    const box = await mapCanvas(page).boundingBox();
    if (!box) throw new Error('El lienzo no tiene caja');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
    await expect.poll(() => selectedId(page), { timeout: 10_000 }).not.toBeNull();
    await expect(selectedName(page)).toContainText('Coiba');
    // El resalte existe en el estilo que MapLibre aplicó de verdad
    await expect
      .poll(async () => (await mapCanvas(page).getAttribute('data-style-layers')) ?? '')
      .toContain('protected-selected');
    // …y la lista marca la misma área como seleccionada
    await expect(listRegion(page).locator('button[aria-pressed="true"]')).toHaveCount(1);
  });

  test('hacer clic en el marcador de un destino NO selecciona el área que hay debajo', async ({
    page,
  }) => {
    await openCoiba(page);
    const marker = page.locator('button[data-destination="coiba"]');
    await expect(marker).toBeVisible();
    await marker.click();
    await page.waitForTimeout(800);
    expect(selectedId(page)).toBeNull();
    await expect(selectedName(page)).toHaveCount(0);
  });

  test('Atrás deshace la selección (cada elección es una entrada del historial)', async ({
    page,
  }) => {
    await openCoiba(page);
    await listButtons(page).first().click();
    await expect.poll(() => selectedId(page)).not.toBeNull();
    await page.goBack();
    await expect.poll(() => selectedId(page)).toBeNull();
    await expect(selectedName(page)).toHaveCount(0);
    await page.goForward();
    await expect.poll(() => selectedId(page)).not.toBeNull();
    await expect(selectedName(page)).toBeVisible();
  });

  test('elegir un destino descarta el área; quitar el destino conserva el área', async ({
    page,
  }) => {
    await openCoiba(page);
    await listButtons(page).first().click();
    await expect.poll(() => selectedId(page)).not.toBeNull();
    await page.getByRole('button', { name: 'Quitar la selección', exact: true }).click();
    await expect(page).not.toHaveURL(/[?&]d=/);
    expect(selectedId(page)).not.toBeNull(); // el área sigue
    await page.getByRole('button', { name: /^Ver en el mapa: Boquete$/ }).click();
    await expect(page).toHaveURL(/[?&]d=boquete/);
    expect(selectedId(page)).toBeNull(); // otro contexto: el área se descarta
  });

  test('un enlace con un área cuyo nombre aún no se conoce NO afirma que «no tiene nombre»', async ({
    page,
  }) => {
    const unknown = '00000000-0000-4000-8000-000000000001';
    await openMap(page, `${EXPLORE}?a=${unknown}`);
    await expect(selectedName(page)).toHaveText('Área protegida seleccionada');
    await expect(page.getByText('Área protegida sin nombre en la fuente')).toHaveCount(0);
    await expect(page.locator('[data-area-status]')).toHaveAttribute(
      'data-area-status',
      'unavailable',
    );
  });

  test('un enlace con un área vista en el mapa toma su nombre del mapa', async ({ page }) => {
    await openCoiba(page);
    const first = listButtons(page).first();
    const name = ((await first.textContent()) ?? '').trim();
    await first.click();
    const id = selectedId(page);
    expect(id).not.toBeNull();
    await page.goto(`${COIBA}&a=${id}`);
    await expect(page.locator('[data-map-status="ready"]')).toBeVisible({ timeout: 60_000 });
    await expect(selectedName(page)).toHaveText(name, { timeout: 30_000 });
  });

  test('un `a` hostil se descarta con aviso: sin ficha, sin ejecutar nada', async ({ page }) => {
    const watch = watchPage(page);
    let dialogs = 0;
    page.on('dialog', async (dialog) => {
      dialogs++;
      await dialog.dismiss();
    });
    await openMap(page, `${EXPLORE}?a=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E`);
    await expect(page.getByText('Una parte del enlace no era válida y se ignoró.')).toBeVisible();
    await expect(selectedName(page)).toHaveCount(0);
    await expect(page.locator('[data-selected-area]')).toHaveCount(0);
    expect(dialogs).toBe(0);
    expect(await watch.violations()).toEqual([]);
  });

  test('con la capa apagada la lista dice cómo activarla y el resalte desaparece; al volver, todo vuelve', async ({
    page,
  }) => {
    await openCoiba(page);
    await listButtons(page).first().click();
    await expect.poll(() => selectedId(page)).not.toBeNull();

    await page.getByRole('checkbox', { name: 'Áreas protegidas' }).uncheck();
    await expect(
      listRegion(page).getByText('Activa la capa «Áreas protegidas» para elegir áreas.'),
    ).toBeVisible();
    await expect
      .poll(async () => (await mapCanvas(page).getAttribute('data-style-layers')) ?? '')
      .not.toContain('protected-selected');
    expect(selectedId(page)).not.toBeNull(); // la selección sigue en la URL

    await page.getByRole('checkbox', { name: 'Áreas protegidas' }).check();
    await expect
      .poll(async () => (await mapCanvas(page).getAttribute('data-style-layers')) ?? '')
      .toContain('protected-selected');
    await expect.poll(() => listButtons(page).count(), { timeout: 30_000 }).toBeGreaterThan(0);
  });

  test('la ficha y la lista se traducen (inglés) y conservan la selección al cambiar de idioma', async ({
    page,
  }) => {
    await openCoiba(page);
    await listButtons(page).first().click();
    const id = selectedId(page);
    expect(id).not.toBeNull();
    await page.goto(`${PATHS.explore.en}?d=coiba&a=${id}`);
    await expect(page.locator('[data-map-status="ready"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Selected area', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Protected areas in this view' })).toBeVisible();
    await expect(
      page.getByText(
        'There is no verified data on activities, access restrictions or how to get there for this area.',
      ),
    ).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`accesibilidad (axe, WCAG 2.2 AA) con un área seleccionada, tema ${scheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openCoiba(page);
      await listButtons(page).first().click();
      await expect(selectedName(page)).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
        ),
      ).toEqual([]);
    });
  }
});
