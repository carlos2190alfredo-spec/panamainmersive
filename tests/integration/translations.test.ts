import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectSqlState, ids, type TestDb } from './helpers';
import { seedWorld, type World } from './world';

let db: TestDb;
let w: World;

beforeAll(async () => {
  db = await createTestDb();
  w = await seedWorld(db);
});
afterAll(async () => {
  await db.close();
});

const insert = (locale: string, status: string) =>
  db.owner.query(
    `insert into public.destination_translations
       (destination_id, locale, name, source_language, source_version, translation_status, provenance)
     values ($1, $2, 'n', 'es', 1, $3::public.translation_status, 'p')`,
    [w.draftDest, locale, status],
  );

describe('estado editorial de las traducciones (ADR-0008)', () => {
  it('una traducción automática NO puede tener revisor (una máquina no figura como persona)', async () => {
    await expectSqlState(
      db.owner.query(
        `insert into public.destination_translations
           (destination_id, locale, name, source_language, source_version, translation_status, provenance, reviewed_by)
         values ($1, 'pt', 'n', 'es', 1, 'machine_translated', 'p', $2)`,
        [w.draftDest, ids.reviewer],
      ),
      '23514',
    );
  });

  it('revisada o publicada exige revisor Y fecha', async () => {
    for (const status of ['reviewed', 'published']) {
      await expectSqlState(insert('fr', status), '23514');
    }
    await expectSqlState(
      db.owner.query(
        `insert into public.destination_translations
           (destination_id, locale, name, source_language, source_version, translation_status, provenance, reviewed_by)
         values ($1, 'de', 'n', 'es', 1, 'reviewed', 'p', $2)`,
        [w.draftDest, ids.reviewer],
      ),
      '23514',
    );
    // con revisor y fecha sí se admite
    await db.owner.query(
      `insert into public.destination_translations
         (destination_id, locale, name, source_language, source_version, translation_status, provenance, reviewed_by, reviewed_at)
       values ($1, 'de', 'ok', 'es', 1, 'reviewed', 'p', $2, now())`,
      [w.draftDest, ids.reviewer],
    );
  });

  it('nadie revisa su propia traducción', async () => {
    await expectSqlState(
      db.owner.query(
        `insert into public.destination_translations
           (destination_id, locale, name, source_language, source_version, translation_status, provenance, translated_by, reviewed_by, reviewed_at)
         values ($1, 'pt', 'n', 'es', 1, 'reviewed', 'p', $2, $2, now())`,
        [w.draftDest, ids.reviewer],
      ),
      '23514',
    );
  });

  it('un nombre vacío o solo espacios se rechaza', async () => {
    await expectSqlState(
      db.owner.query(
        `insert into public.destination_translations (destination_id, locale, name, source_language, source_version, provenance)
         values ($1, 'pt', '   ', 'es', 1, 'p')`,
        [w.draftDest],
      ),
      '23514',
    );
  });

  it('el idioma debe estar registrado (integridad referencial, sin EAV)', async () => {
    await expectSqlState(
      db.owner.query(
        `insert into public.destination_translations (destination_id, locale, name, source_language, source_version, provenance)
         values ($1, 'zz', 'n', 'es', 1, 'p')`,
        [w.draftDest],
      ),
      '23503',
    );
  });

  it('una sola traducción por (destino, idioma)', async () => {
    await expectSqlState(insert('es', 'draft'), '23505');
  });
});

