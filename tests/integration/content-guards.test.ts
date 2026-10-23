import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { exportPublished } from '../../scripts/content/export-lib';
import { getTodayIsoDate } from '../../src/lib/today';
import { createTestDb, expectDenied, ids, seedPeople, type TestDb } from './helpers';
import {
  createDraft,
  createSource,
  makeVerified,
  newDestination,
  rowsOf,
  ruleError,
} from './content-helpers';

/**
 * Garantías del modelo de contenido que NINGUNA prueba ejercía, descubiertas por una revisión independiente que
 * aplicó mutaciones al SQL y comprobó que la suite seguía verde (22 de 39 sobrevivían). Cada prueba de aquí mata
 * al menos una de esas mutaciones: se comprueba con `python3 scripts/mutation/db.py` (README en esa carpeta) y no por ser
 * «obvias». Son garantías de seguridad, no de comodidad:
 *   · lo verificado es inmutable columna por columna (si no, se cambia lo verificado sin volver a verificarlo);
 *   · la autoría y la identidad no se reescriben (si no, «nadie verifica lo que redactó» se salta);
 *   · una traducción automática no se «lava» como humana, y la evidencia no se mueve de una afirmación a otra;
 *   · `anon` solo lee las columnas públicas (lista blanca exacta, no «las que probé»);
 *   · lo que no es público (en disputa, reemplazado, vencido) no entrega ni su texto, ni su traducción, ni sus fuentes;
 *   · la auditoría cubre todas las tablas; el exportador es de solo lectura.
 */
let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await seedPeople(db);
});
afterAll(async () => {
  await db.close();
});

const asEditor = <T>(fn: (c: Client) => Promise<T>) => db.asCommit('authenticated', ids.editor, fn);
const asReviewer = <T>(fn: (c: Client) => Promise<T>) =>
  db.asCommit('authenticated', ids.reviewer, fn);

describe('lo verificado es inmutable, columna por columna', () => {
  let text: string;
  let quantity: string;
  let draft: string;
  let textDestination: string;
  let draftDestination: string;

  beforeAll(async () => {
    textDestination = await newDestination(db);
    draftDestination = await newDestination(db);
    text = await makeVerified(db, { destinationId: textDestination, text: '[prueba] verificada' });
    const volcano = await newDestination(db, 'volcano');
    quantity = await makeVerified(db, {
      destinationId: volcano,
      fieldKey: 'facts.elevation_m',
      quantity: { value: 3475, unit: 'm' },
      sourceClass: 'scientific',
    });
    draft = await asEditor((c) =>
      createDraft(c, { destinationId: draftDestination, text: '[prueba] borrador' }),
    );
  });

  const owner = (sql: string, id: string) => ruleError(db.owner.query(sql, [id]));

  it.each([
    ['el texto original', "original_text = 'otro'", 'assertion_content_is_frozen'],
    ['el idioma del original', "source_locale = 'en'", 'assertion_content_is_frozen'],
    ['el inicio de la vigencia', 'valid_from = current_date - 1', 'assertion_content_is_frozen'],
    ['el fin de la vigencia', 'valid_until = current_date + 30', 'assertion_content_is_frozen'],
    ['la confianza', "confidence = 'high'", 'assertion_content_is_frozen'],
    ['la nota de estado', "status_note = 'otra'", 'assertion_content_is_frozen'],
    ['quién verificó', `verified_by = '${ids.reviewer2}'`, 'assertion_verification_is_immutable'],
    [
      'cuándo se verificó',
      "verified_at = verified_at + interval '1 day'",
      'assertion_verification_is_immutable',
    ],
  ])('no se cambia %s de una afirmación verificada', async (_name, set, message) => {
    const r = await owner(`update public.field_assertions set ${set} where id = $1`, text);
    expect(r.message).toBe(message);
  });

  it.each([
    ['el valor', 'quantity_value = 3000'],
    ['la unidad', "quantity_unit = 'km'"],
  ])('no se cambia %s de una cantidad verificada', async (_name, set) => {
    const r = await owner(`update public.field_assertions set ${set} where id = $1`, quantity);
    expect(r.message).toBe('assertion_content_is_frozen');
  });

  it.each([
    ['a qué destino pertenece', 'destination_id = $2'],
    ['de qué campo es', "field_key = 'access.how_to_get_there'"],
    ['qué versión es', 'version = 7'],
    ['quién la redactó', `created_by = '${ids.reviewer2}'`],
    ['cuándo se creó', "created_at = created_at - interval '1 day'"],
  ])('la identidad no se reescribe: %s (verificada y en borrador)', async (_name, set) => {
    // Cambiar `created_by` permitiría que quien redactó se «convierta» en otra persona y se salte la separación
    // de funciones; cambiar destino o campo publicaría lo verificado bajo otro destino sin volver a verificar.
    // (Cada afirmación se «mueve» al destino de la otra: nunca al suyo, que no sería un cambio.)
    for (const [id, elsewhere] of [
      [text, draftDestination],
      [draft, textDestination],
    ] as const) {
      const sql = `update public.field_assertions set ${set} where id = $1`;
      const r = await ruleError(db.owner.query(sql, set.includes('$2') ? [id, elsewhere] : [id]));
      expect(r.message).toBe('assertion_identity_is_immutable');
    }
  });
});

