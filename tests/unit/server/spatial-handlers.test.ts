import { describe, expect, it, vi } from 'vitest';
import type { RightsPolicy } from '@/domains/geography/rights';
import type { AreaRow } from '@/domains/geography/spatial-response';
import { DatabaseUnavailableError, type Queryable, type RunAnon } from '@/server/spatial/db';
import {
  handleAreaByOvertureId,
  handleAreaDetail,
  handleAreas,
  handleLocate,
  layerAccess,
  type SpatialDeps,
} from '@/server/spatial/handlers';

const provisional: RightsPolicy[] = [
  { subject: 'overture', status: 'provisional', allowed: ['display', 'transform', 'redistribute'] },
];
const verified: RightsPolicy[] = [
  { subject: 'overture', status: 'verified', allowed: ['display', 'transform', 'redistribute'] },
];
const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function areaRow(over: Partial<AreaRow> = {}): AreaRow {
  return {
    id: ID,
    kind: 'protected_area',
    source_class: 'osm_derived',
    overture_id: null,
    geometry_version: 1,
    area_m2: 100,
    area_method: 'ST_Area(geography, EPSG:4326)',
    source_version_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    version_label: 'v',
    retrieved_at: '2026-10-20T00:00:00Z',
    license_name: 'ODbL',
    license_url: null,
    attribution: '© OSM',
    rights_status: 'provisional',
    source_key: 'overture',
    institution: 'Overture Maps Foundation',
    source_kind: 'osm_derived',
    geometry_json: '{"type":"Point","coordinates":[-80,8]}',
    ...over,
  };
}

interface Recorded {
  text: string;
  values: unknown[] | undefined;
}

/** Ejecutor de pruebas: contesta según el SQL y registra consultas y parámetros. */
function fakeRun(rows: AreaRow[], log: Recorded[] = []): RunAnon {
  const q: Queryable = {
    query: (text, values) => {
      log.push({ text, values });
      if (text.includes('geographic_area_names')) return Promise.resolve({ rows: [] as never[] });
      return Promise.resolve({ rows: rows as never[] });
    },
  };
  return (fn) => fn(q);
}

const deps = (over: Partial<SpatialDeps> = {}): SpatialDeps => ({
  siteEnv: 'development',
  policies: provisional,
  runAnon: fakeRun([areaRow()]),
  ...over,
});
const neverCalled: RunAnon = () => {
  throw new Error('No debía consultarse la base de datos');
};
const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { headers });
const AREAS = '/api/spatial/areas?bbox=-80,8,-79,9&zoom=8';

