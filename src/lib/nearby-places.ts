import raw from '../../data/places/nearby-places.json';
import type { SiteEnv } from '@/domains/geography/rights';
import { placesRights, type RightsPolicy } from '@/domains/geography/rights';
import { DESTINATION_KEYS, type DestinationKey } from '@/domains/tourism/destinations';
import {
  PLACE_GROUPS,
  parseDestinationPlaces,
  type DestinationPlaces,
} from '@/domains/tourism/places';

/**
 * Lugares cercanos sin verificar (ADR-0027 A2), del archivo que genera y verifica `pnpm data:places`
 * (`data/places/nearby-places.json`). Solo en el servidor: la API los sirve destino a destino y el navegador vuelve a validarlos.
 *
 * Lo que sale hacia el navegador es lo MÍNIMO: sin la confianza de la fuente (no se enseña: no es una verificación) ni el ancla
 * (la página ya la tiene). Si el archivo no pasa el validador del dominio, falla al cargar (en el build), no en una visita.
 */
function toResponse(key: DestinationKey): Record<string, unknown> {
  const doc = raw as unknown as {
    release: string;
    destinations: Record<
      string,
      {
        radiusKm: number;
        groups: Record<string, { total: number; places: Record<string, unknown>[] }>;
      }
    >;
  };
  const entry = doc.destinations[key];
  if (!entry) throw new Error(`nearby-places.json: falta el destino ${key}`);
  const groups = Object.fromEntries(
    PLACE_GROUPS.map((group) => {
      const block = entry.groups[group];
      if (!block) throw new Error(`nearby-places.json: falta ${key}.${group}`);
      return [
        group,
        {
          total: block.total,
          // Campo a campo (lo que no se nombra aquí no sale): sin `confidence`.
          places: block.places.map((p) => ({
            id: p.id,
            name: p.name,
            kind: p.kind,
            lon: p.lon,
            lat: p.lat,
            distanceM: p.distanceM,
            sourceUpdated: p.sourceUpdated,
            sources: p.sources,
          })),
        },
      ];
    }),
  );
  return {
    status: 'unverified',
    destination: key,
    release: doc.release,
    radiusKm: entry.radiusKm,
    groups,
  };
}

const RESPONSES: ReadonlyMap<DestinationKey, Record<string, unknown>> = new Map(
  DESTINATION_KEYS.map((key) => {
    const response = toResponse(key);
    if (!parseDestinationPlaces(response, key)) {
      throw new Error(`nearby-places.json: ${key} no pasa el validador del dominio`);
    }
    return [key, response];
  }),
);

/** Para las pruebas: lo que el navegador recibirá de un destino, ya validado. */
export function nearbyPlacesOf(key: DestinationKey): DestinationPlaces {
  const parsed = parseDestinationPlaces(RESPONSES.get(key), key);
  if (!parsed) throw new Error(`nearby-places.json: ${key} no pasa el validador`);
  return parsed;
}

/**
 * Respuesta de `GET /api/places/{destino}`: derechos ANTES que datos (como la API espacial, ADR-0016). Con la política de Overture
 * Places `provisional`, en producción es un 403 sin datos.
 */
export function placesResponse(
  key: string,
  env: SiteEnv,
  policies: readonly RightsPolicy[],
): Response {
  const rights = placesRights(policies, env);
  if (!rights.allowed) {
    return Response.json(
      { error: 'blocked', reason: rights.reason },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const body = (DESTINATION_KEYS as readonly string[]).includes(key)
    ? RESPONSES.get(key as DestinationKey)
    : undefined;
  if (!body) {
    return Response.json(
      { error: 'notFound' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return Response.json(body, {
    headers: { 'Cache-Control': 'public, max-age=3600', 'X-Content-Status': 'unverified' },
  });
}
