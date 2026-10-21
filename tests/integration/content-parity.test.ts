import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ASSERTION_STATUSES,
  canTransition,
  type AssertionRecord,
} from '../../src/domains/content/assertion';
import { addDays, dayOf } from '../../src/domains/content/dates';
import { CONTENT_FIELDS, type FieldKey } from '../../src/domains/content/fields';
import { GATE_CODES, verificationIssues, type GateCode } from '../../src/domains/content/gates';
import type { DestinationKey } from '../../src/domains/tourism/destinations';
import { createTestDb, expectSqlState, ids, seedPeople, type TestDb } from './helpers';
import { newDestination } from './content-helpers';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
  await seedPeople(db);
});
afterAll(async () => {
  await db.close();
});

type Kind = 'locality' | 'volcano' | 'island';
const KEY_OF: Record<Kind, DestinationKey> = {
  locality: 'boquete',
  volcano: 'volcan-baru',
  island: 'coiba',
};

interface Spec {
  fieldKey: FieldKey;
  kind: Kind;
  text: string | null;
  quantity: { value: number; unit: string } | null;
  confidence: 'low' | 'medium' | 'high' | null;
  validUntilDays: number | null;
  evidence: { cls: string; daysAgo: number; stance: 'supports' | 'contradicts' }[];
  verifier: 'reviewer' | 'author' | 'none';
}

const baseSpec = (over: Partial<Spec> = {}): Spec => ({
  fieldKey: 'overview.summary',
  kind: 'locality',
  text: '[prueba] texto',
  quantity: null,
  confidence: 'medium',
  validUntilDays: null,
  evidence: [{ cls: 'official', daysAgo: 10, stance: 'supports' }],
  verifier: 'reviewer',
  ...over,
});

async function setClaims(sub: string | null): Promise<void> {
  await db.owner.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(sub ? { sub, role: 'authenticated' } : { role: 'anon' }),
  ]);
}

/** Verifica `spec` en la BD (todo se revierte) y en el dominio; devuelve los códigos de cada lado. */
async function bothSides(spec: Spec): Promise<{ dbCodes: string[]; domainCodes: string[] }> {
  const o = db.owner;
  await o.query('begin');
  try {
    const dest = await newDestinationTx(spec.kind);
    await setClaims(ids.editor);
    const { rows } = await o.query<{ id: string }>(
      `insert into public.field_assertions
         (destination_id, field_key, source_locale, original_text, quantity_value, quantity_unit, valid_until)
       values ($1, $2, 'es', $3, $4, $5,
               case when $6::int is null then null else (now() at time zone 'UTC')::date + $6::int end)
       returning id`,
      [
        dest,
        spec.fieldKey,
        spec.text,
        spec.quantity?.value ?? null,
        spec.quantity?.unit ?? null,
        spec.validUntilDays,
      ],
    );
    const id = (rows[0] as { id: string }).id;
    for (const e of spec.evidence) {
      const src = await o.query<{ id: string }>(
        `insert into public.source_records (source_class, institution, title, url, retrieved_at, license_name)
         values ($1::public.content_source_class, 'i', 't', $2, now() - make_interval(days => $3::int), 'l') returning id`,
        [e.cls, `https://example.org/${Math.random().toString(36).slice(2)}`, e.daysAgo],
      );
      await o.query(
        'insert into public.assertion_evidence (assertion_id, source_record_id, stance) values ($1, $2, $3::public.evidence_stance)',
        [id, (src.rows[0] as { id: string }).id, e.stance],
      );
    }
    await o.query("update public.field_assertions set status = 'in_review' where id = $1", [id]);

    await setClaims(
      spec.verifier === 'reviewer' ? ids.reviewer : spec.verifier === 'author' ? ids.editor : null,
    );
    await o.query('savepoint s');
    let dbCodes: string[] = [];
    try {
      await o.query(
        "update public.field_assertions set status = 'verified', confidence = $2::public.content_confidence where id = $1",
        [id, spec.confidence],
      );
    } catch (error) {
      const e = error as { code?: string; message?: string; detail?: string };
      if (e.code !== '23514' || e.message !== 'verification_gates_failed') {
        throw new Error(`Error inesperado al verificar: ${String(e.message)}`, { cause: error });
      }
      dbCodes = (e.detail ?? '').split(',');
      await o.query('rollback to savepoint s');
    }
    const now = ((await o.query<{ now: Date }>('select now() as now')).rows[0] as { now: Date })
      .now;

    const verifiedAt = now.toISOString();
    const record: AssertionRecord = {
      id,
      destinationKey: KEY_OF[spec.kind],
      fieldKey: spec.fieldKey,
      version: 1,
      status: 'verified',
      sourceLocale: 'es',
      quantity: spec.quantity,
      texts:
        spec.text === null
          ? []
          : [{ locale: 'es', text: spec.text, provenance: 'original', status: 'published' }],
      confidence: spec.confidence,
      verifiedAt,
      validFrom: null,
      validUntil:
        spec.validUntilDays === null ? null : addDays(dayOf(verifiedAt), spec.validUntilDays),
      supersededAt: null,
      evidence: spec.evidence.map((e, i) => ({
        id: `5b0c2a1e-8f0d-4c1b-9a53-0d6a3f2e1b${String(10 + i)}`,
        sourceClass: e.cls as AssertionRecord['evidence'][number]['sourceClass'],
        institution: 'i',
        title: 't',
        url: 'https://example.org/x',
        publishedOn: null,
        retrievedAt: new Date(now.getTime() - e.daysAgo * 86_400_000).toISOString(),
        license: { name: 'l', url: null },
        stance: e.stance,
        locator: null,
        excerpt: null,
      })),
      authorId: ids.editor,
      verifiedById:
        spec.verifier === 'reviewer'
          ? ids.reviewer
          : spec.verifier === 'author'
            ? ids.editor
            : null,
    };
    const domainCodes = verificationIssues(record, spec.kind, {
      people: 'required',
    });
    return { dbCodes, domainCodes };
  } finally {
    await o.query('rollback');
  }
}

