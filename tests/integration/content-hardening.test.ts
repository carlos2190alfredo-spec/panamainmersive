import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isHttpsUrl } from '../../src/domains/content/gates';
import { exportPublished } from '../../scripts/content/export-lib';
import { SnapshotError } from '../../src/domains/content/snapshot';
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

/**
 * Regresiones de la revisión independiente de la Fase 4 (ADR-0020). Cada prueba nombra su hallazgo (R-n) y se escribió
 * PRIMERO, fallando contra la migración 0007; la 0008 las pone en verde. Principio que las ordena: la BD debe ser
 * al menos tan estricta como el dominio y el exportador (lo que la BD acepta, ellos también).
 */
let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
  await seedPeople(db);
});
afterAll(async () => {
  await db.close();
});

const editor = <T>(fn: (c: Client) => Promise<T>) => db.as('authenticated', ids.editor, fn);
const asAdmin = <T>(fn: (c: Client) => Promise<T>) => db.as('authenticated', ids.admin, fn);

describe('R-1 · separación de funciones: solo quien redactó un borrador lo reescribe', () => {
  it('otra persona con editor+revisor no puede cambiar el texto ni la evidencia del borrador de otra', async () => {
    const dest = await newDestination(db);
    const id = await db.asCommit('authenticated', ids.editor, async (c) => {
      const d = await createDraft(c, { destinationId: dest });
      await addEvidence(c, d, await createSource(c));
      return d;
    });
    const changed = await asAdmin((c) =>
      c.query(
        "update public.field_assertions set original_text = '[REESCRITO POR OTRA PERSONA]' where id = $1",
        [id],
      ),
    );
    expect(changed.rowCount).toBe(0);
    const evidence = await ruleError(
      asAdmin(async (c) => addEvidence(c, id, await createSource(c))),
    );
    expect(evidence.message).toBe('evidence_not_author');
    const [row] = await rowsOf(
      db.owner,
      'select original_text from public.field_assertions where id = $1',
      [id],
    );
    expect(row?.original_text).toBe('[prueba] texto');
  });

  it('y sí puede VERIFICAR lo que otra persona redactó, sin tocarlo (el caso legítimo)', async () => {
    const dest = await newDestination(db);
    const id = await db.asCommit('authenticated', ids.editor, async (c) => {
      const d = await createDraft(c, { destinationId: dest });
      await addEvidence(c, d, await createSource(c));
      await submit(c, d);
      return d;
    });
    await db.asCommit('authenticated', ids.admin, (c) => verify(c, id));
    const [row] = await rowsOf(
      db.owner,
      'select status, created_by, verified_by from public.field_assertions where id = $1',
      [id],
    );
    expect(row).toMatchObject({
      status: 'verified',
      created_by: ids.editor,
      verified_by: ids.admin,
    });
  });

  it('un revisor que devuelve a borrador no gana la autoría: sigue editando solo quien creó', async () => {
    const dest = await newDestination(db);
    const id = await db.asCommit('authenticated', ids.editor, async (c) => {
      const d = await createDraft(c, { destinationId: dest });
      await addEvidence(c, d, await createSource(c));
      await submit(c, d);
      return d;
    });
    await db.asCommit('authenticated', ids.admin, (c) =>
      c.query("update public.field_assertions set status = 'draft' where id = $1", [id]),
    );
    const byAdmin = await asAdmin((c) =>
      c.query("update public.field_assertions set original_text = '[otra mano]' where id = $1", [
        id,
      ]),
    );
    expect(byAdmin.rowCount).toBe(0);
    await db.as('authenticated', ids.editor, (c) =>
      c.query("update public.field_assertions set original_text = '[propia]' where id = $1", [id]),
    );
  });
});

