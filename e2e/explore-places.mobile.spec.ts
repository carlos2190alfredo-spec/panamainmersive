import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PATHS } from './helpers';
import {
  MAP_DATA_PRESENT,
  MAP_DATA_SKIP_REASON,
  mapCanvas,
  openMap,
  openSheet,
  sheetHandle,
} from './map-helpers';

/**
 * Lugares cercanos sin verificar en móvil (ADR-0027 A2): la lista vive en la hoja inferior, que abierta tapa más de la mitad del
 * mapa. «Lugares cercanos» de la ficha lleva hasta la lista DENTRO de la hoja; «Ver en el mapa» la pliega, el foco pasa al asa (el
 * botón queda inerte) y el lugar queda resaltado.
 */
const EXPLORE = PATHS.explore.es;
const SETTLE = { timeout: 30_000 } as const;
const published = JSON.parse(
  readFileSync(new URL('../data/places/nearby-places.json', import.meta.url), 'utf8'),
) as {
  destinations: Record<
    string,
    { groups: Record<string, { places: { id: string; name: string }[] }> }
  >;
};

test.describe('lugares cercanos en móvil con el mapa dibujado', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  test.setTimeout(120_000);

  test('la ficha lleva a la lista dentro de la hoja; «Ver en el mapa» pliega la hoja, el foco va al asa y el lugar se resalta', async ({
    page,
  }) => {
    const target = published.destinations.boquete?.groups.activities?.places[0];
    if (!target) throw new Error('Boquete sin actividades publicadas');
    await openMap(page, `${EXPLORE}?d=boquete`);
    await openSheet(page);
    await page.getByRole('button', { name: 'Lugares cercanos', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lugares cerca de Boquete' })).toBeFocused(
      SETTLE,
    );
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(mapCanvas(page)).not.toHaveAttribute('data-places-shown', '0', SETTLE);

    await page.getByRole('button', { name: `Ver en el mapa: ${target.name}`, exact: true }).click();
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false', SETTLE);
    await expect(sheetHandle(page)).toBeFocused();
    await expect(mapCanvas(page)).toHaveAttribute('data-place-highlight', target.id);
  });
});
