import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectDenied, expectSqlState, ids, type TestDb } from './helpers';
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

const keys = (rows: { key: string }[]) => rows.map((r) => r.key).sort();

describe('control: las pruebas de RLS no son vacías', () => {
  it('el propietario (sin SET ROLE) ve TODO: es RLS lo que filtra para anon', async () => {
    const owner = await db.owner.query<{ key: string }>('select key from public.destinations');
    expect(keys(owner.rows)).toEqual(['draft-dest', 'pub-dest']);
    const anon = await db.as(
      'anon',
      null,
      async (c) => (await c.query<{ key: string }>('select key from public.destinations')).rows,
    );
    expect(anon.length).toBeLessThan(owner.rows.length);
  });

  it('el rol activo dentro de as() es el pedido y no el propietario', async () => {
    const who = await db.as(
      'anon',
      null,
      async (c) =>
        (
          await c.query<{ u: string; sub: string | null }>(
            'select current_user as u, app.current_user_id()::text as sub',
          )
        ).rows[0],
    );
    expect(who).toEqual({ u: 'anon', sub: null });
    const auth = await db.as(
      'authenticated',
      ids.editor,
      async (c) =>
        (
          await c.query<{ u: string; sub: string }>(
            'select current_user as u, app.current_user_id()::text as sub',
          )
        ).rows[0],
    );
    expect(auth).toEqual({ u: 'authenticated', sub: ids.editor });
  });

  it('un sub mal formado en el JWT falla cerrado (sin identidad ni excepción)', async () => {
    await db.owner.query('begin');
    await db.owner.query('set local role authenticated');
    await db.owner.query(
      'select set_config(\'request.jwt.claims\', \'{"sub": "no-es-uuid"}\', true)',
    );
    const r = await db.owner.query<{ id: string | null }>(
      'select app.current_user_id()::text as id',
    );
    await db.owner.query('rollback');
    expect(r.rows[0]?.id).toBeNull();
  });
});

describe('visitante (anon)', () => {
  it('solo ve los destinos PUBLICADOS', async () => {
    const rows = await db.as(
      'anon',
      null,
      async (c) => (await c.query<{ key: string }>('select key from public.destinations')).rows,
    );
    expect(keys(rows)).toEqual(['pub-dest']);
  });

  it('solo ve traducciones PUBLICADAS de destinos publicados (no la automática ni el borrador)', async () => {
    const rows = await db.as(
      'anon',
      null,
      async (c) =>
        (
          await c.query<{ name: string }>(
            'select name from public.destination_translations order by name',
          )
        ).rows,
    );
    expect(rows.map((r) => r.name)).toEqual(['Destino público']);
  });

  it('solo ve los slugs de destinos publicados', async () => {
    const rows = await db.as(
      'anon',
      null,
      async (c) =>
        (await c.query<{ slug: string }>('select slug from public.destination_slugs')).rows,
    );
    expect(rows.map((r) => r.slug)).toEqual(['destino-publico']);
  });

  it('ve las áreas públicas y las vinculadas a un destino publicado; no las privadas ni las editoriales', async () => {
    const rows = await db.as(
      'anon',
      null,
      async (c) => (await c.query<{ id: string }>('select id from public.geographic_areas')).rows,
    );
    expect(rows.map((r) => r.id).sort()).toEqual([w.areaPublic, w.areaLinked].sort());
  });

  it('de cada área visible solo ve la geometría VIGENTE (no versiones antiguas ni de áreas ocultas)', async () => {
    const rows = await db.as(
      'anon',
      null,
      async (c) =>
        (
          await c.query<{ area_id: string; version: number }>(
            'select area_id, version from public.geometry_versions order by area_id, version',
          )
        ).rows,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => [w.areaPublic, w.areaLinked].includes(r.area_id))).toBe(true);
    expect(rows.find((r) => r.area_id === w.areaPublic)?.version).toBe(2);
  });

  it('la cobertura solo muestra destinos publicados, con estado efectivo derivado', async () => {
    const rows = await db.as(
      'anon',
      null,
      async (c) =>
        (
          await c.query<{ destination_id: string; effective_status: string }>(
            'select destination_id, effective_status from public.current_visual_coverage',
          )
        ).rows,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.destination_id).toBe(w.pubDest);
  });

  it('no puede leer tablas internas: derechos, perfiles, roles ni auditoría', async () => {
    for (const t of ['rights_policies', 'profiles', 'user_roles', 'audit_events']) {
      await expectDenied(db.as('anon', null, (c) => c.query(`select * from public.${t}`)));
    }
  });

  it('no puede escribir en ninguna tabla', async () => {
    await expectDenied(
      db.as('anon', null, (c) =>
        c.query("insert into public.destinations (key, kind) values ('x', 'city')"),
      ),
    );
    await expectDenied(
      db.as('anon', null, (c) => c.query("update public.destinations set status = 'draft'")),
    );
    await expectDenied(db.as('anon', null, (c) => c.query('delete from public.destinations')));
  });
});