describe('R-2 · las traducciones no sobreviven a un cambio del original', () => {
  async function draftWithPublishedTranslation() {
    const dest = await newDestination(db);
    const id = await db.asCommit('authenticated', ids.editor, async (c) => {
      const d = await createDraft(c, {
        destinationId: dest,
        text: '[prueba] No se requiere permiso',
      });
      await addEvidence(c, d, await createSource(c));
      await c.query(
        "insert into public.assertion_translations (assertion_id, locale, text, provenance, status, translated_by) values ($1, 'en', '[test] No permit is required', 'human_translation', 'draft', $2)",
        [d, ids.editor],
      );
      return d;
    });
    await db.asCommit('authenticated', ids.reviewer, (c) =>
      c.query(
        "update public.assertion_translations set status = 'published', reviewed_by = $2, reviewed_at = now() where assertion_id = $1",
        [id, ids.reviewer],
      ),
    );
    return id;
  }

  it('cambiar el original de un borrador deja desactualizada la traducción ya revisada y publicada', async () => {
    const id = await draftWithPublishedTranslation();
    await db.asCommit('authenticated', ids.editor, (c) =>
      c.query(
        "update public.field_assertions set original_text = '[prueba] SE REQUIERE permiso' where id = $1",
        [id],
      ),
    );
    const [t] = await rowsOf(
      db.owner,
      "select status from public.assertion_translations where assertion_id = $1 and locale = 'en'",
      [id],
    );
    expect(t?.status).toBe('outdated');
    await db.asCommit('authenticated', ids.editor, (c) => submit(c, id));
    await db.asCommit('authenticated', ids.reviewer, (c) => verify(c, id));
    const seen = await db.as('anon', null, (c) =>
      rowsOf(c, 'select locale from public.assertion_translations where assertion_id = $1', [id]),
    );
    expect(seen).toEqual([]);
  });

  it('cambiar el idioma del original a uno que ya tiene traducción se rechaza', async () => {
    const id = await draftWithPublishedTranslation();
    const err = await ruleError(
      editor((c) =>
        c.query("update public.field_assertions set source_locale = 'en' where id = $1", [id]),
      ),
    );
    expect(err.message).toBe('assertion_source_locale_conflicts_translation');
  });
});

describe('R-3 · translated_by es inmutable (no se falsea la autoría para esquivar no_self_review)', () => {
  it('ni al revisar ni después', async () => {
    const dest = await newDestination(db);
    const id = await makeVerified(db, { destinationId: dest });
    await db.asCommit('authenticated', ids.admin, (c) =>
      c.query(
        "insert into public.assertion_translations (assertion_id, locale, text, provenance, status, translated_by) values ($1, 'fr', '[test] x', 'human_translation', 'draft', $2)",
        [id, ids.admin],
      ),
    );
    const err = await ruleError(
      asAdmin((c) =>
        c.query(
          "update public.assertion_translations set translated_by = $2, status = 'published', reviewed_by = $3, reviewed_at = now() where assertion_id = $1 and locale = 'fr'",
          [id, ids.editor, ids.admin],
        ),
      ),
    );
    expect(err.message).toBe('translation_identity_is_immutable');
  });

  it('lo mismo en destination_translations', async () => {
    const dest = await newDestination(db);
    await db.owner.query(
      "insert into public.destination_translations (destination_id, locale, name, source_language, source_version, translation_status, provenance, translated_by) values ($1, 'en', 'x', 'es', 1, 'draft', 'human_translation', $2)",
      [dest, ids.editor],
    );
    const err = await ruleError(
      editor((c) =>
        c.query(
          "update public.destination_translations set translated_by = $2 where destination_id = $1 and locale = 'en'",
          [dest, ids.reviewer],
        ),
      ),
    );
    expect(err.message).toBe('translation_identity_is_immutable');
  });
});