async function newDestinationTx(kind: Kind): Promise<string> {
  const { rows } = await db.owner.query<{ id: string }>(
    "insert into public.destinations (key, kind, status) values ($1, $2, 'published') returning id",
    [`p-${Math.random().toString(36).slice(2, 10)}`, kind],
  );
  return (rows[0] as { id: string }).id;
}

const same = (a: string[], b: string[]) =>
  expect([...new Set(a)].sort()).toEqual([...new Set(b)].sort());

describe('paridad entre las puertas de la BD y las del dominio', () => {
  const cases: [string, Spec, GateCode[]][] = [
    ['válida', baseSpec(), []],
    ['sin evidencia', baseSpec({ evidence: [] }), ['evidence_none']],
    [
      'solo comunitaria',
      baseSpec({ evidence: [{ cls: 'community', daysAgo: 5, stance: 'supports' }] }),
      ['evidence_class_insufficient'],
    ],
    [
      'fuente demasiado vieja',
      baseSpec({ evidence: [{ cls: 'official', daysAgo: 731, stance: 'supports' }] }),
      ['evidence_stale'],
    ],
    [
      'antigüedad justo en el límite (730)',
      baseSpec({ evidence: [{ cls: 'official', daysAgo: 730, stance: 'supports' }] }),
      [],
    ],
    [
      'con contradicción',
      baseSpec({
        evidence: [
          { cls: 'official', daysAgo: 5, stance: 'supports' },
          { cls: 'official', daysAgo: 5, stance: 'contradicts' },
        ],
      }),
      ['evidence_contradicts'],
    ],
    [
      'sin vigencia en un campo que caduca',
      baseSpec({ fieldKey: 'restrictions.entry_rules', validUntilDays: null }),
      ['validity_missing'],
    ],
    [
      'vigencia en el límite (180)',
      baseSpec({ fieldKey: 'restrictions.entry_rules', validUntilDays: 180 }),
      [],
    ],
    [
      'vigencia demasiado larga (181)',
      baseSpec({ fieldKey: 'restrictions.entry_rules', validUntilDays: 181 }),
      ['validity_too_long'],
    ],
    [
      'vigencia ya vencida al verificar',
      baseSpec({ fieldKey: 'restrictions.entry_rules', validUntilDays: -1 }),
      ['validity_before_verification'],
    ],
    ['sin confianza', baseSpec({ confidence: null }), ['confidence_missing']],
    ['verifica la autora', baseSpec({ verifier: 'author' }), ['verifier_is_author']],
    ['sin persona verificadora (sin JWT)', baseSpec({ verifier: 'none' }), ['verifier_missing']],
    ['sin texto original', baseSpec({ text: null }), ['original_text_missing']],
    [
      'cantidad válida',
      baseSpec({
        fieldKey: 'facts.elevation_m',
        kind: 'volcano',
        text: null,
        quantity: { value: 3475, unit: 'm' },
        evidence: [{ cls: 'scientific', daysAgo: 100, stance: 'supports' }],
      }),
      [],
    ],
    [
      'cantidad con otra unidad',
      baseSpec({
        fieldKey: 'facts.elevation_m',
        kind: 'volcano',
        text: null,
        quantity: { value: 3475, unit: 'km' },
        evidence: [{ cls: 'scientific', daysAgo: 100, stance: 'supports' }],
      }),
      ['quantity_invalid'],
    ],
    [
      'cantidad ausente',
      baseSpec({
        fieldKey: 'facts.elevation_m',
        kind: 'volcano',
        text: null,
        quantity: null,
        evidence: [{ cls: 'scientific', daysAgo: 100, stance: 'supports' }],
      }),
      ['quantity_missing'],
    ],
    [
      'campo no aplicable al tipo',
      baseSpec({
        fieldKey: 'facts.elevation_m',
        kind: 'island',
        text: null,
        quantity: { value: 100, unit: 'm' },
        evidence: [{ cls: 'official', daysAgo: 1, stance: 'supports' }],
      }),
      ['field_not_applicable'],
    ],
  ];

  it.each(cases)('%s', async (_name, spec, expected) => {
    const { dbCodes, domainCodes } = await bothSides(spec);
    same(dbCodes, expected);
    same(domainCodes, expected);
  });

  it('fuzz determinista: 300 combinaciones dan los MISMOS códigos en la BD y en el dominio', async () => {
    let seed = 7_2026_1021;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
    const ages = [0, 1, 5, 80, 89, 90, 91, 179, 180, 181, 364, 365, 366, 729, 730, 731, 3650, 3651];
    const validity = [null, -1, 0, 1, 89, 90, 91, 179, 180, 181, 364, 365, 366, 1000];
    const classes = [
      'official',
      'institutional',
      'scientific',
      'editorial_review',
      'community',
      'commercial',
    ];
    const mismatches: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const field = pick(CONTENT_FIELDS);
      const isQuantity = field.valueKind === 'quantity';
      const spec: Spec = {
        fieldKey: field.key,
        kind: pick(['locality', 'volcano', 'island'] as const),
        text: isQuantity ? null : pick(['[prueba] texto', '[prueba] texto', null]),
        quantity: isQuantity
          ? pick([{ value: 3475, unit: 'm' }, { value: 3475, unit: 'km' }, null])
          : null,
        confidence: pick(['low', 'medium', 'high', 'high', null] as const),
        validUntilDays: pick(validity),
        evidence: Array.from({ length: Math.floor(rnd() * 4) }, () => ({
          cls: pick(classes),
          daysAgo: pick(ages),
          stance: rnd() < 0.85 ? ('supports' as const) : ('contradicts' as const),
        })),
        verifier: pick(['reviewer', 'reviewer', 'reviewer', 'author', 'none'] as const),
      };
      const { dbCodes, domainCodes } = await bothSides(spec);
      for (const c of domainCodes) seen.add(c);
      if ([...new Set(dbCodes)].sort().join() !== [...new Set(domainCodes)].sort().join()) {
        mismatches.push(
          `${JSON.stringify(spec)} → BD [${dbCodes.join()}] ≠ dominio [${domainCodes.join()}]`,
        );
      }
    }
    expect(mismatches).toEqual([]);
    // el fuzz ejercita de verdad las puertas, no solo el caso feliz
    expect(seen.size).toBeGreaterThanOrEqual(12);
  }, 120_000);

  it('cada código del dominio está clasificado: comparado arriba, impedido por la BD al escribir, o no aplica al verificar', () => {
    const compared: GateCode[] = [
      'evidence_none',
      'evidence_class_insufficient',
      'evidence_stale',
      'evidence_contradicts',
      'validity_missing',
      'validity_too_long',
      'validity_before_verification',
      'confidence_missing',
      'verifier_is_author',
      'verifier_missing',
      'original_text_missing',
      'quantity_invalid',
      'quantity_missing',
      'field_not_applicable',
    ];
    const preventedByDb: GateCode[] = [
      'unknown_field', // FK a content_fields
      'evidence_insecure_url', // CHECK de https en source_records
      'evidence_date_invalid', // tipos date/timestamptz
      'evidence_after_verification', // retrieved_at no puede ser futuro
      'validity_invalid', // CHECK valid_from <= valid_until
      'text_invalid', // CHECK de longitud y no vacío
      'verified_at_invalid', // la fija el disparador
    ];
    const notApplicable: GateCode[] = ['status_not_verified', 'superseded']; // al verificar, por definición, no ocurren
    expect([...compared, ...preventedByDb, ...notApplicable].sort()).toEqual(
      [...GATE_CODES].sort(),
    );
  });

  it('lo que la BD impide por construcción se rechaza al escribir', async () => {
    const dest = await newDestination(db);
    const ins = (cols: string, vals: string, params: unknown[] = []) =>
      db.owner.query(
        `insert into public.field_assertions (destination_id, source_locale, created_by, ${cols})
         values ($1, 'es', '${ids.editor}', ${vals})`,
        [dest, ...params],
      );
    await expectSqlState(ins('field_key, original_text', "'overview.nope', 'x'"), '23503'); // campo desconocido
    await expectSqlState(
      ins(
        'field_key, original_text, valid_from, valid_until',
        "'overview.summary', 'x', '2026-05-01', '2026-04-01'",
      ),
      '23514',
    ); // vigencia invertida
    await expectSqlState(ins('field_key, original_text', "'overview.summary', '   '"), '23514'); // texto en blanco
    await expectSqlState(
      ins('field_key, original_text', "'overview.summary', $2", ['x'.repeat(4001)]),
      '23514',
    ); // texto enorme
  });
});

