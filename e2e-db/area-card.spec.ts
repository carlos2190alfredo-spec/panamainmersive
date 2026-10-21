import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PATHS, watchPage } from '../e2e/helpers';
import { mapCanvas, mapState, openMap } from '../e2e/map-helpers';
import { formatNumber, formatPanamaDateTime } from '../src/i18n/format';

/**
 * Ficha de un área con datos REALES: Next (build de producción) → API espacial → PostgreSQL+PostGIS temporal con
 * las áreas protegidas de Overture importadas y publicadas. Las orquesta `scripts/e2e-db.ts`.
 * Una de las áreas se DESPUBLICÓ a propósito (`E2E_UNPUBLISHED_OVID`) para comprobar la RLS de punta a punta.
 */
const PUBLISHED = {
  ovid: process.env.E2E_PUBLISHED_OVID ?? '',
  name: process.env.E2E_PUBLISHED_NAME ?? '',
};
const UNPUBLISHED = process.env.E2E_UNPUBLISHED_OVID ?? '';
const EXPLORE = PATHS.explore.es;
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const AREA_PARAM = /[?&]a=([0-9a-f-]{36})(&|$)/;

test.skip(
  !PUBLISHED.ovid || !UNPUBLISHED,
  'Falta el entorno: ejecuta `pnpm test:e2e:db` (lo prepara scripts/e2e-db.ts).',
);

const card = (page: Page) => page.locator('[data-area-status]');
const heading = (page: Page) => page.locator('#selected-area-name');
const selectedId = (page: Page) => AREA_PARAM.exec(page.url())?.[1] ?? null;

interface Detail {
  properties: {
    name: { value: string } | null;
    area: { squareMeters: number; method: string } | null;
    geometryVersion: number;
    sourceRef: string;
  };
  sources: {
    ref: string;
    versionLabel: string;
    retrievedAt: string;
    license: { name: string; url: string | null };
    institution: string;
  }[];
}

