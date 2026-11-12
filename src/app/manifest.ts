import type { MetadataRoute } from 'next';
import { SITE } from '@/config/site';
import { THEME_COLORS } from '@/lib/seo';

/**
 * Manifiesto de la aplicación web (se sirve en `/manifest.webmanifest`; la CSP ya admite `manifest-src 'self'`).
 *
 * - SIN service worker y sin prometer modo sin conexión: la política de derechos del mapa base no incluye `offline`
 *   (data/rights/policies.json), así que «instalable» aquí solo significa un acceso directo con icono y sin barra.
 * - Una sola copia por sitio, no por idioma: por eso no lleva `description` ni `lang` (la descripción vive en los
 *   metadatos de cada página, localizada). `start_url` es `/`: el proxy negocia el idioma.
 * - Colores de la constante única (src/lib/seo.ts, comparada con tokens.css por una prueba). Se usa el oscuro porque la
 *   portada y Explorar —la entrada de la aplicación— son siempre oscuras; cada página sustituye `theme-color` con su
 *   `<meta>`.
 * - Iconos `any`: el de 192 px es el de la convención de archivos de Next (`src/app/icon.png`, también en `/icon.png`) y
 *   el de 512 px lo genera `pipelines/brand/make_og.py`. Tienen esquinas redondeadas, así que NO se declaran
 *   `maskable` (la máscara del sistema recortaría la P).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: SITE.name,
    short_name: SITE.name,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME_COLORS.dark,
    theme_color: THEME_COLORS.dark,
    icons: [
      { src: '/icon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