describe('cambio del original → traducciones afectadas pasan a «outdated»', () => {
  it('subir la versión marca las traducciones antiguas, sin tocar la fila del idioma fuente', async () => {
    const d = (
      await db.owner.query<{ id: string }>(
        "insert into public.destinations (key, kind) values ('versionado', 'city') returning id",
      )
    ).rows[0]?.id;
    const add = (locale: string, status: string, v: number) =>
      db.owner.query(
        `insert into public.destination_translations (destination_id, locale, name, source_language, source_version, translation_status, provenance, reviewed_by, reviewed_at)
         values ($1, $2, 'n', 'es', $3, $4::public.translation_status, 'p', $5, $6)`,
        [
          d,
          locale,
          v,
          status,
          status === 'published' ? ids.reviewer : null,
          status === 'published' ? new Date() : null,
        ],
      );
    await add('es', 'draft', 1); // el original
    await add('en', 'published', 1);
    await add('fr', 'machine_translated', 1);

    await db.owner.query('update public.destinations set version = 2 where id = $1', [d]);

    const { rows } = await db.owner.query<{ locale: string; translation_status: string }>(
      'select locale, translation_status from public.destination_translations where destination_id = $1 order by locale',
      [d],
    );
    expect(rows).toEqual([
      { locale: 'en', translation_status: 'outdated' },
      { locale: 'es', translation_status: 'draft' }, // el original NO se marca
      { locale: 'fr', translation_status: 'outdated' },
    ]);
  });

  it('una traducción ya actualizada a la nueva versión no se vuelve a marcar', async () => {
    const d = (
      await db.owner.query<{ id: string }>(
        "insert into public.destinations (key, kind) values ('versionado2', 'city') returning id",
      )
    ).rows[0]?.id;
    await db.owner.query(
      `insert into public.destination_translations (destination_id, locale, name, source_language, source_version, translation_status, provenance)
       values ($1, 'en', 'n', 'es', 2, 'machine_translated', 'p')`,
      [d],
    );
    await db.owner.query('update public.destinations set version = 2 where id = $1', [d]);
    const { rows } = await db.owner.query<{ translation_status: string }>(
      "select translation_status from public.destination_translations where destination_id = $1 and locale = 'en'",
      [d],
    );
    expect(rows[0]?.translation_status).toBe('machine_translated');
  });

  it('las traducciones no se borran al marcarse como desactualizadas', async () => {
    const { rows } = await db.owner.query<{ n: string }>(
      "select count(*) as n from public.destination_translations where translation_status = 'outdated'",
    );
    expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(2);
  });
});

describe('slugs con alias (ADR-0003)', () => {
  it('(idioma, slug) es único: una URL = un destino', async () => {
    await expectSqlState(
      db.owner.query(
        "insert into public.destination_slugs (destination_id, locale, slug) values ($1, 'es', 'destino-publico')",
        [w.draftDest],
      ),
      '23505',
    );
  });

  it('el mismo slug puede existir en otro idioma', async () => {
    await db.owner.query(
      "insert into public.destination_slugs (destination_id, locale, slug) values ($1, 'en', 'destino-publico')",
      [w.pubDest],
    );
  });

  it('un slug nuevo vigente convierte el anterior en ALIAS (no se borra) y solo hay uno vigente', async () => {
    await db.owner.query(
      "insert into public.destination_slugs (destination_id, locale, slug) values ($1, 'es', 'nuevo-nombre')",
      [w.pubDest],
    );
    const { rows } = await db.owner.query<{ slug: string; is_current: boolean }>(
      "select slug, is_current from public.destination_slugs where destination_id = $1 and locale = 'es' order by slug",
      [w.pubDest],
    );
    expect(rows).toEqual([
      { slug: 'destino-publico', is_current: false }, // alias: la URL antigua sigue resolviendo
      { slug: 'nuevo-nombre', is_current: true },
    ]);
  });

  it('el alias antiguo sigue resolviendo al mismo destino (para el 308)', async () => {
    const { rows } = await db.owner.query<{ destination_id: string }>(
      "select destination_id from public.destination_slugs where locale = 'es' and slug = 'destino-publico'",
    );
    expect(rows[0]?.destination_id).toBe(w.pubDest);
  });

  it('un slug debe ser ASCII en minúsculas con guiones', async () => {
    for (const bad of [
      'Con Mayúsculas',
      'con espacios',
      'acentuado-á',
      '-guion',
      'doble--guion',
      '',
    ]) {
      await expectSqlState(
        db.owner.query(
          "insert into public.destination_slugs (destination_id, locale, slug) values ($1, 'de', $2)",
          [w.pubDest, bad],
        ),
        '23514',
      );
    }
  });
});

describe('identidad estable de los destinos', () => {
  it('la clave debe ser un identificador ASCII y es única', async () => {
    await expectSqlState(
      db.owner.query("insert into public.destinations (key, kind) values ('Mal Nombre', 'city')"),
      '23514',
    );
    await expectSqlState(
      db.owner.query("insert into public.destinations (key, kind) values ('pub-dest', 'city')"),
      '23505',
    );
  });

  it('el tipo de destino está acotado', async () => {
    await expectSqlState(
      db.owner.query("insert into public.destinations (key, kind) values ('raro', 'planeta')"),
      '23514',
    );
  });
});