describe('evidencia y traducciones: su identidad no cambia', () => {
  it('la evidencia de una afirmación verificada no se mueve a otro borrador (ni siquiera por quien la redactó)', async () => {
    const verified = await makeVerified(db, {
      destinationId: await newDestination(db),
      text: '[prueba] con evidencia',
    });
    const otherDestination = await newDestination(db); // antes de entrar al rol: la RLS de destinations no deja a un editor
    const other = await asEditor((c) =>
      createDraft(c, { destinationId: otherDestination, text: '[prueba] otro' }),
    );
    const r = await db.as('authenticated', ids.editor, (c) =>
      ruleError(
        c.query('update public.assertion_evidence set assertion_id = $2 where assertion_id = $1', [
          verified,
          other,
        ]),
      ),
    );
    // Sin esta regla el guardián miraba el estado del DESTINO del movimiento (un borrador) y dejaba pasar el
    // cambio, quitándole la evidencia a lo verificado.
    expect(r.message).toBe('evidence_cannot_move');
    const { rows } = await db.owner.query(
      'select count(*)::int as n from public.assertion_evidence where assertion_id = $1',
      [verified],
    );
    expect(rows[0]).toEqual({ n: 1 });
  });

  describe('traducciones', () => {
    let assertionId: string;
    let target: string;
    beforeAll(async () => {
      assertionId = await makeVerified(db, {
        destinationId: await newDestination(db),
        text: '[prueba] original',
      });
      target = await makeVerified(db, {
        destinationId: await newDestination(db),
        text: '[prueba] otro destino',
      });
      await db.owner.query(
        "insert into public.assertion_translations (assertion_id, locale, text, provenance, status) values ($1, 'fr', '[machine] sortie brute', 'ai_translation', 'machine_translated')",
        [assertionId],
      );
    });

    it('una traducción automática NO se «lava» como humana publicada (ni siquiera una persona revisora)', async () => {
      const r = await db.as('authenticated', ids.reviewer, (c) =>
        ruleError(
          c.query(
            `update public.assertion_translations
                set provenance = 'human_translation', translated_by = $2, status = 'published',
                    reviewed_by = $3, reviewed_at = now()
              where assertion_id = $1 and locale = 'fr'`,
            [assertionId, ids.editor, ids.reviewer],
          ),
        ),
      );
      expect(r.message).toBe('translation_identity_is_immutable');
      const { rows } = await db.owner.query(
        "select provenance::text, status::text from public.assertion_translations where assertion_id = $1 and locale = 'fr'",
        [assertionId],
      );
      expect(rows[0]).toEqual({ provenance: 'ai_translation', status: 'machine_translated' });
    });

    it('ni cambiando SOLO la procedencia (la autoría ya estaba puesta): no hay otra cláusula que lo detenga', async () => {
      // Aquí `translated_by` no cambia: si el guardián dejara de mirar `provenance`, nada más impediría presentar
      // como «traducción humana revisada y publicada» lo que salió de una máquina.
      await db.owner.query(
        `insert into public.assertion_translations (assertion_id, locale, text, provenance, status, translated_by)
         values ($1, 'de', '[machine] rohe Ausgabe', 'ai_translation', 'machine_translated', $2)`,
        [assertionId, ids.editor],
      );
      const r = await db.as('authenticated', ids.reviewer, (c) =>
        ruleError(
          c.query(
            `update public.assertion_translations
                set provenance = 'human_translation', status = 'published', reviewed_by = $2, reviewed_at = now()
              where assertion_id = $1 and locale = 'de'`,
            [assertionId, ids.reviewer],
          ),
        ),
      );
      expect(r.message).toBe('translation_identity_is_immutable');
      const { rows } = await db.owner.query(
        "select provenance::text as provenance from public.assertion_translations where assertion_id = $1 and locale = 'de'",
        [assertionId],
      );
      expect(rows[0]).toEqual({ provenance: 'ai_translation' });
    });

    it.each([
      ['el idioma', "locale = 'pt'"],
      ['la afirmación a la que pertenece', 'assertion_id = $2'],
    ])('no se cambia %s de una traducción', async (_name, set) => {
      const r = await ruleError(
        db.owner.query(
          `update public.assertion_translations set ${set} where assertion_id = $1 and locale = 'fr'`,
          set.includes('$2') ? [assertionId, target] : [assertionId],
        ),
      );
      expect(r.message).toBe('translation_identity_is_immutable');
    });
  });
});

