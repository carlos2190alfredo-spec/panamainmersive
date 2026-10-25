import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Seo from '@/lib/seo';
import { SITE } from '@/config/site';
import { LOCALES, LOCALE_INFO, type Locale } from '@/i18n/locales';

/**
 * Metadatos sociales de TODAS las páginas (`pageMetadata`): imagen Open Graph ESTÁTICA de 1200×630 y Twitter
 * `summary_large_image`, con el texto alternativo LOCALIZADO (`Meta.og.alt`). La imagen no lleva texto horneado: sin un
 * `alt` en el idioma de la página, quien no ve la imagen no sabría qué es.
 */
vi.mock('@/config/env', () => ({
  getEnv: () => ({ SITE_ENV: 'staging', NEXT_PUBLIC_SITE_URL: 'https://example.org' }),
}));
// `next-intl/navigation` no se resuelve fuera de Next: la forma exacta de la ruta no es lo que se prueba aquí.
vi.mock('@/i18n/navigation', () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    `/${locale}${href === '/' ? '' : href}`,
}));

const messages = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf8')) as {
      Meta: { og: { alt: string } };
    },
  ]),
) as Record<Locale, { Meta: { og: { alt: string } } }>;

let seo: typeof Seo;
beforeAll(async () => {
  seo = await import('@/lib/seo');
});

const page = (locale: Locale) =>
  seo.pageMetadata({
    locale,
    title: 'Título',
    description: 'Descripción',
    hrefFor: () => '/',
    hasRequiredFields: true,
    isHome: true,
  });

describe('imagen social', () => {
  it('es un archivo REAL de public/ con las dimensiones declaradas', () => {
    expect(seo.OG_IMAGE).toEqual({
      path: '/brand/og-1200x630.jpg',
      width: 1200,
      height: 630,
      type: 'image/jpeg',
    });
    expect(existsSync(join(process.cwd(), 'public', seo.OG_IMAGE.path))).toBe(true);
  });

  it.each(LOCALES)(
    '«%s»: Open Graph lleva la imagen absoluta, con tamaño y alt localizado',
    (locale) => {
      const og = page(locale).openGraph;
      const image = (og && 'images' in og ? og.images : undefined) as
        { url: string; width: number; height: number; type: string; alt: string }[] | undefined;
      expect(image).toHaveLength(1);
      expect(image?.[0]).toEqual({
        url: 'https://example.org/brand/og-1200x630.jpg',
        width: 1200,
        height: 630,
        type: 'image/jpeg',
        alt: messages[locale].Meta.og.alt.replace('{siteName}', SITE.name),
      });
    },
  );

  it.each(LOCALES)(
    '«%s»: Twitter es summary_large_image con la MISMA imagen y su alt',
    (locale) => {
      const meta = page(locale);
      expect(meta.twitter).toMatchObject({
        card: 'summary_large_image',
        title: 'Título',
        description: 'Descripción',
      });
      const og = meta.openGraph as { images: { url: string; alt: string }[] };
      const tw = meta.twitter as {
        images: { url: string; alt: string; width: number; height: number }[];
      };
      expect(tw.images).toHaveLength(1);
      expect(tw.images[0]?.url).toBe(og.images[0]?.url);
      expect(tw.images[0]?.alt).toBe(og.images[0]?.alt);
      expect([tw.images[0]?.width, tw.images[0]?.height]).toEqual([1200, 630]);
    },
  );

  it('el alt cambia con el idioma, nombra el sitio y no deja marcadores sin sustituir', () => {
    const alts = LOCALES.map((l) => seo.ogImageAlt(l));
    expect(new Set(alts).size).toBe(LOCALES.length);
    for (const alt of alts) {
      expect(alt).toContain(SITE.name);
      expect(alt).not.toMatch(/[{}]/);
    }
  });

  it('el alt nunca es una cadena vacía ni un marcador de clave ausente', () => {
    // `createTranslator` devuelve la RUTA de la clave si falta (p. ej. «Meta.og.alt»): sería corto y con un punto.
    for (const l of LOCALES) {
      const alt = seo.ogImageAlt(l);
      expect(alt.trim().length).toBeGreaterThan(20);
      expect(alt).not.toMatch(/^Meta\./);
    }
  });

  it.each(LOCALES)(
    '«%s»: sigue calculando canonical, locale de Open Graph y robots como antes',
    (locale) => {
      const meta = page(locale);
      expect(meta.title).toBe('Título');
      expect(meta.alternates?.canonical).toBe(`https://example.org/${locale}`);
      expect(meta.openGraph).toMatchObject({
        type: 'website',
        locale: LOCALE_INFO[locale].ogLocale,
        url: `https://example.org/${locale}`,
      });
      // Fuera de producción nada se indexa.
      expect(meta.robots).toMatchObject({ index: false });
    },
  );
});
