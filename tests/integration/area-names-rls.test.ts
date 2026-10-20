import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectDenied, expectSqlState, ids, type TestDb } from './helpers';
import { seedWorld, type World } from './world';

let db: TestDb;
let w: World;
beforeAll(async () => {
  db = await createTestDb();
  w = await seedWorld(db);
  await db.owner.query(
    "insert into public.geographic_area_names (area_id, locale, name, provenance, source_version_id) values ($1, null, 'Pública', 'source_local', $2), ($3, null, 'Privada', 'source_local', $2)",
    [w.areaPublic, w.sourceVersionId, w.areaPrivate],
  );
});
afterAll(async () => {
  await db.close();
});

describe('nombres de áreas: RLS y restricciones', () => {
  it('el visitante solo ve nombres de áreas visibles', async () => {
    const names = await db.as(
      'anon',
      null,
      async (c) =>
        (
          await c.query<{ name: string }>(
            'select name from public.geographic_area_names order by name',
          )
        ).rows,
    );
    expect(names.map((r) => r.name)).toEqual(['Pública']);
    const asOwner = await db.owner.query<{ n: number }>(
      'select count(*)::int as n from public.geographic_area_names',
    );
    expect(asOwner.rows[0]?.n).toBe(2); // control: la RLS es lo que filtra
  });

  it('el visitante y los usuarios corrientes NO pueden escribir nombres', async () => {
    await expectDenied(
      db.as('anon', null, (c) =>
        c.query(
          "insert into public.geographic_area_names (area_id, name, provenance) values ($1, 'x', 'editorial')",
          [w.areaPublic],
        ),
      ),
    );
    await expectDenied(
      db.as('authenticated', ids.user, (c) =>
        c.query(
          "insert into public.geographic_area_names (area_id, name, provenance) values ($1, 'x', 'editorial')",
          [w.areaPublic],
        ),
      ),
    );
  });

  it('un editor solo puede poner nombres EDITORIALES a áreas EDITORIALES (nunca a lo oficial/OSM)', async () => {
    await db.as('authenticated', ids.editor, async (c) => {
      await c.query(
        "insert into public.geographic_area_names (area_id, locale, name, provenance) values ($1, 'es', 'Nombre editorial', 'editorial')",
        [w.areaEditorial],
      );
    });
    await expectDenied(
      db.as('authenticated', ids.editor, (c) =>
        c.query(
          "insert into public.geographic_area_names (area_id, locale, name, provenance) values ($1, 'es', 'Intento', 'editorial')",
          [w.areaPublic],
        ),
      ),
    );
    await expectDenied(
      db.as('authenticated', ids.editor, (c) =>
        c.query(
          "insert into public.geographic_area_names (area_id, locale, name, provenance, source_version_id) values ($1, 'en', 'Falso', 'source_common', $2)",
          [w.areaEditorial, w.sourceVersionId],
        ),
      ),
    );
  });

  it('restricciones: el local no lleva idioma; el común, sí; los de fuente exigen versión; sin caracteres de control', async () => {
    const insert = (sql: string, params: unknown[]) =>
      db.owner.query(
        `insert into public.geographic_area_names (area_id, locale, name, provenance, source_version_id) values ${sql}`,
        params,
      );
    await expectSqlState(
      insert("($1, 'es', 'x', 'source_local', $2)", [w.areaPublic, w.sourceVersionId]),
      '23514',
    );
    await expectSqlState(
      insert("($1, null, 'x', 'source_common', $2)", [w.areaPublic, w.sourceVersionId]),
      '23514',
    );
    await expectSqlState(insert("($1, 'en', 'x', 'source_common', null)", [w.areaPublic]), '23514');
    await expectSqlState(
      insert("($1, 'en', 'a\u0007b', 'source_common', $2)", [w.areaPublic, w.sourceVersionId]),
      '23514',
    );
    await expectSqlState(
      insert("($1, 'xx', 'x', 'source_common', $2)", [w.areaPublic, w.sourceVersionId]),
      '23503',
    ); // idioma no soportado
  });

  it('un solo nombre local por área y un nombre por idioma y procedencia', async () => {
    const insert = (locale: string | null, prov: string) =>
      db.owner.query(
        'insert into public.geographic_area_names (area_id, locale, name, provenance, source_version_id) values ($1, $2, $3, $4, $5)',
        [w.areaLinked, locale, 'n', prov, w.sourceVersionId],
      );
    await insert(null, 'source_local');
    await expectSqlState(insert(null, 'source_local'), '23505');
    await insert('en', 'source_common');
    await expectSqlState(insert('en', 'source_common'), '23505');
  });

  it('import_runs: lo lee el personal y ningún rol de la aplicación lo escribe', async () => {
    await db.owner.query(
      "insert into public.import_runs (dataset, source_version_id, content_sha256, status, counts, quarantine_count) values ('d-test', $1, $2, 'applied', '{}', 0)",
      [w.sourceVersionId, 'a'.repeat(64)],
    );
    expect(
      await db.as(
        'authenticated',
        ids.user,
        async (c) => (await c.query('select 1 from public.import_runs')).rows.length,
      ),
    ).toBe(0);
    expect(
      await db.as(
        'authenticated',
        ids.editor,
        async (c) => (await c.query('select 1 from public.import_runs')).rows.length,
      ),
    ).toBe(1);
    await expectDenied(db.as('anon', null, (c) => c.query('select 1 from public.import_runs')));
    // Ni el editor ni el administrador de la aplicación escriben aquí: solo el propietario que importa.
    for (const person of [ids.editor, ids.admin]) {
      await expectDenied(
        db.as('authenticated', person, (c) =>
          c.query(
            "insert into public.import_runs (dataset, source_version_id, content_sha256, status, counts, quarantine_count) values ('d2', $1, $2, 'applied', '{}', 0)",
            [w.sourceVersionId, 'b'.repeat(64)],
          ),
        ),
      );
    }
  });

  it('el ID de Overture es único: no hay dos áreas con el mismo origen', async () => {
    const ref = JSON.stringify({ overture_id: '11111111-1111-4111-8111-111111111111' });
    await db.owner.query(
      "insert into public.geographic_areas (kind, source_class, external_ref) values ('protected_area', 'osm_derived', $1)",
      [ref],
    );
    await expectSqlState(
      db.owner.query(
        "insert into public.geographic_areas (kind, source_class, external_ref) values ('locality', 'osm_derived', $1)",
        [ref],
      ),
      '23505',
    );
  });

  it('los cambios en nombres y en importaciones quedan auditados', async () => {
    const { rows } = await db.owner.query<{ n: number }>(
      "select count(*)::int as n from public.audit_events where entity_table in ('geographic_area_names', 'import_runs')",
    );
    expect(rows[0]?.n).toBeGreaterThan(0);
  });
});