describe('privilegios: lista blanca exacta', () => {
  const TABLES = [
    'content_fields',
    'source_records',
    'field_assertions',
    'assertion_evidence',
    'assertion_translations',
    'field_public_state',
  ];
  /** Qué privilegios tiene `role` sobre alguna columna de cada tabla (incluidos los heredados de PUBLIC). */
  async function columnPrivileges(role: string): Promise<Record<string, Record<string, string[]>>> {
    const { rows } = await db.owner.query<{ t: string; col: string; priv: string }>(
      `select c.relname as t, a.attname as col, p.priv
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
         join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) p(priv)
        where c.relname = any($1) and c.relkind in ('r', 'v')
          and has_column_privilege($2, c.oid, a.attnum, p.priv)
        order by 1, 3, 2`,
      [TABLES, role],
    );
    const out: Record<string, Record<string, string[]>> = {};
    for (const r of rows) ((out[r.t] ??= {})[r.priv] ??= []).push(r.col);
    // El orden no depende de la colación de la base: se ordena aquí (y la lista esperada también).
    for (const privs of Object.values(out)) for (const cols of Object.values(privs)) cols.sort();
    return out;
  }
  async function tablePrivileges(role: string): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    for (const t of TABLES) {
      const granted: string[] = [];
      for (const priv of [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
      ]) {
        const { rows } = await db.owner.query<{ ok: boolean }>(
          'select has_table_privilege($1, $2, $3) as ok',
          [role, `public.${t}`, priv],
        );
        if (rows[0]?.ok) granted.push(priv);
      }
      out[t] = granted;
    }
    return out;
  }

  const sorted = (cols: string[]) => [...cols].sort();

  it('anon solo lee estas columnas (y ninguna otra: ni identidades, ni notas, ni autoría) y no escribe nada', async () => {
    expect(await columnPrivileges('anon')).toEqual({
      field_assertions: {
        SELECT: sorted([
          'confidence',
          'destination_id',
          'field_key',
          'id',
          'original_text',
          'quantity_unit',
          'quantity_value',
          'source_locale',
          'status',
          'superseded_at',
          'valid_from',
          'valid_until',
          'verified_at',
          'version',
        ]),
      },
      assertion_translations: {
        SELECT: sorted(['assertion_id', 'locale', 'provenance', 'status', 'text']),
      },
      assertion_evidence: {
        SELECT: sorted(['assertion_id', 'excerpt', 'id', 'locator', 'source_record_id', 'stance']),
      },
      source_records: {
        SELECT: sorted([
          'id',
          'institution',
          'language',
          'license_name',
          'license_url',
          'published_on',
          'retrieved_at',
          'source_class',
          'title',
          'url',
        ]),
      },
      field_public_state: {
        SELECT: sorted(['destination_key', 'field_key', 'state', 'valid_until', 'verified_at']),
      },
    });
    // Sin privilegios a nivel de tabla (solo columnas concretas): ni DELETE, ni TRUNCATE, ni TRIGGER… La única
    // excepción es la vista de estado público (solo SELECT).
    for (const [table, privileges] of Object.entries(await tablePrivileges('anon'))) {
      expect(privileges, table).toEqual(table === 'field_public_state' ? ['SELECT'] : []);
    }
  });

  it('authenticated: el personal escribe borradores, evidencia y traducciones; las fuentes son de solo inserción', async () => {
    const privs = await columnPrivileges('authenticated');
    const kinds = (table: string) => Object.keys(privs[table] ?? {}).sort();
    expect(kinds('content_fields')).toEqual(['SELECT']);
    expect(kinds('field_public_state')).toEqual(['SELECT']);
    // Sin UPDATE sobre las fuentes: lo que se cita no cambia de enlace, de clase ni de fecha de consulta
    expect(kinds('source_records')).toEqual(['INSERT', 'SELECT']);
    for (const t of ['field_assertions', 'assertion_evidence', 'assertion_translations']) {
      expect(kinds(t), t).toEqual(['INSERT', 'SELECT', 'UPDATE']);
    }
    const tables = await tablePrivileges('authenticated');
    expect(tables.content_fields).toEqual(['SELECT']);
    expect(tables.field_public_state).toEqual(['SELECT']);
    expect(tables.source_records).toEqual(['SELECT', 'INSERT', 'DELETE']);
    for (const t of ['field_assertions', 'assertion_evidence', 'assertion_translations']) {
      expect(tables[t], t).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
    }
  });

  it('comprobación de conducta (no solo de catálogo): anon no lee la identidad de quien revisó', async () => {
    await expectDenied(
      db.as('anon', null, (c) => c.query('select reviewed_by from public.assertion_translations')),
    );
    await expectDenied(
      db.as('anon', null, (c) => c.query('select created_at from public.assertion_evidence')),
    );
  });
});

