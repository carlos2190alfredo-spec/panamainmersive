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

const addCoverage = (status: string, observed: string, expires: string, capability = 'google3d') =>
  db.owner.query<{ id: string }>(
    `insert into public.visual_coverage (destination_id, capability, provider, status, method, observed_at, expires_at)
     values ($1, $2, 'google', $3::public.coverage_status, 'sondeo', $4, $5) returning id`,
    [w.pubDest, capability, status, observed, expires],
  );

const effective = async (id: string): Promise<string> =>
  (
    await db.owner.query<{ effective_status: string }>(
      'select effective_status from public.current_visual_coverage where id = $1',
      [id],
    )
  ).rows[0]?.effective_status as string;

describe('cobertura visual: el estado efectivo se DERIVA de la caducidad', () => {
  it('con evidencia vigente conserva su estado', async () => {
    const id = (await addCoverage('VERIFIED', '2026-01-01', '2999-01-01')).rows[0]?.id ?? '';
    expect(await effective(id)).toBe('VERIFIED');
  });

  it('una evidencia caducada pasa a UNKNOWN, NUNCA a UNAVAILABLE', async () => {
    for (const status of ['VERIFIED', 'PARTIAL', 'UNAVAILABLE', 'ERROR']) {
      const id = (await addCoverage(status, '2020-01-01', '2020-04-01')).rows[0]?.id ?? '';
      expect(await effective(id), status).toBe('UNKNOWN');
    }
  });

  it('el estado almacenado no se altera: solo cambia el efectivo', async () => {
    const id = (await addCoverage('PARTIAL', '2020-01-01', '2020-04-01')).rows[0]?.id ?? '';
    const { rows } = await db.owner.query<{ status: string; effective_status: string }>(
      'select status, effective_status from public.current_visual_coverage where id = $1',
      [id],
    );
    expect(rows[0]).toEqual({ status: 'PARTIAL', effective_status: 'UNKNOWN' });
  });

  it('caduca exactamente en el día `expires_at` (día calendario de Panamá)', async () => {
    const { rows: today } = await db.owner.query<{ d: string }>(
      "select ((now() at time zone 'America/Panama')::date)::text as d",
    );
    const t = today[0]?.d as string;
    const yesterday = (
      await db.owner.query<{ d: string }>('select (($1::date) - 1)::text as d', [t])
    ).rows[0]?.d as string;
    const earlier = (
      await db.owner.query<{ d: string }>('select (($1::date) - 10)::text as d', [t])
    ).rows[0]?.d as string;
    const tomorrow = (
      await db.owner.query<{ d: string }>('select (($1::date) + 1)::text as d', [t])
    ).rows[0]?.d as string;
    expect(await effective((await addCoverage('VERIFIED', earlier, t)).rows[0]?.id ?? '')).toBe(
      'UNKNOWN',
    ); // expira hoy
    expect(
      await effective((await addCoverage('VERIFIED', earlier, yesterday)).rows[0]?.id ?? ''),
    ).toBe('UNKNOWN');
    expect(
      await effective((await addCoverage('VERIFIED', earlier, tomorrow)).rows[0]?.id ?? ''),
    ).toBe('VERIFIED');
  });

  it('la caducidad debe ser posterior a la observación', async () => {
    await expectSqlState(addCoverage('VERIFIED', '2026-10-20', '2026-10-20'), '23514');
    await expectSqlState(addCoverage('VERIFIED', '2026-10-20', '2026-01-01'), '23514');
  });

  it('solo se admiten capacidades y estados conocidos', async () => {
    await expectSqlState(
      addCoverage('VERIFIED', '2026-01-01', '2999-01-01', 'teletransporte'),
      '23514',
    );
    await expect(addCoverage('SI', '2026-01-01', '2999-01-01')).rejects.toMatchObject({
      code: '22P02',
    });
  });

  it('la vista respeta RLS del llamante (security_invoker): un visitante no ve cobertura de destinos no publicados', async () => {
    const rows = await db.as(
      'anon',
      null,
      async (c) =>
        (
          await c.query<{ destination_id: string }>(
            'select destination_id from public.current_visual_coverage',
          )
        ).rows,
    );
    expect(rows.every((r) => r.destination_id === w.pubDest)).toBe(true);
  });
});

describe('política de derechos (ADR-0007): «verified» exige evidencia y una persona', () => {
  it('«provisional» no exige nada más', async () => {
    await db.owner.query(
      "insert into public.rights_policies (subject, status) values ('natural-earth', 'provisional')",
    );
  });

  it('«verified» sin URL, fecha, extracto, revisor y fecha de revisión se rechaza', async () => {
    await expectSqlState(
      db.owner.query(
        "insert into public.rights_policies (subject, status) values ('a', 'verified')",
      ),
      '23514',
    );
    await expectSqlState(
      db.owner.query(
        `insert into public.rights_policies (subject, status, source_url, source_retrieved_at, excerpt)
         values ('b', 'verified', 'https://example.org/license', '2026-10-20', 'texto')`,
      ),
      '23514',
    ); // falta el revisor
  });

  it('«verified» con toda la evidencia se admite', async () => {
    await db.owner.query(
      `insert into public.rights_policies
         (subject, status, allowed_actions, source_url, source_retrieved_at, excerpt, reviewed_by, reviewed_at)
       values ('c', 'verified', '{display,combine}', 'https://example.org/license', '2026-10-20', 'texto', $1, now())`,
      [ids.reviewer],
    );
  });

  it('un sujeto tiene una sola política y las acciones están acotadas', async () => {
    await expectSqlState(
      db.owner.query(
        "insert into public.rights_policies (subject, status) values ('overture', 'provisional')",
      ),
      '23505',
    );
    await expect(
      db.owner.query(
        "insert into public.rights_policies (subject, status, allowed_actions) values ('d', 'provisional', '{fly}')",
      ),
    ).rejects.toMatchObject({ code: '22P02' });
  });
});
