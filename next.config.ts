import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { TERRAIN_ORIGIN, securityHeaders } from './src/config/security-headers';

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
            connectOrigins: [TERRAIN_ORIGIN],
          }),
        ],
      },
    ]);
  },
};

export default withNextIntl(nextConfig);
