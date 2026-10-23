import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fromMapView, zoomFromAltitude } from '../src/domains/geography/camera';
import { LOCALES, PATHS, watchPage } from './helpers';
import {
  MAP_DATA_PRESENT,
  MAP_DATA_SKIP_REASON,
  TERRAIN_HOST,
  mapCanvas,
  mapState,
  openMap,
  paintedFractions,
  routeTerrain,
  trackRequests,
} from './map-helpers';

const EXPLORE = PATHS.explore.es;
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const mapAlert = (page: Page) =>
  page.getByRole('region', { name: 'Mapa de Panamá' }).getByRole('alert');

const cardHeading = (page: Page) => page.locator('#selected-destination-name');

test.describe('mapa: carga y dibujo', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  test('carga el mapa base real sin violaciones de CSP ni errores de consola', async ({ page }) => {
    const watch = watchPage(page);
    await openMap(page, EXPLORE);
    await expect(mapCanvas(page)).toBeVisible();
    const box = await mapCanvas(page).boundingBox();
    expect(box?.width).toBeGreaterThan(400);
    expect(box?.height).toBeGreaterThan(300);
    expect(await watch.violations()).toEqual([]);
    expect(watch.errors).toEqual([]);
  });

  test('dibuja tierra, mar y detalle (no un lienzo en blanco)', async ({ page }) => {
    await openMap(page, `${EXPLORE}?d=bocas-del-toro`);
    await expect
      .poll(
        async () => (await paintedFractions(page, { water: '--color-map-water' })).fractions.water,
        {
          timeout: 20_000,
        },
      )
      .toBeGreaterThan(0.05);
    const { fractions, distinct } = await paintedFractions(page, {
      water: '--color-map-water',
      land: '--color-map-land',
    });
    expect(fractions.water).toBeGreaterThan(0.05);
    expect(fractions.land).toBeGreaterThan(0.01);
    expect(distinct).toBeGreaterThan(25);
  });

  test('el PMTiles se sirve por peticiones Range (206) y con caché', async ({ page }) => {
    const ranged = page.waitForResponse(
      (r) => r.url().endsWith('/data/panama-basemap.pmtiles') && r.status() === 206,
      { timeout: 60_000 },
    );
    await page.goto(EXPLORE);
    const response = await ranged;
    expect(response.headers()['content-range']).toMatch(/^bytes \d+-\d+\/\d+$/);
    expect(response.headers()['cache-control']).toBe('public, max-age=3600');
  });

  test('sin capas de relieve NO se contacta a ningún tercero (privacidad)', async ({ page }) => {
    const requests = trackRequests(page);
    await openMap(page, EXPLORE);
    await page.waitForLoadState('networkidle');
    expect(requests.hosts()).toEqual([new URL(page.url()).host]);
  });
});

test.describe('mapa: selección de destino', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  test('«Ver en el mapa» selecciona, acerca, actualiza la URL y Atrás lo deshace', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    const before = (await mapState(page)).zoom;
    const button = page.getByRole('button', { name: /^Ver en el mapa: Boquete$/ });
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await button.click();

    await expect(page).toHaveURL(/[?&]d=boquete(&|$)/);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(cardHeading(page)).toHaveText('Boquete');
    await expect(
      page.getByText('El marcador es un punto de referencia derivado de OpenStreetMap'),
    ).toBeVisible();
    await expect
      .poll(async () => (await mapState(page)).zoom, { timeout: 15_000 })
      .toBeGreaterThan(before + 1.5);
    // El mapa termina centrado cerca del ancla de Boquete (derivada del ID de Overture).
    await expect
      .poll(async () => (await mapState(page)).center[1], { timeout: 15_000 })
      .toBeGreaterThan(8.6);

    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]d=/);
    await expect(cardHeading(page)).toHaveCount(0);
  });

  test('la ficha enlaza a la página del destino en el idioma actual', async ({ page }) => {
    await openMap(page, `${EXPLORE}?d=volcan-baru`);
    await page.getByRole('link', { name: 'Abrir la ficha de Volcán Barú' }).click();
    await expect(page).toHaveURL(/\/es\/destinos\/volcan-baru$/);
  });

  test('un marcador se activa con el teclado y selecciona su destino', async ({ page }) => {
    // Altitud ≈ 12 km sobre Boquete: Boquete y el Volcán Barú (10 km) ya no se agrupan.
    await openMap(page, `${EXPLORE}?c=-82.4348,8.7764,4000,0,0,0`);
    const marker = page.locator('button[data-destination="boquete"]');
    await expect(marker).toBeVisible();
    await marker.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/[?&]d=boquete/);
    await expect(cardHeading(page)).toHaveText('Boquete');
    await expect(marker).toHaveAttribute('aria-pressed', 'true');
  });

  test('Quitar la selección oculta la tarjeta y limpia `d`', async ({ page }) => {
    await openMap(page, `${EXPLORE}?d=coiba`);
    await expect(cardHeading(page)).toHaveText('Coiba');
    await page.getByRole('button', { name: 'Quitar la selección' }).click();
    await expect(cardHeading(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]d=/);
  });
});