describe('R-4 · la BD no acepta lo que el exportador rechazaría (DB ⊆ dominio)', () => {
  it('como mucho 20 evidencias por afirmación', async () => {
    const dest = await newDestination(db);
    const err = await ruleError(
      editor(async (c) => {
        const d = await createDraft(c, { destinationId: dest });
        for (let i = 0; i < 21; i++) await addEvidence(c, d, await createSource(c));
      }),
    );
    expect(err.message).toBe('evidence_limit_exceeded');
  });

  it('enlaces: lo que la BD acepta, new URL() también', async () => {
    const urls = [
      'https://%',
      'https://:1',
      'https://user@',
      'https://[',
      'https://exa%mple.org/',
      'https://example.org:99999999/x',
      'https://exa<mple.org/',
      'https://a..b/',
      'https://-a.example/',
      'https://example.org',
      'https://example.org/a?b=c#d',
      'https://sub.example.org:8443/ruta%20x',
      'https://xn--bcher-kva.example/',
      'https://EXAMPLE.org/',
      'https://1.2.3.4/',
      'https://example.org:0/',
      'https://example.org:65536/',
      'https://example.org:65535/',
    ];
    const accepted: string[] = [];
    for (const url of urls) {
      try {
        await editor((c) => createSource(c, { url }));
        accepted.push(url);
      } catch (error) {
        if ((error as { code?: string }).code !== '23514') throw error;
      }
    }
    expect(
      accepted.filter((u) => !isHttpsUrl(u)),
      'aceptadas por la BD pero rechazadas por el dominio',
    ).toEqual([]);
    // y sigue aceptando lo razonable
    for (const ok of [
      'https://example.org',
      'https://example.org/a?b=c#d',
      'https://sub.example.org:8443/ruta%20x',
      'https://EXAMPLE.org/',
    ]) {
      expect(accepted, ok).toContain(ok);
    }
  });

  it('barrido: de miles de enlaces hostiles, NINGUNO aceptado por la BD lo rechaza new URL() (y la BD acepta bastantes)', async () => {
    const hosts = [
      'example.org',
      'a.b.c',
      '1.2.3.4',
      '999.999.999.999',
      '1.2.3',
      '1',
      'a.1',
      'a.0x1',
      '0x1',
      '01.1.1.1',
      '08.1.1.1',
      '255.255.255.255',
      '256.0.0.1',
      '1.2.3.4.5',
      '-a.com',
      'a-.com',
      'a..com',
      '.com',
      'a.',
      'a.com.',
      'xn--e1afmkfd.xn--p1ai',
      'EXAMPLE',
      'localhost',
      'a_b.com',
      'a b.com',
      'exa%mple.com',
      '[::1]',
      '::1',
      '1e3.com',
      '0.0.0.0',
      '1.2.3.04',
      'a.b-c.d',
      'user@a.com',
      'a.com\\',
      'a.com?x',
      'a.com#x',
      'é.com',
      '日本.jp',
      'a.b.c.d.e.f.g.h',
      'a.1e3',
      '4294967296',
      '0300.0250.1.1',
      '1.2.3.0x4',
      '0x7f.1',
      'a.00',
      'a.09',
    ];
    const ports = ['', ':80', ':0', ':65535', ':65536', ':99999', ':', ':080'];
    const paths = [
      '',
      '/',
      '/a b',
      '/a%20b',
      '/a<b',
      '/a"b',
      '/a\\b',
      '/a^b',
      '/a`b',
      '/a{b}',
      '/a|b',
      '/é',
      '?q=1',
      '#f',
      '/a?b=c#d',
      '/%zz',
    ];
    const urls: string[] = [];
    for (const h of hosts)
      for (const po of ports) for (const pa of paths) urls.push(`https://${h}${po}${pa}`);
    urls.push(
      'http://example.org',
      'HTTPS://example.org',
      'https:/example.org',
      'https:example.org',
      'https://',
      'https:///a',
      '',
      ' https://example.org',
    );
    const rows = await rowsOf(
      db.owner,
      'select u, app.is_https_url(u) as ok from unnest($1::text[]) as u',
      [urls],
    );
    const accepted = rows.filter((r) => r.ok === true).map((r) => r.u as string);
    expect(
      accepted.filter((u) => !isHttpsUrl(u)),
      'aceptadas por la BD pero rechazadas por new URL()',
    ).toEqual([]);
    expect(accepted.length).toBeGreaterThan(100); // la prueba no es vacua: la BD acepta enlaces razonables
    for (const ok of ['https://example.org', 'https://1.2.3.4/', 'https://a.b.c:80/a?b=c#d'])
      expect(accepted).toContain(ok);
    for (const no of [
      'https://999.999.999.999/',
      'https://a.1/',
      'https://a.0x1/',
      'https://08.1.1.1/',
      'https://1/',
      'https://1.2.3/',
    ]) {
      expect(accepted, no).not.toContain(no);
    }
  });

  it('el identificador lo asigna el sistema, no el cliente (UUID no estándar rompería la instantánea)', async () => {
    const forced = '11111111-1111-1111-1111-111111111111';
    const [src] = await db.as('authenticated', ids.editor, async (c) =>
      rowsOf(
        c,
        "insert into public.source_records (id, source_class, institution, title, url, retrieved_at, license_name) values ($1, 'official', 'i', 't', 'https://example.org/forzada', now(), 'l') returning id",
        [forced],
      ),
    );
    expect(src?.id).not.toBe(forced);
    const dest = await newDestination(db);
    const [a] = await db.as('authenticated', ids.editor, (c) =>
      rowsOf(
        c,
        "insert into public.field_assertions (id, destination_id, field_key, source_locale, original_text) values ($1, $2, 'overview.summary', 'es', '[prueba] x') returning id",
        [forced, dest],
      ),
    );
    expect(a?.id).not.toBe(forced);
    const dest2 = await newDestination(db);
    const [ev] = await db.as('authenticated', ids.editor, async (c) => {
      const draft = await createDraft(c, { destinationId: dest2 });
      const source = await createSource(c);
      return rowsOf(
        c,
        'insert into public.assertion_evidence (id, assertion_id, source_record_id) values ($1, $2, $3) returning id',
        [forced, draft, source],
      );
    });
    expect(ev?.id).not.toBe(forced);
  });

  it('un texto «en blanco» según JavaScript (NBSP, saltos, U+3000…) también lo rechaza la BD, carácter por carácter', async () => {
    const rows = await rowsOf(
      db.owner,
      `select array_agg(g order by g) as blank from generate_series(1, 65535) g
        where (g < 55296 or g > 57343) and app.is_blank(chr(g))`,
    );
    const inSql = (rows[0]?.blank as number[] | null) ?? [];
    const inJs: number[] = [];
    for (let c = 1; c < 65536; c++) {
      if (c >= 0xd800 && c <= 0xdfff) continue;
      if (String.fromCharCode(c).trim() === '') inJs.push(c);
    }
    expect(inSql).toEqual(inJs);
    const dest = await newDestination(db);
    for (const blank of [' ', '\n', '\t', ' ', '﻿', '　', ' ']) {
      await expectSqlState(
        editor((c) => createDraft(c, { destinationId: dest, text: blank })),
        '23514',
      );
    }
  });

  it('los tamaños se cuentan en caracteres (puntos de código) en la BD y en el dominio por igual', async () => {
    const { codePointLength } = await import('../../src/domains/content/gates');
    expect(codePointLength('😀'.repeat(2500))).toBe(2500);
    expect(codePointLength('a😀b')).toBe(3);
  });

  it('un destino con afirmaciones no cambia de tipo ni de clave (la puerta de aplicabilidad leyó el tipo de entonces)', async () => {
    const dest = await newDestination(db);
    await db.asCommit('authenticated', ids.editor, (c) => createDraft(c, { destinationId: dest }));
    const kind = await ruleError(
      db.owner.query("update public.destinations set kind = 'volcano' where id = $1", [dest]),
    );
    expect(kind.message).toBe('destination_identity_frozen');
    const key = await ruleError(
      db.owner.query("update public.destinations set key = 'otra-clave' where id = $1", [dest]),
    );
    expect(key.message).toBe('destination_identity_frozen');
    // sin afirmaciones sí se puede
    const free = await newDestination(db);
    await db.owner.query("update public.destinations set kind = 'island' where id = $1", [free]);
  });
});

