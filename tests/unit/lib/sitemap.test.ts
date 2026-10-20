import { describe, expect, it } from 'vitest';
import type { TranslationStatus } from '@/domains/editorial/publication';
import type { Locale } from '@/i18n/locales';
import { buildSitemap, type SitemapRoute } from '@/lib/sitemap';

const urlFor = (l: Locale, href: string) => `https://example.org/${l}${href}`;
const rootUrl = 'https://example.org/';

const published =
  (...locales: Locale[]) =>
  (l: Locale): TranslationStatus =>
    locales.includes(l) ? 'published' : 'machine_translated';

const route = (over: Partial<SitemapRoute<string>> = {}): SitemapRoute<string> => ({
  hrefFor: () => '/explore',
  hasRequiredFields: true,
  ...over,
});

describe('sitemap solo con variantes publicadas', () => {
  it('con la política por defecto (interfaz borrador/automática) nada es indexable, ni en producción', () => {
    expect(buildSitemap({ siteEnv: 'production', routes: [route()], urlFor, rootUrl })).toEqual([]);
  });

  it('fuera de producción siempre está vacío, aunque todo esté publicado', () => {
    const all = published('es', 'en', 'pt', 'fr', 'de');
    for (const siteEnv of ['development', 'staging'] as const) {
      expect(
        buildSitemap({ siteEnv, routes: [route({ statusFor: all })], urlFor, rootUrl }),
      ).toEqual([]);
    }
  });

  it('solo aparecen los idiomas publicados, cada uno con alternates recíprocos y x-default en español', () => {
    const out = buildSitemap({
      siteEnv: 'production',
      routes: [route({ statusFor: published('es', 'de') })],
      urlFor,
      rootUrl,
    });
    expect(out.map((e) => e.url)).toEqual([
      'https://example.org/es/explore',
      'https://example.org/de/explore',
    ]);
    const expected = {
      es: 'https://example.org/es/explore',
      de: 'https://example.org/de/explore',
      'x-default': 'https://example.org/es/explore',
    };
    for (const e of out) expect(e.alternates?.languages).toEqual(expected);
  });

  it('un idioma pendiente (p. ej. pt) nunca figura en los alternates de los demás', () => {
    const out = buildSitemap({
      siteEnv: 'production',
      routes: [route({ statusFor: published('es', 'en') })],
      urlFor,
      rootUrl,
    });
    for (const e of out) expect(Object.keys(e.alternates?.languages ?? {})).not.toContain('pt');
  });

  it('la home usa la raíz que negocia idioma como x-default', () => {
    const out = buildSitemap({
      siteEnv: 'production',
      routes: [route({ hrefFor: () => '/', isHome: true, statusFor: published('es', 'en') })],
      urlFor,
      rootUrl,
    });
    expect(out[0]?.alternates?.languages?.['x-default']).toBe(rootUrl);
  });

  it('las páginas sin contenido mínimo no entran (no se indexan páginas vacías)', () => {
    const out = buildSitemap({
      siteEnv: 'production',
      routes: [route({ hasRequiredFields: false, statusFor: published('es', 'en') })],
      urlFor,
      rootUrl,
    });
    expect(out).toEqual([]);
  });

  it('sin variante en español publicada no se inventa x-default', () => {
    const out = buildSitemap({
      siteEnv: 'production',
      routes: [route({ statusFor: published('en', 'fr') })],
      urlFor,
      rootUrl,
    });
    expect(out).toHaveLength(2);
    expect(out[0]?.alternates?.languages).not.toHaveProperty('x-default');
  });

  it('una ruta con contenido sensible sin revisión humana no se publica aunque esté «traducida»', () => {
    // El contenido sensible solo puede salir si es `reviewed`/`published`: una traducción automática no.
    const out = buildSitemap({
      siteEnv: 'production',
      routes: [route({ statusFor: () => 'machine_translated' })],
      urlFor,
      rootUrl,
    });
    expect(out).toEqual([]);
  });
});