test.describe('mapa: marcadores cercanos', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  test('a zoom bajo se agrupan en un botón accesible y al pulsarlo se separan', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    const cluster = page.locator('button[data-cluster]').first();
    await expect(cluster).toBeVisible();
    await expect(cluster).toHaveAccessibleName(/^\d+ destinos agrupados: .+\. Acercar el mapa$/);
    // El nombre accesible CONTIENE el texto visible (el recuento): WCAG 2.5.3.
    const count = (await cluster.textContent())?.trim() ?? '';
    expect((await cluster.getAttribute('aria-label')) ?? '').toContain(count);

    const before = await page.locator('button[data-cluster]').count();
    await cluster.click();
    await expect
      .poll(async () => page.locator('button[data-cluster]').count(), { timeout: 20_000 })
      .toBeLessThan(before + 1);
    await expect
      .poll(async () => (await mapState(page)).zoom, { timeout: 20_000 })
      .toBeGreaterThan(9);
  });

  test('ningún par de marcadores/grupos visibles se solapa (objetivos de ≥ 44 px separados)', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    const boxes = await page
      .locator('button[data-cluster], button[data-destination]')
      .evaluateAll((els) =>
        els
          .map((el) => el.getBoundingClientRect())
          .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
      );
    expect(boxes.length).toBeGreaterThan(0);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a || !b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `marcadores ${i} y ${j}`).toBe(false);
      }
    }
  });
});

test.describe('mapa: enlaces profundos', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  test('?d=casco-antiguo encuadra el destino (zoom ≈ 15) y lo marca como seleccionado', async ({
    page,
  }) => {
    await openMap(page, `${EXPLORE}?d=casco-antiguo`);
    const state = await mapState(page);
    expect(state.zoom).toBeGreaterThan(14.5);
    expect(state.center[0]).toBeCloseTo(-79.5347, 2);
    expect(state.center[1]).toBeCloseTo(8.9525, 2);
    await expect(page.locator('button[data-destination="casco-antiguo"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('?c= fija la cámara: la altitud del enlace se convierte en el zoom esperado y vuelve a la URL', async ({
    page,
  }) => {
    await openMap(page, `${EXPLORE}?c=-82.5424,8.8089,9000,20,40,0`);
    const height = await mapCanvas(page).evaluate((el) => el.clientHeight);
    const expected = zoomFromAltitude({ lat: 8.8089, altitudeM: 9000, pitchDeg: 40 }, height);
    const state = await mapState(page);
    expect(state.zoom).toBeCloseTo(expected, 1);
    expect(state.pitch).toBeCloseTo(40, 0);
    expect(state.center[0]).toBeCloseTo(-82.5424, 2);

    // Al mover el mapa, la URL se reescribe con la cámara nueva (altitud ≈ la mitad al subir un nivel de zoom).
    await mapCanvas(page).locator('canvas').focus();
    await page.keyboard.press('Equal');
    await expect
      .poll(() => new URL(page.url()).searchParams.get('c'), { timeout: 15_000 })
      .not.toBe('-82.5424,8.8089,9000,20,40,0');
    const written = new URL(page.url()).searchParams.get('c')?.split(',').map(Number) ?? [];
    expect(written).toHaveLength(6);
    expect(written[2]).toBeGreaterThan(3500);
    expect(written[2]).toBeLessThan(5500);
    expect(
      fromMapView(
        { center: [written[0] ?? 0, written[1] ?? 0], zoom: 5, bearing: 0, pitch: 0, roll: 0 },
        height,
      ).lon,
    ).toBeCloseTo(written[0] ?? 0, 4);
  });

  test('parámetros inválidos o hostiles no rompen ni se inyectan: el mapa carga y avisa', async ({
    page,
  }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await openMap(
      page,
      `${EXPLORE}?d=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&c=NaN,1,2&l=evil,%3Cscript%3E`,
    );
    await expect(page.getByText('Una parte del enlace no era válida y se ignoró.')).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(cardHeading(page)).toHaveCount(0);
    expect(dialogs).toEqual([]);
  });

  test('con Atrás/Adelante la cámara del enlace se restaura', async ({ page }) => {
    await openMap(page, `${EXPLORE}?c=-82.5424,8.8089,9000,0,0,0`);
    const first = await mapState(page);
    await page.getByRole('button', { name: /^Ver en el mapa: Coiba$/ }).click();
    await expect
      .poll(async () => (await mapState(page)).center[0], { timeout: 15_000 })
      .toBeGreaterThan(-82.4 - 0.5);
    await page.goBack();
    await expect
      .poll(async () => (await mapState(page)).center[0], { timeout: 15_000 })
      .toBeCloseTo(first.center[0], 1);
  });
});

