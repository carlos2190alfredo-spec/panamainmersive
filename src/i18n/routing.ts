import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALES } from './locales';
import { ROUTE_PATHNAMES } from './route-table';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // La URL explícita determina el idioma de una página compartida (ADR-0003).
  localePrefix: 'always',
  // En `/` sin prefijo: preferencia guardada → Accept-Language → es. Nunca geolocalización.
  localeDetection: true,
  // hreflang, canonical y sitemap salen de las variantes realmente PUBLICADAS
  // (src/domains/editorial/alternates.ts). El `Link` automático asume que todas existen.
  alternateLinks: false,
  pathnames: ROUTE_PATHNAMES,
});