describe('transiciones: la BD y el dominio aceptan exactamente las mismas', () => {
  const pairs = ASSERTION_STATUSES.flatMap((from) =>
    ASSERTION_STATUSES.filter((to) => to !== from).map((to) => [from, to] as const),
  );

  it.each(pairs)('%s → %s', async (from, to) => {
    const o = db.owner;
    await o.query('begin');
    try {
      const dest = await newDestinationTx('locality');
      // Se siembra el estado de origen saltando los disparadores (solo en esta prueba y solo para sembrar)
      await o.query('set local session_replication_role = replica');
      const { rows } = await o.query<{ id: string }>(
        `insert into public.field_assertions
           (destination_id, field_key, version, status, source_locale, original_text, confidence, verified_by, verified_at, status_note, created_by)
         values ($1, 'overview.summary', 1, $2::public.assertion_status, 'es', '[prueba] x', 'high', $3, now(), 'motivo', $4) returning id`,
        [dest, from, ids.reviewer2, ids.editor],
      );
      await o.query('set local session_replication_role = origin');
      await setClaims(ids.reviewer);
      await o.query('savepoint s');
      let message = 'ok';
      try {
        await o.query(
          "update public.field_assertions set status = $2::public.assertion_status, status_note = 'motivo' where id = $1",
          [(rows[0] as { id: string }).id, to],
        );
      } catch (error) {
        message = (error as { message?: string }).message ?? 'sin mensaje';
      }
      // Solo nos importa si la TRANSICIÓN en sí se aceptó; otras puertas (p. ej. evidencia) son otra prueba.
      expect(message !== 'assertion_invalid_transition', `${from}→${to}: ${message}`).toBe(
        canTransition(from, to),
      );
    } finally {
      await o.query('rollback');
    }
  });
});
