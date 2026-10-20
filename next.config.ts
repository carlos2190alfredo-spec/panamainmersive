import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { mapConnectOrigins } from './src/config/map-urls';
import { securityHeaders } from './src/config/security-headers';

const withNextIntl = createNextIntlPlugin();

const isProduction = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `experimental.sri` NO se usa: en Next 16.4.2 solo añade `integrity` a 6 de 9 scripts y no cubre
  // los inline (ADR-0010). Se reevaluará cuando cubra todos.
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          ...securityHeaders({
            production: isProduction,
            development: !isProduction,
            connectOrigins: mapConnectOrigins({
              tilesBaseUrl: process.env.NEXT_PUBLIC_TILES_BASE_URL,
              terrainTilesUrl: process.env.NEXT_PUBLIC_TERRAIN_TILES_URL,
            }),
          }),
        ],
      },
      // PMTiles se sirve por peticiones Range: se cachea una hora (el nombre es fijo; PMTiles revalida por ETag).
      {
        source: '/data/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
      },
      // Glifos del mapa (rangos Unicode estáticos con licencia OFL).
      {
        source: '/map-assets/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
    ]);
  },
};

export default withNextIntl(nextConfig);
