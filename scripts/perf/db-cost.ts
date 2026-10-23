/**
 * `pnpm perf:db [--scales 200,2000,20000] [--runs N] [--seconds N] [--json <ruta>] [--smoke]` — coste de LECTURA (RLS), de
 * ESCRITURA (disparadores) y de CONTENCIÓN del modelo de contenido con volumen (F4-8, ADR-0022; docs/performance.md).
 *
 * Qué hace, por escala (N destinos × los campos que aplican a una localidad, con 2 versiones por campo y algunos
 * borradores y revisiones en curso):
 *  · EXPORTADOR REAL: ejecuta `exportPublished` tal cual y registra cada consulta que lanza (no copia su SQL: una copia
 *    se desviaría). El esquema de la instantánea fija las claves de destino a los NUEVE del registro, así que con
 *    claves sintéticas el exportador acaba rechazando la forma, y eso se EXIGE (un fallo distinto sería otra cosa):
 *    lo medido es lo que ocurre hasta ese veredicto (leer, montar y validar la forma). La revalidación de puertas
 *    NO se mide a escala (necesitaría destinos del registro): es lineal por lectura y el registro la limita a 72.
 *  · LECTURA con RLS frente a lo mismo escrito a mano (propietario con el filtro explícito): aísla lo que cuesta la
 *    maquinaria de las políticas (`exists` anidados, `app.is_staff()`) de lo que cuesta el filtro en sí. Con EXPLAIN.
 *  · ESCRITURA con los disparadores completos, sin el de serialización (0011) y sin éste ni la auditoría.
 *  · CONTENCIÓN con `pgbench` real (8 conexiones): claves repartidas y una sola clave caliente, con los ajustes
 *    relajados del clúster de pruebas y en modo DURABLE (`fsync=on`).
 *
 * QUÉ NO ES (y se imprime): no es producción. Socket Unix (sin red), un solo equipo compartido con `pgbench`, datos
 * SINTÉTICOS sembrados por SQL (con los disparadores desactivados: ya validados por las pruebas de integración) y
 * disco de contenedor. Sin `fsync` (clúster de pruebas) el `COMMIT` es casi gratis y la contención es optimista; el
 * modo durable la acota, no la reproduce. No hay umbral ni «aprobado»: da números con su contexto. Sí se comprueba
 * que lo medido es lo que se dice medir (recuentos, disparadores realmente desactivados, filas realmente escritas):
 * un número de algo que no se midió es peor que ningún número.
 *
 * Salida: 0 medido · 1 la premisa de la medición no se cumplió · 2 no se pudo medir (sin PostgreSQL o sin `pgbench`).
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, release, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { migrate } from '../db/lib';
import { exportPublished } from '../content/export-lib';
import { SnapshotError } from '../../src/domains/content/snapshot';
import {
  PostgresUnavailableError,
  findBinDir,
  startTestCluster,
  type TestCluster,
} from '../../tests/integration/pg-cluster';

const execFileAsync = promisify(execFile);

const EDITOR = '00000000-0000-4000-8000-0000000000e1';
const REVIEWER = '00000000-0000-4000-8000-0000000000b1';
const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const PUBLISHED_SHARE = 0.9;

class MeasurementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MeasurementError';
  }
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new MeasurementError(message);
}

// ---------------------------------------------------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------------------------------------------------
interface Options {
  readonly scales: readonly number[];
  readonly runs: number;
  readonly seconds: number;
  readonly writes: number;
  readonly jsonOut: string | undefined;
  readonly smoke: boolean;
}

function parseOptions(argv: readonly string[]): Options {
  const known = new Set(['--scales', '--runs', '--seconds', '--json', '--smoke']);
  for (const a of argv) {
    if (a.startsWith('--') && !known.has(a)) throw new MeasurementError(`Opción desconocida: ${a}`);
  }
  const value = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    if (i < 0) return undefined;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--'))
      throw new MeasurementError(`${name} necesita un valor`);
    return v;
  };
  const smoke = argv.includes('--smoke');
  const scalesText = value('--scales') ?? (smoke ? '30' : '200,2000,20000');
  const scales = scalesText.split(',').map((s) => Number(s));
  for (const s of scales) {
    if (!Number.isInteger(s) || s < 20)
      throw new MeasurementError(`Escala inválida: ${scalesText}`);
  }
  const positive = (name: string, fallback: number): number => {
    const v = value(name);
    if (v === undefined) return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new MeasurementError(`${name} debe ser un entero ≥ 1`);
    return n;
  };
  return {
    scales,
    runs: positive('--runs', smoke ? 2 : 5),
    seconds: positive('--seconds', smoke ? 1 : 5),
    writes: smoke ? 10 : 150,
    jsonOut: value('--json'),
    smoke,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Utilidades de medición
// ---------------------------------------------------------------------------------------------------------------------
const round = (n: number, digits = 2): number => Number(n.toFixed(digits));

interface Timing {
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly p95Ms: number;
  readonly samples: number;
}

function summarize(samples: readonly number[]): Timing {
  check(samples.length > 0, 'una medición sin muestras');
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
  return {
    medianMs: round(at(0.5)),
    minMs: round(sorted[0] as number),
    maxMs: round(sorted[sorted.length - 1] as number),
    p95Ms: round(at(0.95)),
    samples: samples.length,
  };
}

type Role = 'owner' | 'anon' | 'authenticated';

/** Ejecuta `fn` en una transacción que siempre se revierte, con el rol y los claims de Supabase. */
async function asRole<T>(
  c: Client,
  role: Role,
  userId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await c.query('begin');
  try {
    if (role !== 'owner') {
      await c.query(`set local role ${role}`);
      await c.query('set local search_path = public, extensions');
      const claims = userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' };
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    }
    return await fn();
  } finally {
    await c.query('rollback');
  }
}

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Parent Relationship'?: string;
  Filter?: string;
  'Rows Removed by Filter'?: number;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  Plans?: PlanNode[];
}
interface PlanRoot {
  Plan: PlanNode;
  'Planning Time': number;
  'Execution Time': number;
}

