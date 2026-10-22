import type { MetadataRoute } from 'next';
import { getEnv } from '@/config/env';
import { DESTINATIONS, destinationSlug } from '@/domains/tourism/destinations';
import { contentFor } from '@/lib/content-snapshot';
import { destinationSeo } from '@/lib/destination-content';
import { absoluteUrl, localizedUrl, type Href } from '@/lib/seo';
import { buildSitemap, type SitemapRoute } from '@/lib/sitemap';
import { getTodayIsoDate } from '@/lib/today';

/**
 * Igual que la ficha: lo que entra aquí depende del DÍA (caducidad del resumen). Sin `revalidate`, Next cachea el
 * sitemap en el build (`initialRevalidateSeconds: false`, medido) y seguiría listando una ficha ya `noindex` hasta el
 * siguiente despliegue. Debe ser un literal; `pnpm check:bundle` comprueba que coincide con el de la ficha.
 */
export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: SitemapRoute<Href>[] = [
    { hrefFor: () => '/', hasRequiredFields: true, isHome: true },
    { hrefFor: () => '/explore', hasRequiredFields: true },
    { hrefFor: () => '/destinations', hasRequiredFields: true },
    { hrefFor: () => '/sources', hasRequiredFields: true },
    { hrefFor: () => '/accessibility', hasRequiredFields: true },
  ];
  // Una ficha de destino entra solo en los idiomas donde su resumen verificado existe y la página es publicable
  // (la misma función que sus metadatos: no pueden discrepar).
  const today = getTodayIsoDate();
  const destinationRoutes: SitemapRoute<Href>[] = DESTINATIONS.map((d) => {
    const seo = destinationSeo(contentFor(d.key), d.kind, today);
    return {
      hrefFor: (l) => ({
        pathname: '/destinations/[slug]',
        params: { slug: destinationSlug(d, l) },
      }),
      hasRequiredFields: seo.hasRequiredFields,
      statusFor: seo.statusFor,
      sensitivity: seo.sensitivity,
    };
  });

  return buildSitemap<Href>({
    siteEnv: getEnv().SITE_ENV,
    routes: [...staticRoutes, ...destinationRoutes],
    urlFor: localizedUrl,
    rootUrl: absoluteUrl('/'),
  });
}
