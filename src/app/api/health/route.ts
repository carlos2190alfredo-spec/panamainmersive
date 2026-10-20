import { NextResponse } from 'next/server';
import { getEnv } from '@/config/env';
import { LOCALES } from '@/i18n/locales';

export const dynamic = 'force-dynamic';

/** Salud del servicio. No expone secretos ni valores de configuración sensibles. */
export function GET() {
  const env = getEnv();
  return NextResponse.json(
    { status: 'ok', siteEnv: env.SITE_ENV, locales: LOCALES },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