test.describe('mapa: capas y relieve de terceros', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  test('activar el relieve lo pide a AWS (solo entonces), lo anuncia y lo refleja en leyenda, URL y atribución', async ({
    page,
  }) => {
    const watch = watchPage(page);
    const terrain = await routeTerrain(page, 'ok');
    await openMap(page, EXPLORE);
    expect(terrain.requests).toEqual([]); // antes de activar nada: cero peticiones a AWS

    await page.getByRole('checkbox', { name: 'Sombreado del relieve' }).check();
    await expect(page).toHaveURL(
      /[?&]l=protectedAreas,boundaries,places,waterways,landcover,hillshade(&|$)/,
    );
    await expect(
      page.getByText('Con una capa de relieve activa, Amazon Web Services recibe tu dirección IP'),
    ).toBeVisible();
    await expect.poll(() => terrain.requests.length, { timeout: 20_000 }).toBeGreaterThan(0);
    for (const url of terrain.requests)
      expect(url).toMatch(new RegExp(`^https://${TERRAIN_HOST}/terrarium/\\d+/\\d+/\\d+\\.png$`));
    // La leyenda (no el control, que también dice «Sombreado del relieve») refleja la capa activada.
    const legend = page.getByRole('region', { name: 'Leyenda' });
    await expect(
      legend.getByRole('listitem').filter({ hasText: 'Sombreado del relieve' }),
    ).toBeVisible();
    await expect(page.locator('[data-map-layers]')).toHaveAttribute(
      'data-map-layers',
      'protectedAreas,boundaries,places,waterways,landcover,hillshade',
    );
    await expect(page.getByText('Relieve: AWS Terrain Tiles (SRTM, GMTED, ETOPO1)')).toBeAttached();

    await page.getByRole('checkbox', { name: 'Sombreado del relieve' }).uncheck();
    await expect(page).toHaveURL(/[?&]l=protectedAreas,boundaries,places,waterways,landcover(&|$)/);
    await expect(page.getByText('Con una capa de relieve activa')).toHaveCount(0);
    await expect(legend.getByText('Sombreado del relieve')).toHaveCount(0);
    await expect(page.locator('[data-map-status]')).toHaveAttribute('data-map-status', 'ready');
    // La CSP deja pasar el origen del relieve (connect-src) y nada más.
    expect(await watch.violations()).toEqual([]);
    expect(watch.errors).toEqual([]);
  });

  test('«Relieve en 3D» permite inclinar más el mapa', async ({ page }) => {
    await routeTerrain(page, 'ok');
    await openMap(page, `${EXPLORE}?c=-82.5424,8.8089,9000,0,0,0&l=protectedAreas,terrain3d`);
    await expect(page.getByRole('checkbox', { name: 'Relieve en 3D' })).toBeChecked();
    await expect(page.locator('[data-map-layers]')).toHaveAttribute(
      'data-map-layers',
      'protectedAreas,terrain3d',
    );
    await expect(page.locator('[data-map-status]')).toHaveAttribute('data-map-status', 'ready');
  });

  test('si el relieve falla, el mapa base sigue funcionando y se avisa', async ({ page }) => {
    await routeTerrain(page, 'fail');
    await openMap(page, EXPLORE);
    await page.getByRole('checkbox', { name: 'Sombreado del relieve' }).check();
    await expect(page.locator('[data-map-terrain-failed="true"]')).toBeAttached({
      timeout: 30_000,
    });
    await expect(page.getByText('No se pudo cargar el relieve')).toBeVisible();
    await expect(page.locator('[data-map-status]')).toHaveAttribute('data-map-status', 'ready');
    // Al desactivarlo, el aviso desaparece.
    await page.getByRole('checkbox', { name: 'Sombreado del relieve' }).uncheck();
    await expect(page.getByText('No se pudo cargar el relieve')).toHaveCount(0);
  });

  test('la leyenda se deriva de las capas activas y distingue por trazo, no solo por color', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    const legend = page.getByRole('region', { name: 'Leyenda' });
    await expect(legend.getByText('Área protegida (borde discontinuo)')).toBeVisible();
    await expect(legend.getByText('Límite del país (línea continua)')).toBeVisible();
    await expect(legend.getByText('Límite de provincia o comarca (guiones)')).toBeVisible();
    await expect(legend.getByText('Límite de distrito (puntos)')).toBeVisible();
    await expect(legend.getByText('Sombreado del relieve')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Áreas protegidas' }).uncheck();
    await expect(legend.getByText('Área protegida (borde discontinuo)')).toHaveCount(0);
  });
});