describe('R-5 · orden de versiones: una anterior no reemplaza a una posterior', () => {
  it('verificar v1 después de v2 se rechaza y v2 sigue vigente', async () => {
    const dest = await newDestination(db);
    const [v1, v2] = await db.asCommit('authenticated', ids.editor, async (c) => {
      const made: string[] = [];
      for (const text of ['[prueba] antiguo', '[prueba] corrección']) {
        const d = await createDraft(c, { destinationId: dest, text });
        await addEvidence(c, d, await createSource(c));
        await submit(c, d);
        made.push(d);
      }
      return made as [string, string];
    });
    await db.asCommit('authenticated', ids.reviewer, (c) => verify(c, v2));
    const err = await ruleError(db.as('authenticated', ids.reviewer, (c) => verify(c, v1)));
    expect(err.message).toBe('assertion_older_version');
    const seen = await db.as('anon', null, (c) =>
      rowsOf(c, 'select original_text from public.field_assertions where destination_id = $1', [
        dest,
      ]),
    );
    expect(seen).toEqual([{ original_text: '[prueba] corrección' }]);
  });
});

describe('R-6 · la vista de estado y las funciones internas no filtran', () => {
  it('field_public_state es security_barrier: un predicado hostil de anon no ve destinos sin publicar', async () => {
    const dest = await newDestination(db, 'locality', 'draft');
    const risky = await makeVerified(db, {
      destinationId: dest,
      fieldKey: 'safety.hazards',
      validUntilDays: 30,
    });
    await db.asCommit('authenticated', ids.reviewer, (c) =>
      c.query(
        "update public.field_assertions set status = 'disputed', status_note = 'se discute' where id = $1",
        [risky],
      ),
    );
    const rows = await db.as('anon', null, (c) =>
      rowsOf(
        c,
        'select * from public.field_public_state where destination_key::regclass is not null',
      ),
    );
    expect(rows).toEqual([]);
  });

  it('una persona autenticada sin rol no puede ejecutar la función de puertas ni sondear por los disparadores', async () => {
    const dest = await newDestination(db);
    const id = await makeVerified(db, { destinationId: dest });
    await expectDenied(
      db.as('authenticated', ids.user, (c) =>
        c.query(
          "select app.assertion_gate_issues(json_populate_record(null::public.field_assertions, '{}'::json))",
        ),
      ),
    );
    // antes: 23514 (revelaba el idioma del original); ahora, igual que la RLS: sin acceso
    await expectDenied(
      db.as('authenticated', ids.user, (c) =>
        c.query(
          "insert into public.assertion_translations (assertion_id, locale, text, provenance, status, translated_by) values ($1, 'es', 'x', 'human_translation', 'draft', $2)",
          [id, ids.user],
        ),
      ),
    );
  });

  it('el personal sí puede previsualizar las puertas con una función propia', async () => {
    const dest = await newDestination(db);
    const draft = await db.asCommit('authenticated', ids.editor, (c) =>
      createDraft(c, { destinationId: dest }),
    );
    const rows = await db.as('authenticated', ids.reviewer, (c) =>
      rowsOf(c, 'select app.preview_assertion_gates($1) as issues', [draft]),
    );
    expect(rows[0]?.issues).toContain('evidence_none');
    await expectDenied(
      db.as('authenticated', ids.user, (c) =>
        rowsOf(c, 'select app.preview_assertion_gates($1)', [draft]),
      ),
    );
  });
});

