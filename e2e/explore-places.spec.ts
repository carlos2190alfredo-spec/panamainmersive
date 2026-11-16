import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PATHS, watchPage } from './helpers';
import {
  MAP_DATA_PRESENT,
  MAP_DATA_SKIP_REASON,
  mapCanvas,
  mapState,
  openMap,
  safeBox,
} from './map-helpers';

/**
 * Lugares cercanos SIN VERIFICAR (ADR-0027 A2): la ficha del destino los pide, el panel los enseña en tres pestañas y el mapa
 * pinta los puntos de la pestaña abierta. Los recuentos se comparan con el archivo publicado (`data/places/nearby-places.json`),
 * no con números escritos aquí. El lienzo deja su diagnóstico en el contenedor del mapa: `data-places-shown` (cuántos puntos
 * pinta) y `data-place-highlight` (el resaltado).
 */
const EXPLORE = PATHS.explore.es;
const SETTLE = { timeout: 20_000 } as const;

const published = JSON.parse(
  readFileSync(new URL('../data/places/nearby-places.json', import.meta.url), 'utf8'),
) as {
  destinations: Record<
    string,
    {
      radiusKm: number;
      groups: Record<
        string,
        { total: number; places: { id: string; name: string; lon: number; lat: number }[] }
      >;
    }
  >;
};
const anchors = JSON.parse(
  readFileSync(new URL('../data/anchors/destination-anchors.json', import.meta.url), 'utf8'),
) as { destinations: Record<string, { anchor: { lon: number; lat: number } }> };
const BOQUETE_ANCHOR = anchors.destinations.boquete?.anchor ?? { lon: Number.NaN, lat: Number.NaN };
const boquete = published.destinations.boquete;
if (!boquete) throw new Error('nearby-places.json sin Boquete');

const placesButton = (page: Page) =>
  page.getByRole('button', { name: 'Lugares cercanos', exact: true });
const tab = (page: Page, label: string) =>
  page.getByRole('tab', { name: new RegExp(`^${label} \\(`) });

/** Píxel de la página donde cae un punto (Web Mercator de MapLibre, teselas de 512 px; sin rumbo ni inclinación). */
async function screenPoint(page: Page, lon: number, lat: number) {
  const { zoom, center } = await mapState(page);
  const box = await mapCanvas(page).boundingBox();
  if (!box) throw new Error('sin lienzo');
  const world = 512 * 2 ** zoom;
  const project = (lo: number, la: number) => {
    const phi = (la * Math.PI) / 180;
    return [
      ((lo + 180) / 360) * world,
      ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * world,
    ] as const;
  };
  const [px, py] = project(lon, lat);
  const [cx, cy] = project(center[0], center[1]);
  return { x: box.x + box.width / 2 + (px - cx), y: box.y + box.height / 2 + (py - cy) };
}

test.describe('lugares cercanos sin verificar (escritorio)', () => {
  test('nada se pide hasta pulsar; la ficha abre el panel, el foco llega a la lista y los recuentos son los publicados', async ({
    page,
  }) => {
    const watch = watchPage(page);
    const placeRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/places/')) placeRequests.push(r.url());
    });
    await page.goto(`${EXPLORE}?d=boquete`);
    await expect(placesButton(page)).toBeVisible();
    await page.waitForTimeout(500);
    expect(placeRequests, 'antes de pedirlos, ni una petición').toEqual([]);

    await placesButton(page).click();
    const heading = page.getByRole('heading', { name: 'Lugares cerca de Boquete' });
    await expect(heading).toBeFocused(SETTLE);
    await expect(page.locator('aside [data-panel-toggle]')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(placeRequests.map((u) => new URL(u).pathname)).toEqual(['/api/places/boquete']);

    for (const [label, group] of [
      ['Qué hacer', 'activities'],
      ['Dónde comer', 'food'],
      ['Dónde dormir', 'lodging'],
    ] as const) {
      const block = boquete.groups[group];
      if (!block) throw new Error(group);
      await expect(tab(page, label)).toHaveText(`${label} (${String(block.total)})`);
    }
    await expect(tab(page, 'Qué hacer')).toHaveAttribute('aria-selected', 'true');
    const first = boquete.groups.activities?.places[0];
    if (!first) throw new Error('Boquete sin actividades en el archivo publicado');
    const items = page.getByRole('tabpanel').getByRole('listitem');
    await expect(items).toHaveCount(boquete.groups.activities?.places.length ?? 0);
    await expect(items.first()).toContainText(first.name);
    await expect(items.first()).toContainText('Sin verificar');
    await expect(items.first()).toContainText('Fuente: Overture Maps');

    // Teclado: de «Qué hacer» a «Dónde dormir» con Fin; la lista cambia
    await tab(page, 'Qué hacer').focus();
    await page.keyboard.press('End');
    await expect(tab(page, 'Dónde dormir')).toBeFocused();
    await expect(tab(page, 'Dónde dormir')).toHaveAttribute('aria-selected', 'true');
    await expect(items).toHaveCount(boquete.groups.lodging?.places.length ?? 0);
    expect(placeRequests, 'cambiar de pestaña no vuelve a pedir').toHaveLength(1);
    expect(await watch.violations()).toEqual([]);
    // La lista no necesita el mapa: en un clon SIN el mapa base (el techo de omitidas de CI) su 404 es lo esperado; con él,
    // cualquier error cuenta.
    const missingBasemap = (e: string) =>
      !MAP_DATA_PRESENT && e.includes('/data/panama-basemap.pmtiles');
    expect(watch.errors.filter((e) => !missingBasemap(e))).toEqual([]);
  });

  test('un destino sin datos lo DICE en las tres pestañas (Coiba: no se agranda el radio para rellenar)', async ({
    page,
  }) => {
    await page.goto(`${EXPLORE}?d=coiba`);
    await placesButton(page).click();
    await expect(tab(page, 'Dónde dormir')).toHaveText('Dónde dormir (0)', SETTLE);
    await tab(page, 'Dónde dormir').click();
    await expect(page.getByRole('tabpanel')).toContainText(
      'La fuente no tiene lugares de este tipo a menos de 10 km del punto de referencia.',
    );
    await expect(page.getByRole('tabpanel').getByRole('list')).toHaveCount(0);
  });
});

