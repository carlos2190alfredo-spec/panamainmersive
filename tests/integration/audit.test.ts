import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectSqlState, ids, type TestDb } from './helpers';
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

describe('auditoría inmutable: quién, qué, cuándo, antes y después', () => {
  it('un cambio hecho por un editor queda registrado con su identidad, antes y después', async () => {
    await db.asCommit('authenticated', ids.editor, (c) =>
      c.query("update public.destinations set status = 'in_review' where key = 'draft-dest'"),
    );
    const { rows } = await db.owner.query<{
      actor_id: string;
      action: string;
      before: { status: string };
      after: { status: string };
      at: Date;
    }>(
      `select actor_id, action, before, after, at from public.audit_events
        where entity_table = 'destinations' and entity_id = $1 and action = 'UPDATE' order by id desc limit 1`,
      [w.draftDest],
    );
    expect(rows[0]?.actor_id).toBe(ids.editor);
    expect(rows[0]?.before.status).toBe('draft');
    expect(rows[0]?.after.status).toBe('in_review');
    expect(rows[0]?.at).toBeInstanceOf(Date);
  });

  it('inserciones y borrados también se auditan', async () => {
    await db.asCommit('authenticated', ids.admin, async (c) => {
      await c.query("insert into public.destinations (key, kind) values ('efimero', 'city')");
      await c.query("delete from public.destinations where key = 'efimero'");
    });
    const { rows } = await db.owner.query<{ action: string }>(
      "select action from public.audit_events where entity_table = 'destinations' and (after ->> 'key' = 'efimero' or before ->> 'key' = 'efimero') order by id",
    );
    expect(rows.map((r) => r.action)).toEqual(['INSERT', 'DELETE']);
  });

  it('los cambios de roles (privilegios) se auditan con quién los concedió', async () => {
    await db.asCommit('authenticated', ids.admin, (c) =>
      c.query("insert into public.user_roles (user_id, role) values ($1, 'editor')", [ids.user]),
    );
    const { rows } = await db.owner.query<{ actor_id: string; entity_id: string }>(
      "select actor_id, entity_id from public.audit_events where entity_table = 'user_roles' and after ->> 'user_id' = $1",
      [ids.user],
    );
    expect(rows[0]?.actor_id).toBe(ids.admin);
    expect(rows[0]?.entity_id).toBe(`${ids.user}:editor`);
  });

  it('la geometría pesada NO se vuelca a la auditoría (solo metadatos)', async () => {
    await db.owner.query(
      'insert into public.geometry_versions (area_id, version, geom) values ($1, 5, $2::geometry)',
      [w.areaEditorial, square(-79.7, 9.0)],
    );
    const { rows } = await db.owner.query<{ after: Record<string, unknown> }>(
      "select after from public.audit_events where entity_table = 'geometry_versions' order by id desc limit 1",
    );
    expect(rows[0]?.after).not.toHaveProperty('geom');
    expect(rows[0]?.after).toHaveProperty('area_m2');
  });

  it('las filas de auditoría son inmutables, también para el propietario', async () => {
    const { rows } = await db.owner.query<{ id: string }>(
      'select id from public.audit_events limit 1',
    );
    await expectSqlState(
      db.owner.query("update public.audit_events set action = 'DELETE' where id = $1", [
        rows[0]?.id,
      ]),
      '42501',
    );
    await expectSqlState(
      db.owner.query('delete from public.audit_events where id = $1', [rows[0]?.id]),
      '42501',
    );
    await expectSqlState(db.owner.query('truncate public.audit_events'), '42501');
  });

  it('el actor de una operación del propietario/sistema (sin sesión) es nulo, no inventado', async () => {
    await db.owner.query("insert into public.destinations (key, kind) values ('sistema', 'city')");
    const { rows } = await db.owner.query<{ actor_id: string | null }>(
      "select actor_id from public.audit_events where entity_table = 'destinations' and after ->> 'key' = 'sistema'",
    );
    expect(rows[0]?.actor_id).toBeNull();
  });
});
