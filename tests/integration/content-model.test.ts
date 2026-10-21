import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTENT_FIELDS } from '../../src/domains/content/fields';
import {
  createTestDb,
  expectDenied,
  expectSqlState,
  ids,
  seedPeople,
  type TestDb,
} from './helpers';
import {
  addEvidence,
  createDraft,
  createSource,
  makeVerified,
  newDestination,
  rowsOf,
  ruleError,
  submit,
  verify,
} from './content-helpers';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
  await seedPeople(db);
});
afterAll(async () => {
  await db.close();
});

const editor = <T>(fn: (c: Client) => Promise<T>) => db.as('authenticated', ids.editor, fn);
const reviewer = <T>(fn: (c: Client) => Promise<T>) => db.as('authenticated', ids.reviewer, fn);
const anon = <T>(fn: (c: Client) => Promise<T>) => db.as('anon', null, fn);

describe('catálogo de campos', () => {
  it('la semilla de la BD coincide con el registro de código (contrato)', async () => {
    const rows = await rowsOf(
      db.owner,
      'select *, evidence_classes::text[] as classes from public.content_fields order by key',
    );
    const expected = [...CONTENT_FIELDS].sort((a, b) => a.key.localeCompare(b.key));
    expect(rows.map((r) => r.key)).toEqual(expected.map((f) => f.key));
    for (const f of expected) {
      const r = rows.find((x) => x.key === f.key) ?? {};
      expect(r.field_group, f.key).toBe(f.group);
      expect(r.value_kind, f.key).toBe(f.valueKind);
      expect(r.sensitivity, f.key).toBe(f.sensitivity);
      expect([...(r.classes as string[])].sort(), f.key).toEqual([...f.evidence.classes].sort());
      expect(r.evidence_min_count, f.key).toBe(f.evidence.minCount);
      expect(r.evidence_max_age_days, f.key).toBe(f.evidence.maxAgeDays);
      expect(r.max_validity_days, f.key).toBe(f.maxValidityDays);
      expect(r.applies_to, f.key).toEqual(f.appliesTo === 'all' ? null : [...f.appliesTo]);
      expect(r.unit, f.key).toBe('unit' in f ? f.unit : null);
    }
  });

  it('el catálogo no lo escribe nadie desde la aplicación (ni un admin): solo una migración', async () => {
    await expectDenied(
      db.as('authenticated', ids.admin, (c) =>
        c.query(
          "update public.content_fields set evidence_max_age_days = 99999 where key = 'overview.summary'",
        ),
      ),
    );
    await expectDenied(anon((c) => c.query('select key from public.content_fields')));
  });

  it('una fuente comunitaria o comercial no puede declararse suficiente ni con una migración descuidada', async () => {
    await expectSqlState(
      db.owner.query(
        `insert into public.content_fields (key, field_group, value_kind, sensitivity, evidence_classes, evidence_min_count, evidence_max_age_days)
         values ('overview.x', 'overview', 'text', 'general', array['community']::public.content_source_class[], 1, 10)`,
      ),
      '23514',
    );
  });
});