test.describe('lugares cercanos sobre el mapa dibujado', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  test.setTimeout(120_000);

  test('el mapa pinta los puntos de la pestaña abierta; «Ver en el mapa» resalta el lugar y lo deja en el hueco libre; ocultar los retira', async ({
    page,
  }) => {
    const watch = watchPage(page);
    await openMap(page, `${EXPLORE}?d=boquete`);
    await expect(mapCanvas(page)).toHaveAttribute('data-places-shown', '0');
    await placesButton(page).click();
    const activities = boquete.groups.activities?.places ?? [];
    const lodging = boquete.groups.lodging?.places ?? [];
    await expect(mapCanvas(page)).toHaveAttribute(
      'data-places-shown',
      String(activities.length),
      SETTLE,
    );
    await tab(page, 'Dónde dormir').click();
    await expect(mapCanvas(page)).toHaveAttribute(
      'data-places-shown',
      String(lodging.length),
      SETTLE,
    );

    const target = lodging[1];
    if (!target) throw new Error('Boquete con menos de dos alojamientos publicados');
    await page.getByRole('button', { name: `Ver en el mapa: ${target.name}`, exact: true }).click();
    await expect(mapCanvas(page)).toHaveAttribute('data-place-highlight', target.id);
    await expect(page.locator(`li[data-place-id="${target.id}"]`)).toHaveAttribute(
      'data-highlighted',
      'true',
    );
    // `data-zoom`/`data-center` se escriben en `idle` (lento con WebGL por software): se espera a que lleguen al zoom del lugar.
    await expect
      .poll(async () => (await mapState(page)).zoom, { timeout: 45_000 })
      .toBeGreaterThan(15.5);
    // Control de la proyección: el marcador de Boquete (anclado por su centro) está donde la cuenta dice que está su ancla.
    // Sin él, una cuenta que devolviera siempre el centro del lienzo también podría «caer en el hueco libre».
    const anchor = await screenPoint(page, BOQUETE_ANCHOR.lon, BOQUETE_ANCHOR.lat);
    const markerBox = await page.locator('button[data-destination="boquete"]').boundingBox();
    if (!markerBox) throw new Error('sin marcador de Boquete');
    expect(Math.abs(markerBox.x + markerBox.width / 2 - anchor.x), 'proyección (x)').toBeLessThan(
      6,
    );
    expect(Math.abs(markerBox.y + markerBox.height / 2 - anchor.y), 'proyección (y)').toBeLessThan(
      6,
    );
    const point = await screenPoint(page, target.lon, target.lat);
    const safe = await safeBox(page);
    expect(point.x, 'el lugar cae dentro del hueco libre (x)').toBeGreaterThan(safe.x);
    expect(point.x).toBeLessThan(safe.x + safe.width);
    expect(point.y, 'el lugar cae dentro del hueco libre (y)').toBeGreaterThan(safe.y);
    expect(point.y).toBeLessThan(safe.y + safe.height);

    await page.getByRole('button', { name: 'Ocultar los lugares cercanos' }).click();
    await expect(mapCanvas(page)).toHaveAttribute('data-places-shown', '0', SETTLE);
    await expect(mapCanvas(page)).toHaveAttribute('data-place-highlight', '');
    expect(await watch.violations()).toEqual([]);
    expect(watch.errors).toEqual([]);
  });
});
