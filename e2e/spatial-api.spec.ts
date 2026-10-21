import { expect, test } from '@playwright/test';

/**
 * Humo de la API espacial dentro de Next (build de producción). SIN base de datos: comprueba lo que solo se
 * puede comprobar en el servidor real (empaquetado, `params` asíncronos, el proxy de i18n no toca `/api`,
 * cabeceras y que un fallo de infraestructura NO inventa datos). La semántica con PostGIS la prueban las de
 * integración (`tests/integration/spatial-api.test.ts`).
 */
const AREAS = '/api/spatial/areas?bbox=-80,8,-79,9&zoom=8';
const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

test.describe('API espacial', () => {
  test('sin base de datos responde 503 explícito (nunca datos inventados) y sin caché', async ({
    request,
  }) => {
    test.skip(!!process.env.DATABASE_URL, 'Hay DATABASE_URL: este caso es el de «sin BD».');
    const res = await request.get(AREAS, { maxRedirects: 0 });
    expect(res.status()).toBe(503);
    expect(await res.json()).toEqual({ error: { code: 'database_unavailable' } });
    expect(res.headers()['cache-control']).toBe('no-store');
    expect(res.headers()['x-powered-by']).toBeUndefined();
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('parámetros inválidos → 400 con códigos de máquina, sin tocar la BD ni reflejar la entrada', async ({
    request,
  }) => {
    const res = await request.get(
      "/api/spatial/areas?bbox=1e9,'--,x,y&zoom=99&layers=a';drop%20table%20x",
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as {
      error: { code: string; issues: { field: string; code: string }[] };
    };
    expect(body.error.code).toBe('invalid_parameters');
    expect(body.error.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['bbox.format', 'zoom.range', 'layers.unknown']),
    );
    expect(JSON.stringify(body)).not.toContain('drop table');
  });

  test('lat/lon intercambiados se rechazan, no se adivinan', async ({ request }) => {
    const bbox = await request.get('/api/spatial/areas?bbox=8,-80,9,-79&zoom=8');
    expect((await bbox.json()) as unknown).toMatchObject({
      error: { issues: [{ field: 'bbox', code: 'bbox.outside_working_area' }] },
    });
    const point = await request.get('/api/spatial/locate?lon=8.5&lat=-79.5');
    expect(point.status()).toBe(400);
  });

  test('la ficha exige un UUID: la identidad nunca es el nombre', async ({ request }) => {
    const byName = await request.get('/api/spatial/areas/bocas-del-toro');
    expect(byName.status()).toBe(400);
    expect(await byName.json()).toMatchObject({
      error: { issues: [{ field: 'id', code: 'id.format' }] },
    });
    // Con un UUID válido el manejador llega a la BD (aquí no hay): 503, no 404 ni 500
    test.skip(!!process.env.DATABASE_URL, 'Con DATABASE_URL el resultado depende de los datos.');
    expect((await request.get(`/api/spatial/areas/${ID}`)).status()).toBe(503);
  });

  test('la API no se localiza ni se redirige, y solo admite GET', async ({ request }) => {
    const res = await request.get('/api/spatial/locate', { maxRedirects: 0 });
    expect(res.status()).toBe(400); // no 307/308 del proxy de i18n
    for (const method of ['post', 'put', 'delete'] as const) {
      const r = await request[method]('/api/spatial/areas', { maxRedirects: 0 });
      expect(r.status()).toBe(405);
    }
  });
});