describe('R-1/R-2/R-6 · cierres que las otras pruebas no distinguían', () => {
  it('una persona sin rol no sondea la evidencia de una afirmación oculta: recibe 42501, no un código que revele su estado', async () => {
    const dest = await newDestination(db);
    const id = await db.asCommit('authenticated', ids.editor, async (c) => {
      const d = await createDraft(c, { destinationId: dest });
      await addEvidence(c, d, await createSource(c));
      await submit(c, d);
      return d;
    });
    const source = await db.asCommit('authenticated', ids.editor, (c) => createSource(c));
    // antes: 23514 evidence_is_frozen (revelaba que está en revisión); ahora, igual que la RLS: sin acceso
    await expectDenied(
      db.as('authenticated', ids.user, (c) =>
        c.query(
          'insert into public.assertion_evidence (assertion_id, source_record_id) values ($1, $2)',
          [id, source],
        ),
      ),
    );
  });

  it('una traducción desactualizada no vuelve a publicarse sin reescribirla', async () => {
    const dest = await newDestination(db);
    const id = await db.asCommit('authenticated', ids.editor, async (c) => {
      const d = await createDraft(c, { destinationId: dest });
      await addEvidence(c, d, await createSource(c));
      await c.query(
        "insert into public.assertion_translations (assertion_id, locale, text, provenance, status, translated_by) values ($1, 'en', '[test] x', 'human_translation', 'draft', $2)",
        [d, ids.editor],
      );
      return d;
    });
    await db.asCommit('authenticated', ids.reviewer, (c) =>
      c.query(
        "update public.assertion_translations set status = 'published', reviewed_by = $2, reviewed_at = now() where assertion_id = $1",
        [id, ids.reviewer],
      ),
    );
    await db.asCommit('authenticated', ids.editor, (c) =>
      c.query("update public.field_assertions set original_text = '[prueba] otro' where id = $1", [
        id,
      ]),
    );
    const err = await ruleError(
      db.as('authenticated', ids.reviewer, (c) =>
        c.query(
          "update public.assertion_translations set status = 'published' where assertion_id = $1",
          [id],
        ),
      ),
    );
    expect(err.message).toBe('translation_outdated_needs_new_text');
  });

  it('el disparador también impide la edición ajena cuando la RLS no interviene (propietario con la identidad de otra persona)', async () => {
    const dest = await newDestination(db);
    const id = await db.asCommit('authenticated', ids.editor, (c) =>
      createDraft(c, { destinationId: dest }),
    );
    await db.owner.query('begin');
    try {
      await db.owner.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: ids.admin, role: 'authenticated' }),
      ]);
      const err = await ruleError(
        db.owner.query(
          "update public.field_assertions set original_text = '[otra mano]' where id = $1",
          [id],
        ),
      );
      expect(err.message).toBe('assertion_edit_not_author');
    } finally {
      await db.owner.query('rollback');
    }
  });
});