export interface PlanSummary {
  readonly executionMs: number;
  readonly planningMs: number;
  /** Cómo se lee cada tabla: «Seq Scan on field_assertions», «Index Scan on x using y»… */
  readonly scans: readonly string[];
  /** Subplanes (`exists` de una política, `app.is_staff()`…) que aparecen en el plan. */
  readonly subPlans: number;
  /** Filtros que se aplican fila a fila sobre `field_assertions`, para ver CÓMO se aplicó la política. */
  readonly filters: readonly string[];
  readonly sharedHit: number;
  readonly sharedRead: number;
}

async function explain(
  c: Client,
  role: Role,
  userId: string | null,
  sql: string,
  params: readonly unknown[],
): Promise<PlanSummary> {
  return asRole(c, role, userId, async () => {
    const { rows } = await c.query<{ 'QUERY PLAN': PlanRoot[] }>(
      `explain (analyze, buffers, format json) ${sql}`,
      [...params],
    );
    const root = (rows[0] as { 'QUERY PLAN': PlanRoot[] })['QUERY PLAN'][0] as PlanRoot;
    const scans = new Map<string, number>();
    const filters = new Set<string>();
    let subPlans = 0;
    let hit = 0;
    let read = 0;
    const walk = (n: PlanNode): void => {
      if (n['Node Type'].includes('Scan') && n['Relation Name'] !== undefined) {
        const label = `${n['Node Type']} on ${n['Relation Name']}${n['Index Name'] ? ` using ${n['Index Name']}` : ''}`;
        scans.set(label, (scans.get(label) ?? 0) + 1);
        if (n['Relation Name'] === 'field_assertions' && n.Filter !== undefined)
          filters.add(n.Filter.length > 200 ? `${n.Filter.slice(0, 200)}…` : n.Filter);
      }
      if (n['Parent Relationship'] === 'SubPlan' || n['Parent Relationship'] === 'InitPlan')
        subPlans += 1;
      hit += n['Shared Hit Blocks'] ?? 0;
      read += n['Shared Read Blocks'] ?? 0;
      for (const child of n.Plans ?? []) walk(child);
    };
    walk(root.Plan);
    return {
      executionMs: round(root['Execution Time']),
      planningMs: round(root['Planning Time']),
      scans: [...scans].map(([label, n]) => (n > 1 ? `${label} ×${String(n)}` : label)),
      subPlans,
      filters: [...filters],
      sharedHit: hit,
      sharedRead: read,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Datos sintéticos
// ---------------------------------------------------------------------------------------------------------------------
interface ScaleInfo {
  readonly destinations: number;
  readonly published: number;
  readonly fields: readonly string[];
  /** Afirmaciones vigentes y verificadas de destinos publicados: lo único que ve `anon`. */
  readonly visible: number;
  readonly totals: Record<string, number>;
}

async function count(c: Client, sql: string, params: readonly unknown[] = []): Promise<number> {
  const { rows } = await c.query<{ n: string }>(sql, [...params]);
  return Number((rows[0] as { n: string }).n);
}

/**
 * Siembra por SQL con los disparadores desactivados (`session_replication_role = replica`): las restricciones CHECK
 * siguen vigentes y los datos replican el aspecto de lo que dejan los flujos reales (que SÍ validan las pruebas de
 * integración): por campo, la versión 1 reemplazada, la 2 vigente con una fuente propia, y en un 5 % una versión 3 en
 * revisión (con fuente) y en otro 5 % una 3 en borrador. Un 30 % de las vigentes lleva una traducción humana publicada.
 */
async function seed(owner: Client, destinations: number): Promise<ScaleInfo> {
  const published = Math.floor(destinations * PUBLISHED_SHARE);
  const { rows: fieldRows } = await owner.query<{ key: string }>(
    "select key from public.content_fields where applies_to is null or 'locality' = any(applies_to) order by key",
  );
  const fields = fieldRows.map((r) => r.key);
  check(fields.length >= 1, 'no hay campos que apliquen a una localidad');

  await owner.query('set session_replication_role = replica');
  try {
    await owner.query(
      `insert into public.destinations (key, kind, status)
       select 'bench-' || g, 'locality', (case when g <= $1::int then 'published' else 'draft' end)::public.destination_status
         from generate_series(1, $2::int) g`,
      [published, destinations],
    );
    await owner.query(
      `create temp table bench_keys as
       select d.id as destination_id, f.key as field_key,
              gen_random_uuid() as a1, gen_random_uuid() as a2, gen_random_uuid() as a3,
              gen_random_uuid() as s1, gen_random_uuid() as s2, gen_random_uuid() as s3,
              row_number() over (order by d.key, f.key) as rn
         from public.destinations d
        cross join (select key from public.content_fields
                     where applies_to is null or 'locality' = any(applies_to)) f
        where d.key like 'bench-%'`,
    );
    await owner.query(
      `insert into public.source_records
         (id, source_class, institution, title, url, published_on, retrieved_at, license_name, license_url, created_by)
       select v.s, 'official'::public.content_source_class, 'Institución sintética', 'Documento sintético ' || k.rn,
              'https://example.org/bench/' || k.rn || '/' || v.n, date '2026-01-15', now() - interval '10 days',
              'Licencia sintética', 'https://example.org/licencia', $1::uuid
         from bench_keys k
        cross join lateral (values (1, k.s1), (2, k.s2)) v(n, s)
       union all
       select k.s3, 'official', 'Institución sintética', 'Documento sintético ' || k.rn,
              'https://example.org/bench/' || k.rn || '/3', date '2026-01-15', now() - interval '10 days',
              'Licencia sintética', 'https://example.org/licencia', $1::uuid
         from bench_keys k where k.rn % 20 = 0`,
      [EDITOR],
    );
    await owner.query(
      `insert into public.field_assertions
         (id, destination_id, field_key, version, status, source_locale, original_text, confidence, verified_by,
          verified_at, valid_from, valid_until, superseded_at, created_by, created_at, updated_at)
       select k.a1, k.destination_id, k.field_key, 1, 'verified'::public.assertion_status, 'es', 'Texto sintético v1 ' || k.rn, 'medium'::public.content_confidence, $2::uuid,
              now() - interval '3 days', null::date, null::date, now() - interval '1 day', $1::uuid, now() - interval '4 days',
              now() - interval '1 day'
         from bench_keys k
       union all
       select k.a2, k.destination_id, k.field_key, 2, 'verified', 'es', 'Texto sintético v2 ' || k.rn, 'high', $2::uuid,
              now() - interval '1 day', null, app.panama_today() + 30, null, $1::uuid, now() - interval '2 days',
              now() - interval '1 day'
         from bench_keys k
       union all
       select k.a3, k.destination_id, k.field_key, 3, 'in_review', 'es', 'Texto sintético v3 ' || k.rn, null, null,
              null, null, app.panama_today() + 30, null, $1::uuid, now() - interval '1 hour', now() - interval '1 hour'
         from bench_keys k where k.rn % 20 = 0
       union all
       select gen_random_uuid(), k.destination_id, k.field_key, 3, 'draft', 'es', 'Borrador sintético ' || k.rn, null,
              null, null, null, null, null, $1::uuid, now() - interval '1 hour', now() - interval '1 hour'
         from bench_keys k where k.rn % 20 = 1`,
      [EDITOR, REVIEWER],
    );
    await owner.query(
      `insert into public.assertion_evidence (assertion_id, source_record_id, stance, locator)
       select v.a, v.s, 'supports'::public.evidence_stance, 'sección 2'
         from bench_keys k
        cross join lateral (values (k.a1, k.s1), (k.a2, k.s2)) v(a, s)
       union all
       select k.a3, k.s3, 'supports', 'sección 2' from bench_keys k where k.rn % 20 = 0`,
    );
    await owner.query(
      `insert into public.assertion_translations
         (assertion_id, locale, text, provenance, status, translated_by, reviewed_by, reviewed_at)
       select k.a2, 'en', 'Synthetic text ' || k.rn, 'human_translation'::public.translation_provenance, 'published'::public.translation_status, $1::uuid, $2::uuid, now()
         from bench_keys k where k.rn % 10 < 3`,
      [EDITOR, REVIEWER],
    );
  } finally {
    await owner.query('set session_replication_role = origin');
  }
  await owner.query('drop table bench_keys');
  await owner.query(
    'analyze public.destinations, public.source_records, public.field_assertions, public.assertion_evidence, public.assertion_translations',
  );

  const totals: Record<string, number> = {
    destinations: await count(owner, 'select count(*) as n from public.destinations'),
    sources: await count(owner, 'select count(*) as n from public.source_records'),
    assertions: await count(owner, 'select count(*) as n from public.field_assertions'),
    evidence: await count(owner, 'select count(*) as n from public.assertion_evidence'),
    translations: await count(owner, 'select count(*) as n from public.assertion_translations'),
    inReview: await count(
      owner,
      "select count(*) as n from public.field_assertions where status = 'in_review'",
    ),
    drafts: await count(
      owner,
      "select count(*) as n from public.field_assertions where status = 'draft' and created_by = $1",
      [EDITOR],
    ),
  };
  const visible = published * fields.length;
  check(
    totals.destinations === destinations,
    `destinos sembrados: ${String(totals.destinations)} ≠ ${String(destinations)}`,
  );
  check(
    (await count(
      owner,
      `select count(*) as n from public.field_assertions a join public.destinations d on d.id = a.destination_id
        where a.status = 'verified' and a.superseded_at is null and d.status = 'published'`,
    )) === visible,
    'las afirmaciones vigentes de destinos publicados no son las esperadas',
  );
  return { destinations, published, fields, visible, totals };
}

// ---------------------------------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------------------------------
interface ExportQuery {
  readonly query: string;
  readonly ms: number;
  readonly rows: number;
}
interface ExportResult {
  readonly totalMs: number;
  readonly sqlMs: number;
  /** Tiempo fuera de las consultas: montaje de la instantánea y validación hasta el veredicto. */
  readonly otherMs: number;
  readonly queries: readonly ExportQuery[];
  readonly plans: Record<string, PlanSummary>;
}

/** Cliente que registra cada consulta del exportador (con sus parámetros) sin tocar su código ni copiar su SQL. */
function probeClient(real: Client): {
  client: Client;
  log: { text: string; params: unknown[]; ms: number; rows: number }[];
} {
  const log: { text: string; params: unknown[]; ms: number; rows: number }[] = [];
  const query = async (text: string, params?: unknown[]) => {
    const started = performance.now();
    const result = await real.query(text, params);
    log.push({
      text,
      params: params ?? [],
      ms: performance.now() - started,
      rows: result.rowCount ?? 0,
    });
    return result;
  };
  return { client: { query } as unknown as Client, log };
}

async function measureExport(owner: Client, info: ScaleInfo): Promise<ExportResult> {
  const { client, log } = probeClient(owner);
  const started = performance.now();
  try {
    await exportPublished(client, new Date());
    throw new MeasurementError(
      'el exportador NO rechazó los destinos sintéticos: la medición no es la que se describe',
    );
  } catch (error) {
    if (!(error instanceof SnapshotError)) throw error;
    // El esquema fija `destinationKey` a los nueve destinos del registro (`z.enum`) y limita la instantánea a 5 000
    // afirmaciones: con claves sintéticas el veredicto llega en la validación de FORMA, después de leer y de montar
    // todo. Son los únicos motivos admitidos; cualquier otro no es esto.
    check(
      error.issues.length > 0 &&
        error.issues.every(
          (i) => i.endsWith('destinationKey: invalid_value') || i === 'assertions: too_big',
        ),
      `el exportador falló por otra razón: ${error.issues.slice(0, 2).join('; ')}`,
    );
  }
  const totalMs = performance.now() - started;

  const dataQueries = log.filter(
    (q) => /^\s*select\s/i.test(q.text) && q.text.includes('from public.'),
  );
  check(
    dataQueries.length === 4,
    `el exportador lanzó ${String(dataQueries.length)} consultas de datos, se esperaban 4`,
  );
  check(
    (dataQueries[0] as { rows: number }).rows === info.visible,
    `el exportador leyó ${String((dataQueries[0] as { rows: number }).rows)} afirmaciones, se esperaban ${String(info.visible)}`,
  );
  const sqlMs = log.reduce((s, q) => s + q.ms, 0);
  const names = ['assertions', 'evidence', 'translations', 'notices'];
  const plans: Record<string, PlanSummary> = {};
  for (const [i, q] of dataQueries.entries()) {
    plans[names[i] as string] = await explain(owner, 'anon', null, q.text, q.params);
  }
  return {
    totalMs: round(totalMs, 1),
    sqlMs: round(sqlMs, 1),
    otherMs: round(totalMs - sqlMs, 1),
    queries: dataQueries.map((q, i) => ({
      query: names[i] as string,
      ms: round(q.ms, 1),
      rows: q.rows,
    })),
    plans,
  };
}

interface ReadEntry {
  readonly name: string;
  /** Con la política (rol real). */
  readonly rls: Timing;
  /** Lo mismo escrito a mano como propietario, con el filtro de la política explícito. */
  readonly manual: Timing;
  readonly ratio: number;
  readonly rows: number;
  readonly rlsPlan: PlanSummary;
  readonly manualPlan: PlanSummary;
}

async function timeQuery(
  c: Client,
  role: Role,
  userId: string | null,
  sql: string,
  params: readonly unknown[],
  runs: number,
): Promise<{ timing: Timing; rows: number }> {
  const once = (): Promise<{ ms: number; rows: number }> =>
    asRole(c, role, userId, async () => {
      const started = performance.now();
      const result = await c.query(sql, [...params]);
      return { ms: performance.now() - started, rows: result.rowCount ?? 0 };
    });
  const warm = await once();
  // Una consulta de varios segundos no se repite `runs` veces: dos muestras bastan para un orden de magnitud.
  const repeats = warm.ms > 1000 ? Math.min(runs, 2) : runs;
  const samples: number[] = [];
  for (let i = 0; i < repeats; i += 1) samples.push((await once()).ms);
  return { timing: summarize(samples), rows: warm.rows };
}

interface ReadCase {
  readonly name: string;
  readonly role: Exclude<Role, 'owner'>;
  readonly userId: string | null;
  readonly rlsSql: string;
  readonly manualSql: string;
  readonly params?: readonly unknown[];
  /** Filas esperadas (la política y lo escrito a mano deben devolver LO MISMO o no se compara lo mismo). */
  readonly expectedRows: number;
}

const VISIBLE_PREDICATE = `a.status = 'verified' and a.superseded_at is null
       and (a.valid_until is null or a.valid_until >= app.panama_today()) and d.status = 'published'`;

async function measureReads(owner: Client, info: ScaleInfo, runs: number): Promise<ReadEntry[]> {
  const cases: ReadCase[] = [
    {
      name: 'anon · todas las afirmaciones públicas (forma del exportador)',
      role: 'anon',
      userId: null,
      rlsSql: `select a.id, d.key, a.field_key, a.version, a.original_text
                 from public.field_assertions a join public.destinations d on d.id = a.destination_id
                order by d.key, a.field_key, a.version`,
      manualSql: `select a.id, d.key, a.field_key, a.version, a.original_text
                    from public.field_assertions a join public.destinations d on d.id = a.destination_id
                   where ${VISIBLE_PREDICATE}
                   order by d.key, a.field_key, a.version`,
      expectedRows: info.visible,
    },
    {
      name: 'anon · las afirmaciones de UN destino (por clave)',
      role: 'anon',
      userId: null,
      rlsSql: `select a.id, a.field_key, a.version, a.original_text
                 from public.field_assertions a join public.destinations d on d.id = a.destination_id
                where d.key = $1`,
      manualSql: `select a.id, a.field_key, a.version, a.original_text
                    from public.field_assertions a join public.destinations d on d.id = a.destination_id
                   where d.key = $1 and ${VISIBLE_PREDICATE}`,
      params: ['bench-1'],
      expectedRows: info.fields.length,
    },
    {
      name: 'anon · fuentes (RLS anidada: fuente → evidencia → afirmación → destino)',
      role: 'anon',
      userId: null,
      rlsSql: 'select count(*) from public.source_records',
      manualSql: `select count(*) from public.source_records s
                   where exists (select 1 from public.assertion_evidence e
                                   join public.field_assertions a on a.id = e.assertion_id
                                   join public.destinations d on d.id = a.destination_id
                                  where e.source_record_id = s.id and ${VISIBLE_PREDICATE})`,
      expectedRows: 1,
    },
    {
      name: 'personal (revisor) · cuenta de todas las afirmaciones',
      role: 'authenticated',
      userId: REVIEWER,
      rlsSql: 'select count(*) from public.field_assertions',
      manualSql: 'select count(*) from public.field_assertions',
      expectedRows: 1,
    },
    {
      name: 'personal (revisor) · cola de revisión (50 en revisión, más antiguas primero)',
      role: 'authenticated',
      userId: REVIEWER,
      rlsSql: `select id, destination_id, field_key, created_at from public.field_assertions
                where status = 'in_review' order by created_at limit 50`,
      manualSql: `select id, destination_id, field_key, created_at from public.field_assertions
                   where status = 'in_review' order by created_at limit 50`,
      expectedRows: Math.min(50, info.totals.inReview ?? 0),
    },
    {
      name: 'personal (editor) · mis borradores (50)',
      role: 'authenticated',
      userId: EDITOR,
      rlsSql: `select id, destination_id, field_key from public.field_assertions
                where created_by = $1 and status = 'draft' limit 50`,
      manualSql: `select id, destination_id, field_key from public.field_assertions
                   where created_by = $1 and status = 'draft' limit 50`,
      params: [EDITOR],
      expectedRows: Math.min(50, info.totals.drafts ?? 0),
    },
  ];

  const entries: ReadEntry[] = [];
  for (const c of cases) {
    const params = c.params ?? [];
    const rls = await timeQuery(owner, c.role, c.userId, c.rlsSql, params, runs);
    const manual = await timeQuery(owner, 'owner', null, c.manualSql, params, runs);
    check(
      rls.rows === c.expectedRows,
      `${c.name}: con la política ${String(rls.rows)} filas, se esperaban ${String(c.expectedRows)}`,
    );
    check(
      manual.rows === c.expectedRows,
      `${c.name}: a mano ${String(manual.rows)} filas, se esperaban ${String(c.expectedRows)}`,
    );
    entries.push({
      name: c.name,
      rls: rls.timing,
      manual: manual.timing,
      ratio: round(rls.timing.medianMs / Math.max(manual.timing.medianMs, 0.01), 1),
      rows: rls.rows,
      rlsPlan: await explain(owner, c.role, c.userId, c.rlsSql, params),
      manualPlan: await explain(owner, 'owner', null, c.manualSql, params),
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------------------------------------------------
type Variant = 'completo' | 'sin serialización' | 'sin serialización ni auditoría';

interface WriteEntry {
  readonly operation: string;
  readonly variant: Variant;
  readonly timing: Timing;
}

async function triggerStates(owner: Client): Promise<Record<string, string>> {
  const { rows } = await owner.query<{ tgname: string; tgenabled: string }>(
    `select tgname, tgenabled from pg_trigger
      where tgrelid = 'public.field_assertions'::regclass and tgname in ('field_assertions_00_serialize', 'field_assertions_audit')`,
  );
  return Object.fromEntries(rows.map((r) => [r.tgname, r.tgenabled]));
}

async function setVariant(owner: Client, variant: Variant): Promise<void> {
  const off = (name: string): string =>
    `alter table public.field_assertions disable trigger ${name}`;
  const on = (name: string): string => `alter table public.field_assertions enable trigger ${name}`;
  await owner.query(
    variant === 'completo'
      ? on('field_assertions_00_serialize')
      : off('field_assertions_00_serialize'),
  );
  await owner.query(
    variant === 'sin serialización ni auditoría'
      ? off('field_assertions_audit')
      : on('field_assertions_audit'),
  );
  // Lo que se mide es lo que se dice medir: el estado real del catálogo, no lo que se pidió.
  const states = await triggerStates(owner);
  const serialize = variant === 'completo' ? 'O' : 'D';
  const audit = variant === 'sin serialización ni auditoría' ? 'D' : 'O';
  check(
    states.field_assertions_00_serialize === serialize && states.field_assertions_audit === audit,
    `los disparadores no quedaron como «${variant}»: ${JSON.stringify(states)}`,
  );
}

async function measureWrites(
  owner: Client,
  info: ScaleInfo,
  writes: number,
): Promise<WriteEntry[]> {
  const variants: Variant[] = ['completo', 'sin serialización', 'sin serialización ni auditoría'];
  const out: WriteEntry[] = [];
  const { rows: dest } = await owner.query<{ id: string }>(
    "select id from public.destinations where status = 'published' order by key",
  );
  const pairs = info.published * info.fields.length;
  check(
    writes * variants.length <= pairs,
    'no hay pares (destino, campo) distintos suficientes para las escrituras',
  );
  const pair = (k: number): { destination: string; field: string } => ({
    destination: (dest[k % info.published] as { id: string }).id,
    field: info.fields[Math.floor(k / info.published) % info.fields.length] as string,
  });

  // Verificaciones: filas en revisión de destinos publicados (cada una solo se verifica una vez).
  const { rows: pool } = await owner.query<{ id: string }>(
    `select a.id from public.field_assertions a join public.destinations d on d.id = a.destination_id
      where a.status = 'in_review' and d.status = 'published' order by a.id`,
  );
  const verifyEach = Math.min(100, Math.floor(pool.length / 2));
  check(verifyEach >= 1, 'no hay revisiones en curso que verificar');

  try {
    for (const [vi, variant] of variants.entries()) {
      await setVariant(owner, variant);
      // Borrador nuevo (siguiente versión de un campo existente): INSERT + COMMIT, sin contar el rol ni los claims.
      const inserts: number[] = [];
      for (let i = 0; i < writes; i += 1) {
        const p = pair(vi * writes + i);
        await owner.query('begin');
        try {
          await owner.query('set local role authenticated');
          await owner.query('set local search_path = public, extensions');
          await owner.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({ sub: EDITOR, role: 'authenticated' }),
          ]);
          const started = performance.now();
          const r = await owner.query(
            `insert into public.field_assertions (destination_id, field_key, source_locale, original_text)
             values ($1, $2, 'es', 'bench write')`,
            [p.destination, p.field],
          );
          await owner.query('commit');
          inserts.push(performance.now() - started);
          check(r.rowCount === 1, 'el INSERT no escribió una fila');
        } catch (error) {
          await owner.query('rollback');
          throw error;
        }
      }
      out.push({
        operation: 'nuevo borrador (INSERT + COMMIT)',
        variant,
        timing: summarize(inserts),
      });

      if (vi < 2) {
        const ids = pool.slice(vi * verifyEach, (vi + 1) * verifyEach);
        if (ids.length > 0 && variant !== 'sin serialización ni auditoría') {
          const verifies: number[] = [];
          for (const row of ids) {
            await owner.query('begin');
            try {
              await owner.query('set local role authenticated');
              await owner.query('set local search_path = public, extensions');
              await owner.query("select set_config('request.jwt.claims', $1, true)", [
                JSON.stringify({ sub: REVIEWER, role: 'authenticated' }),
              ]);
              const started = performance.now();
              const r = await owner.query(
                "update public.field_assertions set status = 'verified', confidence = 'medium' where id = $1",
                [row.id],
              );
              await owner.query('commit');
              verifies.push(performance.now() - started);
              check(
                r.rowCount === 1,
                'la verificación no actualizó una fila (¿la RLS o una puerta la rechazó en silencio?)',
              );
            } catch (error) {
              await owner.query('rollback');
              throw error;
            }
          }
          out.push({
            operation: 'verificar una versión (UPDATE + COMMIT)',
            variant,
            timing: summarize(verifies),
          });
        }
      }
    }
    const written = await count(
      owner,
      "select count(*) as n from public.field_assertions where original_text = 'bench write'",
    );
    check(
      written === writes * variants.length,
      `se escribieron ${String(written)} borradores, se esperaban ${String(writes * variants.length)}`,
    );
  } finally {
    await setVariant(owner, 'completo');
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Contención
// ---------------------------------------------------------------------------------------------------------------------
type Mode = 'relajado (fsync=off)' | 'durable (fsync=on)';

interface ContentionEntry {
  readonly durability: Mode;
  readonly scenario: string;
  readonly clients: number;
  readonly transactions: number;
  readonly tps: number;
  readonly latencyMs: number;
}

interface PgbenchTarget {
  readonly cluster: TestCluster;
  readonly database: string;
  readonly bin: string;
}

async function pgbench(
  target: PgbenchTarget,
  script: string,
  clients: number,
  seconds: number,
): Promise<{ transactions: number; tps: number; latencyMs: number }> {
  const dir = mkdtempSync(join(tmpdir(), 'pi-pgbench-'));
  try {
    const file = join(dir, 'script.sql');
    writeFileSync(file, script);
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(
        join(target.bin, 'pgbench'),
        [
          '-n',
          '-f',
          file,
          '-c',
          String(clients),
          '-j',
          String(Math.min(clients, 4)),
          '-T',
          String(seconds),
          '-h',
          target.cluster.host,
          '-p',
          String(target.cluster.port),
          '-U',
          'postgres',
          target.database,
        ],
        { encoding: 'utf8', timeout: (seconds + 60) * 1000 },
      ));
    } catch (error) {
      const e = error as { stderr?: string; message: string };
      throw new MeasurementError(`pgbench falló: ${e.stderr ?? e.message}`);
    }
    const processed = /number of transactions actually processed: (\d+)/.exec(stdout);
    const failed = /number of failed transactions: (\d+)/.exec(stdout);
    const latency = /latency average = ([\d.]+) ms/.exec(stdout);
    const tps = [...stdout.matchAll(/tps = ([\d.]+)/g)].at(-1);
    check(processed && latency && tps, `no se pudo leer la salida de pgbench:\n${stdout}`);
    check(Number(failed?.[1] ?? 0) === 0, `pgbench informó transacciones fallidas:\n${stdout}`);
    return {
      transactions: Number(processed[1]),
      tps: Number(tps[1]),
      latencyMs: Number(latency[1]),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sessionPrelude = (user: string): string =>
  `begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true);`;

async function measureContention(
  owner: Client,
  target: PgbenchTarget,
  info: ScaleInfo,
  seconds: number,
  durability: Mode,
): Promise<ContentionEntry[]> {
  const out: ContentionEntry[] = [];
  const clients = 8;
  const stripe = Math.floor(info.published / clients);
  check(stripe >= 1, 'no hay destinos publicados suficientes para repartir 8 conexiones');
  const fieldList = info.fields.map((f) => `'${f}'`).join(', ');

  // Cada conexión escribe en SU franja de destinos: sin choques (aísla el coste del bloqueo de los choques reales).
  const spread = `\\set n random(0, ${String(stripe - 1)}) * ${String(clients)} + :client_id + 1
\\set f random(1, ${String(info.fields.length)})
${sessionPrelude(EDITOR)}
insert into public.field_assertions (destination_id, field_key, source_locale, original_text)
select d.id, (array[${fieldList}])[:f], 'es', 'pgbench-spread' from public.destinations d where d.key = 'bench-' || :n;
commit;
`;
  const { rows: hot } = await owner.query<{ id: string }>(
    "select id from public.destinations where key = 'bench-1'",
  );
  const hotId = (hot[0] as { id: string }).id;
  const hotKey = info.fields[0] as string;
  const hotScript = `${sessionPrelude(EDITOR)}
insert into public.field_assertions (destination_id, field_key, source_locale, original_text)
values ('${hotId}', '${hotKey}', 'es', 'pgbench-hot');
commit;
`;

  const run = async (
    scenario: string,
    script: string,
    n: number,
    marker: string,
    serializeOn: boolean,
  ): Promise<void> => {
    await setVariant(owner, serializeOn ? 'completo' : 'sin serialización');
    const before = await count(
      owner,
      'select count(*) as n from public.field_assertions where original_text = $1',
      [marker],
    );
    const r = await pgbench(target, script, n, seconds);
    const after = await count(
      owner,
      'select count(*) as n from public.field_assertions where original_text = $1',
      [marker],
    );
    check(r.transactions > 0, `${scenario}: pgbench no procesó transacciones`);
    check(
      after - before === r.transactions,
      `${scenario}: pgbench dice ${String(r.transactions)} transacciones y hay ${String(after - before)} filas nuevas`,
    );
    out.push({
      durability,
      scenario,
      clients: n,
      transactions: r.transactions,
      tps: round(r.tps, 0),
      latencyMs: round(r.latencyMs),
    });
  };

  try {
    await run('repartidas · con serialización', spread, clients, 'pgbench-spread', true);
    await run('repartidas · sin serialización', spread, clients, 'pgbench-spread', false);
    await run('una sola clave · 1 conexión', hotScript, 1, 'pgbench-hot', true);
    await run('una sola clave · 8 conexiones', hotScript, clients, 'pgbench-hot', true);
  } finally {
    await setVariant(owner, 'completo');
  }

  // Bajo carga, las versiones de la clave caliente siguen siendo 1…N sin repetir ni saltar.
  // `count` llega como texto (bigint) y `max(version)` como número: se comparan como números.
  const { rows } = await owner.query<{ n: string; d: string; m: number }>(
    'select count(*) as n, count(distinct version) as d, max(version) as m from public.field_assertions where destination_id = $1 and field_key = $2',
    [hotId, hotKey],
  );
  const v = rows[0] as { n: string; d: string; m: number };
  const [total, distinct, max] = [Number(v.n), Number(v.d), Number(v.m)];
  check(
    total > 0 && total === distinct && total === max,
    `versiones de la clave caliente corruptas: filas ${String(total)}, distintas ${String(distinct)}, máxima ${String(max)}`,
  );
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------------------------------------------------
interface ScaleResult {
  readonly scale: number;
  readonly info: ScaleInfo;
  readonly seedMs: number;
  readonly export: ExportResult;
  readonly reads: readonly ReadEntry[];
  readonly writes: readonly WriteEntry[];
  readonly contention: readonly ContentionEntry[];
}

/** Lo que depende del `COMMIT`: se repite con un clúster durable (los de lectura no cambian con el disco). */
interface DurableResult {
  readonly scale: number;
  readonly writes: readonly WriteEntry[];
  readonly contention: readonly ContentionEntry[];
}

async function connect(cluster: TestCluster, database: string): Promise<Client> {
  const client = new Client({ host: cluster.host, port: cluster.port, user: 'postgres', database });
  // Una conexión que el servidor cierra estando inactiva emite 'error' y, sin manejador, tumba el proceso sin decir cuál.
  client.on('error', (error) => {
    console.error(`La conexión a «${database}» se terminó: ${error.message}`);
  });
  await client.connect();
  await client.query('set search_path = public, extensions');
  return client;
}

/** Lo que realmente ve una conexión nueva (no lo que se pidió al arrancar). */
async function describeCluster(cluster: TestCluster): Promise<Record<string, string>> {
  const c = await connect(cluster, 'postgres');
  try {
    const { rows } = await c.query<Record<string, string>>(
      `select version() as version, current_setting('shared_buffers') as shared_buffers,
              current_setting('work_mem') as work_mem, current_setting('max_connections') as max_connections,
              current_setting('fsync') as fsync, current_setting('synchronous_commit') as synchronous_commit,
              current_setting('full_page_writes') as full_page_writes`,
    );
    const r = rows[0] as Record<string, string>;
    return { ...r, version: (r.version ?? '').split(' on ')[0] ?? '' };
  } finally {
    await c.end();
  }
}

/** Arranca un clúster, migra una plantilla con las tres personas y entrega la conexión de administración. */
async function withCluster<T>(
  durable: boolean,
  fn: (cluster: TestCluster, admin: Client) => Promise<T>,
): Promise<T> {
  console.error(`Arrancando PostgreSQL temporal (${durable ? 'durable' : 'relajado'})…`);
  const cluster = await startTestCluster({ durable });
  try {
    const admin = await connect(cluster, 'postgres');
    try {
      await admin.query('create database pi_bench_template');
      const tpl = await connect(cluster, 'pi_bench_template');
      try {
        await migrate(tpl, join(process.cwd(), 'db/migrations'));
        for (const [id, name] of [
          [ADMIN, 'admin'],
          [EDITOR, 'editor'],
          [REVIEWER, 'reviewer'],
        ] as const) {
          await tpl.query('insert into public.profiles (id, display_name) values ($1, $2)', [
            id,
            name,
          ]);
          await tpl.query(
            'insert into public.user_roles (user_id, role) values ($1, $2::public.app_role)',
            [id, name],
          );
        }
      } finally {
        await tpl.end();
      }
      return await fn(cluster, admin);
    } finally {
      await admin.end();
    }
  } finally {
    await cluster.stopAsync();
  }
}

/** Una base nueva clonada de la plantilla, sembrada a esa escala; se borra al terminar. */
async function inScale<T>(
  cluster: TestCluster,
  admin: Client,
  scale: number,
  fn: (owner: Client, database: string, info: ScaleInfo, seedMs: number) => Promise<T>,
): Promise<T> {
  const database = `pi_bench_${String(scale)}`;
  await admin.query(`create database ${database} template pi_bench_template`);
  const owner = await connect(cluster, database);
  try {
    const started = performance.now();
    const info = await seed(owner, scale);
    const seedMs = round(performance.now() - started, 0);
    console.error(
      `  sembrado: ${String(info.totals.assertions)} afirmaciones, ${String(info.totals.sources)} fuentes (${String(seedMs)} ms)`,
    );
    return await fn(owner, database, info, seedMs);
  } finally {
    await owner.end();
    await admin.query(`drop database if exists ${database} with (force)`);
  }
}

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));
  const bin = findBinDir();
  try {
    await execFileAsync(join(bin, 'pgbench'), ['--version']);
  } catch {
    throw new PostgresUnavailableError(
      `No hay pgbench en ${bin}: instala el paquete de PostgreSQL que lo incluye.`,
    );
  }

  const results: ScaleResult[] = [];
  const durable: DurableResult[] = [];
  const environment: Record<string, unknown> = {
    cores: cpus().length,
    cpuModel: cpus()[0]?.model ?? 'desconocido',
    memoryGB: round(totalmem() / 1024 ** 3, 1),
    kernel: release(),
    node: process.version,
    transport: 'socket Unix, sin red, sin pooler',
    measuredAt: new Date().toISOString(),
  };

  await withCluster(false, async (cluster, admin) => {
    const described = await describeCluster(cluster);
    check(described.fsync === 'off', 'el clúster «relajado» tiene fsync activo');
    environment.relaxedCluster = described;
    for (const scale of options.scales) {
      console.error(`\n== Escala ${String(scale)} destinos · relajado ==`);
      await inScale(cluster, admin, scale, async (owner, database, info, seedMs) => {
        const exported = await measureExport(owner, info);
        console.error(
          `  exportador: ${String(exported.totalMs)} ms (SQL ${String(exported.sqlMs)} ms)`,
        );
        const reads = await measureReads(owner, info, options.runs);
        const writes = await measureWrites(owner, info, options.writes);
        const contention = await measureContention(
          owner,
          { cluster, database, bin },
          info,
          options.seconds,
          'relajado (fsync=off)',
        );
        results.push({ scale, info, seedMs, export: exported, reads, writes, contention });
      });
    }
  });

  await withCluster(true, async (cluster, admin) => {
    const described = await describeCluster(cluster);
    check(
      described.fsync === 'on' &&
        described.synchronous_commit === 'on' &&
        described.full_page_writes === 'on',
      `el clúster «durable» no es durable: ${JSON.stringify(described)}`,
    );
    environment.durableCluster = described;
    for (const scale of options.scales) {
      console.error(`\n== Escala ${String(scale)} destinos · durable ==`);
      await inScale(cluster, admin, scale, async (owner, database, info) => {
        const writes = await measureWrites(owner, info, options.writes);
        const contention = await measureContention(
          owner,
          { cluster, database, bin },
          info,
          options.seconds,
          'durable (fsync=on)',
        );
        durable.push({ scale, writes, contention });
      });
    }
  });

  const report = { environment, options: { ...options, jsonOut: undefined }, results, durable };
  if (options.jsonOut) writeFileSync(options.jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  printReport(environment, results, durable);
  return 0;
}

function printReport(
  environment: Record<string, unknown>,
  results: readonly ScaleResult[],
  durable: readonly DurableResult[],
): void {
  const out = (line = ''): void => {
    process.stdout.write(`${line}\n`);
  };
  const writesOf = (writes: readonly WriteEntry[]): void => {
    out('Escritura (ms por operación): mediana · p95');
    for (const w of writes)
      out(
        `  · ${w.operation} · ${w.variant}: ${String(w.timing.medianMs)} · ${String(w.timing.p95Ms)}  (n=${String(w.timing.samples)})`,
      );
  };
  const contentionOf = (rows: readonly ContentionEntry[]): void => {
    out('Contención (pgbench): conexiones · transacciones/s · latencia media ms');
    for (const c of rows)
      out(
        `  · ${c.durability} · ${c.scenario}: ${String(c.clients)} · ${String(c.tps)} · ${String(c.latencyMs)}`,
      );
  };
  out('ENTORNO');
  for (const [k, v] of Object.entries(environment))
    out(
      `  ${k}: ${typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v)}`,
    );
  out(
    '  AVISO: datos sintéticos, sin red y sin pooler; el modo «relajado» no es durable. No es producción.',
  );
  for (const r of results) {
    out(
      `\n=== ${String(r.scale)} destinos · ${String(r.info.visible)} afirmaciones públicas · ${String(r.info.totals.assertions)} filas en total (siembra ${String(r.seedMs)} ms) ===`,
    );
    out(
      `Exportador real: total ${String(r.export.totalMs)} ms = SQL ${String(r.export.sqlMs)} ms + montaje y validación de forma ${String(r.export.otherMs)} ms`,
    );
    for (const q of r.export.queries) {
      const p = r.export.plans[q.query] as PlanSummary;
      out(
        `  · ${q.query}: ${String(q.ms)} ms, ${String(q.rows)} filas · servidor ${String(p.executionMs)} ms + plan ${String(p.planningMs)} ms · ${p.scans.join(' | ')}`,
      );
    }
    out('Lectura (mediana, ms): con política · a mano · cociente');
    for (const e of r.reads) {
      out(
        `  · ${e.name}: ${String(e.rls.medianMs)} · ${String(e.manual.medianMs)} · ×${String(e.ratio)}  (${String(e.rows)} filas)`,
      );
      out(
        `      política → ${e.rlsPlan.scans.join(' | ')}; subplanes ${String(e.rlsPlan.subPlans)}; servidor ${String(e.rlsPlan.executionMs)} + plan ${String(e.rlsPlan.planningMs)} ms${e.rlsPlan.filters.length ? `; filtro ${e.rlsPlan.filters.join(' ; ')}` : ''}`,
      );
      out(
        `      a mano  → ${e.manualPlan.scans.join(' | ')}; servidor ${String(e.manualPlan.executionMs)} + plan ${String(e.manualPlan.planningMs)} ms`,
      );
    }
    out('— modo relajado —');
    writesOf(r.writes);
    contentionOf(r.contention);
    const d = durable.find((x) => x.scale === r.scale);
    if (d) {
      out('— modo durable (fsync=on) —');
      writesOf(d.writes);
      contentionOf(d.contention);
    }
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof PostgresUnavailableError) {
      console.error(`No se pudo medir: ${error.message}`);
      process.exitCode = 2;
    } else if (error instanceof MeasurementError) {
      console.error(`Medición inválida: ${error.message}`);
      process.exitCode = 1;
    } else {
      console.error(error);
      process.exitCode = 1;
    }
  });
