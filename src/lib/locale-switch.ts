import {
  destinationSlug,
  getDestination,
  resolveDestinationSlug,
} from '@/domains/tourism/destinations';
import type { Locale } from '@/i18n/locales';
import type { InternalRoute } from '@/i18n/route-table';

export type Query = Readonly<Record<string, string | readonly string[]>>;

export type SwitchHref =
  | { readonly pathname: Exclude<InternalRoute, '/destinations/[slug]'>; readonly query?: Query }
  | {
      readonly pathname: '/destinations/[slug]';
      readonly params: { readonly slug: string };
      readonly query?: Query;
    };

/**
 * Destino del selector de idioma: la MISMA vista en otro idioma, conservando el estado de la URL
 * (cámara, capas, filtros: todo vive en la query). En la ficha de un destino el slug se traduce
 * a través del registro (identidad estable), no se copia tal cual (docs/i18n.md §2).
 */
export function switchTarget(
  pathname: InternalRoute,
  params: { readonly slug?: string | undefined },
  current: Locale,
  target: Locale,
  query?: Query,
): SwitchHref {
  const withQuery = query && Object.keys(query).length > 0 ? { query } : {};

  if (pathname === '/destinations/[slug]') {
    const resolved = params.slug ? resolveDestinationSlug(current, params.slug) : undefined;
    const entry =
      resolved && resolved.kind !== 'not_found' ? getDestination(resolved.key) : undefined;
    if (entry) {
      return { pathname, params: { slug: destinationSlug(entry, target) }, ...withQuery };
    }
    // Sin destino resoluble no se inventa un slug: se vuelve al índice.
    return { pathname: '/destinations', ...withQuery };
  }

  return { pathname, ...withQuery };
}

/** Convierte URLSearchParams en un objeto que conserva claves repetidas. */
export function queryFromSearchParams(sp: URLSearchParams): Query {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    out[key] = all.length > 1 ? all : (all[0] ?? '');
  }
  return out;
}