describe('lo que no es público no entrega su contenido, ni el de sus traducciones, evidencia o fuentes', () => {
  async function publicRows(id: string) {
    return db.as('anon', null, async (c) => ({
      assertions: (await c.query('select id from public.field_assertions where id = $1', [id]))
        .rowCount,
      translations: (
        await c.query('select locale from public.assertion_translations where assertion_id = $1', [
          id,
        ])
      ).rowCount,
      evidence: (
        await c.query('select id from public.assertion_evidence where assertion_id = $1', [id])
      ).rowCount,
      sources: (
        await c.query(
          'select s.id from public.source_records s join public.assertion_evidence e on e.source_record_id = s.id where e.assertion_id = $1',
          [id],
        )
      ).rowCount,
    }));
  }
  /** Una afirmación verificada con una traducción humana publicada (como la deja el flujo real). */
  async function withPublishedTranslation(
    destinationId: string,
    fieldKey = 'overview.summary',
    validUntilDays?: number,
  ) {
    const id = await makeVerified(db, {
      destinationId,
      fieldKey,
      text: '[prueba] original',
      ...(validUntilDays === undefined ? {} : { validUntilDays }),
    });
    await db.owner.query(
      `insert into public.assertion_translations
         (assertion_id, locale, text, provenance, status, translated_by, reviewed_by, reviewed_at)
       values ($1, 'en', '[test] translated', 'human_translation', 'published', $2, $3, now())`,
      [id, ids.editor, ids.reviewer],
    );
    return id;
  }
  const visible = { assertions: 1, translations: 1, evidence: 1, sources: 1 };
  const hidden = { assertions: 0, translations: 0, evidence: 0, sources: 0 };

  it('control: lo verificado y vigente se ve completo', async () => {
    const id = await withPublishedTranslation(await newDestination(db));
    expect(await publicRows(id)).toEqual(visible);
  });

  it('en disputa: ni el texto, ni la traducción, ni la evidencia, ni las fuentes', async () => {
    const id = await withPublishedTranslation(await newDestination(db));
    await asReviewer((c) =>
      c.query(
        "update public.field_assertions set status = 'disputed', status_note = '[prueba] motivo' where id = $1",
        [id],
      ),
    );
    expect(await publicRows(id)).toEqual(hidden);
  });

  it('vencida: ni la traducción ni nada de lo suyo (el borde del último día todavía se ve)', async () => {
    const id = await withPublishedTranslation(
      await newDestination(db),
      'access.how_to_get_there',
      30,
    );
    const setValidUntil = async (expr: string) => {
      await db.owner.query('begin');
      try {
        await db.owner.query('set local session_replication_role = replica'); // simula el paso del tiempo
        await db.owner.query(
          `update public.field_assertions set valid_until = ${expr} where id = $1`,
          [id],
        );
        await db.owner.query('commit');
      } catch (error) {
        await db.owner.query('rollback');
        throw error;
      }
    };
    await setValidUntil('app.panama_today()');
    expect(await publicRows(id)).toEqual(visible);
    await setValidUntil('app.panama_today() - 1');
    expect(await publicRows(id)).toEqual(hidden);
  });

  it('reemplazada por una versión nueva: lo de la versión anterior deja de verse', async () => {
    const destinationId = await newDestination(db);
    const v1 = await withPublishedTranslation(destinationId);
    expect(await publicRows(v1)).toEqual(visible);
    const v2 = await makeVerified(db, { destinationId, text: '[prueba] versión nueva' });
    expect(await publicRows(v1)).toEqual(hidden);
    expect((await publicRows(v2)).assertions).toBe(1);
  });
});

