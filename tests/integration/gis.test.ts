import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectSqlState, type TestDb } from './helpers';
import { seedWorld, square, type World } from './world';

let db: TestDb;
let w: World;

beforeAll(async () => {
  db = await createTestDb();
  w = await seedWorld(db);
});
afterAll(async () => {
  await db.close();
});

const newArea = async (cls: 'official' | 'osm_derived' | 'editorial'): Promise<string> =>
  (
    await db.owner.query<{ id: string }>(
      "insert into public.geographic_areas (kind, source_class) values ('county', $1::public.geometry_source_class) returning id",
      [cls],
    )
  ).rows[0]?.id as string;

describe('geometrías (docs/gis.md)', () => {
  it('la superficie se calcula con geography y método identificado, NO en grados', async () => {
    const a = await newArea('editorial');
    // 0,1° × 0,1° a ≈ 8,5° N: ≈ 11,01 km × 11,06 km ≈ 121,7 km²
    const { rows } = await db.owner.query<{ area_m2: number; area_method: string; planar: number }>(
      `insert into public.geometry_versions (area_id, version, geom) values ($1, 1, $2::geometry)
       returning area_m2, area_method, st_area(geom) as planar`,
      [a, square(-82.5, 8.5)],
    );
    const km2 = (rows[0]?.area_m2 ?? 0) / 1e6;
    expect(km2).toBeGreaterThan(120.5);
    expect(km2).toBeLessThan(123);
    expect(rows[0]?.area_method).toBe('ST_Area(geography, EPSG:4326)');
    // El área plana en grados² (0,01) no tiene ninguna relación con m²: confundirla sería el error clásico.
    expect(rows[0]?.planar).toBeCloseTo(0.01, 6);
  });

  it('una geometría inválida se REGISTRA como inválida y NO se repara en silencio', async () => {
    const a = await newArea('editorial');
    const bowtie = 'SRID=4326;POLYGON((-80 8, -79.9 8.1, -79.9 8, -80 8.1, -80 8))'; // lazo: autointersección
    const before = (
      await db.owner.query<{ hex: string }>('select st_asewkb($1::geometry)::text as hex', [bowtie])
    ).rows[0]?.hex;
    const { rows } = await db.owner.query<{
      validity: string;
      validation_notes: string;
      area_m2: number | null;
      hex: string;
    }>(
      `insert into public.geometry_versions (area_id, version, geom) values ($1, 1, $2::geometry)
       returning validity, validation_notes, area_m2, st_asewkb(geom)::text as hex`,
      [a, bowtie],
    );
    expect(rows[0]?.validity).toBe('invalid');
    expect(rows[0]?.validation_notes).toMatch(/self-intersection/i);
    expect(rows[0]?.area_m2).toBeNull(); // no se calcula sobre geometría inválida
    expect(rows[0]?.hex).toBe(before); // idéntica bit a bit: sin ST_MakeValid
  });

  it('una geometría vacía se rechaza', async () => {
    const a = await newArea('editorial');
    await expectSqlState(
      db.owner.query(
        "insert into public.geometry_versions (area_id, version, geom) values ($1, 1, 'SRID=4326;POLYGON EMPTY'::geometry)",
        [a],
      ),
      '23514',
    );
  });

  it('lat/lon invertidos (orden de ejes) caen fuera del área de trabajo y se rechazan', async () => {
    const a = await newArea('editorial');
    // (lat, lon) escritos como (lon, lat): x=8.9, y=-79.5 → fuera de [-85,-75]×[5,11]
    await expectSqlState(
      db.owner.query(
        'insert into public.geometry_versions (area_id, version, geom) values ($1, 1, $2::geometry)',
        [a, 'SRID=4326;POLYGON((8.9 -79.5, 9.0 -79.5, 9.0 -79.4, 8.9 -79.4, 8.9 -79.5))'],
      ),
      '23514',
    );
  });

  it('una geometría fuera de Panamá (p. ej. Madrid) se rechaza', async () => {
    const a = await newArea('editorial');
    await expectSqlState(
      db.owner.query(
        'insert into public.geometry_versions (area_id, version, geom) values ($1, 1, $2::geometry)',
        [a, 'SRID=4326;POINT(-3.70 40.42)'],
      ),
      '23514',
    );
  });

  it('el SRID debe ser 4326', async () => {
    const a = await newArea('editorial');
    await expect(
      db.owner.query(
        "insert into public.geometry_versions (area_id, version, geom) values ($1, 1, 'SRID=3857;POINT(-8900000 1000000)'::geometry)",
        [a],
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/SRID|Geometry SRID/i) as string });
  });

  it('lo oficial y lo derivado de OSM EXIGEN su fuente versionada; lo editorial no', async () => {
    for (const cls of ['official', 'osm_derived'] as const) {
      const a = await newArea(cls);
      await expectSqlState(
        db.owner.query(
          'insert into public.geometry_versions (area_id, version, geom) values ($1, 1, $2::geometry)',
          [a, square(-79.5, 9.0)],
        ),
        '23514',
      );
      await db.owner.query(
        'insert into public.geometry_versions (area_id, version, source_version_id, geom) values ($1, 1, $2, $3::geometry)',
        [a, w.sourceVersionId, square(-79.5, 9.0)],
      );
    }
    const e = await newArea('editorial');
    await db.owner.query(
      'insert into public.geometry_versions (area_id, version, geom) values ($1, 1, $2::geometry)',
      [e, square(-79.5, 9.0)],
    );
  });

  it('solo una versión vigente por área', async () => {
    const a = await newArea('editorial');
    await db.owner.query(
      'insert into public.geometry_versions (area_id, version, geom, is_current) values ($1, 1, $2::geometry, true)',
      [a, square(-79.5, 9.0)],
    );
    await expectSqlState(
      db.owner.query(
        'insert into public.geometry_versions (area_id, version, geom, is_current) values ($1, 2, $2::geometry, true)',
        [a, square(-79.4, 9.0)],
      ),
      '23505',
    );
  });

  it('las relaciones no son un árbol: 4 tipos, sin autorrelación, sin duplicados', async () => {
    const [a, b] = [await newArea('editorial'), await newArea('editorial')];
    for (const t of ['administrative', 'contains', 'near', 'access_via']) {
      await db.owner.query(
        'insert into public.geographic_relations (subject_id, object_id, relation_type) values ($1, $2, $3)',
        [a, b, t],
      );
    }
    await expectSqlState(
      db.owner.query(
        "insert into public.geographic_relations (subject_id, object_id, relation_type) values ($1, $1, 'near')",
        [a],
      ),
      '23514',
    );
    await expectSqlState(
      db.owner.query(
        "insert into public.geographic_relations (subject_id, object_id, relation_type) values ($1, $2, 'near')",
        [a, b],
      ),
      '23505',
    );
    await expectSqlState(
      db.owner.query(
        "insert into public.geographic_relations (subject_id, object_id, relation_type) values ($1, $2, 'parent')",
        [a, b],
      ),
      '23514',
    );
  });
});

