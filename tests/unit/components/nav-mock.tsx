import { createElement, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { ROUTE_PATHNAMES } from '@/i18n/route-table';

/**
 * Sustituto de `@/i18n/navigation` para renderizar componentes en entorno Node (sin enrutador de Next). El `Link` real
 * de next-intl necesita el contexto del App Router; este emite un `<a>` con el destino serializado en `data-href` (para
 * comprobar RUTA, PARÁMETROS y QUERY sin depender de la tabla de rutas) y un `href` legible. No es un componente de
 * prueba: `vitest.config.ts` solo recoge `*.test.{ts,tsx}`.
 */
type Href =
  string | { pathname: string; params?: Record<string, string>; query?: Record<string, string> };

export const hrefPath = (href: Href): string => {
  if (typeof href === 'string') return href;
  let path = href.pathname;
  for (const [k, v] of Object.entries(href.params ?? {})) path = path.replace(`[${k}]`, v);
  const query = new URLSearchParams(href.query ?? {}).toString();
  return query ? `${path}?${query}` : path;
};

export const navigationMock = {
  Link: ({
    href,
    children,
    ...rest
  }: { href: Href; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement(
      'a',
      { ...rest, href: hrefPath(href), 'data-href': JSON.stringify(href) },
      children,
    ),
  /** Ruta pública con prefijo de idioma, resuelta con la tabla de rutas REAL (`/es/explorar`, `/de/entdecken`…). */
  getPathname: ({ locale, href }: { locale: string; href: Href }) => {
    const pathname = typeof href === 'string' ? href : href.pathname;
    const route = (ROUTE_PATHNAMES as Record<string, string | Record<string, string>>)[pathname];
    const localized = typeof route === 'string' ? route : (route?.[locale] ?? pathname);
    return `/${locale}${localized === '/' ? '' : localized}`;
  },
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => '/',
  redirect: () => undefined,
  permanentRedirect: () => undefined,
};
