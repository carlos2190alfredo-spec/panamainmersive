import { z } from 'zod';
import { DESTINATION_KEYS, getDestination } from '@/domains/tourism/destinations';
import { LOCALES } from '@/i18n/locales';
import {
  CONFIDENCES,
  MAX_EXCERPT_LENGTH,
  MAX_TEXT_LENGTH,
  TEXT_PROVENANCES,
  type AssertionRecord,
  type FieldNotice,
} from './assertion';
import { dayOf, daysBetween } from './dates';
import { FIELD_KEYS, SOURCE_CLASSES } from './fields';
import { verificationIssues } from './gates';

/**
 * Instantánea PUBLICADA del contenido (`data/content/published.json`). La produce `pnpm content:export` leyendo la BD
 * como `anon` (la RLS decide qué sale) y la revalida con las mismas puertas del dominio. La aplicación solo lee
 * este archivo: sin BD, el contenido es el de la última exportación. No lleva identidades de personas.
 * Se usa solo en el servidor (zod no debe viajar al navegador: E-51).
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoInstant = z.string().max(40);
const shortText = z.string().min(1).max(300);

const evidenceSchema = z.strictObject({
  id: z.uuid(),
  sourceClass: z.enum(SOURCE_CLASSES),
  institution: shortText,
  title: shortText,
  url: z.string().max(2048),
  publishedOn: isoDate.nullable(),
  retrievedAt: isoInstant,
  license: z.strictObject({ name: shortText, url: z.string().max(2048).nullable() }),
  stance: z.enum(['supports', 'contradicts']),
  locator: shortText.nullable(),
  excerpt: z.string().min(1).max(MAX_EXCERPT_LENGTH).nullable(),
});

const textSchema = z.strictObject({
  locale: z.enum(LOCALES),
  text: z.string().max(MAX_TEXT_LENGTH),
  provenance: z.enum(TEXT_PROVENANCES),
  status: z.enum(['draft', 'machine_translated', 'reviewed', 'published', 'outdated']),
});

const assertionSchema = z.strictObject({
  id: z.uuid(),
  destinationKey: z.enum(DESTINATION_KEYS),
  fieldKey: z.enum(FIELD_KEYS),
  version: z.number().int().min(1),
  sourceLocale: z.enum(LOCALES),
  quantity: z
    .strictObject({ value: z.number().finite(), unit: z.string().min(1).max(8) })
    .nullable(),
  texts: z.array(textSchema).max(LOCALES.length),
  confidence: z.enum(CONFIDENCES),
  verifiedAt: isoInstant,
  validFrom: isoDate.nullable(),
  validUntil: isoDate.nullable(),
  evidence: z.array(evidenceSchema).max(20),
});

const noticeSchema = z.discriminatedUnion('state', [
  z.strictObject({
    destinationKey: z.enum(DESTINATION_KEYS),
    fieldKey: z.enum(FIELD_KEYS),
    state: z.literal('EXPIRED'),
    verifiedAt: isoInstant,
    validUntil: isoDate,
  }),
  z.strictObject({
    destinationKey: z.enum(DESTINATION_KEYS),
    fieldKey: z.enum(FIELD_KEYS),
    state: z.literal('DISPUTED'),
  }),
]);

export const snapshotSchema = z.strictObject({
  schema: z.literal(SNAPSHOT_SCHEMA_VERSION),
  /** `null` solo en la instantánea vacía inicial: nunca se ha exportado. */
  generatedAt: isoInstant.nullable(),
  assertions: z.array(assertionSchema).max(5000),
  notices: z.array(noticeSchema).max(5000),
});
export type PublishedSnapshot = z.infer<typeof snapshotSchema>;

export const EMPTY_SNAPSHOT: PublishedSnapshot = {
  schema: SNAPSHOT_SCHEMA_VERSION,
  generatedAt: null,
  assertions: [],
  notices: [],
};

export function snapshotToRecords(snapshot: PublishedSnapshot): AssertionRecord[] {
  return snapshot.assertions.map((a) => ({
    ...a,
    status: 'verified' as const,
    supersededAt: null,
    authorId: null,
    verifiedById: null,
  }));
}

