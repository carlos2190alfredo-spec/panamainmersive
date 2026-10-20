import type { MetadataRoute } from 'next';
import { getEnv } from '@/config/env';
import { DESTINATIONS, destinationSlug } from '@/domains/tourism/destinations';
import { absoluteUrl, localizedUrl, type Href } from '@/lib/seo';
import { buildSitemap, type SitemapRoute } from '@/lib/sitemap';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: SitemapRoute<Href>[] = [
    { hrefFor: () => '/', hasRequiredFields: true, isHome: true },
    { hrefFor: () => '/explore', hasRequiredFields: true },
    { hrefFor: () => '/destinations', hasRequiredFields: true },
    { hrefFor: () => '/sources', hasRequiredFields: true },
    { hrefFor: () => '/accessibility', hasRequiredFields: true },
  ];
  // Las fichas de destino NO entran mientras no tengan contenido editorial (no se indexan páginas vacías).
  const destinationRoutes: SitemapRoute<Href>[] = DESTINATIONS.map((d) => ({
    hrefFor: (l) => ({ pathname: '/destinations/[slug]', params: { slug: destinationSlug(d, l) } }),
    hasRequiredFields: false,
  }));

  return buildSitemap<Href>({
    siteEnv: getEnv().SITE_ENV,
    routes: [...staticRoutes, ...destinationRoutes],
    urlFor: localizedUrl,
    rootUrl: absoluteUrl('/'),
  });
}