describe('usuario autenticado sin roles', () => {
  it('ve lo mismo que un visitante', async () => {
    const rows = await db.as(
      'authenticated',
      ids.user,
      async (c) => (await c.query<{ key: string }>('select key from public.destinations')).rows,
    );
    expect(keys(rows)).toEqual(['pub-dest']);
  });

  it('solo ve su propio perfil y solo puede editar el suyo', async () => {
    await db.as('authenticated', ids.user, async (c) => {
      const mine = await c.query('select id from public.profiles');
      expect(mine.rows).toHaveLength(1);
      const ok = await c.query("update public.profiles set display_name = 'yo' where id = $1", [
        ids.user,
      ]);
      expect(ok.rowCount).toBe(1);
      const theirs = await c.query(
        "update public.profiles set display_name = 'hackeado' where id = $1",
        [ids.other],
      );
      expect(theirs.rowCount).toBe(0); // la fila ajena ni siquiera es visible
    });
  });

  it('NO puede concederse roles a sí mismo (sin escalada de privilegios)', async () => {
    await expectDenied(
      db.as('authenticated', ids.user, (c) =>
        c.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [ids.user]),
      ),
    );
  });

  it('un revisor tampoco puede cambiarse el rol a admin ni borrar los suyos', async () => {
    await db.as('authenticated', ids.reviewer, async (c) => {
      const up = await c.query("update public.user_roles set role = 'admin' where user_id = $1", [
        ids.reviewer,
      ]);
      expect(up.rowCount).toBe(0);
      const del = await c.query('delete from public.user_roles where user_id = $1', [ids.reviewer]);
      expect(del.rowCount).toBe(0);
    });
    const { rows } = await db.owner.query<{ role: string }>(
      'select role from public.user_roles where user_id = $1',
      [ids.reviewer],
    );
    expect(rows.map((r) => r.role)).toEqual(['reviewer']);
  });

  it('un editor tampoco puede ascender a admin', async () => {
    await expectDenied(
      db.as('authenticated', ids.editor, (c) =>
        c.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [ids.editor]),
      ),
    );
  });
});

