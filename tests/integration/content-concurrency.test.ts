import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { exportPublished } from '../../scripts/content/export-lib';
import {
  addEvidence,
  createDraft,
  createSource,
  newDestination,
  submit,
  verify,
} from './content-helpers';
import { createTestDb, ids, seedPeople, type Role, type TestDb } from './helpers';

/**
 * Concurrencia del modelo de contenido (F4-8). Hasta ahora todo se probaba con UNA conexión a la vez, pero «verificado,
 * versionado e inmutable» tiene que sostenerse cuando dos personas actúan a la vez sobre el MISMO campo del MISMO destino:
 *
 *  · `assertion_before_insert` calcula la versión como `max(version) + 1`: sin un bloqueo, dos borradores simultáneos
 *    calculan la misma y el segundo falla con 23505 («clave duplicada») en vez de recibir su versión;
 *  · el reemplazo de la versión vigente solo ve lo ya CONFIRMADO: dos verificaciones simultáneas de versiones distintas
 *    no se ven entre sí y la segunda choca con el índice de «una sola vigente» (23505), aunque fuera legítima.
 *
 * Las redes de seguridad (`assertion_unique_version`, `field_assertions_one_current`) evitan la corrupción, pero no el
 * error espurio. La migración 0011 serializa por (destino, campo). La INTERCALACIÓN no se deja al azar: una transacción
 * mantiene sus cambios sin confirmar, la otra se lanza SIN esperarla y no se sigue hasta que `pg_stat_activity` confirma
 * que está bloqueada. Sin `sleep` y sin pruebas que pasen «por suerte».
 */
let db: TestDb;
const sessions: Session[] = [];

interface Session {
  readonly client: Client;
  readonly pid: number;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/** Una conexión PROPIA con su transacción abierta y el rol/usuario de la API (como `db.as`, pero sin cerrar). */
async function openSession(role: Role, userId: string): Promise<Session> {
  const client = new Client({ connectionString: db.connectionString });
  await client.connect();
  await client.query('begin');
  await client.query(`set local role ${role}`);
  await client.query('set local search_path = public, extensions');
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  const { rows } = await client.query<{ pid: number }>('select pg_backend_pid() as pid');
  const session: Session = {
    client,
    pid: (rows[0] as { pid: number }).pid,
    commit: async () => {
      await client.query('commit');
    },
    rollback: async () => {
      await client.query('rollback');
    },
  };
  sessions.push(session);
  return session;
}

type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string | undefined; readonly message: string };

/** Convierte una promesa en un resultado, para lanzarla SIN esperarla y mirarla después. */
const settle = <T>(promise: Promise<T>): Promise<Outcome<T>> =>
  promise.then(
    (value): Outcome<T> => ({ ok: true, value }),
    (error: unknown): Outcome<T> => ({
      ok: false,
      code: (error as { code?: string }).code,
      message: (error as { message?: string }).message ?? String(error),
    }),
  );

/** Espera (sin dormir a ciegas) a que el servidor registre que esa conexión está bloqueada esperando un bloqueo. */
async function waitUntilBlocked(pid: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const { rows } = await db.owner.query<{ wait_event_type: string | null }>(
      'select wait_event_type from pg_stat_activity where pid = $1',
      [pid],
    );
    if (rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`La conexión ${String(pid)} no llegó a bloquearse: ¿terminó antes de esperar?`);
}

