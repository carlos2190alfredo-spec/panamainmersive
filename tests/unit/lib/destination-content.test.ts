import { describe, expect, it, vi } from 'vitest';
import type { TranslationStatus } from '@/domains/editorial/publication';
import { LOCALES, type Locale } from '@/i18n/locales';
import { destinationSeo } from '@/lib/destination-content';
import { buildSitemap } from '@/lib/sitemap';
import { TODAY, assertion, original, translation } from '../domains/content/fixtures';

const EMPTY = { assertions: [], notices: [] };

describe('SEO de la ficha según el contenido publicado', () => {
  it('sin contenido: ningún idioma tiene los campos mínimos y el estado es el más débil', () => {
    const seo = destinationSeo(EMPTY, 'locality', TODAY);
    for (const l of LOCALES) {
      expect(seo.hasRequiredFields(l), l).toBe(false);
      expect(seo.statusFor(l), l).toBe('draft');
    }
    expect(seo.sensitivity).toBe('general');
  });

  it('con un resumen verificado en español: solo español tiene los campos mínimos; los demás caen al original y no cuentan', () => {
    const seo = destinationSeo({ assertions: [assertion()], notices: [] }, 'locality', TODAY);
    expect(LOCALES.filter((l) => seo.hasRequiredFields(l))).toEqual(['es']);
  });

  it('una traducción humana publicada habilita ese idioma', () => {
    const seo = destinationSeo(
      { assertions: [assertion({ texts: [original(), translation()] })], notices: [] },
      'locality',
      TODAY,
    );
    expect(LOCALES.filter((l) => seo.hasRequiredFields(l))).toEqual(['es', 'en']);
  });

  it('aunque el contenido esté publicado, la interfaz sin revisar (hoy) impide la publicación: gana el estado más débil', () => {
    const seo = destinationSeo({ assertions: [assertion()], notices: [] }, 'locality', TODAY);
    // es: contenido `published` pero interfaz `draft` → draft; en: contenido `draft` e interfaz automática → draft
    expect(seo.statusFor('es')).toBe('draft');
    expect(seo.statusFor('en')).toBe('draft');
  });

  it('la sensibilidad de la página es la de lo más delicado que muestra en cualquier idioma', () => {
    const safety = assertion({
      id: '9f5a1e74-3c6d-4b8a-8d43-6e1c2a7b9f32',
      fieldKey: 'safety.hazards',
      validUntil: '2026-12-01',
    });
    const seo = destinationSeo(
      { assertions: [assertion(), safety], notices: [] },
      'locality',
      TODAY,
    );
    expect(seo.sensitivity).toBe('safety');
  });

  it('un resumen vencido por fecha deja la página sin campos mínimos', () => {
    const stale = assertion({ fieldKey: 'overview.summary', validUntil: '2026-01-01' });
    // `overview.summary` no caduca por registro: una vigencia declarada se respeta igualmente
    const seo = destinationSeo({ assertions: [stale], notices: [] }, 'locality', TODAY);
    expect(seo.hasRequiredFields('es')).toBe(false);
  });
});

describe('sitemap con campos mínimos por idioma y sensibilidad', () => {
  const urlFor = (l: Locale, href: string) => `https://example.org/${l}${href}`;
  const published = (l: Locale): TranslationStatus =>
    l === 'es' || l === 'en' ? 'published' : 'machine_translated';

  it('solo entran los idiomas con campos mínimos Y publicables', () => {
    const out = buildSitemap({
      siteEnv: 'production',
      routes: [{ hrefFor: () => '/d', hasRequiredFields: (l) => l === 'es', statusFor: published }],
      urlFor,
      rootUrl: 'https://example.org/',
    });
    expect(out.map((e) => e.url)).toEqual(['https://example.org/es/d']);
  });

  it('la sensibilidad de la ruta llega a la decisión de indexar: con una política que permitiera lo automático general, lo sensible seguiría exigiendo revisión humana', async () => {
    vi.resetModules();
    vi.doMock('@/domains/editorial/ui-status', () => ({
      SITE_PUBLICATION_POLICY: { indexReviewed: false, allowMachineTranslatedGeneral: true },
      UI_TRANSLATION_STATUS: {},
    }));
    try {
      const { buildSitemap: build } = await import('@/lib/sitemap');
      const route = (sensitivity: 'general' | 'safety') => ({
        hrefFor: () => '/d',
        hasRequiredFields: true,
        statusFor: (): TranslationStatus => 'machine_translated',
        sensitivity,
      });
      const args = { siteEnv: 'production', urlFor, rootUrl: 'https://example.org/' } as const;
      expect(build({ ...args, routes: [route('general')] }).length).toBe(5);
      expect(build({ ...args, routes: [route('safety')] })).toEqual([]);
    } finally {
      vi.doUnmock('@/domains/editorial/ui-status');
      vi.resetModules();
    }
  });

  it('con la política real, una página sensible o general con traducción automática no se indexa; publicada, sí', () => {
    const args = { siteEnv: 'production', urlFor, rootUrl: 'https://example.org/' } as const;
    for (const sensitivity of ['general', 'safety'] as const) {
      const route = (status: TranslationStatus) => ({
        hrefFor: () => '/d',
        hasRequiredFields: true,
        statusFor: (): TranslationStatus => status,
        sensitivity,
      });
      expect(buildSitemap({ ...args, routes: [route('machine_translated')] })).toEqual([]);
      expect(buildSitemap({ ...args, routes: [route('published')] }).length).toBe(5);
    }
  });
});

