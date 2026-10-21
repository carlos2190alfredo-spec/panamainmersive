import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RightsPolicy } from '@/domains/geography/rights';
import { coordinateDecimals, simplifyToleranceDegrees } from '@/domains/geography/spatial-query';
import {
  DatabaseUnavailableError,
  closeSpatialPools,
  createRunAnon,
  type Queryable,
} from '@/server/spatial/db';
import { handleAreaDetail, handleAreas, handleLocate } from '@/server/spatial/handlers';
import { findAreaById, findAreas, locateAreas, namesForAreas } from '@/server/spatial/repository';
import { createTestDb, type TestDb } from './helpers';
import { seedWorld, square, type World } from './world';

let db: TestDb;
let w: World;
const id: Record<string, string> = {};

const anon = <T>(fn: (q: Queryable) => Promise<T>) => db.as('anon', null, fn);
const WHOLE = { west: -85, south: 5, east: -75, north: 11 };
const KINDS = ['protected_area', 'county'];

function vertexCount(geometryJson: string | null): number {
  const g = JSON.parse(geometryJson ?? 'null') as { coordinates: unknown } | null;
  const count = (c: unknown): number => {
    if (!Array.isArray(c)) return 0;
    if (typeof c[0] === 'number') return 1;
    return (c as unknown[]).reduce<number>((n, x) => n + count(x), 0);
  };
  return g ? count(g.coordinates) : 0;
}

async function addArea(
  key: string,
  kind: string,
  isPublic: boolean,
  wkt: string,
  names: { locale: string | null; name: string; provenance: string }[] = [],
): Promise<void> {
  const { rows } = await db.owner.query<{ id: string }>(
    "insert into public.geographic_areas (kind, source_class, is_public) values ($1, 'osm_derived', $2) returning id",
    [kind, isPublic],
  );
  const areaId = rows[0]?.id ?? '';
  id[key] = areaId;
  await db.owner.query(
    'insert into public.geometry_versions (area_id, version, source_version_id, geom, is_current) values ($1, 1, $2, $3::geometry, true)',
    [areaId, w.sourceVersionId, wkt],
  );
  for (const n of names) {
    await db.owner.query(
      'insert into public.geographic_area_names (area_id, locale, name, provenance, source_version_id) values ($1, $2, $3, $4, $5)',
      [areaId, n.locale, n.name, n.provenance, w.sourceVersionId],
    );
  }
}

beforeAll(async () => {
  db = await createTestDb();
  w = await seedWorld(db);
  // P1: grande y pública, con nombre local y en inglés. P2: pequeña DENTRO de P1. P5: privada DENTRO de P1.
  await addArea('P1', 'protected_area', true, square(-80.5, 8.0, 1.0), [
    { locale: null, name: 'Parque Uno', provenance: 'source_local' },
    { locale: 'en', name: 'Park One', provenance: 'source_common' },
  ]);
  await addArea('P2', 'protected_area', true, square(-80.2, 8.3, 0.05));
  await addArea('P5', 'protected_area', false, square(-80.4, 8.1, 0.1), [
    { locale: null, name: 'Privada', provenance: 'source_local' },
  ]);
  // P3: círculo con ~1 200 vértices (para comprobar la simplificación).
  await addArea(
    'P3',
    'protected_area',
    true,
    'SRID=4326;' +
      (
        await db.owner.query<{ wkt: string }>(
          "select st_astext(st_buffer(st_setsrid(st_makepoint(-78.5, 8.5), 4326), 0.2, 'quad_segs=300')) as wkt",
        )
      ).rows[0]?.wkt,
  );
  // P4: «lazo» autointersecante: PostGIS la marca `invalid` y NO se repara; la API no la sirve.
  await addArea(
    'P4',
    'protected_area',
    true,
    'SRID=4326;POLYGON((-81 7, -80.5 7.5, -81 7.5, -80.5 7, -81 7))',
  );
});

afterAll(async () => {
  await closeSpatialPools();
  await db.close();
});