describe('el estado público (vista) en los bordes', () => {
  const stateOf = async (destinationId: string, field: string) => {
    const [{ key }] = (await rowsOf(db.owner, 'select key from public.destinations where id = $1', [
      destinationId,
    ])) as [{ key: string }];
    return db.as('anon', null, (c) =>
      rowsOf(
        c,
        `select field_key, state, to_char(valid_until, 'YYYY-MM-DD') as valid_until
           from public.field_public_state where destination_key = $1 and field_key = $2`,
        [key, field],
      ),
    );
  };

  it('el último día de vigencia todavía es vigente (la vista no lo da por vencido); al día siguiente, sí', async () => {
    const destinationId = await newDestination(db);
    const id = await makeVerified(db, {
      destinationId,
      fieldKey: 'safety.hazards',
      validUntilDays: 30,
    });
    const setValidUntil = async (expr: string) => {
      await db.owner.query('begin');
      try {
        await db.owner.query('set local session_replication_role = replica');
        await db.owner.query(
          `update public.field_assertions set valid_until = ${expr} where id = $1`,
          [id],
        );
        await db.owner.query('commit');
      } catch (error) {
        await db.owner.query('rollback');
        throw error;
      }
    };
    await setValidUntil('app.panama_today()');
    expect(await stateOf(destinationId, 'safety.hazards')).toEqual([]);
    // «Ayer» en Panamá, calculado antes y después de la consulta (por si cruza la medianoche entre las dos)
    const yesterdayBefore = getTodayIsoDate(new Date(Date.now() - 86_400_000));
    await setValidUntil('app.panama_today() - 1');
    const rows = await stateOf(destinationId, 'safety.hazards');
    const yesterdayAfter = getTodayIsoDate(new Date(Date.now() - 86_400_000));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: 'EXPIRED' });
    expect([yesterdayBefore, yesterdayAfter]).toContain(rows[0]?.valid_until);
  });

  it('«hoy» es el día de PANAMÁ, no el de UTC (entre las 00:00 y las 05:00 UTC difieren)', async () => {
    // No se puede falsear `now()` en PostgreSQL: se compara con un oráculo independiente (Intl) y solo es
    // informativo en esa franja diaria. Una regresión a UTC se detectaría en la primera ejecución dentro de ella.
    const before = getTodayIsoDate();
    const { rows } = await db.owner.query<{ today: string }>(
      "select to_char(app.panama_today(), 'YYYY-MM-DD') as today",
    );
    const after = getTodayIsoDate();
    expect([before, after]).toContain(rows[0]?.today);
  });

  it('el ciclo «disputa → versión nueva corregida»: la vista queda vacía y solo vale la nueva', async () => {
    const destinationId = await newDestination(db);
    const v1 = await makeVerified(db, { destinationId, text: '[prueba] v1' });
    await asReviewer((c) =>
      c.query(
        "update public.field_assertions set status = 'disputed', status_note = '[prueba] motivo' where id = $1",
        [v1],
      ),
    );
    expect(await stateOf(destinationId, 'overview.summary')).toEqual([
      expect.objectContaining({ state: 'DISPUTED' }),
    ]);

    const v2 = await makeVerified(db, { destinationId, text: '[prueba] v2 corregida' });
    // La disputada queda reemplazada por el sistema (no por el cliente) y deja de figurar
    const [row] = await rowsOf(
      db.owner,
      'select version, status::text as status, superseded_at is not null as superseded from public.field_assertions where id = $1',
      [v1],
    );
    expect(row).toEqual({ version: 1, status: 'disputed', superseded: true });
    expect(await stateOf(destinationId, 'overview.summary')).toEqual([]);

    const seen = await db.as('anon', null, (c) =>
      rowsOf(c, 'select id from public.field_assertions where destination_id = $1', [
        destinationId,
      ]),
    );
    expect(seen).toEqual([{ id: v2 }]);
  });

  it('y el exportador publica la versión corregida, sin un aviso eterno de la disputada (que bloquearía exportar)', async () => {
    // El exportador exige destinos del registro de código: base propia con «boquete».
    const local = await createTestDb();
    try {
      await seedPeople(local);
      const { rows } = await local.owner.query<{ id: string }>(
        "insert into public.destinations (key, kind, status) values ('boquete', 'locality', 'published') returning id",
      );
      const destinationId = (rows[0] as { id: string }).id;
      const v1 = await makeVerified(local, { destinationId, text: '[prueba] v1' });
      await local.asCommit('authenticated', ids.reviewer, (c) =>
        c.query(
          "update public.field_assertions set status = 'disputed', status_note = '[prueba] motivo' where id = $1",
          [v1],
        ),
      );
      const disputed = await exportPublished(local.owner, new Date());
      expect(disputed.snapshot.assertions).toEqual([]);
      expect(disputed.snapshot.notices).toEqual([
        { destinationKey: 'boquete', fieldKey: 'overview.summary', state: 'DISPUTED' },
      ]);

      const v2 = await makeVerified(local, { destinationId, text: '[prueba] v2 corregida' });
      const fixed = await exportPublished(local.owner, new Date());
      expect(fixed.snapshot.assertions.map((a) => a.id)).toEqual([v2]);
      expect(fixed.snapshot.notices).toEqual([]);
    } finally {
      await local.close();
    }
  });
});