/** Falla si `promise` no se resuelve a tiempo: una operación que NO debe esperar a otra. */
async function within<T>(ms: number, promise: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${what}: seguía esperando tras ${String(ms)} ms (¿se bloquea con otra?)`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

beforeAll(async () => {
  db = await createTestDb();
  await seedPeople(db);
}, 120_000);

afterEach(async () => {
  for (const session of sessions.splice(0)) {
    try {
      await session.client.query('rollback');
    } catch {
      // ya cerrada
    }
    await session.client.end().catch(() => undefined);
  }
});

afterAll(async () => {
  // Invariante global tras TODAS las carreras: nunca dos verificadas vigentes del mismo campo ni versiones repetidas.
  const current = await db.owner.query(
    `select destination_id, field_key from public.field_assertions
      where status = 'verified' and superseded_at is null
      group by 1, 2 having count(*) > 1`,
  );
  const repeated = await db.owner.query(
    `select destination_id, field_key, version from public.field_assertions
      group by 1, 2, 3 having count(*) > 1`,
  );
  await db.close();
  expect(current.rows).toEqual([]);
  expect(repeated.rows).toEqual([]);
});

/** Un borrador enviado a revisión (como el editor, con una fuente), listo para que una persona revisora lo verifique. */
async function inReview(destinationId: string, fieldKey = 'overview.summary'): Promise<string> {
  return db.asCommit('authenticated', ids.editor, async (c) => {
    const draft = await createDraft(c, { destinationId, fieldKey, text: '[prueba] concurrencia' });
    await addEvidence(c, draft, await createSource(c));
    await submit(c, draft);
    return draft;
  });
}

const state = async (id: string) =>
  (
    await db.owner.query<{ version: number; status: string; superseded: boolean }>(
      'select version, status, superseded_at is not null as superseded from public.field_assertions where id = $1',
      [id],
    )
  ).rows[0];

const draftDestination = () => newDestination(db, 'locality', 'draft');

describe('versiones: dos borradores del mismo campo a la vez', () => {
  it('el segundo espera al primero y recibe la versión siguiente (antes: error 23505)', async () => {
    const destinationId = await draftDestination();
    const first = await openSession('authenticated', ids.editor);
    const firstDraft = await createDraft(first.client, { destinationId }); // versión 1, sin confirmar
    const second = await openSession('authenticated', ids.editor);
    const secondResult = settle(createDraft(second.client, { destinationId }));
    await waitUntilBlocked(second.pid);

    await first.commit();
    const outcome = await secondResult;
    expect(outcome, 'el segundo borrador debe crearse, no fallar').toMatchObject({ ok: true });
    await second.commit();

    const versions = await db.owner.query<{ id: string; version: number }>(
      'select id, version from public.field_assertions where destination_id = $1 order by version',
      [destinationId],
    );
    expect(versions.rows.map((r) => r.version)).toEqual([1, 2]);
    expect(versions.rows[0]?.id).toBe(firstDraft);
  });

  it('ocho a la vez: todas se crean, con versiones 1…8 sin repetir', async () => {
    const destinationId = await draftDestination();
    const results = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const session = await openSession('authenticated', ids.editor);
        const result = await settle(createDraft(session.client, { destinationId }));
        if (result.ok) await session.commit();
        else await session.rollback();
        return result;
      }),
    );
    expect(
      results.filter((r) => !r.ok).map((r) => (r.ok ? '' : `${String(r.code)} ${r.message}`)),
    ).toEqual([]);
    const { rows } = await db.owner.query<{ version: number }>(
      'select version from public.field_assertions where destination_id = $1 order by version',
      [destinationId],
    );
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  }, 60_000);

  it('campos o destinos DISTINTOS no se bloquean entre sí (la serialización es por destino y campo, no global)', async () => {
    const destinationId = await draftDestination();
    const other = await draftDestination();
    const holder = await openSession('authenticated', ids.editor);
    await createDraft(holder.client, { destinationId, fieldKey: 'overview.summary' }); // retiene su bloqueo
    const sameDestinationOtherField = await openSession('authenticated', ids.editor);
    const otherDestinationSameField = await openSession('authenticated', ids.editor);
    await within(
      5000,
      createDraft(sameDestinationOtherField.client, {
        destinationId,
        fieldKey: 'visit.best_season',
      }),
      'otro campo del mismo destino',
    );
    await within(
      5000,
      createDraft(otherDestinationSameField.client, {
        destinationId: other,
        fieldKey: 'overview.summary',
      }),
      'otro destino, el mismo campo',
    );
  });
});

describe('verificación: dos personas revisoras a la vez sobre el mismo campo', () => {
  it('v1 y v2 a la vez: la segunda espera, reemplaza a la primera y no falla (antes: 23505)', async () => {
    const destinationId = await draftDestination();
    const v1 = await inReview(destinationId);
    const v2 = await inReview(destinationId);

    const first = await openSession('authenticated', ids.reviewer);
    await verify(first.client, v1); // verificada y vigente, sin confirmar
    const second = await openSession('authenticated', ids.reviewer2);
    const secondResult = settle(verify(second.client, v2));
    await waitUntilBlocked(second.pid);

    await first.commit();
    expect(
      await secondResult,
      'la verificación legítima de la versión nueva no debe fallar',
    ).toMatchObject({
      ok: true,
    });
    await second.commit();

    expect(await state(v1)).toMatchObject({ status: 'verified', superseded: true });
    expect(await state(v2)).toMatchObject({ status: 'verified', superseded: false });
  });

  it('una versión ANTERIOR no reemplaza a una posterior ya verificada: error de regla, no de clave duplicada', async () => {
    const destinationId = await draftDestination();
    const v1 = await inReview(destinationId);
    const v2 = await inReview(destinationId);

    const first = await openSession('authenticated', ids.reviewer);
    await verify(first.client, v2); // la POSTERIOR, sin confirmar
    const second = await openSession('authenticated', ids.reviewer2);
    const secondResult = settle(verify(second.client, v1));
    await waitUntilBlocked(second.pid);

    await first.commit();
    const outcome = await secondResult;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toBe('assertion_older_version');
      expect(outcome.code).toBe('23514');
    }
    await second.rollback();

    expect(await state(v2)).toMatchObject({ status: 'verified', superseded: false });
    expect(await state(v1)).toMatchObject({ status: 'in_review' });
  });

  it('disputar la vigente mientras se verifica una nueva: la nueva la reemplaza', async () => {
    const destinationId = await draftDestination();
    const v1 = await inReview(destinationId);
    await db.asCommit('authenticated', ids.reviewer, (c) => verify(c, v1));
    const v2 = await inReview(destinationId);

    const disputer = await openSession('authenticated', ids.reviewer);
    await disputer.client.query(
      "update public.field_assertions set status = 'disputed', status_note = 'Disputa sintética' where id = $1",
      [v1],
    );
    const verifier = await openSession('authenticated', ids.reviewer2);
    const verification = settle(verify(verifier.client, v2));
    await waitUntilBlocked(verifier.pid);

    await disputer.commit();
    expect(await verification).toMatchObject({ ok: true });
    await verifier.commit();

    expect(await state(v1)).toMatchObject({ status: 'disputed', superseded: true });
    expect(await state(v2)).toMatchObject({ status: 'verified', superseded: false });
  });

  it('verificar y rechazar la MISMA versión a la vez: gana la primera, la segunda es una transición inválida', async () => {
    const destinationId = await draftDestination();
    const draft = await inReview(destinationId);

    const verifier = await openSession('authenticated', ids.reviewer);
    await verify(verifier.client, draft);
    const rejector = await openSession('authenticated', ids.reviewer2);
    const rejection = settle(
      rejector.client.query(
        "update public.field_assertions set status = 'rejected', status_note = 'Rechazo sintético' where id = $1",
        [draft],
      ),
    );
    await waitUntilBlocked(rejector.pid);

    await verifier.commit();
    const outcome = await rejection;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toBe('assertion_invalid_transition');
    await rejector.rollback();
    expect(await state(draft)).toMatchObject({ status: 'verified', superseded: false });
  });

  it('tras una carrera de verificaciones, el exportador sigue produciendo una instantánea válida', async () => {
    // Un destino del registro (la instantánea valida contra él) y publicado; los demás destinos de esta suite son borrador.
    const { rows } = await db.owner.query<{ id: string }>(
      "insert into public.destinations (key, kind, status) values ('boquete', 'locality', 'published') returning id",
    );
    const destinationId = (rows[0] as { id: string }).id;
    const v1 = await inReview(destinationId);
    const v2 = await inReview(destinationId);

    const first = await openSession('authenticated', ids.reviewer);
    await verify(first.client, v1);
    const second = await openSession('authenticated', ids.reviewer2);
    const secondResult = settle(verify(second.client, v2));
    await waitUntilBlocked(second.pid);
    await first.commit();
    expect(await secondResult).toMatchObject({ ok: true });
    await second.commit();

    const { snapshot } = await exportPublished(db.owner, new Date());
    expect(snapshot.assertions.map((a) => [a.destinationKey, a.fieldKey, a.version])).toEqual([
      ['boquete', 'overview.summary', 2],
    ]);
  });
});

describe('el orden de los disparadores importa', () => {
  it.each([
    ['INSERT', 4],
    ['UPDATE', 16],
  ])(
    'el bloqueo por destino y campo es el PRIMER disparador BEFORE ROW de %s (si otro corriera antes, leería el estado sin bloquear)',
    async (_event, eventBit) => {
      const { rows } = await db.owner.query<{ tgname: string }>(
        `select tgname from pg_trigger
          where tgrelid = 'public.field_assertions'::regclass and not tgisinternal
            and (tgtype & 1) = 1 and (tgtype & 2) = 2 and (tgtype & $1::int) = $1::int
          order by tgname`,
        [eventBit],
      );
      expect(rows[0]?.tgname).toBe('field_assertions_00_serialize');
    },
  );
});
