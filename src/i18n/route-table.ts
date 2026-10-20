import type { Locale } from './locales';

type LocalizedPath = string | Readonly<Record<Locale, string>>;

/**
 * Rutas estructurales: ruta interna (carpeta de `src/app/[locale]`) → ruta pública por idioma.
 * Es configuración ESTÁTICA (limitación de next-intl, ADR-0003): la parte dinámica
 * (`[slug]` de destino) se resuelve contra el registro de slugs, no aquí.
 */
export const ROUTE_PATHNAMES = {
  '/': '/',
  '/explore': {
    es: '/explorar',
    en: '/explore',
    pt: '/explorar',
    fr: '/explorer',
    de: '/entdecken',
  },
  '/destinations': {
    es: '/destinos',
    en: '/destinations',
    pt: '/destinos',
    fr: '/destinations',
    de: '/reiseziele',
  },
  '/destinations/[slug]': {
    es: '/destinos/[slug]',
    en: '/destinations/[slug]',
    pt: '/destinos/[slug]',
    fr: '/destinations/[slug]',
    de: '/reiseziele/[slug]',
  },
  '/sources': { es: '/fuentes', en: '/sources', pt: '/fontes', fr: '/sources', de: '/quellen' },
  '/accessibility': {
    es: '/accesibilidad',
    en: '/accessibility',
    pt: '/acessibilidade',
    fr: '/accessibilite',
    de: '/barrierefreiheit',
  },
} as const satisfies Record<string, LocalizedPath>;

export type InternalRoute = keyof typeof ROUTE_PATHNAMES;
