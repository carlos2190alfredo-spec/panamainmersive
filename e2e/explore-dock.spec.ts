import { expect, test, type Page } from '@playwright/test';
import { applyCss } from './a11y-probes';
import { PATHS } from './helpers';

/**
 * La ficha del destino no gobierna la altura del dock (backlog F5-11). El dock pone la ficha y el carrusel LADO A LADO y su alto es
 * el del más alto: con la ficha al 42 % de la fila (el ancho de antes por debajo de 80rem) a 1024 px el nombre se partía, el aviso
 * previo del recorrido ocupaba dos líneas y el tercer botón («Lugares cercanos») otra, y la ficha llegaba a 349 px frente a los
 * 254 del carrusel: el hueco del mapa perdía ≈ 95 px. Con el ancho único (34rem o el 56 % de la fila) la ficha no pasa del carrusel.
 *
 * No necesita el mapa: su estilo no se descarga (la petición queda retenida), así que el estado es «cargando» (el aviso previo del
 * recorrido SE VE, que es justo lo que alarga la ficha) y no se gasta la CPU de WebGL. Lleva un control: con el ancho de antes
 * inyectado la misma medida tiene que salir mal, o la prueba no mediría nada.
 */
const PMTILES = '**/data/panama-basemap.pmtiles';
const KEYS = [
  'bocas-del-toro',
  'boquete',
  'casco-antiguo',
  'coiba',
  'el-valle-de-anton',
  'panama-canal',
  'panama-city',
  'santa-catalina',
  'volcan-baru',
] as const;
const LANGS = ['es', 'en', 'pt', 'fr', 'de'] as const;
/** Entre 64 y 80rem (el escritorio de portátil): por debajo de 1024 px la ficha puede seguir siendo algo más alta (nota en el backlog). */
const WIDTHS = [1024, 1200, 1279] as const;
/**
 * Holgura entre la ficha y el carrusel: el texto parte distinto según las fuentes de cada sistema (macOS y Linux), y 12 px son
 * menos de una línea de las notas. El defecto que se vigila mide 80–95 px más.
 */
const TOLERANCE_PX = 12;

const WAIT = { timeout: 15_000 } as const;

/** Enlace de la ficha: lleva la dirección localizada del destino elegido, así que cambia cuando la ficha pasa a otro. */
const cardHref = (page: Page) =>
  page.evaluate(
    () =>
      document
        .querySelector<HTMLAnchorElement>('[data-hud-zone="featured"] section a[href]')
        ?.getAttribute('href') ?? '',
  );

/** Elige el destino por la URL (`history.pushState(null, …)`, como el resto de la suite) y espera a que la ficha cambie. */
async function select(page: Page, key: string): Promise<void> {
  const before = await cardHref(page);
  const already = await page.evaluate(
    (k) => new URL(location.href).searchParams.get('d') === k,
    key,
  );
  if (already) return;
  await page.evaluate((k) => {
    history.pushState(null, '', `?d=${k}`);
  }, key);
  await expect.poll(() => cardHref(page), WAIT).not.toBe(before);
}

async function boxes(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const height = (el: Element | null) => (el ? el.getBoundingClientRect().height : Number.NaN);
    return {
      card: height(document.querySelector('[data-hud-zone="featured"] section')),
      carousel: height(document.querySelector('[data-hud-zone="carousel"]')),
      safe: height(document.querySelector('[data-hud-safe]')),
      notice: document.querySelector('[data-tour-notice]') !== null,
    };
  });
}

test.describe('la ficha del destino no gobierna la altura del dock (F5-11)', () => {
  test.setTimeout(90_000);

  for (const lang of LANGS) {
    test(`${lang}: de 1024 a 1279 px la ficha de los nueve destinos no es más alta que el carrusel`, async ({
      page,
    }) => {
      await page.route(PMTILES, () => new Promise<void>(() => undefined));
      await page.setViewportSize({ width: WIDTHS[0], height: 700 });
      await page.goto(`${PATHS.explore[lang]}?d=${KEYS[0]}`);
      await expect(page.locator('[data-hud-zone="featured"] section')).toBeVisible(WAIT);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 700 });
        for (const key of KEYS) {
          await select(page, key);
          const b = await boxes(page);
          // Control de que el aviso del recorrido está (es lo que alarga la ficha): sin él la medida sería de otro estado
          expect(
            b.notice,
            `${key} a ${String(width)} px: el aviso previo del recorrido se ve`,
          ).toBe(true);
          expect(
            b.card - b.carousel,
            `${lang} · ${key} a ${String(width)} px: ficha ${String(b.card)} px, carrusel ${String(b.carousel)} px`,
          ).toBeLessThanOrEqual(TOLERANCE_PX);
        }
      }
    });
  }

  test('el hueco del mapa a 1024×700 no baja de 180 px con la ficha más alta de las nueve; y CONTROL: con el 42 % de antes la ficha pasa del carrusel y el hueco cae', async ({
    page,
  }) => {
    await page.route(PMTILES, () => new Promise<void>(() => undefined));
    await page.setViewportSize({ width: 1024, height: 700 });
    await page.goto(`${PATHS.explore.es}?d=bocas-del-toro`);
    await expect(page.locator('[data-hud-zone="featured"] section')).toBeVisible(WAIT);
    const now = await boxes(page);
    expect(now.card - now.carousel).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(now.safe, 'hueco libre del mapa').toBeGreaterThanOrEqual(180);

    await applyCss(
      page,
      "@media (min-width: 56rem) and (max-width: 79.999rem) { [data-hud-zone='featured'] { flex-basis: min(34rem, 42%) !important; } }",
    );
    // La hoja del estado anterior tiene que ver el defecto (la ficha más alta que el carrusel y el hueco recortado)…
    await expect
      .poll(async () => (await boxes(page)).card, WAIT)
      .toBeGreaterThan(now.carousel + 40);
    const before = await boxes(page);
    expect(before.safe, 'con el 42 % el hueco es menor').toBeLessThan(now.safe - 40);
  });
});