async function apiDetail(page: Page, ovid: string, locale = 'es'): Promise<Detail> {
  const response = await page.request.get(
    `/api/spatial/areas/by-overture/${ovid}?locale=${locale}&zoom=6`,
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as Detail;
}

test.describe('ficha de un área con datos reales de PostGIS', () => {
  test('un clic en el mapa abre una ficha que coincide con la API: superficie con método, fuente, licencia y derechos', async ({
    page,
  }) => {
    const watch = watchPage(page);
    await openMap(page, `${EXPLORE}?d=coiba`);
    await expect
      .poll(
        () =>
          page
            .getByRole('region', { name: 'Áreas protegidas en esta vista' })
            .getByRole('button')
            .count(),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
    const box = await mapCanvas(page).boundingBox();
    if (!box) throw new Error('El lienzo no tiene caja');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
    await expect.poll(() => selectedId(page), { timeout: 10_000 }).not.toBeNull();
    await expect(card(page)).toHaveAttribute('data-area-status', 'ready', { timeout: 30_000 });

    const id = selectedId(page) ?? '';
    const api = await apiDetail(page, id);
    const source = api.sources.find((s) => s.ref === api.properties.sourceRef);
    expect(source).toBeDefined();
    expect(api.properties.area?.method).toBe('ST_Area(geography, EPSG:4326)');

    await expect(heading(page)).toHaveText(api.properties.name?.value ?? '');
    await expect(card(page).getByText('Área protegida', { exact: true })).toBeVisible();
    await expect(
      card(page).getByText('Geometría derivada de OpenStreetMap (no oficial)'),
    ).toBeVisible();
    await expect(card(page).getByText('Nombre local de la fuente, sin traducir.')).toBeVisible();

    // La superficie es la del ORIGINAL, calculada con geography, y se muestra con su método
    const hectares = (api.properties.area?.squareMeters ?? 0) / 10_000;
    expect(hectares).toBeGreaterThan(0);
    await expect(card(page)).toContainText(
      formatNumber('es', hectares, {
        style: 'unit',
        unit: 'hectare',
        maximumFractionDigits: hectares < 100 ? 1 : 0,
      }),
    );
    await expect(card(page)).toContainText(
      'Calculada sobre la geometría original con ST_Area(geography, EPSG:4326).',
    );
    await expect(card(page)).toContainText(
      `Versión de la geometría: ${api.properties.geometryVersion}`,
    );

    // Fuente, versión, fecha, licencia (con enlace seguro) y estado de derechos
    await expect(card(page)).toContainText(
      `${source?.institution ?? ''} · versión ${source?.versionLabel ?? ''} · obtenida el ${formatPanamaDateTime('es', new Date(source?.retrievedAt ?? ''), { dateStyle: 'long' })}`,
    );
    await expect(card(page)).toContainText(`Licencia: ${source?.license.name ?? ''}`);
    const link = card(page).getByRole('link', { name: 'Texto de la licencia' });
    await expect(link).toHaveAttribute('href', /^https:\/\//);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(card(page)).toContainText(
      'Derechos: provisionales (aún no leídos en la fuente primaria).',
    );
    // Y SIGUE diciendo lo que no hay
    await expect(card(page)).toContainText(
      'No hay datos verificados de actividades, restricciones de acceso ni cómo llegar para esta área.',
    );
    await expect(card(page)).not.toContainText('La ficha ampliada no está disponible');

    // La carga diferida del componente y del validador no rompe la CSP (nada de `eval`)
    expect(await watch.violations()).toEqual([]);
    expect(watch.errors).toEqual([]);
  });

  test('un enlace profundo toma el título de la BD (pasa de neutro al nombre real) y «Mostrar el área» encuadra', async ({
    page,
  }) => {
    await openMap(page, `${EXPLORE}?a=${PUBLISHED.ovid}`);
    await expect(card(page)).toHaveAttribute('data-area-status', 'ready', { timeout: 30_000 });
    await expect(heading(page)).toHaveText(PUBLISHED.name);

    const before = await mapState(page);
    await page.getByRole('button', { name: 'Mostrar el área en el mapa' }).click();
    await expect
      .poll(
        async () => {
          const now = await mapState(page);
          return (
            Math.abs(now.zoom - before.zoom) > 0.4 ||
            Math.abs(now.center[0] - before.center[0]) > 0.05
          );
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    await expect(page).toHaveURL(/[?&]c=/); // la cámara nueva queda en la URL
    expect(selectedId(page)).toBe(PUBLISHED.ovid); // y la selección se conserva
  });

  test('un área DESPUBLICADA no tiene ficha: la RLS la oculta de punta a punta (igual que lo inexistente)', async ({
    page,
  }) => {
    await openMap(page, `${EXPLORE}?a=${UNPUBLISHED}`);
    await expect(card(page)).toHaveAttribute('data-area-status', 'notFound', { timeout: 30_000 });
    await expect(page.getByText('Esta área no tiene ficha publicada.')).toBeVisible();
    await expect(page.getByText(/^Superficie$/)).toHaveCount(0);
    await expect(page.getByText(/Licencia:/)).toHaveCount(0);

    const direct = await page.request.get(`/api/spatial/areas/by-overture/${UNPUBLISHED}`);
    expect(direct.status()).toBe(404);
    expect(await direct.json()).toEqual({ error: { code: 'not_found' } });
    const inexistent = await page.request.get(
      '/api/spatial/areas/by-overture/00000000-0000-4000-8000-000000000000',
    );
    expect(inexistent.status()).toBe(404);
    expect(await inexistent.json()).toEqual({ error: { code: 'not_found' } });
  });

  test('la API por HTTP real: solo lo publicado, con procedencia y derechos, y ETag/304', async ({
    request,
  }) => {
    const url = '/api/spatial/areas?bbox=-83.2,6.9,-77,9.8&zoom=6&layers=protected_areas&limit=200';
    const response = await request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/geo+json');
    const body = (await response.json()) as {
      features: {
        properties: {
          overtureId: string | null;
          sourceClass: string;
          area: { method: string } | null;
        };
      }[];
      sources: { key: string; rightsStatus: string }[];
    };
    expect(body.features.length).toBeGreaterThan(20);
    const ids = body.features.map((f) => f.properties.overtureId);
    expect(ids).not.toContain(UNPUBLISHED); // despublicada: nunca sale
    expect(body.features.every((f) => f.properties.sourceClass === 'osm_derived')).toBe(true); // jamás «oficial»
    expect(
      body.features.every((f) => f.properties.area?.method === 'ST_Area(geography, EPSG:4326)'),
    ).toBe(true);
    expect(body.sources.map((s) => s.key)).toEqual(['overture']);
    expect(body.sources[0]?.rightsStatus).toBe('provisional');

    const etag = response.headers().etag ?? '';
    expect(etag).toMatch(/^W\/"[0-9a-f]{32}"$/);
    const again = await request.get(url, { headers: { 'if-none-match': etag } });
    expect(again.status()).toBe(304);
  });

  test('la ficha se traduce (inglés) con los mismos datos', async ({ page }) => {
    await openMap(page, `${PATHS.explore.en}?a=${PUBLISHED.ovid}`);
    await expect(card(page)).toHaveAttribute('data-area-status', 'ready', { timeout: 30_000 });
    await expect(card(page)).toContainText(
      'Calculated on the original geometry with ST_Area(geography, EPSG:4326).',
    );
    await expect(card(page)).toContainText(
      'Rights: provisional (not yet read at the primary source).',
    );
    await expect(card(page)).toContainText('Geometry derived from OpenStreetMap (not official)');
    await expect(card(page).getByRole('link', { name: 'License text' })).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`accesibilidad (axe, WCAG 2.2 AA) con la ficha completa, tema ${scheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openMap(page, `${EXPLORE}?a=${PUBLISHED.ovid}`);
      await expect(card(page)).toHaveAttribute('data-area-status', 'ready', { timeout: 30_000 });
      await expect(card(page).getByRole('link', { name: 'Texto de la licencia' })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
        ),
      ).toEqual([]);
    });
  }
});
