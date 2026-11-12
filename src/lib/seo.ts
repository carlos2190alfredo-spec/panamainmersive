import type { Metadata } from 'next';
import { createTranslator } from 'next-intl';
import { buildAlternates, type LocaleVariant } from '@/domains/editorial/alternates';
import {
  decideIndexing,
  type Sensitivity,
  type SiteEnv,
  type TranslationStatus,
} from '@/domains/editorial/publication';
import { SITE_PUBLICATION_POLICY, UI_TRANSLATION_STATUS } from '@/domains/editorial/ui-status';
import { getEnv } from '@/config/env';
import { SITE } from '@/config/site';
import { DEFAULT_LOCALE, LOCALES, LOCALE_INFO, type Locale } from '@/i18n/locales';
import { getPathname } from '@/i18n/navigation';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import es from '../../messages/es.json';
import fr from '../../messages/fr.json';
import pt from '../../messages/pt.json';

/**
 * Colores del navegador (`<meta name="theme-color">`) y del manifiesto: ÚNICO sitio donde viven sus hexadecimales
 * (el layout y `manifest.ts` los importan de aquí). `tokens.css` es la fuente de verdad de los colores, pero un
 * `<meta>` y un JSON no pueden leer variables CSS, así que se repiten aquí y `tests/unit/lib/theme-colors.test.ts` exige
 * que coincidan con el token que representan en cada ámbito:
 *  - `light`: `--color-surface` del tema claro = fondo de la cabecera (la barra del navegador se funde con ella).
 *  - `dark`: `--color-surface` del tema oscuro y del ámbito inmersivo (siempre oscuro: portada y Explorar).
 */
export const THEME_COLORS = { light: '#ffffff', dark: '#0a1b45' } as const;

/**
 * Imagen social ESTÁTICA (Open Graph y Twitter): 1200×630, sin texto horneado, generada por
 * `pipelines/brand/make_og.py` a partir de las marcas entregadas (`public/brand/SOURCE.json`). No se usa `next/og`
 * (no admite woff2: ADR-0025) ni el archivo `opengraph-image` (su `alt` es de un solo idioma). El `alt` sí es
 * localizado: sale de `Meta.og.alt`.
 */
export const OG_IMAGE = {
  path: '/brand/og-1200x630.jpg',
  width: 1200,
  height: 630,
  type: 'image/jpeg',
} as const;

/**
 * Los metadatos se calculan en SÍNCRONO (la portada hace `{ ...pageMetadata() }`), así que el `alt` se resuelve con los
 * mensajes importados y no con `getTranslations` (asíncrono). Solo se usa en servidor y solo una clave; el resto de la
 * interfaz sigue cargando un único archivo por idioma (src/i18n/request.ts).
 */
const MESSAGES = { es, en, pt, fr, de } satisfies Record<Locale, typeof es>;

/** Texto alternativo de la imagen social en el idioma de la página (con el nombre del sitio de `SITE`). */
export function ogImageAlt(locale: Locale): string {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'Meta' });
  return t('og.alt', { siteName: SITE.name });
}

export type Href = Parameters<typeof getPathname>[0]['href'];

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, getEnv().NEXT_PUBLIC_SITE_URL).toString();
}

export function localizedUrl(locale: Locale, href: Href): string {
  return absoluteUrl(getPathname({ locale, href }));
}

export interface PageSeoInput {
  readonly locale: Locale;
  readonly title: string;
  readonly description: string;
  /** Ruta (con sus parámetros) de la MISMA página en cada idioma. */
  readonly hrefFor: (locale: Locale) => Href;
  /** ¿Hay contenido mínimo en ese idioma? Las páginas vacías no se indexan. Puede depender del idioma. */
  readonly hasRequiredFields: boolean | ((locale: Locale) => boolean);
  readonly sensitivity?: Sensitivity;
  /** Estado editorial por idioma; por defecto el de la interfaz. */
  readonly statusFor?: (locale: Locale) => TranslationStatus;
  /** La home negocia idioma en `/`: es su `x-default`. */
  readonly isHome?: boolean;
}

/** Metadatos localizados: canonical propio, hreflang recíproco SOLO de variantes publicadas, robots. */
export function pageMetadata(input: PageSeoInput): Metadata {
  const siteEnv: SiteEnv = getEnv().SITE_ENV;
  const statusFor = input.statusFor ?? ((l: Locale) => UI_TRANSLATION_STATUS[l]);

  const variants: LocaleVariant[] = LOCALES.map((locale) => ({
    locale,
    url: localizedUrl(locale, input.hrefFor(locale)),
    indexable: decideIndexing({
      status: statusFor(locale),
      sensitivity: input.sensitivity ?? 'general',
      siteEnv,
      hasRequiredFields:
        typeof input.hasRequiredFields === 'function'
          ? input.hasRequiredFields(locale)
          : input.hasRequiredFields,
      ...SITE_PUBLICATION_POLICY,
    }).indexable,
  }));

  const alt = buildAlternates(input.locale, variants, {
    defaultLocale: DEFAULT_LOCALE,
    htmlLangOf: (l) => LOCALE_INFO[l].htmlLang,
    ...(input.isHome ? { xDefaultUrl: absoluteUrl('/') } : {}),
  });

  const others = variants
    .filter((v) => v.indexable && v.locale !== input.locale)
    .map((v) => LOCALE_INFO[v.locale].ogLocale);

  const image = { url: absoluteUrl(OG_IMAGE.path), width: OG_IMAGE.width, height: OG_IMAGE.height };
  const imageAlt = ogImageAlt(input.locale);

  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: alt.canonical,
      ...(Object.keys(alt.languages).length > 0 ? { languages: { ...alt.languages } } : {}),
    },
    robots: alt.robots,
    openGraph: {
      title: input.title,
      description: input.description,
      url: alt.canonical,
      locale: LOCALE_INFO[input.locale].ogLocale,
      ...(others.length > 0 ? { alternateLocale: others } : {}),
      type: 'website',
      images: [{ ...image, type: OG_IMAGE.type, alt: imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: [{ ...image, alt: imageAlt }],
    },
  };
}