export const snapshotNotices = (snapshot: PublishedSnapshot): FieldNotice[] => snapshot.notices;

/**
 * Comprobaciones SEMÁNTICAS de una instantánea ya válida en forma. Devuelve mensajes legibles para quien exporta o
 * compila; vacío = sin problemas. La instantánea no se «arregla»: si algo no cumple, se rechaza entera.
 */
export function snapshotIssues(snapshot: PublishedSnapshot): string[] {
  const out: string[] = [];
  const seenIds = new Set<string>();
  const current = new Set<string>();
  for (const a of snapshot.assertions) {
    const where = `${a.destinationKey}/${a.fieldKey}@${String(a.version)}`;
    if (seenIds.has(a.id)) out.push(`${where}: id duplicado`);
    seenIds.add(a.id);

    const slot = `${a.destinationKey}/${a.fieldKey}`;
    if (current.has(slot)) out.push(`${slot}: más de una afirmación vigente`);
    current.add(slot);

    const destination = getDestination(a.destinationKey);
    if (!destination) {
      out.push(`${where}: destino desconocido`);
      continue;
    }
    const record: AssertionRecord = {
      ...a,
      status: 'verified',
      supersededAt: null,
      authorId: null,
      verifiedById: null,
    };
    for (const code of verificationIssues(record, destination.kind, { people: 'unavailable' })) {
      out.push(`${where}: ${code}`);
    }
    for (const t of a.texts) {
      // Solo sale lo publicable: el original (publicado al verificar) o una traducción humana revisada y publicada.
      if (t.status !== 'published') out.push(`${where}: texto ${t.locale} no publicado`);
      if (t.provenance === 'ai_translation')
        out.push(`${where}: texto ${t.locale} es traducción automática`);
    }
    const locales = a.texts.map((t) => t.locale);
    if (new Set(locales).size !== locales.length)
      out.push(`${where}: idioma repetido en los textos`);
  }
  const noticeSlots = new Set<string>();
  for (const n of snapshot.notices) {
    const slot = `${n.destinationKey}/${n.fieldKey}`;
    if (current.has(slot)) out.push(`${slot}: aviso ${n.state} junto a una afirmación vigente`);
    if (noticeSlots.has(slot)) out.push(`${slot}: avisos repetidos`);
    noticeSlots.add(slot);
  }
  return out;
}

export class SnapshotError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(
      `Instantánea de contenido inválida (${String(issues.length)}): ${issues.slice(0, 5).join('; ')}`,
    );
    this.name = 'SnapshotError';
    this.issues = issues;
  }
}

/** Valida forma y semántica; lanza `SnapshotError` (nunca devuelve algo parcial). */
export function parseSnapshot(raw: unknown): PublishedSnapshot {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SnapshotError(
      parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.code}`),
    );
  }
  const issues = snapshotIssues(parsed.data);
  if (issues.length > 0) throw new SnapshotError(issues);
  return parsed.data;
}

/**
 * Serialización determinista (claves en el orden del esquema, 2 espacios, salto de línea final): la misma exportación
 * da los mismos bytes, así un `git diff` muestra solo cambios de contenido reales.
 */
export function serializeSnapshot(snapshot: PublishedSnapshot): string {
  return `${JSON.stringify(snapshotSchema.parse(snapshot), null, 2)}\n`;
}

/** ¿Dos instantáneas dicen lo mismo? Ignora solo `generatedAt` (la hora de la exportación). */
export function sameSnapshotContent(a: PublishedSnapshot, b: PublishedSnapshot): boolean {
  return (
    serializeSnapshot({ ...a, generatedAt: null }) ===
    serializeSnapshot({ ...b, generatedAt: null })
  );
}

/** Días de calendario desde la exportación; `null` si nunca se exportó (instantánea vacía inicial). */
export function snapshotAgeDays(snapshot: PublishedSnapshot, today: string): number | null {
  return snapshot.generatedAt === null ? null : daysBetween(dayOf(snapshot.generatedAt), today);
}