describe('auditoría', () => {
  const actionsOf = async (table: string, entityId: string) =>
    (
      await rowsOf(
        db.owner,
        'select action from public.audit_events where entity_table = $1 and entity_id = $2 order by id',
        [table, entityId],
      )
    ).map((r) => r.action);

  it('las cinco tablas de contenido tienen su disparador de auditoría activo (insert, update y delete)', async () => {
    const rows = await rowsOf(
      db.owner,
      `select c.relname as t, t.tgenabled::text as enabled,
              (t.tgtype & 4) <> 0 as on_insert, (t.tgtype & 16) <> 0 as on_update, (t.tgtype & 8) <> 0 as on_delete
         from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal and t.tgname = c.relname || '_audit'
          and c.relname in ('content_fields', 'source_records', 'field_assertions', 'assertion_evidence', 'assertion_translations')
        order by 1`,
    );
    expect(rows).toEqual(
      [
        'assertion_evidence',
        'assertion_translations',
        'content_fields',
        'field_assertions',
        'source_records',
      ].map((t) => ({ t, enabled: 'O', on_insert: true, on_update: true, on_delete: true })),
    );
  });

  it('el registro de campos: alta, cambio y baja dejan rastro', async () => {
    const key = 'overview.zz_auditoria';
    await db.owner.query(
      `insert into public.content_fields
         (key, field_group, value_kind, sensitivity, evidence_classes, evidence_min_count, evidence_max_age_days)
       values ($1, 'overview', 'text', 'general', array['official']::public.content_source_class[], 1, 30)`,
      [key],
    );
    await db.owner.query(
      'update public.content_fields set evidence_max_age_days = 31 where key = $1',
      [key],
    );
    await db.owner.query('delete from public.content_fields where key = $1', [key]);
    expect(await actionsOf('content_fields', key)).toEqual(['INSERT', 'UPDATE', 'DELETE']);
  });

  it('las fuentes: alta y baja dejan rastro (y no hay cambio posible que auditar)', async () => {
    const source = await asEditor((c) => createSource(c));
    await db.owner.query('delete from public.source_records where id = $1', [source]);
    expect(await actionsOf('source_records', source)).toEqual(['INSERT', 'DELETE']);
  });
});