/**
 * El camino POSITIVO. Con el estado real de la interfaz (español en borrador, el resto automático) nada puede ser
 * publicable, así que todas las pruebas de arriba solo afirman «no indexable»: un `statusFor: () => 'draft'` las
 * dejaba verdes. Aquí se simula que la interfaz ya se revisó, para probar que el estado SÍ llega a `published` y que
 * manda el más débil entre la interfaz y el contenido.
 */
describe('SEO de la ficha: el camino positivo (con la interfaz simulada como revisada)', () => {
  async function seoWith(
    ui: Record<Locale, TranslationStatus>,
    content: Parameters<typeof destinationSeo>[0],
  ) {
    vi.resetModules();
    vi.doMock('@/domains/editorial/ui-status', () => ({
      UI_TRANSLATION_STATUS: ui,
      SITE_PUBLICATION_POLICY: { indexReviewed: false, allowMachineTranslatedGeneral: false },
    }));
    try {
      const mod = await import('@/lib/destination-content');
      return mod.destinationSeo(content, 'locality', TODAY);
    } finally {
      vi.doUnmock('@/domains/editorial/ui-status');
      vi.resetModules();
    }
  }
  const everywhere = (status: TranslationStatus): Record<Locale, TranslationStatus> => ({
    es: status,
    en: status,
    pt: status,
    fr: status,
    de: status,
  });
  const translated = (...locales: Locale[]) =>
    assertion({
      texts: [original(), ...locales.map((l) => translation({ locale: l, text: `[test] ${l}` }))],
    });

  it('contenido publicado + interfaz publicada = publicada, solo en los idiomas donde el resumen existe', async () => {
    const seo = await seoWith(everywhere('published'), {
      assertions: [translated('en')],
      notices: [],
    });
    expect(LOCALES.map((l) => [l, seo.statusFor(l)])).toEqual([
      ['es', 'published'],
      ['en', 'published'],
      ['pt', 'draft'], // sin traducción al portugués: el contenido de esa página no está publicado
      ['fr', 'draft'],
      ['de', 'draft'],
    ]);
    expect(LOCALES.filter((l) => seo.hasRequiredFields(l))).toEqual(['es', 'en']);
  });

  it('manda el MÁS DÉBIL de la interfaz y el contenido, en cada idioma', async () => {
    const seo = await seoWith(
      { es: 'published', en: 'reviewed', pt: 'machine_translated', fr: 'draft', de: 'outdated' },
      { assertions: [translated('en', 'pt', 'fr', 'de')], notices: [] },
    );
    expect(LOCALES.map((l) => [l, seo.statusFor(l)])).toEqual([
      ['es', 'published'],
      ['en', 'reviewed'],
      ['pt', 'machine_translated'],
      ['fr', 'draft'],
      ['de', 'outdated'],
    ]);
  });

  it('una interfaz publicada no publica una página sin contenido verificado', async () => {
    const seo = await seoWith(everywhere('published'), { assertions: [], notices: [] });
    for (const l of LOCALES) expect(seo.statusFor(l), l).toBe('draft');
  });
});

describe('indexingOf: lo que la ficha y el sitemap reciben', () => {
  it('son exactamente los tres campos que deciden la indexación, los mismos de destinationSeo', async () => {
    const { indexingOf } = await import('@/lib/destination-content');
    const seo = destinationSeo({ assertions: [assertion()], notices: [] }, 'locality', TODAY);
    const indexing = indexingOf(seo);
    expect(Object.keys(indexing).sort()).toEqual(['hasRequiredFields', 'sensitivity', 'statusFor']);
    expect(indexing.hasRequiredFields).toBe(seo.hasRequiredFields);
    expect(indexing.statusFor).toBe(seo.statusFor);
    expect(indexing.sensitivity).toBe(seo.sensitivity);
  });
});
