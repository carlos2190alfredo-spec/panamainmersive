import type { Page } from '@playwright/test';

export const LOCALES = ['es', 'en', 'pt', 'fr', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

export const HTML_LANG: Record<Locale, string> = { es: 'es', en: 'en', pt: 'pt', fr: 'fr', de: 'de' };

/** Ruta pública de cada página estructural por idioma (docs/i18n.md §2). */
export const PATHS = {
  home: { es: '/es', en: '/en', pt: '/pt', fr: '/fr', de: '/de' },
  explore: { es: '/es/explorar', en: '/en/explore', pt: '/pt/explorar', fr: '/fr/explorer', de: '/de/entdecken' },
  destinations: {
    es: '/es/destinos',
    en: '/en/destinations',
    pt: '/pt/destinos',
    fr: '/fr/destinations',
    de: '/de/reiseziele',
  },
  destination: {
    es: '/es/destinos/volcan-baru',
    en: '/en/destinations/baru-volcano',
    pt: '/pt/destinos/vulcao-baru',
    fr: '/fr/destinations/volcan-baru',
    de: '/de/reiseziele/vulkan-baru',
  },
  sources: { es: '/es/fuentes', en: '/en/sources', pt: '/pt/fontes', fr: '/fr/sources', de: '/de/quellen' },
  accessibility: {
    es: '/es/accesibilidad',
    en: '/en/accessibility',
    pt: '/pt/acessibilidade',
    fr: '/fr/accessibilite',
    de: '/de/barrierefreiheit',
  },
  notFound: {
    es: '/es/no-existe',
    en: '/en/does-not-exist',
    pt: '/pt/nao-existe',
    fr: '/fr/inexistant',
    de: '/de/gibt-es-nicht',
  },
} as const satisfies Record<string, Record<Locale, string>>;

export type PageName = keyof typeof PATHS;
export const PAGE_NAMES = Object.keys(PATHS) as PageName[];

/** Recoge violaciones de CSP y errores de consola/página durante una carga. */
export function watchPage(page: Page, options: { expectNotFound?: boolean } = {}) {
  const csp: string[] = [];
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // El 404 del propio documento es esperado en las páginas «no encontrado»; cualquier otro recurso
    // que falle (p. ej. /favicon.ico) sigue siendo un error.
    const isOwn404 =
      options.expectNotFound === true &&
      /status of 404/.test(m.text()) &&
      new URL(m.location().url || 'http://x').pathname !== '/favicon.ico';
    if (!isOwn404) errors.push(`${m.text()} @ ${m.location().url}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  void page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp ??= [];
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return {
    errors,
    csp,
    async violations(): Promise<string[]> {
      const fromPage = await page
        .evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
        .catch(() => [] as string[]);
      return [...csp, ...fromPage];
    },
  };
}
