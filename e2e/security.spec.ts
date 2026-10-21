import { expect, test } from '@playwright/test';
import { LOCALES, PAGE_NAMES, PATHS, watchPage } from './helpers';
import { MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON } from './map-helpers';

test.describe('cabeceras de seguridad (ADR-0010)', () => {
  test('toda respuesta lleva CSP estricta y cabeceras de endurecimiento', async ({ request }) => {
    const res = await request.get(PATHS.home.es);
    const h = res.headers();
    const csp = h['content-security-policy'] ?? '';
    expect(csp).toMatch(/default-src 'self'/);
    // ADR-0010: directiva EXACTA. Ampliarla (p. ej. 'unsafe-eval' o un origen externo) o endurecerla
    // sin comprobar la hidratación debe hacer fallar esta prueba.
    expect(/script-src ([^;]*)/.exec(csp)?.[1]).toBe("'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/'unsafe-eval'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/worker-src 'self' blob:/);
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toMatch(/geolocation=\(self\)/);
    expect(h['permissions-policy']).toMatch(/camera=\(\)/);
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
    expect(h['x-powered-by']).toBeUndefined();
  });

  test('el origen de terreno es el único externo permitido para conectar', async ({ request }) => {
    const csp = (await request.get(PATHS.home.es)).headers()['content-security-policy'] ?? '';
    const connect = /connect-src ([^;]*)/.exec(csp)?.[1] ?? '';
    expect(connect.split(' ')).toEqual(["'self'", 'https://elevation-tiles-prod.s3.amazonaws.com']);
  });
});

test.describe('CSP sin violaciones y con hidratación real', () => {
  for (const name of PAGE_NAMES) {
    test(`${name}: ninguna violación de CSP ni error de consola en los 5 idiomas`, async ({
      page,
    }) => {
      // En Explorar, sin el mapa base el navegador registra el 404 del PMTiles como error de consola.
      test.skip(name === 'explore' && !MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);
      const watch = watchPage(page, { expectNotFound: name === 'notFound' });
      for (const locale of LOCALES) {
        await page.goto(PATHS[name][locale]);
        await page.waitForLoadState('networkidle');
      }
      expect(await watch.violations()).toEqual([]);
      expect(watch.errors).toEqual([]);
    });
  }

  test('la hidratación funciona bajo CSP: Escape cierra el menú de idioma (requiere JS)', async ({
    page,
  }) => {
    const watch = watchPage(page);
    await page.goto(PATHS.explore.en);
    await page.waitForLoadState('networkidle');
    const details = page.locator('details').first();
    await page.locator('summary').first().click();
    await expect(details).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(details).not.toHaveAttribute('open', '');
    await expect(page.locator('summary').first()).toBeFocused();
    expect(await watch.violations()).toEqual([]);
  });

  test('los scripts externos solo se cargan del propio origen (ningún <script src> de terceros)', async ({
    page,
    baseURL,
  }) => {
    for (const locale of LOCALES) {
      await page.goto(PATHS.home[locale]);
      const srcs = await page
        .locator('script[src]')
        .evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src));
      expect(srcs.length).toBeGreaterThan(0);
      for (const src of srcs) expect(new URL(src).origin, src).toBe(new URL(baseURL ?? '').origin);
    }
  });
});
