import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { ids, type TestDb } from './helpers';

/** Un destino con clave única (como propietario, saltando RLS). */
export async function newDestination(
  db: TestDb,
  kind: 'locality' | 'volcano' | 'island' = 'locality',
  status: 'published' | 'draft' = 'published',
): Promise<string> {
  const { rows } = await db.owner.query<{ id: string }>(
    'insert into public.destinations (key, kind, status) values ($1, $2, $3::public.destination_status) returning id',
    [`t-${randomUUID().slice(0, 8)}`, kind, status],
  );
  return (rows[0] as { id: string }).id;
}

export interface DraftInput {
  destinationId: string;
  fieldKey?: string;
  text?: string | null;
  quantity?: { value: number; unit: string } | null;
  validUntilDays?: number | null;
  sourceLocale?: string;
}

/** Crea un borrador. Debe llamarse dentro de `db.as*('authenticated', editor, …)`. */
export async function createDraft(c: Client, input: DraftInput): Promise<string> {
  const fieldKey = input.fieldKey ?? 'overview.summary';
  const text = input.quantity ? null : input.text === undefined ? '[prueba] texto' : input.text;
  const { rows } = await c.query<{ id: string }>(
    `insert into public.field_assertions
       (destination_id, field_key, source_locale, original_text, quantity_value, quantity_unit, valid_until)
     values ($1, $2, $3, $4, $5, $6,
             case when $7::int is null then null else (now() at time zone 'UTC')::date + $7::int end)
     returning id`,
    [
      input.destinationId,
      fieldKey,
      input.sourceLocale ?? 'es',
      text,
      input.quantity?.value ?? null,
      input.quantity?.unit ?? null,
      input.validUntilDays ?? null,
    ],
  );
  return (rows[0] as { id: string }).id;
}

export interface SourceInput {
  sourceClass?: string;
  retrievedDaysAgo?: number;
  url?: string;
}

export async function createSource(c: Client, input: SourceInput = {}): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.source_records
       (source_class, institution, title, url, published_on, retrieved_at, license_name, license_url)
     values ($1::public.content_source_class, 'Institución de prueba', 'Documento de prueba', $2, '2026-01-15',
             now() - make_interval(days => $3::int), 'Licencia de prueba', 'https://example.org/licencia')
     returning id`,
    [
      input.sourceClass ?? 'official',
      input.url ?? `https://example.org/${randomUUID().slice(0, 8)}`,
      input.retrievedDaysAgo ?? 10,
    ],
  );
  return (rows[0] as { id: string }).id;
}

export async function addEvidence(
  c: Client,
  assertionId: string,
  sourceId: string,
  stance: 'supports' | 'contradicts' = 'supports',
): Promise<void> {
  await c.query(
    `insert into public.assertion_evidence (assertion_id, source_record_id, stance, locator, excerpt)
     values ($1, $2, $3::public.evidence_stance, 'sección 2', '[prueba] cita breve')`,
    [assertionId, sourceId, stance],
  );
}

export const submit = (c: Client, id: string) =>
  c.query("update public.field_assertions set status = 'in_review' where id = $1", [id]);

export const verify = (c: Client, id: string, confidence: 'low' | 'medium' | 'high' = 'medium') =>
  c.query(
    "update public.field_assertions set status = 'verified', confidence = $2::public.content_confidence where id = $1",
    [id, confidence],
  );

export interface VerifiedInput extends DraftInput {
  sourceClass?: string;
  retrievedDaysAgo?: number;
  author?: string;
  verifier?: string;
}

/** Flujo completo y legítimo: el editor redacta con una fuente y la envía; un revisor distinto verifica. */
export async function makeVerified(db: TestDb, input: VerifiedInput): Promise<string> {
  const author = input.author ?? ids.editor;
  const id = await db.asCommit('authenticated', author, async (c) => {
    const draft = await createDraft(c, input);
    const src = await createSource(c, {
      sourceClass: input.sourceClass ?? 'official',
      retrievedDaysAgo: input.retrievedDaysAgo ?? 10,
    });
    await addEvidence(c, draft, src);
    await submit(c, draft);
    return draft;
  });
  await db.asCommit('authenticated', input.verifier ?? ids.reviewer, (c) => verify(c, id));
  return id;
}

export interface Row {
  [k: string]: unknown;
}
export const rowsOf = async (c: Client, sql: string, params: unknown[] = []): Promise<Row[]> =>
  (await c.query<Row>(sql, params)).rows;

/** Código de máquina y detalle de un error de regla (SQLSTATE 23514). */
export async function ruleError(
  promise: Promise<unknown>,
): Promise<{ message: string; detail: string }> {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; message?: string; detail?: string };
    if (e.code !== '23514')
      throw new Error(`Se esperaba 23514, llegó ${String(e.code)}: ${String(e.message)}`, {
        cause: error,
      });
    return { message: e.message ?? '', detail: e.detail ?? '' };
  }
  throw new Error('Se esperaba un error de regla (23514), pero la operación se permitió');
}