describe('semántica espacial (consultas de la API espacial)', () => {
  it('ST_Covers incluye el límite; ST_Contains no (cada consulta declara su semántica)', async () => {
    const { rows } = await db.owner.query<{ covers: boolean; contains: boolean }>(
      `select st_covers(g, p) as covers, st_contains(g, p) as contains
         from (select $1::geometry as g, 'SRID=4326;POINT(-79.5 8.95)'::geometry as p) t`,
      [square(-79.5, 8.9)], // el punto está sobre el borde oeste
    );
    expect(rows[0]).toEqual({ covers: true, contains: false });
  });

  it('las distancias se miden en metros con geography, no en grados', async () => {
    const { rows } = await db.owner.query<{ meters: number; degrees: number }>(
      `select st_distance('SRID=4326;POINT(-79.5 9.0)'::geography, 'SRID=4326;POINT(-79.5 9.1)'::geography) as meters,
              st_distance('SRID=4326;POINT(-79.5 9.0)'::geometry, 'SRID=4326;POINT(-79.5 9.1)'::geometry) as degrees`,
    );
    expect(rows[0]?.meters).toBeGreaterThan(11_000);
    expect(rows[0]?.meters).toBeLessThan(11_150); // 0,1° de latitud ≈ 11,06 km
    expect(rows[0]?.degrees).toBeCloseTo(0.1, 6); // en grados: otra magnitud, nunca mezclar
  });

  it('el índice GiST existe y las consultas por bbox lo pueden usar', async () => {
    const idx = await db.owner.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'geometry_versions_geom_gix'",
    );
    expect(idx.rows[0]?.indexdef).toMatch(/USING gist/i);
    const { rows } = await db.owner.query<{ n: string }>(
      'select count(*) as n from public.geometry_versions where geom && st_makeenvelope(-83.2, 6.9, -77.0, 9.8, 4326)',
    );
    expect(Number(rows[0]?.n)).toBeGreaterThan(0);
  });
});