describe('R-7 · límites de tamaño y rangos de los datos', () => {
  it('unidad ≤ 8 caracteres, cantidad ≥ 1e-6, fechas entre 1900 y 9999 y sin infinitos', async () => {
    const volcano = await newDestination(db, 'volcano');
    await expectSqlState(
      db.owner.query(
        "insert into public.field_assertions (destination_id, field_key, source_locale, quantity_value, quantity_unit, created_by) values ($1, 'facts.elevation_m', 'es', 1, 'mmmmmmmmm', $2)",
        [volcano, ids.editor],
      ),
      '23514',
    );
    await expectSqlState(
      db.owner.query(
        "insert into public.field_assertions (destination_id, field_key, source_locale, quantity_value, quantity_unit, created_by) values ($1, 'facts.elevation_m', 'es', 1e-400, 'm', $2)",
        [volcano, ids.editor],
      ),
      '23514',
    );
    const dest = await newDestination(db);
    for (const date of ['10000-01-01', '0050-01-01', 'infinity', '-infinity']) {
      await expectSqlState(
        db.owner.query(
          "insert into public.field_assertions (destination_id, field_key, source_locale, original_text, valid_until, created_by) values ($1, 'overview.summary', 'es', 'x', $2, $3)",
          [dest, date, ids.editor],
        ),
        '23514',
      );
    }
    await expectSqlState(
      db.owner.query(
        "insert into public.source_records (source_class, institution, title, url, published_on, retrieved_at, license_name, created_by) values ('official', 'i', 't', 'https://example.org/x', '10000-01-01', now(), 'l', $1)",
        [ids.editor],
      ),
      '23514',
    );
  });
});

describe('R-8/R-10 · vigencia', () => {
  async function tryVerify(over: {
    fieldKey?: string;
    validFromDays?: number | null;
    validUntilDays?: number | null;
  }) {
    const dest = await newDestination(db);
    const id = await db.asCommit('authenticated', ids.editor, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `insert into public.field_assertions (destination_id, field_key, source_locale, original_text, valid_from, valid_until)
         values ($1, $2, 'es', '[prueba] x',
                 case when $3::int is null then null else (now() at time zone 'UTC')::date + $3::int end,
                 case when $4::int is null then null else (now() at time zone 'UTC')::date + $4::int end) returning id`,
        [
          dest,
          over.fieldKey ?? 'overview.summary',
          over.validFromDays ?? null,
          over.validUntilDays ?? null,
        ],
      );
      const d = (rows[0] as { id: string }).id;
      await addEvidence(c, d, await createSource(c));
      await submit(c, d);
      return d;
    });
    return db
      .as('authenticated', ids.reviewer, (c) => verify(c, id))
      .then(
        () => 'verificada',
        (e: { detail?: string }) => `rechazada:${e.detail ?? ''}`,
      );
  }

  it('R-8: algo que aún no rige (valid_from posterior a la verificación) no se verifica como vigente', async () => {
    const r = await tryVerify({
      fieldKey: 'restrictions.entry_rules',
      validFromDays: 10,
      validUntilDays: 60,
    });
    expect(r).toContain('validity_starts_after_verification');
  });

  it('R-8: valid_from el mismo día de la verificación o anterior sí', async () => {
    expect(
      await tryVerify({
        fieldKey: 'restrictions.entry_rules',
        validFromDays: 0,
        validUntilDays: 60,
      }),
    ).toBe('verificada');
    expect(
      await tryVerify({
        fieldKey: 'restrictions.entry_rules',
        validFromDays: -5,
        validUntilDays: 60,
      }),
    ).toBe('verificada');
  });

  it('R-10: un campo estable con valid_until anterior a la verificación nace vencido: se rechaza', async () => {
    const r = await tryVerify({ fieldKey: 'overview.summary', validUntilDays: -5 });
    expect(r).toContain('validity_before_verification');
    expect(await tryVerify({ fieldKey: 'overview.summary', validUntilDays: 0 })).toBe('verificada');
    expect(await tryVerify({ fieldKey: 'overview.summary', validUntilDays: null })).toBe(
      'verificada',
    );
  });
});

