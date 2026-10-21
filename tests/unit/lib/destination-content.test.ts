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
