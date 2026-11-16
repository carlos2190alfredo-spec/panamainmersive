import { getEnv } from '@/config/env';
import { DESTINATION_KEYS } from '@/domains/tourism/destinations';
import { placesResponse } from '@/lib/nearby-places';
import { RIGHTS_POLICIES } from '@/lib/rights-policies';

/**
 * Lugares cercanos sin verificar de un destino (ADR-0027 A2), por CLAVE estable del destino. Se generan en el build (un archivo
 * por destino; el entorno y los derechos se evalúan entonces) y cualquier otra clave es un 404. Con los derechos denegados
 * (producción con la política `provisional`) el 403 NO se guarda en el build (Next 16 solo pregenera estados < 400 y 404:
 * `next/dist/export/routes/app-route.js`): la ruta se atiende en cada petición y vuelve a responder 403, sin datos.
 */
export const dynamicParams = false;

export function generateStaticParams(): { destination: string }[] {
  return DESTINATION_KEYS.map((destination) => ({ destination }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ destination: string }> },
): Promise<Response> {
  const { destination } = await context.params;
  return placesResponse(destination, getEnv().SITE_ENV, RIGHTS_POLICIES);
}