describe('R-9 · una fuente repetida no cuenta como dos', () => {
  it('con minCount = 2, citar dos veces el mismo documento no basta; dos documentos distintos sí', async () => {
    await db.owner.query(
      "update public.content_fields set evidence_min_count = 2 where key = 'overview.summary'",
    );
    try {
      const attempt = async (urls: string[]) => {
        const dest = await newDestination(db);
        const id = await db.asCommit('authenticated', ids.editor, async (c) => {
          const d = await createDraft(c, { destinationId: dest });
          for (const url of urls) await addEvidence(c, d, await createSource(c, { url }));
          await submit(c, d);
          return d;
        });
        return db
          .as('authenticated', ids.reviewer, (c) => verify(c, id))
          .then(
            () => 'verificada',
            (e: { detail?: string }) => `rechazada:${e.detail ?? ''}`,
          );
      };
      expect(await attempt(['https://example.org/mismo', 'https://example.org/mismo'])).toContain(
        'evidence_class_insufficient',
      );
      expect(
        await attempt(['https://example.org/mismo', 'https://EXAMPLE.org/mismo#otra-parte']),
      ).toContain('evidence_class_insufficient');
      expect(await attempt(['https://example.org/uno', 'https://example.org/dos'])).toBe(
        'verificada',
      );
    } finally {
      await db.owner.query(
        "update public.content_fields set evidence_min_count = 1 where key = 'overview.summary'",
      );
    }
  });
});

describe('R-11 · el exportador excluye con ruido lo que ya no cumple el registro, y sigue fallando ante lo malformado', () => {
  it('endurecer un umbral no bloquea la exportación de todo el sitio: se excluye lo afectado y se dice', async () => {
    const local = await createTestDb();
    try {
      await seedPeople(local);
      const dest = await local.owner.query<{ id: string }>(
        "insert into public.destinations (key, kind, status) values ('boquete', 'locality', 'published') returning id",
      );
      const destId = (dest.rows[0] as { id: string }).id;
      // En la BD se admitió una fuente de 400 días para «entry_rules»; el registro de código (180) es más estricto.
      await local.owner.query(
        "update public.content_fields set evidence_max_age_days = 3650 where key = 'restrictions.entry_rules'",
      );
      await makeVerified(local, {
        destinationId: destId,
        fieldKey: 'restrictions.entry_rules',
        validUntilDays: 30,
        retrievedDaysAgo: 400,
      });
      await makeVerified(local, { destinationId: destId, text: '[prueba] resumen sano' });
      const result = await exportPublished(local.owner, new Date('2026-10-21T12:00:00Z'));
      expect(result.snapshot.assertions.map((a) => a.fieldKey)).toEqual(['overview.summary']);
      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0]).toMatchObject({
        destinationKey: 'boquete',
        fieldKey: 'restrictions.entry_rules',
        codes: ['evidence_stale'],
      });
    } finally {
      await local.close();
    }
  });

  it('un destino público que no existe en el registro sigue haciendo fallar toda la exportación', async () => {
    const local = await createTestDb();
    try {
      await seedPeople(local);
      const dest = await local.owner.query<{ id: string }>(
        "insert into public.destinations (key, kind, status) values ('no-esta-en-el-registro', 'locality', 'published') returning id",
      );
      await makeVerified(local, { destinationId: (dest.rows[0] as { id: string }).id });
      await expect(exportPublished(local.owner, new Date())).rejects.toBeInstanceOf(SnapshotError);
    } finally {
      await local.close();
    }
  });

  it('2 500 emojis (2 500 caracteres) se exportan: el tamaño se cuenta igual en la BD y en el dominio', async () => {
    const local = await createTestDb();
    try {
      await seedPeople(local);
      const dest = await local.owner.query<{ id: string }>(
        "insert into public.destinations (key, kind, status) values ('boquete', 'locality', 'published') returning id",
      );
      await makeVerified(local, {
        destinationId: (dest.rows[0] as { id: string }).id,
        text: '😀'.repeat(2500),
      });
      const result = await exportPublished(local.owner, new Date());
      expect(result.snapshot.assertions).toHaveLength(1);
      expect(result.excluded).toEqual([]);
    } finally {
      await local.close();
    }
  });
});