describe('findAreas (rol anon, RLS real)', () => {
  it('el visitante solo ve lo visible: nunca áreas privadas, editoriales ni geometrías inválidas', async () => {
    const rows = await anon((q) => findAreas(q, { bbox: WHOLE, zoom: 8, kinds: KINDS, limit: 50 }));
    const got = new Set(rows.map((r) => r.id));
    expect(got).toEqual(
      new Set([id.P1, id.P2, id.P3, w.areaPublic, w.areaLinked]), // areaLinked: visible por su destino publicado
    );
    for (const hidden of [id.P4, id.P5, w.areaPrivate, w.areaEditorial])
      expect(got.has(hidden as string)).toBe(false);
    // Control: el propietario SÍ las ve (es la RLS lo que filtra, no la consulta)
    const owner = await db.owner.query('select count(*)::int as n from public.geographic_areas');
    expect((owner.rows[0] as { n: number }).n).toBeGreaterThan(got.size);
  });

  it('devuelve solo la versión VIGENTE de cada área', async () => {
    const rows = await anon((q) =>
      findAreas(q, { bbox: WHOLE, zoom: 14, kinds: ['county'], limit: 50 }),
    );
    const row = rows.find((r) => r.id === w.areaPublic);
    expect(row?.geometry_version).toBe(2);
    const ring =
      (JSON.parse(row?.geometry_json ?? '{}') as { coordinates: number[][][] }).coordinates[0] ??
      [];
    expect(Math.min(...ring.map((p) => p[0] ?? 0))).toBeCloseTo(-79.5, 5); // v2; la v1 empezaba en −79,6
  });

  it('filtra por tipo, por ventana y ordena por superficie (la mayor primero)', async () => {
    const protectedOnly = await anon((q) =>
      findAreas(q, { bbox: WHOLE, zoom: 8, kinds: ['protected_area'], limit: 50 }),
    );
    expect(protectedOnly.map((r) => r.id)).toEqual([id.P1, id.P3, id.P2]); // 1°² > círculo r=0,2° > 0,05°²
    const window = await anon((q) =>
      findAreas(q, {
        bbox: { west: -80.21, south: 8.31, east: -80.19, north: 8.33 },
        zoom: 8,
        kinds: ['protected_area'],
        limit: 50,
      }),
    );
    expect(window.map((r) => r.id)).toEqual([id.P1, id.P2]); // P1 contiene la ventana, P2 la cruza; P3 no
    const apart = await anon((q) =>
      findAreas(q, {
        bbox: { west: -77.5, south: 5.5, east: -77, north: 6 },
        zoom: 8,
        kinds: ['protected_area'],
        limit: 50,
      }),
    );
    expect(apart).toEqual([]);
  });

  it('pide una fila más que el límite (así se sabe si hubo truncado)', async () => {
    const rows = await anon((q) =>
      findAreas(q, { bbox: WHOLE, zoom: 8, kinds: ['protected_area'], limit: 2 }),
    );
    expect(rows).toHaveLength(3);
  });

  it('simplifica para mostrar SIN tocar la superficie almacenada del original', async () => {
    const at = (zoom: number) =>
      anon((q) => findAreas(q, { bbox: WHOLE, zoom, kinds: ['protected_area'], limit: 50 }));
    const low = (await at(3)).find((r) => r.id === id.P3);
    const high = (await at(16)).find((r) => r.id === id.P3);
    expect(vertexCount(low?.geometry_json ?? null)).toBeLessThan(20);
    expect(vertexCount(high?.geometry_json ?? null)).toBeGreaterThan(200);
    expect(vertexCount(low?.geometry_json ?? null)).toBeLessThan(
      vertexCount(high?.geometry_json ?? null),
    );
    // La superficie es la del ORIGINAL (calculada con geography al insertar), idéntica a cualquier zoom
    expect(low?.area_m2).toBe(high?.area_m2);
    const exact = await db.owner.query<{ a: number; n: number }>(
      'select st_area(geom::geography) as a, st_npoints(geom) as n from public.geometry_versions where area_id = $1',
      [id.P3],
    );
    expect(low?.area_m2 ?? 0).toBeCloseTo(exact.rows[0]?.a ?? -1, 3);
    expect(low?.area_method).toBe('ST_Area(geography, EPSG:4326)');
    // La simplificación sigue siendo geometría válida y no se aleja más de la tolerancia
    const check = await db.owner.query<{ valid: boolean; d: number }>(
      `select st_isvalid(s) as valid, st_hausdorffdistance(s, g.geom) as d
         from public.geometry_versions g, st_geomfromgeojson($2::text) as s
        where g.area_id = $1`,
      [id.P3, low?.geometry_json],
    );
    expect(check.rows[0]?.valid).toBe(true);
    expect(check.rows[0]?.d ?? 99).toBeLessThanOrEqual(
      simplifyToleranceDegrees(3) + 10 ** -coordinateDecimals(3),
    );
  });

  it('la fila trae la procedencia completa (fuente, versión, licencia, atribución)', async () => {
    const rows = await anon((q) =>
      findAreas(q, { bbox: WHOLE, zoom: 8, kinds: ['protected_area'], limit: 50 }),
    );
    expect(rows[0]).toMatchObject({
      source_key: 'overture',
      institution: 'Overture Maps Foundation',
      license_name: 'ODbL',
      rights_status: 'provisional',
      source_class: 'osm_derived',
    });
    expect(rows[0]?.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

describe('locateAreas: ST_Covers sobre el original', () => {
  const at = (lon: number, lat: number) =>
    anon((q) => locateAreas(q, { lon, lat, kinds: ['protected_area'], limit: 20 })).then((rows) =>
      rows.map((r) => r.id),
    );

  it('devuelve las áreas que cubren el punto, de la más pequeña (más específica) a la mayor', async () => {
    expect(await at(-80.18, 8.32)).toEqual([id.P2, id.P1]);
  });

  it('un punto sobre el BORDE cuenta como dentro (ST_Covers, no ST_Contains)', async () => {
    expect(await at(-80.2, 8.32)).toEqual([id.P2, id.P1]); // borde oeste de P2
    expect(await at(-80.5, 8.5)).toEqual([id.P1]); // borde oeste de P1
    expect(await at(-80.5, 8.0)).toEqual([id.P1]); // vértice
  });

  it('un punto justo fuera no cuenta', async () => {
    expect(await at(-80.2000001, 8.32)).toEqual([id.P1]);
    expect(await at(-81.6, 8.5)).toEqual([]);
  });

  it('nunca revela un área privada aunque cubra el punto (RLS)', async () => {
    // (−80,35; 8,15) está dentro de P5 (privada) y de P1 (pública)
    expect(await at(-80.35, 8.15)).toEqual([id.P1]);
  });

  it('un área con geometría inválida no aparece', async () => {
    expect(await at(-80.9, 7.3)).toEqual([]);
  });
});

describe('findAreaById y nombres', () => {
  it('la ficha de un área visible existe; privada, editorial o inexistente son indistinguibles (null)', async () => {
    const ok = await anon((q) => findAreaById(q, { id: id.P1 as string, zoom: 10 }));
    expect(ok?.id).toBe(id.P1);
    expect(ok?.geometry_json).toContain('Polygon');
    for (const hidden of [
      id.P5,
      w.areaPrivate,
      w.areaEditorial,
      '00000000-0000-4000-8000-000000000000',
    ]) {
      expect(await anon((q) => findAreaById(q, { id: hidden as string, zoom: 10 }))).toBeNull();
    }
    // Un área con geometría inválida tampoco se sirve
    expect(await anon((q) => findAreaById(q, { id: id.P4 as string, zoom: 10 }))).toBeNull();
  });

  it('los nombres de áreas no visibles no se leen', async () => {
    const names = await anon((q) => namesForAreas(q, [id.P1 as string, id.P5 as string]));
    expect(names.map((n) => [n.name, n.provenance])).toEqual(
      expect.arrayContaining([
        ['Parque Uno', 'source_local'],
        ['Park One', 'source_common'],
      ]),
    );
    expect(names.some((n) => n.name === 'Privada')).toBe(false);
    expect(await anon((q) => namesForAreas(q, []))).toEqual([]);
  });
});

describe('createRunAnon: el ejecutor real', () => {
  it('corre como `anon`, en una transacción de SOLO LECTURA y con tiempos máximos', async () => {
    const run = createRunAnon(db.connectionString);
    const info = await run(async (q) => {
      const user = await q.query<{ u: string }>('select current_user as u');
      const ro = await q.query<{ v: string }>(
        "select current_setting('transaction_read_only') as v",
      );
      const st = await q.query<{ v: string }>("select current_setting('statement_timeout') as v");
      return { user: user.rows[0]?.u, ro: ro.rows[0]?.v, st: st.rows[0]?.v };
    });
    expect(info).toEqual({ user: 'anon', ro: 'on', st: '3s' });
  });

  it('no puede escribir ni leer lo que no le toca, aunque la URL sea del propietario', async () => {
    const run = createRunAnon(db.connectionString);
    const attempt = async (sql: string) => {
      try {
        await run((q) => q.query(sql));
        return 'permitido';
      } catch (error) {
        return (error as { code?: string }).code;
      }
    };
    expect(['25006', '42501']).toContain(
      await attempt(
        "insert into public.geographic_areas (kind, source_class) values ('county', 'osm_derived')",
      ),
    );
    expect(await attempt('select 1 from public.audit_events')).toBe('42501');
    expect(await attempt('select 1 from public.import_runs')).toBe('42501');
    expect(await attempt('select 1 from public.profiles')).toBe('42501');
    expect(await attempt('create table public.x (a int)')).not.toBe('permitido');
  });

  it('una consulta lenta se corta a los 3 s (57014) y el ejecutor sigue sirviendo', async () => {
    const run = createRunAnon(db.connectionString);
    const started = Date.now();
    await expect(run((q) => q.query('select pg_sleep(10)'))).rejects.toMatchObject({
      code: '57014',
    });
    expect(Date.now() - started).toBeLessThan(6000);
    expect(await run(async (q) => (await q.query<{ n: number }>('select 1 as n')).rows[0]?.n)).toBe(
      1,
    );
  }, 20_000);

  it('sin DATABASE_URL o sin servidor: DatabaseUnavailableError (nunca datos inventados)', async () => {
    await expect(createRunAnon(undefined)((q) => q.query('select 1'))).rejects.toBeInstanceOf(
      DatabaseUnavailableError,
    );
    await expect(
      createRunAnon('postgresql://nobody@127.0.0.1:1/none')((q) => q.query('select 1')),
    ).rejects.toBeInstanceOf(DatabaseUnavailableError);
  });
});

describe('API completa (manejadores + BD real)', () => {
  const provisional: RightsPolicy[] = [
    {
      subject: 'overture',
      status: 'provisional',
      allowed: ['display', 'transform', 'redistribute'],
    },
  ];
  const deps = (siteEnv: 'development' | 'production' = 'development') => ({
    siteEnv,
    policies: provisional,
    runAnon: createRunAnon(db.connectionString),
  });
  const req = (path: string) => new Request(`http://localhost${path}`);

  it('GET /areas: solo lo visible, con nombre del idioma pedido y procedencia', async () => {
    const res = await handleAreas(
      req('/api/spatial/areas?bbox=-81,7.5,-79,9&zoom=8&layers=protected_areas&locale=en'),
      deps(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      features: {
        id: string;
        properties: { name: { value: string } | null; area: { method: string } | null };
      }[];
      sources: { key: string }[];
      meta: { truncated: boolean };
    };
    const ids = body.features.map((f) => f.id);
    expect(ids).toContain(id.P1);
    expect(ids).not.toContain(id.P5); // privada
    expect(ids).not.toContain(id.P4); // inválida
    expect(body.features.find((f) => f.id === id.P1)?.properties.name?.value).toBe('Park One');
    expect(body.features.find((f) => f.id === id.P2)?.properties.name).toBeNull(); // sin nombre en la fuente
    expect(
      body.features.every((f) => f.properties.area?.method === 'ST_Area(geography, EPSG:4326)'),
    ).toBe(true);
    expect(body.sources.map((s) => s.key)).toEqual(['overture']);
    expect(body.meta.truncated).toBe(false);
    expect(JSON.stringify(body)).not.toContain(id.P5 as string);
  });

  it('GET /areas: el límite trunca de forma explícita', async () => {
    const res = await handleAreas(
      req('/api/spatial/areas?bbox=-85,5,-75,11&zoom=4&limit=1'),
      deps(),
    );
    // Ventana demasiado grande para la API (60 grados²)
    expect(res.status).toBe(400);
    const ok = await handleAreas(
      req('/api/spatial/areas?bbox=-81,7.5,-77,9.5&zoom=5&limit=1'),
      deps(),
    );
    const body = (await ok.json()) as {
      features: unknown[];
      meta: { truncated: boolean; limit: number };
    };
    expect(body.features).toHaveLength(1);
    expect(body.meta).toMatchObject({ truncated: true, limit: 1 });
  });

  it('GET /locate y /areas/[id] bajo RLS', async () => {
    const located = await handleLocate(
      req('/api/spatial/locate?lon=-80.35&lat=8.15&layers=protected_areas'),
      deps(),
    );
    const body = (await located.json()) as { features: { id: string; geometry: unknown }[] };
    expect(body.features.map((f) => f.id)).toEqual([id.P1]);
    expect(body.features[0]?.geometry).toBeNull();

    const detail = await handleAreaDetail(
      req(`/api/spatial/areas/${id.P1}?locale=en`),
      id.P1 as string,
      deps(),
    );
    expect(detail.status).toBe(200);
    const d = (await detail.json()) as {
      properties: { name: { value: string }; names: unknown[] };
    };
    expect(d.properties.name.value).toBe('Park One');
    expect(d.properties.names).toHaveLength(2);

    const hidden = await handleAreaDetail(
      req(`/api/spatial/areas/${id.P5}`),
      id.P5 as string,
      deps(),
    );
    expect(hidden.status).toBe(404);
  });

  it('EN PRODUCCIÓN con la política provisional no se sirve nada, aunque los datos existan y sean públicos', async () => {
    for (const res of [
      await handleAreas(req('/api/spatial/areas?bbox=-81,7.5,-79,9&zoom=8'), deps('production')),
      await handleLocate(req('/api/spatial/locate?lon=-80.18&lat=8.32'), deps('production')),
      await handleAreaDetail(
        req(`/api/spatial/areas/${id.P1}`),
        id.P1 as string,
        deps('production'),
      ),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain(id.P1 as string);
    }
  });

  it('con ETag, una segunda petición idéntica devuelve 304', async () => {
    const path = '/api/spatial/areas?bbox=-81,7.5,-79,9&zoom=8';
    const first = await handleAreas(req(path), deps());
    const etag = first.headers.get('etag') ?? '';
    const second = await handleAreas(
      new Request(`http://localhost${path}`, { headers: { 'if-none-match': etag } }),
      deps(),
    );
    expect(second.status).toBe(304);
  });
});
