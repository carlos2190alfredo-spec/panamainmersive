import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, ids, seedPeople, type TestDb } from './helpers';

/**
 * Una política RLS que llama a `app.is_staff()` (o a otra función de rol) sin envolverla se evalúa FILA A FILA: son
 * funciones `security definer` que consultan `user_roles`, ≈ 60 µs por fila, y se aplican ANTES que los filtros de la
 * propia consulta. `pnpm perf:db` lo midió (la lectura de personal era ×100 más lenta que lo mismo escrito a mano).
 * Envueltas en `(select …)` PostgreSQL las evalúa una vez por sentencia (InitPlan). La migración 0012 reescribió las
 * existentes; esta prueba se ocupa de las FUTURAS: una política nueva con la forma antigua debe fallar aquí.
 */
describe('políticas RLS: una evaluación por consulta (migración 0012)', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    await seedPeople(db);
  });
  afterAll(async () => {
    await db.close();
  });

  const CALL = /app\.(?:is_[a-z]+|current_user_id)\(\)/g;

  async function policies() {
    const { rows } = await db.owner.query<{
      tablename: string;
      policyname: string;
      qual: string | null;
      with_check: string | null;
    }>(
      "select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2",
    );
    return rows;
  }

  /** Llamadas que NO están justo después de `SELECT ` (así imprime `pg_get_expr` una subconsulta). */
  function unwrapped(expression: string | null): string[] {
    if (expression === null) return [];
    const bad: string[] = [];
    for (const match of expression.matchAll(CALL)) {
      const before = expression.slice(Math.max(0, match.index - 7), match.index);
      if (before !== 'SELECT ') bad.push(match[0]);
    }
    return bad;
  }

  it('ninguna política llama a app.is_*() ni a app.current_user_id() sin envolverla en (select …)', async () => {
    const all = await policies();
    const offenders = all.flatMap((p) =>
      [...unwrapped(p.qual), ...unwrapped(p.with_check)].map(
        (call) => `${p.tablename}.${p.policyname}: ${call}`,
      ),
    );
    expect(offenders).toEqual([]);
    // Que la comprobación midió algo: hay políticas y muchas llaman a estas funciones (ya envueltas).
    expect(all.length).toBeGreaterThan(40);
    const wrapped = all.filter((p) => `${p.qual ?? ''}${p.with_check ?? ''}`.match(CALL) !== null);
    expect(wrapped.length).toBeGreaterThan(30);
  });

  it('el detector distingue una llamada envuelta de una sin envolver (no pasa por no mirar)', () => {
    expect(unwrapped('( SELECT app.is_staff() AS is_staff)')).toEqual([]);
    expect(unwrapped('app.is_staff()')).toEqual(['app.is_staff()']);
    expect(unwrapped('(created_by = app.current_user_id())')).toEqual(['app.current_user_id()']);
    expect(
      unwrapped('(a = ( SELECT app.current_user_id() AS current_user_id) AND app.is_admin())'),
    ).toEqual(['app.is_admin()']);
    expect(unwrapped(null)).toEqual([]);
  });

  it('la lectura del personal evalúa la política una sola vez (InitPlan), no en cada fila', async () => {
    // Datos mínimos como propietario (sin disparadores): lo que se comprueba es la FORMA del plan, no el contenido.
    await db.owner.query(
      "insert into public.destinations (key, kind, status) values ('plan-prueba', 'locality', 'published')",
    );
    await db.owner.query('set session_replication_role = replica');
    try {
      await db.owner.query(
        `insert into public.field_assertions (destination_id, field_key, version, source_locale, original_text, created_by)
         select d.id, 'overview.summary', g, 'es', 'plan ' || g, $1::uuid
           from public.destinations d, generate_series(1, 300) g where d.key = 'plan-prueba'`,
        [ids.editor],
      );
    } finally {
      await db.owner.query('set session_replication_role = origin');
    }
    await db.owner.query('analyze public.field_assertions');

    const plan = await db.as('authenticated', ids.reviewer, async (c) => {
      const { rows } = await c.query<{ 'QUERY PLAN': unknown }>(
        "explain (format json) select id from public.field_assertions where status = 'draft'",
      );
      return JSON.stringify(rows[0]?.['QUERY PLAN']);
    });
    expect(plan).toContain('"Parent Relationship":"InitPlan"');
    // La función de rol no aparece como filtro de fila.
    expect(plan).not.toContain('has_role');
    expect(plan).not.toContain('is_staff');

    // Y el resultado es el mismo que siempre: el personal ve las 300; el público, ninguna (son borradores).
    const staff = await db.as('authenticated', ids.reviewer, async (c) =>
      Number(
        (
          await c.query<{ n: string }>(
            "select count(*) as n from public.field_assertions where destination_id = (select id from public.destinations where key = 'plan-prueba')",
          )
        ).rows[0]?.n,
      ),
    );
    expect(staff).toBe(300);
    const anon = await db.as('anon', null, async (c) =>
      Number(
        (await c.query<{ n: string }>('select count(*) as n from public.field_assertions')).rows[0]
          ?.n,
      ),
    );
    expect(anon).toBe(0);
  });
  it('volver a ejecutar la migración no hace nada y FALLA en voz alta (no reenvuelve lo ya envuelto ni se da por buena)', async () => {
    // Si el patrón no distinguiera lo ya envuelto, una segunda pasada lo envolvería otra vez; y si la migración diera por
    // buena una pasada que no cambió nada, un patrón que no encuentra nada pasaría desapercibido.
    const sql = readFileSync(join(process.cwd(), 'db/migrations/0012_rls_initplan.sql'), 'utf8');
    const before = await policies();
    await expect(db.owner.query(sql)).rejects.toThrow(/no reescribió ninguna política/);
    expect(await policies()).toEqual(before);
  });
});