const styleLayers = async (page: Page): Promise<string[]> =>
  ((await mapCanvas(page).getAttribute('data-style-layers')) ?? '').split(',').filter(Boolean);

test.describe('mapa: capas propias y leyenda (registro declarativo)', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  const FIRST_PARTY = [
    'Áreas protegidas',
    'Límites administrativos',
    'Localidades y nombres de lugares',
    'Ríos y canales',
    'Cobertura del suelo',
  ];

  test('las cinco capas propias vienen activas, las de terceros apagadas, y el mapa lo confirma', async ({
    page,
  }) => {
    const terrain = await routeTerrain(page, 'ok');
    await openMap(page, EXPLORE);
    for (const name of FIRST_PARTY) {
      await expect(page.getByRole('checkbox', { name }), name).toBeChecked();
    }
    await expect(page.getByRole('checkbox', { name: 'Sombreado del relieve' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Relieve en 3D' })).not.toBeChecked();
    await expect
      .poll(() => styleLayers(page), { timeout: 20_000 })
      .toEqual(
        expect.arrayContaining([
          'land',
          'landcover',
          'boundary-country',
          'ocean',
          'waterway',
          'protected-fill',
          'place-city',
        ]),
      );
    expect(await styleLayers(page)).not.toContain('hillshade');
    expect(terrain.requests).toEqual([]); // sin pedirlo, ni un byte a un tercero
  });

  const cases: { name: string; prefixes: string[]; keeps: string[]; legendGone: string[] }[] = [
    {
      name: 'Límites administrativos',
      prefixes: ['boundary-'],
      keeps: ['place-city', 'protected-fill', 'ocean'],
      legendGone: ['Límite del país (línea continua)', 'Límite de distrito (puntos)'],
    },
    {
      name: 'Localidades y nombres de lugares',
      prefixes: ['place-'],
      keeps: ['boundary-country', 'protected-fill', 'waterway'],
      legendGone: ['Localidad (punto)'],
    },
    {
      name: 'Ríos y canales',
      prefixes: ['waterway'],
      keeps: ['boundary-country', 'place-city', 'water'],
      legendGone: ['Río o canal'],
    },
    {
      name: 'Cobertura del suelo',
      prefixes: ['landcover'],
      keeps: ['land', 'boundary-country', 'place-city'],
      legendGone: ['Bosque', 'Arrecife'],
    },
  ];

  for (const c of cases) {
    test(`apagar «${c.name}» quita exactamente sus capas del mapa, de la leyenda y de la URL`, async ({
      page,
    }) => {
      await openMap(page, EXPLORE);
      const legend = page.getByRole('region', { name: 'Leyenda' });
      for (const text of c.legendGone) await expect(legend.getByText(text)).toBeVisible();

      await page.getByRole('checkbox', { name: c.name }).uncheck();
      await expect(page).toHaveURL(/[?&]l=/);
      await expect
        .poll(
          async () =>
            (await styleLayers(page)).filter((id) => c.prefixes.some((p) => id.startsWith(p))),
          { timeout: 20_000 },
        )
        .toEqual([]);
      const after = await styleLayers(page);
      for (const keep of c.keeps) expect(after, keep).toContain(keep);
      for (const text of c.legendGone) await expect(legend.getByText(text)).toHaveCount(0);
      await expect(legend.getByText('Agua', { exact: true })).toBeVisible(); // la base no se apaga

      await page.getByRole('checkbox', { name: c.name }).check();
      await expect
        .poll(
          async () =>
            (await styleLayers(page)).some((id) => c.prefixes.some((p) => id.startsWith(p))),
          { timeout: 20_000 },
        )
        .toBe(true);
      for (const text of c.legendGone) await expect(legend.getByText(text)).toBeVisible();
    });
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`cada muestra de la leyenda se pinta con un color real del tema ${scheme} (no el negro por defecto de un SVG)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openMap(page, EXPLORE);
      const legend = page.getByRole('region', { name: 'Leyenda' });
      const items = legend.getByRole('listitem');
      expect(await items.count()).toBeGreaterThanOrEqual(10);
      const painted = await items.evaluateAll((lis) =>
        lis.map((li) => {
          const shapes = [...li.querySelectorAll('svg rect, svg line, svg circle')];
          const colors = shapes.map((el) => {
            const cs = getComputedStyle(el);
            return el.tagName === 'line' || cs.fill === 'none' ? cs.stroke : cs.fill;
          });
          return { text: li.textContent ?? '', colors };
        }),
      );
      for (const entry of painted) {
        expect(entry.colors.length, entry.text).toBeGreaterThan(0);
        for (const color of entry.colors) {
          expect(color, entry.text).not.toBe('none');
          expect(color, entry.text).not.toBe('rgb(0, 0, 0)');
        }
      }
    });
  }
});

test.describe('mapa: estados de error y alternativas', () => {
  test('faltan los datos del mapa base → aviso localizado y la lista sigue disponible', async ({
    page,
  }) => {
    await page.route('**/data/panama-basemap.pmtiles', (route) =>
      route.fulfill({ status: 404, body: 'no' }),
    );
    await page.goto(EXPLORE);
    await expect(page.locator('[data-map-status="dataMissing"]')).toBeVisible({ timeout: 30_000 });
    await expect(mapAlert(page)).toContainText('Los datos del mapa base no están disponibles');
    await expect(page.getByRole('link', { name: /Boquete/ }).first()).toBeVisible();
    await expect(page.locator('li[data-destination] a')).toHaveCount(9);
  });

  test('sin WebGL2 → aviso y alternativa de texto', async ({ page }) => {
    await page.addInitScript(() => {
      // Parche deliberado de la prueba: la función original se invoca siempre con su `this` (vía `.call`).
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (type === 'webgl2' || type === 'webgl') return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
      } as typeof original;
    });
    await page.goto(EXPLORE);
    await expect(page.locator('[data-map-status="unsupported"]')).toBeVisible();
    await expect(mapAlert(page)).toContainText('Este navegador no puede mostrar el mapa');
    await expect(page.locator('li[data-destination] a')).toHaveCount(9);
  });

  test('un fallo de red al cargar el mapa ofrece «Reintentar» y se recupera', async ({ page }) => {
    test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON); // se recupera cargando el mapa REAL
    let fail = true;
    await page.route('**/data/panama-basemap.pmtiles', async (route) => {
      if (fail) await route.abort('failed');
      else await route.continue();
    });
    await page.goto(EXPLORE);
    await expect(page.locator('[data-map-status="error"]')).toBeVisible({ timeout: 30_000 });
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.locator('[data-map-status="ready"]')).toBeVisible({ timeout: 60_000 });
  });

  test('sin JavaScript se explica con palabras y la lista de enlaces es la alternativa completa', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL ?? '' });
    try {
      const page = await context.newPage();
      await page.goto(EXPLORE);
      await expect(page.locator('noscript p')).toContainText(
        'El mapa interactivo necesita JavaScript',
      );
      await expect(page.getByText('Cargando el mapa')).toHaveCount(0);
      await expect(page.locator('li[data-destination] a')).toHaveCount(9);
      await expect(page.getByRole('button', { name: /Ver en el mapa/ })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

test.describe('mapa: idiomas, teclado y movimiento', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  const ZOOM_IN: Record<(typeof LOCALES)[number], string> = {
    es: 'Acercar',
    en: 'Zoom in',
    pt: 'Aproximar',
    fr: 'Zoom avant',
    de: 'Vergrößern',
  };
  for (const locale of LOCALES) {
    test(`los controles del propio mapa están traducidos (${locale})`, async ({ page }) => {
      await openMap(page, PATHS.explore[locale]);
      await expect(page.getByRole('button', { name: ZOOM_IN[locale], exact: true })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    });
  }

  test('cambiar de idioma conserva destino y capas y vuelve a abrir el mapa', async ({ page }) => {
    await routeTerrain(page, 'ok');
    await openMap(page, `${EXPLORE}?d=boquete&l=protectedAreas,hillshade`);
    await page.locator('summary').first().click();
    await page.locator('a[hreflang="en"]').click();
    await expect(page).toHaveURL(/\/en\/explore\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get('d')).toBe('boquete');
    expect(url.searchParams.get('l')).toBe('protectedAreas,hillshade');
    await expect(page.locator('[data-map-status="ready"]')).toBeVisible({ timeout: 60_000 });
    await expect(cardHeading(page)).toHaveText('Boquete');
    await expect(page.getByText('Selected destination')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Terrain shading' })).toBeChecked();
  });

  test('el mapa se maneja con el teclado (flechas desplazan)', async ({ page }) => {
    await openMap(page, `${EXPLORE}?c=-80.1,8.6,60000,0,0,0`);
    const before = await mapState(page);
    await mapCanvas(page).locator('canvas').focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await mapState(page)).center[0], { timeout: 10_000 })
      .toBeGreaterThan(before.center[0]);
  });

  test('con prefers-reduced-motion el encuadre es inmediato (sin vuelo animado)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMap(page, EXPLORE);
    const before = (await mapState(page)).zoom;
    await page.getByRole('button', { name: /^Ver en el mapa: Casco Antiguo$/ }).click();
    // Un vuelo animado tarda ≈1,6 s; sin animación el zoom final llega casi de inmediato.
    await expect
      .poll(async () => (await mapState(page)).zoom, { timeout: 1200, intervals: [100] })
      .toBeGreaterThan(before + 5);
  });

  test('el lienzo es alcanzable y describe su uso', async ({ page }) => {
    await openMap(page, EXPLORE);
    const canvas = mapCanvas(page).locator('canvas');
    await expect(canvas).toHaveAttribute('aria-describedby', 'map-keyboard-help');
    await expect(page.locator('#map-keyboard-help')).toContainText('flechas');
    await expect(canvas).toHaveAttribute('aria-label', 'Mapa');
  });
});

test.describe('mapa: accesibilidad con el mapa listo', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
  for (const [locale, scheme] of [
    ['es', 'light'],
    ['de', 'dark'],
    ['fr', 'light'],
  ] as const) {
    test(`axe WCAG 2.2 AA con el mapa dibujado y un destino seleccionado (${locale}, ${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openMap(page, `${PATHS.explore[locale]}?d=casco-antiguo`);
      await expect(page.locator('button[data-destination]').first()).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(
        results.violations.map(
          (v) =>
            `${v.id} [${v.impact ?? '?'}] ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join(' | ')}`,
        ),
      ).toEqual([]);
    });
  }
});
