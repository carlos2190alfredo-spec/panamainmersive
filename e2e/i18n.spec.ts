import { expect, test } from '@playwright/test';
import { HTML_LANG, LOCALES, PATHS } from './helpers';

test.describe('idiomas y rutas', () => {
  for (const locale of LOCALES) {
    test(`home en ${locale}: lang correcto, h1 y título`, async ({ page }) => {
      const res = await page.goto(PATHS.home[locale]);
      expect(res?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', HTML_LANG[locale]);
      await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
      await expect(page).toHaveTitle(/Panamá Immersive/);
    });

    test(`rutas localizadas responden 200 en ${locale}`, async ({ request }) => {
      for (const name of ['explore', 'destinations', 'sources', 'accessibility'] as const) {
        const res = await request.get(PATHS[name][locale]);
        expect(res.status(), `${locale} ${name}`).toBe(200);
      }
    });

    test(`404 localizado en ${locale}`, async ({ page }) => {
      const res = await page.goto(PATHS.notFound[locale]);
      expect(res?.status()).toBe(404);
      await expect(page.locator('html')).toHaveAttribute('lang', HTML_LANG[locale]);
      await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
      // noindex en los 404: puede haber más de una etiqueta (la del sitio y la que inyecta Next);
      // todas deben ser restrictivas.
      const robots = await page.locator('meta[name="robots"]').evaluateAll((els) => els.map((e) => e.getAttribute('content') ?? ''));
      expect(robots.length).toBeGreaterThan(0);
      for (const r of robots) expect(r).toMatch(/noindex/);
    });
  }

  test('la ruta interna redirige a la localizada (una sola URL pública por página)', async ({ request }) => {
    const res = await request.get('/es/explore', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toMatch(/\/es\/explorar$/);
  });

  test('negociación en «/»: cookie > Accept-Language > español; nunca geolocalización', async ({ playwright, baseURL }) => {
    // Un contexto NUEVO por petición: el `request` de Playwright conserva cookies entre llamadas y la
    // primera redirección fija NEXT_LOCALE, lo que ya demuestra que la cookie gana al Accept-Language.
    const go = async (headers: Record<string, string>) => {
      const ctx = await playwright.request.newContext({ baseURL: baseURL ?? '' });
      try {
        return (await ctx.get('/', { headers, maxRedirects: 0 })).headers()['location'];
      } finally {
        await ctx.dispose();
      }
    };
    expect(await go({})).toMatch(/\/es$/);
    expect(await go({ 'Accept-Language': 'de-DE,de;q=0.9' })).toMatch(/\/de$/);
    expect(await go({ 'Accept-Language': 'zh-CN' })).toMatch(/\/es$/); // idioma no soportado → es
    expect(await go({ 'Accept-Language': 'de', Cookie: 'NEXT_LOCALE=pt' })).toMatch(/\/pt$/);
  });

  test('una cookie fijada por una visita anterior se respeta en la siguiente', async ({ request }) => {
    const first = await request.get('/', { headers: { 'Accept-Language': 'fr' }, maxRedirects: 0 });
    expect(first.headers()['location']).toMatch(/\/fr$/);
    await request.get('/fr'); // la visita fija NEXT_LOCALE=fr
    const second = await request.get('/', { headers: { 'Accept-Language': 'de' }, maxRedirects: 0 });
    expect(second.headers()['location']).toMatch(/\/fr$/); // gana la cookie, no el navegador
  });

  test('la URL explícita manda sobre la cookie y el Accept-Language', async ({ request }) => {
    const res = await request.get('/fr', {
      headers: { 'Accept-Language': 'de', Cookie: 'NEXT_LOCALE=pt' },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(200);
  });

  test.describe('prefijo de idioma desconocido', () => {
    test.use({ locale: 'es-ES' });
    test('no se asume ningún idioma: se trata como ruta sin prefijo y acaba en 404 localizado', async ({ page }) => {
      const res = await page.goto('/xx/foo');
      expect(res?.status()).toBe(404);
      expect(page.url()).toMatch(/\/es\/xx\/foo$/); // el navegador pide español
    });
  });
});

test.describe('slugs de destino', () => {
  test('slug actual → 200', async ({ request }) => {
    expect((await request.get('/en/destinations/panama-city')).status()).toBe(200);
    expect((await request.get('/de/reiseziele/panamakanal')).status()).toBe(200);
  });

  test('slug de otro idioma → 308 al canónico del idioma de la URL', async ({ request }) => {
    const a = await request.get('/en/destinations/ciudad-de-panama', { maxRedirects: 0 });
    expect(a.status()).toBe(308);
    expect(a.headers()['location']).toMatch(/\/en\/destinations\/panama-city$/);

    const b = await request.get('/de/reiseziele/panama-canal', { maxRedirects: 0 });
    expect(b.status()).toBe(308);
    expect(b.headers()['location']).toMatch(/\/de\/reiseziele\/panamakanal$/);
  });

  test('slug desconocido → 404; «Barú» no es «Volcán Barú»', async ({ request }) => {
    expect((await request.get('/es/destinos/no-existe')).status()).toBe(404);
    expect((await request.get('/es/destinos/baru')).status()).toBe(404);
  });
});

test.describe('cambiar de idioma conserva el contexto', () => {
  test('ficha de destino + query → misma entidad en otro idioma, con su slug y su query', async ({ page }) => {
    await page.goto('/en/destinations/panama-city?d=panama-city&layers=admin&cam=-79.5,8.98,9');
    await page.getByRole('group').first().waitFor({ state: 'attached' }).catch(() => undefined);
    await page.locator('summary').first().click();
    await page.getByRole('link', { name: 'Deutsch' }).click();
    await expect(page).toHaveURL(/\/de\/reiseziele\/panama-stadt\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get('d')).toBe('panama-city');
    expect(url.searchParams.get('layers')).toBe('admin');
    expect(url.searchParams.get('cam')).toBe('-79.5,8.98,9');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Panama-Stadt');
  });

  test('la página es la misma entidad en los cinco idiomas', async ({ page }) => {
    const slugs = { es: 'ciudad-de-panama', en: 'panama-city', pt: 'cidade-do-panama', fr: 'ville-de-panama', de: 'panama-stadt' } as const;
    await page.goto('/es/destinos/ciudad-de-panama');
    for (const next of ['en', 'pt', 'fr', 'de', 'es'] as const) {
      await page.locator('summary').first().click();
      await page.locator(`a[hreflang="${next}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/${next}/[^/]+/${slugs[next]}$`));
    }
  });

  test('si el destino no se puede resolver no se inventa un slug: se vuelve al índice', async ({ page }) => {
    // `casco-antiguo` es válido en todos los idiomas; con un slug inválido el selector no debe fabricar uno.
    await page.goto('/es/destinos');
    await page.locator('summary').first().click();
    await page.locator('a[hreflang="fr"]').click();
    await expect(page).toHaveURL(/\/fr\/destinations$/);
  });

  test('el selector muestra nombres de idioma, no banderas, y marca el actual', async ({ page }) => {
    await page.goto('/pt/explorar');
    await page.locator('summary').first().click();
    const links = page.locator('a[hreflang]');
    await expect(links).toHaveCount(5);
    await expect(links).toHaveText(['Español', 'English', 'Português', 'Français', 'Deutsch']);
    await expect(page.locator('a[hreflang="pt"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('a[hreflang="es"]')).toHaveAttribute('lang', 'es');
  });
});

test.describe('SEO (fuera de producción todo es noindex)', () => {
  test('noindex en meta, en cabecera X-Robots-Tag y en robots.txt', async ({ page, request }) => {
    const res = await page.goto(PATHS.explore.en);
    expect(res?.headers()['x-robots-tag']).toMatch(/noindex/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toMatch(/Disallow: \//);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).not.toMatch(/<loc>/);
  });

  test('canonical propio por idioma (nunca todo a español)', async ({ page }) => {
    for (const locale of ['es', 'en', 'de'] as const) {
      await page.goto(PATHS.explore[locale]);
      const href = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(href).toContain(PATHS.explore[locale]);
    }
  });

  test('sin hreflang mientras ninguna variante esté publicada (no se indexan traducciones pendientes)', async ({ page }) => {
    await page.goto(PATHS.home.en);
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  });
});