describe('editor', () => {
  it('crea borradores pero NO publica (publica un revisor o admin)', async () => {
    await db.as('authenticated', ids.editor, async (c) => {
      const r = await c.query<{ status: string }>(
        "insert into public.destinations (key, kind) values ('nuevo', 'city') returning status",
      );
      expect(r.rows[0]?.status).toBe('draft');
    });
    await expectDenied(
      db.as('authenticated', ids.editor, (c) =>
        c.query(
          "insert into public.destinations (key, kind, status) values ('nuevo2', 'city', 'published')",
        ),
      ),
    );
    await expectDenied(
      db.as('authenticated', ids.editor, (c) =>
        c.query("update public.destinations set status = 'published' where key = 'draft-dest'"),
      ),
    );
  });

  it('puede pasar un destino a revisión', async () => {
    await db.as('authenticated', ids.editor, async (c) => {
      const r = await c.query(
        "update public.destinations set status = 'in_review' where key = 'draft-dest'",
      );
      expect(r.rowCount).toBe(1);
    });
  });

  it('crea traducciones en borrador o automáticas, NUNCA revisadas ni con revisor', async () => {
    await db.as('authenticated', ids.editor, async (c) => {
      const r = await c.query<{ translation_status: string }>(
        `insert into public.destination_translations (destination_id, locale, name, source_language, source_version, translation_status, provenance)
         values ($1, 'fr', 'Destination en brouillon', 'es', 1, 'machine_translated', 'ai') returning translation_status`,
        [w.draftDest],
      );
      expect(r.rows[0]?.translation_status).toBe('machine_translated');
    });
    await expectDenied(
      db.as('authenticated', ids.editor, (c) =>
        c.query(
          `insert into public.destination_translations (destination_id, locale, name, source_language, source_version, translation_status, reviewed_by, reviewed_at, provenance)
           values ($1, 'de', 'x', 'es', 1, 'reviewed', $2, now(), 'self')`,
          [w.draftDest, ids.editor],
        ),
      ),
    );
    await expectDenied(
      db.as('authenticated', ids.editor, (c) =>
        c.query(
          `update public.destination_translations set translation_status = 'published', reviewed_by = $2, reviewed_at = now()
            where destination_id = $1 and locale = 'es'`,
          [w.draftDest, ids.editor],
        ),
      ),
    );
  });

  it('no puede modificar una traducción ya publicada', async () => {
    await db.as('authenticated', ids.editor, async (c) => {
      const r = await c.query(
        "update public.destination_translations set name = 'manipulado' where destination_id = $1 and locale = 'es'",
        [w.pubDest],
      );
      expect(r.rowCount).toBe(0);
    });
  });

  it('crea áreas EDITORIALES, pero no se hace pasar por fuente oficial ni derivada', async () => {
    await db.as('authenticated', ids.editor, async (c) => {
      const r = await c.query(
        "insert into public.geographic_areas (kind, source_class) values ('editorial_area', 'editorial') returning id",
      );
      expect(r.rows).toHaveLength(1);
    });
    await expectDenied(
      db.as('authenticated', ids.editor, (c) =>
        c.query(
          "insert into public.geographic_areas (kind, source_class) values ('county', 'official')",
        ),
      ),
    );
    await expectDenied(
      db.as('authenticated', ids.editor, (c) =>
        c.query(
          "insert into public.geographic_areas (kind, source_class) values ('county', 'osm_derived')",
        ),
      ),
    );
  });

  it('añade geometría a un área editorial, pero no a una oficial/derivada', async () => {
    await db.as('authenticated', ids.editor, async (c) => {
      const r = await c.query<{ validity: string }>(
        'insert into public.geometry_versions (area_id, version, geom) values ($1, 2, $2::geometry) returning validity',
        [w.areaEditorial, square(-79.8, 9.1)],
      );
      expect(r.rows[0]?.validity).toBe('valid');
    });
    await expectDenied(
      db.as('authenticated', ids.editor, (c) =>
        c.query(
          'insert into public.geometry_versions (area_id, version, source_version_id, geom) values ($1, 3, $2, $3::geometry)',
          [w.areaPublic, w.sourceVersionId, square(-79.4, 8.9)],
        ),
      ),
    );
  });

  it('puede leer los derechos pero no escribirlos; no borra destinos', async () => {
    await db.as('authenticated', ids.editor, async (c) => {
      expect((await c.query('select subject from public.rights_policies')).rows).toHaveLength(1);
      // Sin política de UPDATE/DELETE para editores: las filas no se tocan (0 afectadas, sin error).
      const upd = await c.query(
        "update public.rights_policies set status = 'verified' where subject = 'overture'",
      );
      expect(upd.rowCount).toBe(0);
      const del = await c.query("delete from public.destinations where key = 'draft-dest'");
      expect(del.rowCount).toBe(0);
    });
    const { rows } = await db.owner.query<{ status: string }>(
      "select status from public.rights_policies where subject = 'overture'",
    );
    expect(rows[0]?.status).toBe('provisional');
    await expectDenied(
      db.as('authenticated', ids.editor, (c) =>
        c.query(
          "insert into public.rights_policies (subject, status) values ('google', 'provisional')",
        ),
      ),
    );
  });
});

