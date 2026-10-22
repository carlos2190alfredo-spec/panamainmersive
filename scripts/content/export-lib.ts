import type { Client } from 'pg';
import {
  SnapshotError,
  excludeFailingGates,
  parseSnapshotShape,
  snapshotIssues,
  type ExcludedAssertion,
  type PublishedSnapshot,
} from '../../src/domains/content/snapshot';

/**
 * Exporta el contenido PÚBLICO de la BD a la instantánea que lee la aplicación (ADR-0019).
 *
 * Lee como `anon` en una transacción de SOLO LECTURA y con una instantánea consistente: la RLS decide qué sale
 * (verificado, vigente, no reemplazado, destino publicado, traducciones humanas publicadas) y los privilegios por columna
 * impiden siquiera pedir identidades de personas. Después REVALIDA todo con las puertas del dominio y rechaza la
 * instantánea entera si algo no cuadra: no repara ni omite en silencio.
 */
const ISO_INSTANT = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
const instant = (column: string) => `to_char(${column} at time zone 'UTC', ${ISO_INSTANT})`;
const day = (column: string) => `to_char(${column}, 'YYYY-MM-DD')`;

interface AssertionRow {
  id: string;
  destination_key: string;
  field_key: string;
  version: number;
  source_locale: string;
  original_text: string | null;
  quantity_value: number | null;
  quantity_unit: string | null;
  confidence: string;
  verified_at: string;
  valid_from: string | null;
  valid_until: string | null;
}
interface EvidenceRow {
  id: string;
  assertion_id: string;
  stance: string;
  locator: string | null;
  excerpt: string | null;
  source_class: string;
  institution: string;
  title: string;
  url: string;
  published_on: string | null;
  retrieved_at: string;
  license_name: string;
  license_url: string | null;
}
interface TranslationRow {
  assertion_id: string;
  locale: string;
  text: string;
  provenance: string;
  status: string;
}
interface NoticeRow {
  destination_key: string;
  field_key: string;
  state: string;
  verified_at: string | null;
  valid_until: string | null;
}

export interface ExportResult {
  readonly snapshot: PublishedSnapshot;
  /** Lo que ya NO cumple las puertas del registro vigente: no se publica y se dice (ADR-0020). */
  readonly excluded: readonly ExcludedAssertion[];
}

export async function exportPublished(client: Client, now: Date): Promise<ExportResult> {
  await client.query('begin isolation level repeatable read read only');
  try {
    await client.query('set local role anon');
    await client.query('set local search_path = public, extensions');
    await client.query(
      "select set_config('statement_timeout', '15000', true), set_config('lock_timeout', '1000', true)",
    );

    const assertions = (
      await client.query<AssertionRow>(
        `select a.id, d.key as destination_key, a.field_key, a.version, a.source_locale, a.original_text,
                a.quantity_value::float8 as quantity_value, a.quantity_unit, a.confidence::text as confidence,
                ${instant('a.verified_at')} as verified_at, ${day('a.valid_from')} as valid_from,
                ${day('a.valid_until')} as valid_until
           from public.field_assertions a
           join public.destinations d on d.id = a.destination_id
          order by d.key, a.field_key, a.version`,
      )
    ).rows;
    const assertionIds = assertions.map((a) => a.id);

    const evidence = (
      await client.query<EvidenceRow>(
        `select e.id, e.assertion_id, e.stance::text as stance, e.locator, e.excerpt,
                s.source_class::text as source_class, s.institution, s.title, s.url,
                ${day('s.published_on')} as published_on, ${instant('s.retrieved_at')} as retrieved_at,
                s.license_name, s.license_url
           from public.assertion_evidence e
           join public.source_records s on s.id = e.source_record_id
          where e.assertion_id = any($1::uuid[])
          order by e.assertion_id, s.retrieved_at, e.id`,
        [assertionIds],
      )
    ).rows;

    const translations = (
      await client.query<TranslationRow>(
        `select assertion_id, locale, text, provenance::text as provenance, status::text as status
           from public.assertion_translations
          where assertion_id = any($1::uuid[])
          order by assertion_id, locale`,
        [assertionIds],
      )
    ).rows;

    const notices = (
      await client.query<NoticeRow>(
        `select destination_key, field_key, state, ${instant('verified_at')} as verified_at,
                ${day('valid_until')} as valid_until
           from public.field_public_state
          order by destination_key, field_key`,
      )
    ).rows;

    const raw = {
      schema: 1,
      generatedAt: now.toISOString(),
      assertions: assertions.map((a) => ({
        id: a.id,
        destinationKey: a.destination_key,
        fieldKey: a.field_key,
        version: a.version,
        sourceLocale: a.source_locale,
        quantity:
          a.quantity_value === null || a.quantity_unit === null
            ? null
            : { value: a.quantity_value, unit: a.quantity_unit },
        texts: [
          // El original se publica al verificar la afirmación (la verificación humana ES su revisión).
          ...(a.original_text === null
            ? []
            : [
                {
                  locale: a.source_locale,
                  text: a.original_text,
                  provenance: 'original',
                  status: 'published',
                },
              ]),
          ...translations
            .filter((t) => t.assertion_id === a.id)
            .map((t) => ({
              locale: t.locale,
              text: t.text,
              provenance: t.provenance,
              status: t.status,
            })),
        ],
        confidence: a.confidence,
        verifiedAt: a.verified_at,
        validFrom: a.valid_from,
        validUntil: a.valid_until,
        evidence: evidence
          .filter((e) => e.assertion_id === a.id)
          .map((e) => ({
            id: e.id,
            sourceClass: e.source_class,
            institution: e.institution,
            title: e.title,
            url: e.url,
            publishedOn: e.published_on,
            retrievedAt: e.retrieved_at,
            license: { name: e.license_name, url: e.license_url },
            stance: e.stance,
            locator: e.locator,
            excerpt: e.excerpt,
          })),
      })),
      notices: notices.map((n) =>
        n.state === 'EXPIRED'
          ? {
              destinationKey: n.destination_key,
              fieldKey: n.field_key,
              state: 'EXPIRED',
              verifiedAt: n.verified_at,
              validUntil: n.valid_until,
            }
          : { destinationKey: n.destination_key, fieldKey: n.field_key, state: n.state },
      ),
    };

    // Forma estricta (error de TODO si falla). Después se separa lo que ya no cumple las puertas del registro vigente
    // —se excluye y se informa, sin reparar— y lo demás se revalida entero (duplicados, traducciones, avisos…).
    const shaped = parseSnapshotShape(raw);
    const { snapshot, excluded } = excludeFailingGates(shaped);
    const issues = snapshotIssues(snapshot);
    if (issues.length > 0) throw new SnapshotError(issues);
    return { snapshot, excluded };
  } finally {
    await client.query('rollback');
  }
}
