import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssertionRecord } from '@/domains/content/assertion';
import type { TranslationStatus } from '@/domains/editorial/publication';
import { DESTINATIONS, destinationSlug, type DestinationKey } from '@/domains/tourism/destinations';
import { LOCALES, type Locale } from '@/i18n/locales';
import { assertion, original, translation } from '../domains/content/fixtures';

/**
 * El sitemap REAL (`src/app/sitemap.ts`): qué fichas de destino entran y en qué idiomas. Hasta ahora ninguna prueba lo
 * importaba: `buildSitemap` y `destinationSeo` se probaban por separado, y cambiar en `sitemap.ts` los campos mínimos,
 * el estado, la sensibilidad, el destino del contenido o la fecha de «hoy» dejaba la suite entera en verde.
 * La interfaz se simula como ya revisada porque, con el estado real, nada es publicable y todo test sería «vacío».
 */
type Content = Partial<Record<DestinationKey, readonly AssertionRecord[]>>;
const state = {
  today: '2026-10-21',
  content: {} as Content,
  ui: {} as Record<Locale, TranslationStatus>,
  allowMachineGeneral: false,
};

async function sitemapUrls(): Promise<string[]> {
  vi.resetModules();
  vi.doMock('@/config/env', () => ({
    getEnv: () => ({ SITE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://example.org' }),
  }));
  vi.doMock('@/domains/editorial/ui-status', () => ({
    UI_TRANSLATION_STATUS: state.ui,
    SITE_PUBLICATION_POLICY: {
      indexReviewed: false,
      allowMachineTranslatedGeneral: state.allowMachineGeneral,
    },
  }));
  vi.doMock('@/lib/content-snapshot', () => ({
    contentFor: (key: DestinationKey) => ({ assertions: state.content[key] ?? [], notices: [] }),
  }));
  vi.doMock('@/lib/today', () => ({ getTodayIsoDate: () => state.today }));
  // `next-intl/navigation` no se resuelve fuera de Next: la forma de la URL no es lo que se prueba aquí.
  vi.doMock('@/i18n/navigation', () => ({
    getPathname: ({
      locale,
      href,
    }: {
      locale: string;
      href: string | { pathname: string; params: { slug: string } };
    }) =>
      typeof href === 'string'
        ? `/${locale}${href === '/' ? '' : href}`
        : `/${locale}${href.pathname.replace('[slug]', href.params.slug)}`,
  }));
  const { default: sitemap } = await import('@/app/sitemap');
  return sitemap().map((entry) => entry.url);
}

/** URLs de FICHAS (no de las páginas estáticas) de un destino, por idioma. */
const fichaUrl = (key: DestinationKey, locale: Locale): RegExp => {
  const d = DESTINATIONS.find((x) => x.key === key);
  if (!d) throw new Error(key);
  return new RegExp(`^https://example\\.org/${locale}/[^/]+/${destinationSlug(d, locale)}$`);
};
const fichasIn = (urls: string[], key: DestinationKey) =>
  LOCALES.filter((l) => urls.some((u) => fichaUrl(key, l).test(u)));
const allFichas = (urls: string[]) =>
  DESTINATIONS.map((d) => [d.key, fichasIn(urls, d.key)] as const).filter(([, l]) => l.length > 0);

const everywhere = (status: TranslationStatus) =>
  Object.fromEntries(LOCALES.map((l) => [l, status])) as Record<Locale, TranslationStatus>;
const withTranslations = (over: Partial<AssertionRecord>, ...locales: Locale[]) =>
  assertion({
    ...over,
    texts: [original(), ...locales.map((l) => translation({ locale: l, text: `[test] ${l}` }))],
  });

beforeEach(() => {
  state.today = '2026-10-21';
  state.content = {};
  state.ui = everywhere('published');
  state.allowMachineGeneral = false;
});
afterEach(() => {
  for (const m of [
    '@/config/env',
    '@/domains/editorial/ui-status',
    '@/lib/content-snapshot',
    '@/lib/today',
    '@/i18n/navigation',
  ])
    vi.doUnmock(m);
  vi.resetModules();
});

describe('sitemap: fichas de destino', () => {
  it('sin contenido verificado no entra ninguna ficha (aunque la interfaz esté publicada)', async () => {
    expect(allFichas(await sitemapUrls())).toEqual([]);
  });

  it('entra cada destino solo en los idiomas donde su resumen existe, y solo el suyo (no el contenido de otro)', async () => {
    state.content = { boquete: [withTranslations({}, 'en')] };
    const urls = await sitemapUrls();
    expect(allFichas(urls)).toEqual([['boquete', ['es', 'en']]]);
  });

  it('cada destino usa SU contenido: dos destinos con contenido distinto salen distintos', async () => {
    state.content = {
      boquete: [withTranslations({}, 'en')],
      'volcan-baru': [
        withTranslations(
          { id: 'a06b2f85-4d7e-4c9b-9e54-7f2d3b8caf43', destinationKey: 'volcan-baru' },
          'en',
          'de',
        ),
      ],
    };
    expect(allFichas(await sitemapUrls())).toEqual([
      ['boquete', ['es', 'en']],
      ['volcan-baru', ['es', 'en', 'de']],
    ]);
  });

  it('manda el estado de la página: con la interfaz del español sin publicar, el español sale aunque su resumen exista', async () => {
    state.ui = { ...everywhere('published'), es: 'reviewed' };
    state.content = { boquete: [withTranslations({}, 'en')] };
    expect(allFichas(await sitemapUrls())).toEqual([['boquete', ['en']]]);
  });

  it('manda la sensibilidad: con traducción automática permitida para lo general, lo sensible sigue exigiendo revisión humana', async () => {
    state.allowMachineGeneral = true;
    state.ui = { ...everywhere('machine_translated'), es: 'published' };
    state.content = {
      boquete: [withTranslations({}, 'en')],
      'volcan-baru': [
        withTranslations(
          { id: 'a06b2f85-4d7e-4c9b-9e54-7f2d3b8caf43', destinationKey: 'volcan-baru' },
          'en',
        ),
        withTranslations(
          {
            id: 'b17c3a96-5e8f-4dab-8f65-8a3e4c9dbf54',
            destinationKey: 'volcan-baru',
            fieldKey: 'safety.hazards',
            validUntil: '2026-12-01',
          },
          'en',
        ),
      ],
    };
    // Boquete (solo lo general): el inglés automático se indexa. Volcán Barú muestra un riesgo (seguridad): no.
    expect(allFichas(await sitemapUrls())).toEqual([
      ['boquete', ['es', 'en']],
      ['volcan-baru', ['es']],
    ]);
  });

  it('la caducidad se evalúa con el día de HOY en cada ejecución, no el del build', async () => {
    state.content = { boquete: [withTranslations({ validUntil: '2027-01-31' })] };
    state.today = '2027-01-31'; // el último día de vigencia todavía vale
    expect(allFichas(await sitemapUrls())).toEqual([['boquete', ['es']]]);
    state.today = '2027-02-01';
    expect(allFichas(await sitemapUrls())).toEqual([]);
  });
});

describe('sitemap: regeneración', () => {
  it('declara revalidate (un literal: Next lo analiza estáticamente) igual al de la ficha', async () => {
    const [sitemapSource, pageSource] = await Promise.all([
      import('node:fs').then((fs) => fs.readFileSync('src/app/sitemap.ts', 'utf8')),
      import('node:fs').then((fs) =>
        fs.readFileSync('src/app/[locale]/destinations/[slug]/page.tsx', 'utf8'),
      ),
    ]);
    const literal = (src: string) => /export const revalidate = (\d+);/.exec(src)?.[1];
    expect(literal(sitemapSource)).toBe('3600');
    expect(literal(pageSource)).toBe('3600');
  });
});