describe('revisor', () => {
  const reviewAs = (reviewer: string, reviewedBy: string) =>
    db.as('authenticated', reviewer, (c) =>
      c.query(
        `update public.destination_translations
            set translation_status = 'reviewed', reviewed_by = $2, reviewed_at = now()
          where destination_id = $1 and locale = 'en'`,
        [w.pubDest, reviewedBy],
      ),
    );

  it('revisa SOLO como sí mismo', async () => {
    const r = await reviewAs(ids.reviewer, ids.reviewer);
    expect(r.rowCount).toBe(1);
  });

  it('no puede firmar una revisión con el nombre de otra persona', async () => {
    await expectDenied(reviewAs(ids.reviewer, ids.reviewer2));
  });

  it('nadie revisa su propia traducción (restricción de integridad)', async () => {
    await db.owner.query(
      "update public.destination_translations set translated_by = $1 where destination_id = $2 and locale = 'en'",
      [ids.reviewer, w.pubDest],
    );
    await expectSqlState(reviewAs(ids.reviewer, ids.reviewer), '23514');
    await db.owner.query(
      "update public.destination_translations set translated_by = null where destination_id = $1 and locale = 'en'",
      [w.pubDest],
    );
  });

  it('un revisor sí puede publicar un destino; no concede roles', async () => {
    await db.as('authenticated', ids.reviewer, async (c) => {
      const r = await c.query(
        "update public.destinations set status = 'published' where key = 'draft-dest'",
      );
      expect(r.rowCount).toBe(1);
    });
    await expectDenied(
      db.as('authenticated', ids.reviewer, (c) =>
        c.query("insert into public.user_roles (user_id, role) values ($1, 'editor')", [ids.user]),
      ),
    );
  });

  it('un revisor no edita contenido en borrador como editor (solo revisa)', async () => {
    await expectDenied(
      db.as('authenticated', ids.reviewer, (c) =>
        c.query(
          `insert into public.destination_translations (destination_id, locale, name, source_language, source_version, translation_status, provenance)
           values ($1, 'pt', 'x', 'es', 1, 'draft', 'x')`,
          [w.draftDest],
        ),
      ),
    );
  });
});

describe('administrador', () => {
  it('concede roles, lee la auditoría y gestiona derechos', async () => {
    await db.as('authenticated', ids.admin, async (c) => {
      const grant = await c.query(
        "insert into public.user_roles (user_id, role) values ($1, 'editor')",
        [ids.user],
      );
      expect(grant.rowCount).toBe(1);
      const audit = await c.query<{ n: number }>(
        'select count(*)::int as n from public.audit_events',
      );
      expect(audit.rows[0]?.n).toBeGreaterThan(0);
      const rp = await c.query(
        "update public.rights_policies set status = 'provisional' where subject = 'overture'",
      );
      expect(rp.rowCount).toBe(1);
    });
  });

  it('solo el admin puede borrar un destino', async () => {
    await db.as('authenticated', ids.admin, async (c) => {
      const del = await c.query("delete from public.destinations where key = 'pub-dest'");
      expect(del.rowCount).toBe(1);
    });
  });

  it('un admin ve borradores y todo lo oculto al público', async () => {
    const rows = await db.as(
      'authenticated',
      ids.admin,
      async (c) => (await c.query<{ id: string }>('select id from public.geographic_areas')).rows,
    );
    expect(rows.length).toBe(4);
  });
});
