import type { Metadata } from 'next';
import { buildAlternates, type LocaleVariant } from '@/domains/editorial/alternates';
import {
  decideIndexing,
  type Sensitivity,
  type SiteEnv,
  type TranslationStatus,
} from '@/domains/editorial/publication';
import { SITE_PUBLICATION_POLICY, UI_TRANSLATION_STATUS } from '@/domains/editorial/ui-status';
import { getEnv } from '@/config/env';
import { DEFAULT_LOCALE, LOCALES, LOCALE_INFO, type Locale } from '@/i18n/locales';
import { getPathname } from '@/i18n/navigation';

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
  /** ¿Hay contenido mínimo en ese idioma? Las páginas vacías no se indexan. */
  readonly hasRequiredFields: boolean;
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
      hasRequiredFields: input.hasRequiredFields,
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
    },
  };
}
