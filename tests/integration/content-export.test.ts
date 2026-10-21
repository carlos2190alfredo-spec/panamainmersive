import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportPublished } from '../../scripts/content/export-lib';
import {
  SnapshotError,
  parseSnapshot,
  sameSnapshotContent,
  serializeSnapshot,
} from '../../src/domains/content/snapshot';
import { createTestDb, ids, seedPeople, type TestDb } from './helpers';
import {
  addEvidence,
  createDraft,
  createSource,
  makeVerified,
  rowsOf,
  submit,
} from './content-helpers';

const NOW = new Date('2026-10-21T12:00:00.000Z');

async function destination(
  db: TestDb,
  key: string,
  kind: string,
  status = 'published',
): Promise<string> {
  const { rows } = await db.owner.query<{ id: string }>(
    'insert into public.destinations (key, kind, status) values ($1, $2, $3::public.destination_status) returning id',
    [key, kind, status],
  );
  return (rows[0] as { id: string }).id;
}

describe('exportación de contenido publicado', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedPeople(db);
  });
  afterAll(async () => {
    await db.close();
  });

  it('una base sin contenido exporta una instantánea vacía y válida', async () => {
    const snapshot = await exportPublished(db.owner, NOW);
    expect(snapshot).toEqual({
      schema: 1,
      generatedAt: '2026-10-21T12:00:00.000Z',
      assertions: [],
      notices: [],
    });
  });

  it('exporta solo lo público, sin identidades, y la instantánea pasa las puertas del dominio', async () => {
    const boquete = await destination(db, 'boquete', 'locality');
    const baru = await destination(db, 'volcan-baru', 'volcano');
    const coiba = await destination(db, 'coiba', 'island', 'draft');

    // Verificado con traducciones: solo la humana publicada sale
    const summary = await makeVerified(db, { destinationId: boquete, text: '[prueba] resumen' });
    await db.asCommit('authenticated', ids.editor, async (c) => {
      for (const [locale, provenance, status, by] of [
        ['en', 'human_translation', 'draft', ids.editor],
        ['fr', 'ai_translation', 'machine_translated', null],
        ['pt', 'human_translation', 'draft', ids.editor],
      ] as const) {
        await c.query(
          'insert into public.assertion_translations (assertion_id, locale, text, provenance, status, translated_by) values ($1, $2, $3, $4::public.translation_provenance, $5::public.translation_status, $6)',
          [summary, locale, `[test] ${locale}`, provenance, status, by],
        );
      }
    });
    await db.asCommit('authenticated', ids.reviewer, (c) =>
      c.query(
        "update public.assertion_translations set status = 'published', reviewed_by = $2, reviewed_at = now() where assertion_id = $1 and locale = 'en'",
        [summary, ids.reviewer],
      ),
    );

    // Vencido y disputado: solo aparecen como aviso, sin contenido. Se crea PRIMERO la disputada: por orden
    // alfabético va después, así el orden de los avisos no es una coincidencia con el de inserción.
    const disputed = await makeVerified(db, {
      destinationId: boquete,
      fieldKey: 'safety.hazards',
      validUntilDays: 30,
      text: '[prueba] peligros',
    });
    await db.asCommit('authenticated', ids.reviewer, (c) =>
      c.query(
        "update public.field_assertions set status = 'disputed', status_note = 'Se discute' where id = $1",
        [disputed],
      ),
    );
    const expired = await makeVerified(db, {
      destinationId: boquete,
      fieldKey: 'restrictions.entry_rules',
      validUntilDays: 30,
      text: '[prueba] reglas',
    });
    await db.owner.query('set session_replication_role = replica');
    await db.owner.query(
      "update public.field_assertions set valid_until = (now() at time zone 'America/Panama')::date - 1 where id = $1",
      [expired],
    );
    await db.owner.query('set session_replication_role = origin');

    // Borrador y en revisión: no salen
    await db.asCommit('authenticated', ids.editor, async (c) => {
      await createDraft(c, {
        destinationId: boquete,
        fieldKey: 'access.how_to_get_there',
        validUntilDays: 100,
      });
      const inReview = await createDraft(c, {
        destinationId: boquete,
        fieldKey: 'visit.accessibility',
        validUntilDays: 100,
      });
      await addEvidence(c, inReview, await createSource(c));
      await submit(c, inReview);
    });

    // Reemplazada: solo la última versión
    await makeVerified(db, {
      destinationId: boquete,
      fieldKey: 'visit.best_season',
      validUntilDays: 100,
      text: '[prueba] v1',
    });
    await makeVerified(db, {
      destinationId: boquete,
      fieldKey: 'visit.best_season',
      validUntilDays: 100,
      text: '[prueba] v2',
    });

    // Cantidad en un volcán, y verificado en un destino NO publicado
    await makeVerified(db, {
      destinationId: baru,
      fieldKey: 'facts.elevation_m',
      quantity: { value: 3475, unit: 'm' },
      sourceClass: 'scientific',
    });
    await makeVerified(db, { destinationId: coiba, text: '[prueba] borrador de destino' });
    // Se inserta AL FINAL pero por orden alfabético va primero: así la prueba de orden no es una coincidencia
    await makeVerified(db, {
      destinationId: boquete,
      fieldKey: 'access.how_to_get_there',
      validUntilDays: 100,
      text: '[prueba] cómo llegar',
    });

    const snapshot = await exportPublished(db.owner, NOW);

    expect(
      snapshot.assertions.map((a) => `${a.destinationKey}/${a.fieldKey}@${String(a.version)}`),
    ).toEqual([
      'boquete/access.how_to_get_there@2',
      'boquete/overview.summary@1',
      'boquete/visit.best_season@2',
      'volcan-baru/facts.elevation_m@1',
    ]);
    const s = snapshot.assertions[1];
    expect(s?.texts).toEqual([
      { locale: 'es', text: '[prueba] resumen', provenance: 'original', status: 'published' },
      { locale: 'en', text: '[test] en', provenance: 'human_translation', status: 'published' },
    ]);
    expect(snapshot.assertions[3]).toMatchObject({
      quantity: { value: 3475, unit: 'm' },
      texts: [],
    });
    expect(snapshot.notices.map((n) => [n.fieldKey, n.state])).toEqual([
      ['restrictions.entry_rules', 'EXPIRED'],
      ['safety.hazards', 'DISPUTED'],
    ]);

    // Nada de contenido en los avisos ni identidades en ninguna parte
    const json = serializeSnapshot(snapshot);
    expect(json).not.toContain('[prueba] reglas');
    expect(json).not.toContain('[prueba] peligros');
    expect(json).not.toContain('[prueba] borrador de destino');
    expect(json).not.toContain('[test] fr');
    expect(json).not.toContain('[test] pt');
    for (const id of Object.values(ids)) expect(json).not.toContain(id);
    expect(json).not.toMatch(/created_by|verified_by|status_note|authorId|verifiedById/);
    // Evidencia: solo https y con licencia
    const evidenceIds = snapshot.assertions.flatMap((a) => a.evidence.map((e) => e.id));
    expect(new Set(evidenceIds).size).toBe(evidenceIds.length); // ninguna evidencia compartida entre afirmaciones
    for (const a of snapshot.assertions) {
      expect(a.evidence).toHaveLength(1); // cada una trae solo la SUYA
      for (const e of a.evidence) {
        expect(e.url.startsWith('https://')).toBe(true);
        expect(e.license.name).not.toBe('');
      }
    }
    // Ida y vuelta: lo escrito se lee de nuevo y pasa las mismas puertas
    expect(parseSnapshot(JSON.parse(json))).toEqual(snapshot);
  });

  it('es determinista: la misma base da los mismos bytes, y solo la hora de exportación difiere entre exportaciones', async () => {
    const a = await exportPublished(db.owner, NOW);
    const b = await exportPublished(db.owner, NOW);
    expect(serializeSnapshot(a)).toBe(serializeSnapshot(b));
    const later = await exportPublished(db.owner, new Date('2026-10-22T09:00:00.000Z'));
    expect(serializeSnapshot(a)).not.toBe(serializeSnapshot(later));
    expect(sameSnapshotContent(a, later)).toBe(true);
  });

  it('exporta con el rol anon y deja la conexión limpia (sin transacción ni rol residual)', async () => {
    await exportPublished(db.owner, NOW);
    const [row] = await rowsOf(
      db.owner,
      "select current_user as u, current_setting('transaction_read_only') as ro",
    );
    expect(row).toMatchObject({ u: expect.not.stringMatching(/^anon$/) as unknown, ro: 'off' });
    // y se pudo escribir de nuevo
    await db.owner.query(
      "insert into public.destinations (key, kind, status) values ('tras-export', 'locality', 'draft')",
    );
  });
});