describe('el exportador es de solo lectura', () => {
  it('dentro de su transacción no se puede escribir nada (ni siquiera una tabla temporal)', async () => {
    // `anon` no tiene privilegios de escritura, así que el rol por sí solo ya impide casi todo; lo que solo impide
    // `read only` es, por ejemplo, crear una tabla temporal (PUBLIC tiene TEMP). Se sondea desde dentro, justo
    // después de que el exportador cambia al rol `anon`, con un punto de guardado para no abortar su transacción.
    const outcomes: string[] = [];
    const empty = await createTestDb(); // sin contenido: el exportador no exige destinos del registro
    const real = empty.owner;
    const spy = new Proxy(real, {
      get(target, prop) {
        if (prop === 'query') {
          return async (...args: unknown[]) => {
            const result = await (target.query as (...a: unknown[]) => Promise<unknown>).apply(
              target,
              args,
            );
            if (typeof args[0] === 'string' && args[0].startsWith('set local role anon')) {
              await target.query('savepoint zz_probe');
              try {
                await target.query('create temp table zz_probe (x int) on commit drop');
                outcomes.push('permitido');
                await target.query('release savepoint zz_probe');
              } catch (error) {
                outcomes.push((error as { code?: string }).code ?? 'error');
                await target.query('rollback to savepoint zz_probe');
              }
            }
            return result;
          };
        }
        const value: unknown = Reflect.get(target, prop, target);
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });
    try {
      await exportPublished(spy, new Date());
    } finally {
      await empty.close();
    }
    expect(outcomes).toEqual(['25006']); // read_only_sql_transaction
  });
});

describe('las fuentes son de solo inserción también para quien tiene todos los privilegios', () => {
  let sourceId: string;
  let uncited: string;
  beforeAll(async () => {
    const verified = await makeVerified(db, {
      destinationId: await newDestination(db),
      text: '[prueba] cita una fuente',
    });
    const { rows } = await db.owner.query<{ source_record_id: string }>(
      'select source_record_id from public.assertion_evidence where assertion_id = $1',
      [verified],
    );
    sourceId = (rows[0] as { source_record_id: string }).source_record_id;
    uncited = await asEditor((c) => createSource(c));
  });

  it.each([
    ['el enlace', "url = 'https://cambiado.example/otra'"],
    ['la clase de fuente', "source_class = 'community'"],
    ['la fecha de consulta', "retrieved_at = retrieved_at - interval '1 day'"],
    ['el título', "title = 'otro título'"],
    ['la institución', "institution = 'otra institución'"],
    ['la licencia', "license_name = 'otra licencia'"],
    ['el idioma', "language = 'en'"],
  ])(
    'no se cambia %s de una fuente citada por lo verificado (ni como propietario)',
    async (_name, set) => {
      // «Una verificación nunca apunta a un enlace que cambió»: sin disparador, esto dependía solo de que ningún rol
      // de la aplicación tuviera UPDATE, y el propietario reescribía la fuente sin dejar más que una fila de auditoría.
      const r = await ruleError(
        db.owner.query(`update public.source_records set ${set} where id = $1`, [sourceId]),
      );
      expect(r.message).toBe('source_records_are_append_only');
    },
  );

  it('tampoco una fuente que todavía nadie cita: se crea otra, no se reescribe', async () => {
    const r = await ruleError(
      db.owner.query(
        "update public.source_records set url = 'https://cambiado.example/x' where id = $1",
        [uncited],
      ),
    );
    expect(r.message).toBe('source_records_are_append_only');
  });

  it('una fuente citada no se puede borrar (la evidencia la referencia)', async () => {
    await expect(
      db.owner.query('delete from public.source_records where id = $1', [sourceId]),
    ).rejects.toMatchObject({
      code: '23503',
    });
  });
});
