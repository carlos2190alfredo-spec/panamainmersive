import type { MetadataRoute } from 'next';
import {
  decideIndexing,
  type SiteEnv,
  type TranslationStatus,
} from '@/domains/editorial/publication';
import { SITE_PUBLICATION_POLICY, UI_TRANSLATION_STATUS } from '@/domains/editorial/ui-status';
import { DEFAULT_LOCALE, LOCALES, LOCALE_INFO, type Locale } from '@/i18n/locales';

export interface SitemapRoute<H> {
  readonly hrefFor: (locale: Locale) => H;
  readonly hasRequiredFields: boolean;
  readonly statusFor?: (locale: Locale) => TranslationStatus;
  /** La home negocia idioma en `/`. */
  readonly isHome?: boolean;
}

/**
 * Sitemap SOLO con las variantes realmente publicadas, con alternates recíprocos (docs/i18n.md §6).
 * Fuera de producción devuelve una lista vacía: nada se indexa.
 */
export function buildSitemap<H>(args: {
  readonly siteEnv: SiteEnv;
  readonly routes: readonly SitemapRoute<H>[];
  readonly urlFor: (locale: Locale, href: H) => string;
  readonly rootUrl: string;
}): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  for (const route of args.routes) {
    const status = route.statusFor ?? ((l: Locale) => UI_TRANSLATION_STATUS[l]);
    const published = LOCALES.filter(
      (locale) =>
        decideIndexing({
          status: status(locale),
          sensitivity: 'general',
          siteEnv: args.siteEnv,
          hasRequiredFields: route.hasRequiredFields,
          ...SITE_PUBLICATION_POLICY,
        }).indexable,
    );
    if (published.length === 0) continue;

    const languages: Record<string, string> = {};
    for (const l of published)
      languages[LOCALE_INFO[l].htmlLang] = args.urlFor(l, route.hrefFor(l));
    const defaultPublished = published.includes(DEFAULT_LOCALE);
    if (route.isHome) languages['x-default'] = args.rootUrl;
    else if (defaultPublished)
      languages['x-default'] = args.urlFor(DEFAULT_LOCALE, route.hrefFor(DEFAULT_LOCALE));

    for (const l of published) {
      out.push({
        url: args.urlFor(l, route.hrefFor(l)),
        alternates: { languages: { ...languages } },
      });
    }
  }
  return out;
}