describe('la exportación falla en voz alta (nunca repara ni omite en silencio)', () => {
  it('un destino público que no está en el registro del código se rechaza', async () => {
    const db = await createTestDb();
    try {
      await seedPeople(db);
      const dest = await destination(db, 'destino-que-no-existe-en-el-registro', 'locality');
      await makeVerified(db, { destinationId: dest });
      await expect(exportPublished(db.owner, NOW)).rejects.toBeInstanceOf(SnapshotError);
      // la conexión sigue usable tras el error
      expect(await rowsOf(db.owner, 'select 1 as ok')).toEqual([{ ok: 1 }]);
    } finally {
      await db.close();
    }
  });

  it('datos que no cumplen las puertas (p. ej. alguien se saltó los disparadores) se rechazan al exportar', async () => {
    const db = await createTestDb();
    try {
      await seedPeople(db);
      const dest = await destination(db, 'boquete', 'locality');
      // Simula una BD manipulada: una afirmación «verificada» SIN evidencia, saltando los disparadores
      await db.owner.query('set session_replication_role = replica');
      await db.owner.query(
        `insert into public.field_assertions
           (destination_id, field_key, version, status, source_locale, original_text, confidence, verified_by, verified_at, created_by)
         values ($1, 'overview.summary', 1, 'verified', 'es', '[prueba] sin respaldo', 'high', $2, now(), $3)`,
        [dest, ids.reviewer, ids.editor],
      );
      await db.owner.query('set session_replication_role = origin');
      const error = await exportPublished(db.owner, NOW).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SnapshotError);
      expect((error as SnapshotError).issues.join(' ')).toContain('evidence_none');
    } finally {
      await db.close();
    }
  });

  it('una traducción automática publicada «por error» (saltando restricciones) tampoco sale', async () => {
    const db = await createTestDb();
    try {
      await seedPeople(db);
      const dest = await destination(db, 'boquete', 'locality');
      const id = await makeVerified(db, { destinationId: dest });
      await db.owner.query('alter table public.assertion_translations disable trigger user');
      await db.owner.query(
        'alter table public.assertion_translations drop constraint ai_translation_never_reviewed',
      );
      await db.owner.query(
        `insert into public.assertion_translations (assertion_id, locale, text, provenance, status, reviewed_by, reviewed_at)
         values ($1, 'en', '[test] máquina', 'ai_translation', 'published', $2, now())`,
        [id, ids.reviewer],
      );
      // La RLS ya solo deja ver las humanas: la automática no llega a la instantánea
      const snapshot = await exportPublished(db.owner, NOW);
      expect(JSON.stringify(snapshot)).not.toContain('[test] máquina');
    } finally {
      await db.close();
    }
  });
});