describe('GET /api/spatial/areas', () => {
  it('200: FeatureCollection con procedencia, límites y la simplificación declarada', async () => {
    const res = await handleAreas(get(AREAS), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/geo+json');
    expect(res.headers.get('cache-control')).toContain('public');
    const body = (await res.json()) as {
      type: string;
      features: unknown[];
      sources: unknown[];
      meta: Record<string, unknown>;
    };
    expect(body.type).toBe('FeatureCollection');
    expect(body.features).toHaveLength(1);
    expect(body.sources).toHaveLength(1);
    expect(body.meta).toMatchObject({
      zoom: 8,
      layers: ['protected_areas'],
      truncated: false,
      simplification: { method: 'ST_SimplifyPreserveTopology' },
    });
  });

  it('400 sin tocar la BD ante parámetros hostiles, con códigos y sin eco del valor', async () => {
    const hostile = "/api/spatial/areas?bbox=1e9,'--,x,y&zoom=8&layers=a';drop table x";
    const res = await handleAreas(get(hostile), deps({ runAnon: neverCalled }));
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(text).toContain('invalid_parameters');
    expect(text).not.toContain('drop table');
  });

  it('403 con política provisional en PRODUCCIÓN, sin consultar la BD (deny-by-default)', async () => {
    const res = await handleAreas(
      get(AREAS),
      deps({ siteEnv: 'production', runAnon: neverCalled }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: {
        code: 'rights_blocked',
        blocked: [{ layer: 'protected_areas', reason: 'provisional-in-production' }],
      },
    });
  });

  it('con la política VERIFICADA se sirve también en producción', async () => {
    const res = await handleAreas(get(AREAS), deps({ siteEnv: 'production', policies: verified }));
    expect(res.status).toBe(200);
  });

  it('sin política para la fuente se deniega siempre, también fuera de producción', async () => {
    const res = await handleAreas(get(AREAS), deps({ policies: [], runAnon: neverCalled }));
    expect(res.status).toBe(403);
  });

  it('cada consulta va PARAMETRIZADA: ningún valor de la petición aparece en el texto SQL', async () => {
    const log: Recorded[] = [];
    await handleAreas(
      get('/api/spatial/areas?bbox=-80.123,8.456,-79.5,9&zoom=11&limit=7&layers=protected_areas'),
      deps({ runAnon: fakeRun([areaRow()], log) }),
    );
    const main = log.find((l) => l.text.includes('st_makeenvelope'));
    expect(main).toBeDefined();
    expect(main?.text).not.toMatch(/-80\.123|8\.456|protected_area['"]/);
    expect(main?.values).toEqual(expect.arrayContaining([-80.123, 8.456, ['protected_area']]));
    // Se pide UNA fila más que el límite para detectar el truncado
    expect(main?.values).toContain(8);
  });

  it('ETag débil y 304 con If-None-Match (también con la lista y con «*»)', async () => {
    const first = await handleAreas(get(AREAS), deps());
    const etag = first.headers.get('etag');
    expect(etag).toMatch(/^W\/"[0-9a-f]{32}"$/);
    const same = await handleAreas(get(AREAS, { 'if-none-match': `"x", ${etag ?? ''}` }), deps());
    expect(same.status).toBe(304);
    expect(await same.text()).toBe('');
    expect((await handleAreas(get(AREAS, { 'if-none-match': '*' }), deps())).status).toBe(304);
    expect((await handleAreas(get(AREAS, { 'if-none-match': 'W/"otro"' }), deps())).status).toBe(
      200,
    );
  });

  it('el ETag cambia si cambia el contenido', async () => {
    const a = await handleAreas(get(AREAS), deps());
    const b = await handleAreas(
      get(AREAS),
      deps({ runAnon: fakeRun([areaRow({ area_m2: 101 })]) }),
    );
    expect(a.headers.get('etag')).not.toBe(b.headers.get('etag'));
  });
});

describe('errores de infraestructura', () => {
  const failing =
    (error: Error): RunAnon =>
    () =>
      Promise.reject(error);

  it('503 si no hay base de datos configurada o no se puede conectar', async () => {
    const r1 = await handleAreas(
      get(AREAS),
      deps({ runAnon: failing(new DatabaseUnavailableError('x')) }),
    );
    expect(r1.status).toBe(503);
    const r2 = await handleAreas(
      get(AREAS),
      deps({ runAnon: failing(Object.assign(new Error('x'), { code: '08006' })) }),
    );
    expect(r2.status).toBe(503);
    expect(r1.headers.get('cache-control')).toBe('no-store');
  });

  it('504 si la consulta supera el tiempo máximo (57014)', async () => {
    const res = await handleAreas(
      get(AREAS),
      deps({
        runAnon: failing(Object.assign(new Error('canceling statement'), { code: '57014' })),
      }),
    );
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: { code: 'query_timeout' } });
  });

  it('500 genérico: ni el mensaje, ni el SQL, ni credenciales llegan al cliente', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secret =
      'postgres://app:S3CRET@db.internal/x relation "geometry_versions" does not exist';
    const res = await handleAreas(get(AREAS), deps({ runAnon: failing(new Error(secret)) }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe('{"error":{"code":"internal_error"}}');
    expect(text).not.toContain('S3CRET');
    // El registro del servidor tampoco copia el mensaje (puede contener datos)
    expect(JSON.stringify(spy.mock.calls)).not.toContain('S3CRET');
    spy.mockRestore();
  });
});

describe('GET /api/spatial/locate', () => {
  it('200: áreas que cubren el punto, sin geometría y con la semántica declarada', async () => {
    const res = await handleLocate(
      get('/api/spatial/locate?lon=-79.5&lat=8.5'),
      deps({ runAnon: fakeRun([areaRow({ geometry_json: null })]) }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      features: { geometry: unknown }[];
      meta: { semantics: string; point: number[] };
    };
    expect(body.features[0]?.geometry).toBeNull();
    expect(body.meta.point).toEqual([-79.5, 8.5]);
    expect(body.meta.semantics).toContain('ST_Covers');
  });

  it('400 con lat/lon intercambiados (no se «adivina»)', async () => {
    const res = await handleLocate(
      get('/api/spatial/locate?lon=8.5&lat=-79.5'),
      deps({ runAnon: neverCalled }),
    );
    expect(res.status).toBe(400);
  });

  it('403 en producción con política provisional', async () => {
    const res = await handleLocate(
      get('/api/spatial/locate?lon=-79.5&lat=8.5'),
      deps({ siteEnv: 'production', runAnon: neverCalled }),
    );
    expect(res.status).toBe(403);
  });
});

describe('GET /api/spatial/areas/[id]', () => {
  it('200: la ficha con todos los nombres de la fuente y su procedencia', async () => {
    const run: RunAnon = (fn) =>
      fn({
        query: (text) =>
          Promise.resolve({
            rows: (text.includes('geographic_area_names')
              ? [
                  { area_id: ID, locale: null, name: 'Parque Test', provenance: 'source_local' },
                  { area_id: ID, locale: 'en', name: 'Test Park', provenance: 'source_common' },
                ]
              : [areaRow()]) as never[],
          }),
      });
    const res = await handleAreaDetail(
      get(`/api/spatial/areas/${ID}?locale=en`),
      ID,
      deps({ runAnon: run }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      type: string;
      properties: { name: { value: string }; names: unknown[] };
    };
    expect(body.type).toBe('Feature');
    expect(body.properties.name.value).toBe('Test Park');
    expect(body.properties.names).toHaveLength(2);
  });

  it('404 idéntico para «no existe» y «no es visible»: no se revela lo no público', async () => {
    const res = await handleAreaDetail(
      get(`/api/spatial/areas/${ID}`),
      ID,
      deps({ runAnon: fakeRun([]) }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found' } });
  });

  it('400 si el identificador no es un UUID (la identidad nunca es el nombre)', async () => {
    const res = await handleAreaDetail(
      get('/api/spatial/areas/bocas-del-toro'),
      'bocas-del-toro',
      deps({ runAnon: neverCalled }),
    );
    expect(res.status).toBe(400);
  });

  it('403 si la fila pertenece a una fuente sin permiso (defensa por fila)', async () => {
    const res = await handleAreaDetail(
      get(`/api/spatial/areas/${ID}`),
      ID,
      deps({ runAnon: fakeRun([areaRow({ source_key: 'otra-fuente' })]) }),
    );
    expect(res.status).toBe(403);
  });
});

describe('derechos por capa (layerAccess)', () => {
  // Registro sintético: hoy las dos capas reales comparten fuente, así que el bloqueo PARCIAL solo se
  // puede ejercer con fuentes distintas.
  const registry = {
    protected_areas: { rightsSubject: 'fuente-a' },
    context_areas: { rightsSubject: 'fuente-b' },
  };
  const policies: RightsPolicy[] = [
    { subject: 'fuente-a', status: 'verified', allowed: ['display', 'transform', 'redistribute'] },
    {
      subject: 'fuente-b',
      status: 'provisional',
      allowed: ['display', 'transform', 'redistribute'],
    },
  ];
  const both = ['protected_areas', 'context_areas'] as const;

  it('en producción se sirve la capa verificada y se bloquea la provisional, avisando', () => {
    const access = layerAccess({ siteEnv: 'production', policies }, both, registry);
    expect(access.allowed).toEqual(['protected_areas']);
    expect(access.blocked).toEqual([
      { layer: 'context_areas', reason: 'provisional-in-production' },
    ]);
    expect([...access.subjects]).toEqual(['fuente-a']);
  });

  it('fuera de producción se sirven las dos', () => {
    const access = layerAccess({ siteEnv: 'development', policies }, both, registry);
    expect(access.allowed).toEqual([...both]);
    expect(access.blocked).toEqual([]);
  });

  it('exige mostrar, transformar Y redistribuir: si falta una acción, se bloquea', () => {
    const partial: RightsPolicy[] = [
      { subject: 'fuente-a', status: 'verified', allowed: ['display', 'transform'] },
      {
        subject: 'fuente-b',
        status: 'verified',
        allowed: ['display', 'transform', 'redistribute'],
      },
    ];
    const access = layerAccess({ siteEnv: 'development', policies: partial }, both, registry);
    expect(access.blocked).toEqual([{ layer: 'protected_areas', reason: 'action-not-allowed' }]);
  });
});

describe('GET /api/spatial/areas/by-overture/[ovid]', () => {
  const OVID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('200: busca por el ID de Overture (el `ovid` de las teselas) con consulta parametrizada', async () => {
    const log: Recorded[] = [];
    const res = await handleAreaByOvertureId(
      get(`/api/spatial/areas/by-overture/${OVID.toUpperCase()}?locale=en`),
      OVID.toUpperCase(),
      deps({ runAnon: fakeRun([areaRow()], log) }),
    );
    expect(res.status).toBe(200);
    const main = log.find((l) => l.text.includes("external_ref ->> 'overture_id'"));
    expect(main).toBeDefined();
    // Normaliza a minúsculas y el valor va como PARÁMETRO, nunca en el SQL
    expect(main?.values?.[0]).toBe(OVID);
    expect(main?.text).not.toContain(OVID);
  });

  it('400 con códigos de máquina si no es un UUID: se nombra el parámetro `ovid`; nunca se busca por nombre', async () => {
    const res = await handleAreaByOvertureId(
      get('/api/spatial/areas/by-overture/Parque%20Nacional%20Coiba'),
      'Parque Nacional Coiba',
      deps({ runAnon: neverCalled }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: 'invalid_parameters', issues: [{ field: 'ovid', code: 'id.format' }] },
    });
  });

  it('404 idéntico para inexistente y no visible; 403 en producción con política provisional sin tocar la BD', async () => {
    const missing = await handleAreaByOvertureId(get('/x'), OVID, deps({ runAnon: fakeRun([]) }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { code: 'not_found' } });
    const blocked = await handleAreaByOvertureId(
      get('/x'),
      OVID,
      deps({ siteEnv: 'production', runAnon: neverCalled }),
    );
    expect(blocked.status).toBe(403);
  });

  it('la ficha por ID interno y por ID de Overture devuelven lo mismo', async () => {
    const a = await handleAreaDetail(get(`/x/${ID}`), ID, deps());
    const b = await handleAreaByOvertureId(get(`/x/${ID}`), ID, deps());
    expect(await a.text()).toBe(await b.text());
  });
});
