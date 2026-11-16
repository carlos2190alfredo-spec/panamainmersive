import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RightsPolicy } from '@/domains/geography/rights';
import { DESTINATION_KEYS } from '@/domains/tourism/destinations';
import { nearbyPlacesOf, placesResponse } from '@/lib/nearby-places';
import { RIGHTS_POLICIES } from '@/lib/rights-policies';

/**
 * Lugares cercanos sin verificar (ADR-0027 A2): el archivo publicado y la API que lo sirve. Derechos ANTES que datos: con la
 * política `provisional` de Overture Places, en producción no sale nada.
 */
const published = JSON.parse(
  readFileSync(new URL('../../../data/places/nearby-places.json', import.meta.url), 'utf8'),
) as { destinations: Record<string, unknown> };

const VERIFIED: RightsPolicy[] = [
  {
    subject: 'overture-places',
    status: 'verified',
    allowed: ['display', 'transform', 'redistribute'],
  },
];

describe('archivo publicado', () => {
  it('trae los nueve destinos y cada uno pasa el validador del navegador', () => {
    expect(Object.keys(published.destinations).sort()).toEqual([...DESTINATION_KEYS].sort());
    for (const key of DESTINATION_KEYS) expect(nearbyPlacesOf(key).destination).toBe(key);
  });

  it('no trae datos de contacto en ninguna parte (el repositorio es público)', () => {
    const text = JSON.stringify(published);
    for (const key of ['phone', 'email', 'social', 'website', 'address', 'brand']) {
      expect(text.includes(`"${key}`), key).toBe(false);
    }
    expect(text).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i); // ningún correo escondido en un nombre
  });

  it('hay datos donde el sondeo los vio y Coiba se queda casi vacía (sin agrandar el radio)', () => {
    const total = (key: (typeof DESTINATION_KEYS)[number]) =>
      Object.values(nearbyPlacesOf(key).groups).reduce((n, g) => n + g.total, 0);
    expect(total('boquete')).toBeGreaterThan(20);
    expect(total('bocas-del-toro')).toBeGreaterThan(20);
    expect(total('coiba')).toBeLessThan(5);
  });
});

describe('GET /api/places/{destino}', () => {
  it('fuera de producción (política provisional) sirve los lugares, sin la confianza ni el ancla', async () => {
    const response = placesResponse('boquete', 'staging', RIGHTS_POLICIES);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      groups: { lodging: { places: Record<string, unknown>[] } };
    };
    expect(body).toMatchObject({ status: 'unverified', destination: 'boquete' });
    expect(body).not.toHaveProperty('anchor');
    expect(body.groups.lodging.places[0]).not.toHaveProperty('confidence');
    expect(response.headers.get('X-Content-Status')).toBe('unverified');
  });

  it('en producción con la política provisional: 403 sin datos', async () => {
    const response = placesResponse('boquete', 'production', RIGHTS_POLICIES);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'blocked',
      reason: 'provisional-in-production',
    });
  });

  it('control: con la política verificada, también en producción', () => {
    expect(placesResponse('boquete', 'production', VERIFIED).status).toBe(200);
  });

  it('sin política para Overture Places: 403 en cualquier entorno', () => {
    expect(placesResponse('boquete', 'development', []).status).toBe(403);
  });

  it('un destino que no existe es un 404 (por clave; nunca se busca por nombre)', () => {
    expect(placesResponse('Boquete', 'staging', RIGHTS_POLICIES).status).toBe(404);
    expect(placesResponse('../../etc', 'staging', RIGHTS_POLICIES).status).toBe(404);
  });
});
