import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// `proxy.ts` se llamaba `middleware.ts` hasta Next 16.
const handleI18nRouting = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);
  // Defensa en profundidad: SITE_ENV se hornea en las páginas estáticas al compilar. Si un artefacto
  // de producción se desplegara por error en staging, esta cabecera de ejecución lo mantiene fuera de
  // los buscadores. Solo `SITE_ENV=production` en el servidor permite indexar.
  if (process.env.SITE_ENV !== 'production') {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
}

export const config = {
  // Todo salvo `/api`, `/trpc`, `/_next`, `/_vercel` y rutas con punto (favicon.ico, robots.txt, sitemap.xml…).
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