describe('flujo editorial y puertas', () => {
  it('el editor redacta borradores; la versión la asigna el sistema y no la elige el cliente', async () => {
    const dest = await newDestination(db);
    const [a, b] = await db.asCommit('authenticated', ids.editor, async (c) => {
      const first = await createDraft(c, { destinationId: dest });
      const second = await createDraft(c, { destinationId: dest });
      await c.query('update public.field_assertions set original_text = $2 where id = $1', [
        first,
        '[prueba] otro',
      ]);
      return [first, second] as const;
    });
    const rows = await rowsOf(
      db.owner,
      'select id, version, created_by from public.field_assertions where id = any($1) order by version',
      [[a, b]],
    );
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    expect(rows.every((r) => r.created_by === ids.editor)).toBe(true);
    // intentar elegir la versión se ignora
    const forced = await editor(async (c) => {
      const { rows: r } = await c.query<{ version: number }>(
        "insert into public.field_assertions (destination_id, field_key, source_locale, original_text, version) values ($1, 'overview.summary', 'es', '[prueba] x', 99) returning version",
        [dest],
      );
      return r[0]?.version;
    });
    expect(forced).toBe(3);
  });

  it('nadie crea una afirmación ya verificada ni en revisión, ni a nombre de otra persona', async () => {
    const dest = await newDestination(db);
    // El disparador salta antes que la RLS: lo rechaza con un código de regla, también para el propietario.
    for (const status of ['in_review', 'verified']) {
      const err = await ruleError(
        editor((c) =>
          c.query(
            `insert into public.field_assertions (destination_id, field_key, source_locale, original_text, status)
             values ($1, 'overview.summary', 'es', '[prueba] x', $2::public.assertion_status)`,
            [dest, status],
          ),
        ),
      );
      expect(err.message, status).toBe('assertion_must_start_as_draft');
    }
    const owner = await ruleError(
      db.owner.query(
        "insert into public.field_assertions (destination_id, field_key, source_locale, original_text, status, created_by, verified_by, verified_at, confidence) values ($1, 'overview.summary', 'es', '[prueba] x', 'verified', $2, $3, now(), 'high')",
        [dest, ids.editor, ids.reviewer],
      ),
    );
    expect(owner.message).toBe('assertion_must_start_as_draft');
    // La autoría no se suplanta: lo impide la RLS (WITH CHECK).
    await expectDenied(
      editor((c) =>
        c.query(
          "insert into public.field_assertions (destination_id, field_key, source_locale, original_text, created_by) values ($1, 'overview.summary', 'es', '[prueba] x', $2)",
          [dest, ids.reviewer],
        ),
      ),
    );
  });

  it('un editor no puede verificar; una persona sin rol no puede ni redactar', async () => {
    const dest = await newDestination(db);
    const id = await db.asCommit('authenticated', ids.editor, async (c) => {
      const draft = await createDraft(c, { destinationId: dest });
      await addEvidence(c, draft, await createSource(c));
      return draft;
    });
    // De borrador a verificada no existe como transición (primero hay que pasar por revisión)
    const skip = await ruleError(editor((c) => verify(c, id)));
    expect(skip.message).toBe('assertion_invalid_transition');
    // En revisión, un editor ya no ve la fila para modificarla: la RLS la filtra (0 filas, sin error)
    await db.asCommit('authenticated', ids.editor, (c) => submit(c, id));
    const { rowCount } = await editor((c) => verify(c, id));
    expect(rowCount).toBe(0);
    const [row] = await rowsOf(
      db.owner,
      'select status from public.field_assertions where id = $1',
      [id],
    );
    expect(row?.status).toBe('in_review');
    // Sin rol no se redacta
    await expectDenied(
      db.as('authenticated', ids.user, (c) => createDraft(c, { destinationId: dest })),
    );
  });

  it('un revisor verifica con la persona del JWT y la hora del servidor, aunque el cliente intente elegirlas', async () => {
    const dest = await newDestination(db);
    const id = await db.asCommit('authenticated', ids.editor, async (c) => {
      const draft = await createDraft(c, { destinationId: dest });
      await addEvidence(c, draft, await createSource(c));
      await submit(c, draft);
      return draft;
    });
    await db.asCommit('authenticated', ids.reviewer, (c) =>
      c.query(
        "update public.field_assertions set status = 'verified', confidence = 'high', verified_by = $2, verified_at = '2001-01-01T00:00:00Z' where id = $1",
        [id, ids.reviewer2],
      ),
    );
    const [row] = await rowsOf(
      db.owner,
      'select verified_by, verified_at, status, now() as now from public.field_assertions where id = $1',
      [id],
    );
    expect(row?.verified_by).toBe(ids.reviewer);
    expect(row?.status).toBe('verified');
    expect(Math.abs((row?.verified_at as Date).getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('quien redactó no verifica lo suyo, aunque tenga los dos roles', async () => {
    const dest = await newDestination(db);
    const err = await ruleError(
      db.as('authenticated', ids.admin, async (c) => {
        const id = await createDraft(c, { destinationId: dest });
        await addEvidence(c, id, await createSource(c));
        await submit(c, id);
        await verify(c, id);
      }),
    );
    expect(err.message).toBe('verification_gates_failed');
    expect(err.detail.split(',')).toContain('verifier_is_author');
  });

  it('sin evidencia, o con evidencia insuficiente, no se verifica y se dice por qué', async () => {
    const dest = await newDestination(db);
    const idNone = await db.asCommit('authenticated', ids.editor, async (c) => {
      const id = await createDraft(c, { destinationId: dest });
      await submit(c, id);
      return id;
    });
    const none = await ruleError(reviewer((c) => verify(c, idNone)));
    expect(none.detail.split(',')).toEqual(['evidence_none']);

    const dest2 = await newDestination(db);
    const idWeak = await db.asCommit('authenticated', ids.editor, async (c) => {
      const id = await createDraft(c, {
        destinationId: dest2,
        fieldKey: 'restrictions.entry_rules',
        validUntilDays: 100,
      });
      await addEvidence(c, id, await createSource(c, { sourceClass: 'editorial_review' }));
      await submit(c, id);
      return id;
    });
    const weak = await ruleError(reviewer((c) => verify(c, idWeak)));
    expect(weak.detail.split(',')).toEqual(['evidence_class_insufficient']);
    // y la afirmación sigue en revisión: el rechazo no deja estados a medias
    const [row] = await rowsOf(
      db.owner,
      'select status, verified_by from public.field_assertions where id = $1',
      [idWeak],
    );
    expect(row).toMatchObject({ status: 'in_review', verified_by: null });
  });

  it('lo verificado es inmutable: contenido, confianza, verificador, reemplazo y borrado', async () => {
    const dest = await newDestination(db);
    const id = await makeVerified(db, { destinationId: dest });
    const attempts: [string, string][] = [
      [
        "update public.field_assertions set original_text = '[prueba] cambiado' where id = $1",
        'assertion_content_is_frozen',
      ],
      [
        "update public.field_assertions set confidence = 'low' where id = $1",
        'assertion_content_is_frozen',
      ],
      [
        "update public.field_assertions set valid_until = '2099-01-01' where id = $1",
        'assertion_content_is_frozen',
      ],
      [
        "update public.field_assertions set verified_at = now() - interval '1 day' where id = $1",
        'assertion_verification_is_immutable',
      ],
      [
        'update public.field_assertions set superseded_at = now() where id = $1',
        'assertion_superseded_is_system_managed',
      ],
      [
        'update public.field_assertions set version = 7 where id = $1',
        'assertion_identity_is_immutable',
      ],
      [
        "update public.field_assertions set status_note = 'nota' where id = $1",
        'assertion_content_is_frozen',
      ],
    ];
    for (const [sql, code] of attempts) {
      const err = await ruleError(db.as('authenticated', ids.reviewer, (c) => c.query(sql, [id])));
      expect(err.message, sql).toBe(code);
    }
    // ni el propietario (que salta la RLS) puede tocar lo congelado: lo impone el disparador
    const owner = await ruleError(
      db.owner.query("update public.field_assertions set original_text = 'x' where id = $1", [id]),
    );
    expect(owner.message).toBe('assertion_content_is_frozen');
    // y no se borra
    const del = await ruleError(
      db.as('authenticated', ids.admin, (c) =>
        c.query('delete from public.field_assertions where id = $1', [id]),
      ),
    );
    expect(del.message).toBe('assertion_not_deletable');
    const byReviewer = await db.as('authenticated', ids.reviewer, (c) =>
      c.query('delete from public.field_assertions where id = $1', [id]),
    );
    expect(byReviewer.rowCount).toBe(0); // sin política de borrado para el revisor: la RLS filtra
  });

  it('en revisión el contenido y la evidencia están congelados; devolver a borrador los reabre', async () => {
    const dest = await newDestination(db);
    const id = await db.asCommit('authenticated', ids.editor, async (c) => {
      const draft = await createDraft(c, { destinationId: dest });
      await addEvidence(c, draft, await createSource(c));
      await submit(c, draft);
      return draft;
    });
    const frozenText = await ruleError(
      reviewer((c) =>
        c.query("update public.field_assertions set original_text = 'x' where id = $1", [id]),
      ),
    );
    expect(frozenText.message).toBe('assertion_content_is_frozen');
    const frozenEv = await ruleError(
      editor((c) => createSource(c).then((s) => addEvidence(c, id, s))),
    );
    expect(frozenEv.message).toBe('evidence_is_frozen');
    await db.asCommit('authenticated', ids.reviewer, (c) =>
      c.query("update public.field_assertions set status = 'draft' where id = $1", [id]),
    );
    await db.as('authenticated', ids.editor, async (c) => {
      await c.query(
        "update public.field_assertions set original_text = '[prueba] corregido' where id = $1",
        [id],
      );
      await addEvidence(c, id, await createSource(c));
    });
  });

  it('disputar, rechazar o retirar exige un motivo', async () => {
    const dest = await newDestination(db);
    const id = await makeVerified(db, { destinationId: dest });
    await expectSqlState(
      reviewer((c) =>
        c.query("update public.field_assertions set status = 'disputed' where id = $1", [id]),
      ),
      '23514',
    );
    await reviewer((c) =>
      c.query(
        "update public.field_assertions set status = 'disputed', status_note = 'Otra fuente oficial dice lo contrario' where id = $1",
        [id],
      ),
    );
  });

  it('un valor de otro tipo que el del campo no entra (texto en cantidad y al revés) ni cantidades absurdas', async () => {
    const volcano = await newDestination(db, 'volcano');
    const textInQuantity = await ruleError(
      editor((c) =>
        createDraft(c, {
          destinationId: volcano,
          fieldKey: 'facts.elevation_m',
          text: '[prueba] alto',
        }),
      ),
    );
    expect(textInQuantity.message).toBe('assertion_value_kind_mismatch');
    const quantityInText = await ruleError(
      editor((c) =>
        createDraft(c, { destinationId: volcano, quantity: { value: 3475, unit: 'm' } }),
      ),
    );
    expect(quantityInText.message).toBe('assertion_value_kind_mismatch');
    for (const value of [0, -5, 1e13]) {
      await expectSqlState(
        editor((c) =>
          createDraft(c, {
            destinationId: volcano,
            fieldKey: 'facts.elevation_m',
            quantity: { value, unit: 'm' },
          }),
        ),
        '23514',
      );
    }
    await expectSqlState(
      editor((c) =>
        c.query(
          "insert into public.field_assertions (destination_id, field_key, source_locale, quantity_value, quantity_unit) values ($1, 'facts.elevation_m', 'es', 'NaN', 'm')",
          [volcano],
        ),
      ),
      '23514',
    );
  });

  it('una versión nueva verificada reemplaza a la vigente; solo una vigente a la vez', async () => {
    const dest = await newDestination(db);
    const v1 = await makeVerified(db, { destinationId: dest, text: '[prueba] v1' });
    const v2 = await makeVerified(db, { destinationId: dest, text: '[prueba] v2' });
    const rows = await rowsOf(
      db.owner,
      'select id, version, superseded_at from public.field_assertions where destination_id = $1 order by version',
      [dest],
    );
    expect(rows.map((r) => [r.id, r.version, r.superseded_at !== null])).toEqual([
      [v1, 1, true],
      [v2, 2, false],
    ]);
    const seen = await anon((c) =>
      rowsOf(
        c,
        'select original_text, version from public.field_assertions where destination_id = $1',
        [dest],
      ),
    );
    expect(seen).toEqual([{ original_text: '[prueba] v2', version: 2 }]);
    // el índice único lo garantiza aunque alguien intente saltarse el disparador
    await expectSqlState(
      db.owner.query(
        `set session_replication_role = replica;
         update public.field_assertions set superseded_at = null where id = '${v1}';`,
      ),
      '23505',
    ).finally(() => db.owner.query('set session_replication_role = origin'));
  });

  it('un borrador se puede borrar (admin) y arrastra su evidencia; una fuente usada no', async () => {
    const dest = await newDestination(db);
    const { id, src } = await db.asCommit('authenticated', ids.editor, async (c) => {
      const draft = await createDraft(c, { destinationId: dest });
      const s = await createSource(c);
      await addEvidence(c, draft, s);
      return { id: draft, src: s };
    });
    await expectSqlState(
      db.as('authenticated', ids.admin, (c) =>
        c.query('delete from public.source_records where id = $1', [src]),
      ),
      '23503',
    );
    await db.asCommit('authenticated', ids.admin, (c) =>
      c.query('delete from public.field_assertions where id = $1', [id]),
    );
    const left = await rowsOf(
      db.owner,
      'select 1 from public.assertion_evidence where assertion_id = $1',
      [id],
    );
    expect(left).toEqual([]);
  });
});

describe('lo que ve cada rol', () => {
  it('el público no ve borradores ni revisiones; sí lo verificado, sin identidades ni notas', async () => {
    const dest = await newDestination(db);
    await db.asCommit('authenticated', ids.editor, (c) =>
      createDraft(c, {
        destinationId: dest,
        fieldKey: 'access.how_to_get_there',
        validUntilDays: 100,
      }),
    );
    const verified = await makeVerified(db, { destinationId: dest });
    const seen = await anon((c) =>
      rowsOf(
        c,
        'select id, status, field_key from public.field_assertions where destination_id = $1',
        [dest],
      ),
    );
    expect(seen).toEqual([{ id: verified, status: 'verified', field_key: 'overview.summary' }]);
    for (const col of ['created_by', 'verified_by', 'status_note', 'created_at', 'updated_at']) {
      await expectDenied(
        anon((c) =>
          c.query(`select ${col} from public.field_assertions where destination_id = $1`, [dest]),
        ),
      );
    }
    await expectDenied(anon((c) => c.query('select * from public.field_assertions')));
  });

  it('lo verificado de un destino NO publicado no se ve, ni tampoco su estado vencido o en disputa', async () => {
    const dest = await newDestination(db, 'locality', 'draft');
    const ok = await makeVerified(db, { destinationId: dest });
    const risky = await makeVerified(db, {
      destinationId: dest,
      fieldKey: 'safety.hazards',
      validUntilDays: 30,
    });
    await db.asCommit('authenticated', ids.reviewer, (c) =>
      c.query(
        "update public.field_assertions set status = 'disputed', status_note = 'Se discute' where id = $1",
        [risky],
      ),
    );
    const [key] = await rowsOf(db.owner, 'select key from public.destinations where id = $1', [
      dest,
    ]);
    expect(
      await anon((c) =>
        rowsOf(c, 'select 1 from public.field_assertions where destination_id = $1', [dest]),
      ),
    ).toEqual([]);
    // La vista corre con los derechos de su propietario: el filtro de «publicado» es suyo y debe probarse.
    expect(
      await anon((c) =>
        rowsOf(c, 'select 1 from public.field_public_state where destination_key = $1', [key?.key]),
      ),
    ).toEqual([]);
    // En cuanto se publica el destino, lo disputado aparece como estado (sin contenido) y lo verificado se ve.
    await db.owner.query("update public.destinations set status = 'published' where id = $1", [
      dest,
    ]);
    expect(
      (
        await anon((c) =>
          rowsOf(c, 'select id from public.field_assertions where destination_id = $1', [dest]),
        )
      ).map((r) => r.id),
    ).toEqual([ok]);
    expect(
      await anon((c) =>
        rowsOf(c, 'select state from public.field_public_state where destination_key = $1', [
          key?.key,
        ]),
      ),
    ).toEqual([{ state: 'DISPUTED' }]);
  });

  it('una persona autenticada que no es del personal no lee nada de estas tablas', async () => {
    const dest = await newDestination(db);
    await makeVerified(db, { destinationId: dest });
    for (const t of [
      'field_assertions',
      'assertion_evidence',
      'source_records',
      'assertion_translations',
      'content_fields',
    ]) {
      expect(
        await db.as('authenticated', ids.user, (c) => rowsOf(c, `select 1 from public.${t}`)),
        t,
      ).toEqual([]);
    }
    const staff = await db.as('authenticated', ids.editor, (c) =>
      rowsOf(c, 'select 1 from public.field_assertions where destination_id = $1', [dest]),
    );
    expect(staff).toHaveLength(1);
  });

  it('la evidencia y las fuentes solo se ven si respaldan algo público', async () => {
    const dest = await newDestination(db);
    const draftId = await db.asCommit('authenticated', ids.editor, async (c) => {
      const d = await createDraft(c, {
        destinationId: dest,
        fieldKey: 'access.how_to_get_there',
        validUntilDays: 100,
      });
      await addEvidence(c, d, await createSource(c, { url: 'https://example.org/solo-borrador' }));
      return d;
    });
    const verified = await makeVerified(db, { destinationId: dest });
    const evidence = await anon((c) =>
      rowsOf(c, 'select assertion_id from public.assertion_evidence'),
    );
    expect(evidence.map((e) => e.assertion_id)).toContain(verified);
    expect(evidence.map((e) => e.assertion_id)).not.toContain(draftId);
    const sources = await anon((c) => rowsOf(c, 'select url from public.source_records'));
    expect(sources.map((s) => s.url)).not.toContain('https://example.org/solo-borrador');
    expect(sources.length).toBeGreaterThan(0);
    await expectDenied(anon((c) => c.query('select created_by from public.source_records')));
  });

  it('lo vencido deja de verse (y se dice que venció, sin su contenido); lo disputado igual', async () => {
    const dest = await newDestination(db);
    const rules = await makeVerified(db, {
      destinationId: dest,
      fieldKey: 'restrictions.entry_rules',
      validUntilDays: 30,
      text: '[prueba] reglas de entrada',
    });
    const hazards = await makeVerified(db, {
      destinationId: dest,
      fieldKey: 'safety.hazards',
      validUntilDays: 30,
      text: '[prueba] peligros',
    });
    // simula el paso del tiempo (solo aquí): la vigencia terminó ayer
    await db.owner.query('set session_replication_role = replica');
    await db.owner.query(
      "update public.field_assertions set valid_until = (now() at time zone 'America/Panama')::date - 1 where id = $1",
      [rules],
    );
    await db.owner.query('set session_replication_role = origin');
    await db.asCommit('authenticated', ids.reviewer, (c) =>
      c.query(
        "update public.field_assertions set status = 'disputed', status_note = 'Hay una alerta nueva' where id = $1",
        [hazards],
      ),
    );

    const [key] = await rowsOf(db.owner, 'select key from public.destinations where id = $1', [
      dest,
    ]);
    const visible = await anon((c) =>
      rowsOf(c, 'select field_key from public.field_assertions where destination_id = $1', [dest]),
    );
    expect(visible).toEqual([]);

    const state = await anon((c) =>
      rowsOf(
        c,
        'select * from public.field_public_state where destination_key = $1 order by field_key',
        [key?.key],
      ),
    );
    expect(state.map((s) => [s.field_key, s.state])).toEqual([
      ['restrictions.entry_rules', 'EXPIRED'],
      ['safety.hazards', 'DISPUTED'],
    ]);
    expect(state[0]?.valid_until).toBeDefined();
    expect(state[1]).toMatchObject({ verified_at: null, valid_until: null });
    // la vista nunca lleva texto, ids, personas ni notas
    expect(Object.keys(state[0] ?? {}).sort()).toEqual([
      'destination_key',
      'field_key',
      'state',
      'valid_until',
      'verified_at',
    ]);
    expect(JSON.stringify(state)).not.toContain('[prueba]');
  });

  it('el último día de vigencia (día de Panamá) todavía se ve; al día siguiente no', async () => {
    const dest = await newDestination(db);
    const id = await makeVerified(db, {
      destinationId: dest,
      fieldKey: 'access.how_to_get_there',
      validUntilDays: 5,
    });
    const set = async (expr: string) => {
      await db.owner.query('set session_replication_role = replica');
      await db.owner.query(
        `update public.field_assertions set valid_until = ${expr} where id = $1`,
        [id],
      );
      await db.owner.query('set session_replication_role = origin');
    };
    const count = () =>
      anon((c) => rowsOf(c, 'select 1 from public.field_assertions where id = $1', [id])).then(
        (r) => r.length,
      );
    await set("(now() at time zone 'America/Panama')::date");
    expect(await count()).toBe(1);
    await set("(now() at time zone 'America/Panama')::date - 1");
    expect(await count()).toBe(0);
  });
});

describe('traducciones del texto', () => {
  async function verifiedAssertion(): Promise<string> {
    return makeVerified(db, { destinationId: await newDestination(db) });
  }
  const addTranslation = (
    c: Parameters<Parameters<TestDb['as']>[2]>[0],
    id: string,
    over: Record<string, unknown> = {},
  ) =>
    c.query(
      `insert into public.assertion_translations (assertion_id, locale, text, provenance, status, translated_by)
       values ($1, $2, $3, $4::public.translation_provenance, $5::public.translation_status, $6)`,
      [
        id,
        over.locale ?? 'en',
        over.text ?? '[test] text',
        over.provenance ?? 'human_translation',
        over.status ?? 'draft',
        over.translatedBy === undefined ? ids.editor : over.translatedBy,
      ],
    );

  it('el público solo ve traducciones humanas publicadas; nunca automáticas, borradores ni revisadas sin publicar', async () => {
    const id = await verifiedAssertion();
    await db.asCommit('authenticated', ids.editor, async (c) => {
      await addTranslation(c, id, { locale: 'en', status: 'draft' });
      await addTranslation(c, id, {
        locale: 'pt',
        provenance: 'ai_translation',
        status: 'machine_translated',
        translatedBy: null,
      });
      await addTranslation(c, id, { locale: 'fr', status: 'draft' });
    });
    await db.asCommit('authenticated', ids.reviewer, (c) =>
      c.query(
        "update public.assertion_translations set status = 'reviewed', reviewed_by = $2, reviewed_at = now() where assertion_id = $1 and locale = 'fr'",
        [id, ids.reviewer],
      ),
    );
    expect(
      await anon((c) =>
        rowsOf(c, 'select locale from public.assertion_translations where assertion_id = $1', [id]),
      ),
    ).toEqual([]);
    await db.asCommit('authenticated', ids.reviewer, (c) =>
      c.query(
        "update public.assertion_translations set status = 'published' where assertion_id = $1 and locale = 'fr'",
        [id],
      ),
    );
    expect(
      await anon((c) =>
        rowsOf(
          c,
          'select locale, text from public.assertion_translations where assertion_id = $1',
          [id],
        ),
      ),
    ).toEqual([{ locale: 'fr', text: '[test] text' }]);
    await expectDenied(
      anon((c) => c.query('select translated_by from public.assertion_translations')),
    );
  });

  it('una traducción automática no llega a revisada ni publicada, ni por el propietario', async () => {
    const id = await verifiedAssertion();
    await db.asCommit('authenticated', ids.editor, (c) =>
      addTranslation(c, id, {
        provenance: 'ai_translation',
        status: 'machine_translated',
        translatedBy: null,
      }),
    );
    for (const status of ['reviewed', 'published']) {
      await expectSqlState(
        db.owner.query(
          `update public.assertion_translations set status = '${status}', reviewed_by = $2, reviewed_at = now() where assertion_id = $1`,
          [id, ids.reviewer],
        ),
        '23514',
      );
    }
  });

  it('el editor no puede publicar ni firmar como revisor; el revisor solo firma como sí mismo', async () => {
    const id = await verifiedAssertion();
    await expectDenied(editor((c) => addTranslation(c, id, { status: 'published' })));
    await expectDenied(
      editor((c) =>
        c.query(
          `insert into public.assertion_translations (assertion_id, locale, text, provenance, status, translated_by, reviewed_by, reviewed_at)
           values ($1, 'en', '[test] x', 'human_translation', 'reviewed', $2, $3, now())`,
          [id, ids.editor, ids.reviewer],
        ),
      ),
    );
    await db.asCommit('authenticated', ids.editor, (c) => addTranslation(c, id));
    await expectDenied(
      reviewer((c) =>
        c.query(
          "update public.assertion_translations set status = 'reviewed', reviewed_by = $2, reviewed_at = now() where assertion_id = $1",
          [id, ids.reviewer2],
        ),
      ),
    );
  });

  it('nadie revisa su propia traducción (aunque tenga los dos roles)', async () => {
    const id = await verifiedAssertion();
    await db.asCommit('authenticated', ids.admin, (c) =>
      addTranslation(c, id, { translatedBy: ids.admin }),
    );
    await expectSqlState(
      db.as('authenticated', ids.admin, (c) =>
        c.query(
          "update public.assertion_translations set status = 'reviewed', reviewed_by = $2, reviewed_at = now() where assertion_id = $1",
          [id, ids.admin],
        ),
      ),
      '23514',
    );
  });

  it('editar el texto de una traducción revisada o publicada la invalida; y no hay traducción al idioma del original', async () => {
    const id = await verifiedAssertion();
    await db.asCommit('authenticated', ids.editor, (c) => addTranslation(c, id));
    await db.asCommit('authenticated', ids.reviewer, (c) =>
      c.query(
        "update public.assertion_translations set status = 'published', reviewed_by = $2, reviewed_at = now() where assertion_id = $1",
        [id, ids.reviewer],
      ),
    );
    const edit = await ruleError(
      db.owner.query(
        "update public.assertion_translations set text = '[test] otro' where assertion_id = $1",
        [id],
      ),
    );
    expect(edit.message).toBe('translation_edit_resets_review');
    const sameLocale = await ruleError(editor((c) => addTranslation(c, id, { locale: 'es' })));
    expect(sameLocale.message).toBe('translation_in_source_locale');
  });
});

describe('fuentes, auditoría y robustez', () => {
  it('las fuentes son solo de inserción: ni un admin las edita, y solo un admin las borra', async () => {
    const src = await db.asCommit('authenticated', ids.editor, (c) => createSource(c));
    await expectDenied(
      db.as('authenticated', ids.admin, (c) =>
        c.query("update public.source_records set title = 'otro' where id = $1", [src]),
      ),
    );
    const byEditor = await editor((c) =>
      c.query('delete from public.source_records where id = $1', [src]),
    );
    expect(byEditor.rowCount).toBe(0);
  });

  it('una fuente con enlace no seguro, fecha futura o campos vacíos se rechaza', async () => {
    for (const [col, value] of [
      ['url', 'http://example.org/x'],
      ['url', 'javascript:alert(1)'],
      ['url', 'https://example.org/con espacio'],
      ['license_url', 'http://example.org/l'],
      ['title', '   '],
      ['institution', ''],
    ] as const) {
      await expectSqlState(
        editor(async (c) => {
          const s = await createSource(c);
          await c.query(
            `insert into public.source_records (source_class, institution, title, url, retrieved_at, license_name, license_url)
            select source_class, ${col === 'institution' ? '$1' : 'institution'}, ${col === 'title' ? '$1' : 'title'}, ${col === 'url' ? '$1' : 'url'}, retrieved_at, license_name, ${col === 'license_url' ? '$1' : 'license_url'}
              from public.source_records where id = $2`,
            [value, s],
          );
        }),
        '23514',
      );
    }
    await expectSqlState(
      editor((c) =>
        c.query(
          "insert into public.source_records (source_class, institution, title, url, retrieved_at, license_name) values ('official', 'i', 't', 'https://example.org/f', now() + interval '2 days', 'l')",
        ),
      ),
      '23514',
    );
  });

  it('las transiciones quedan en la auditoría con quién y qué estado antes/después', async () => {
    const dest = await newDestination(db);
    const id = await makeVerified(db, { destinationId: dest });
    const rows = await rowsOf(
      db.owner,
      `select actor_id, before ->> 'status' as before, after ->> 'status' as after from public.audit_events
        where entity_table = 'field_assertions' and entity_id = $1 and action = 'UPDATE' order by id`,
      [id],
    );
    expect(rows).toEqual([
      { actor_id: ids.editor, before: 'draft', after: 'in_review' },
      { actor_id: ids.reviewer, before: 'in_review', after: 'verified' },
    ]);
    const ev = await rowsOf(
      db.owner,
      "select count(*)::int as n from public.audit_events where entity_table = 'assertion_evidence'",
    );
    expect(ev[0]?.n).toBeGreaterThan(0);
  });

  it('las traducciones se auditan con identificador compuesto, no nulo', async () => {
    const id = await makeVerified(db, { destinationId: await newDestination(db) });
    await db.asCommit('authenticated', ids.editor, (c) =>
      c.query(
        "insert into public.assertion_translations (assertion_id, locale, text, provenance, status, translated_by) values ($1, 'de', '[test] x', 'human_translation', 'draft', $2)",
        [id, ids.editor],
      ),
    );
    const rows = await rowsOf(
      db.owner,
      "select entity_id from public.audit_events where entity_table = 'assertion_translations' order by id desc limit 1",
    );
    expect(rows[0]?.entity_id).toBe(`${id}:de`);
  });

  it('TRUNCATE está bloqueado en las tablas de contenido, también para el propietario', async () => {
    // Sin referencias entrantes: el bloqueo es del propio disparador, no de una clave foránea.
    await expectSqlState(db.owner.query('truncate public.assertion_evidence'), '42501');
    for (const t of ['field_assertions', 'assertion_evidence', 'source_records']) {
      await expectSqlState(db.owner.query(`truncate public.${t} cascade`), '42501');
      // y cada tabla lleva su PROPIO disparador de TRUNCATE activo (la cascada podría ocultar que falta uno)
      const rows = await rowsOf(
        db.owner,
        `select tgname from pg_trigger
          where tgrelid = ('public.' || $1)::regclass and not tgisinternal and (tgtype & 32) <> 0 and tgenabled = 'O'`,
        [t],
      );
      expect(
        rows.map((r) => r.tgname),
        t,
      ).toEqual([`${t}_no_truncate`]);
    }
  });
});
