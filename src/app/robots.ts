import type { MetadataRoute } from 'next';
import { getEnv } from '@/config/env';
import { absoluteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  // Fuera de producción se deniega todo (docs/i18n.md §6); en producción se apunta al sitemap.
  if (getEnv().SITE_ENV !== 'production') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return { rules: { userAgent: '*', allow: '/' }, sitemap: absoluteUrl('/sitemap.xml') };
}
