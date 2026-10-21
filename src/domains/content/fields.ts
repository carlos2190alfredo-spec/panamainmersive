import type { Sensitivity } from '@/domains/editorial/publication';
import type { DestinationKind } from '@/domains/tourism/destinations';

/**
 * Modelo de contenido de la ficha de destino (ADR-0019). Lógica pura.
 *
 * Una AFIRMACIÓN (`field_assertions` en la BD) es una afirmación sobre un destino para un CAMPO del registro de
 * abajo, con evidencia, vigencia y verificación humana. El estado que se muestra se DERIVA de evidencia y
 * caducidad (`state.ts`); no existe un booleano «verificado» (docs/PROMPT-MAESTRO.md §12).
 *
 * IMPORTANTE: los umbrales de este registro (cuántas fuentes, de qué clase, de qué antigüedad, cuánto dura la
 * vigencia) son decisiones de INGENIERÍA propuestas, no datos con fuente. Hay que validarlos con la persona
 * responsable de la edición (backlog F4-1). Se centralizan aquí para cambiarlos en un solo sitio; la BD los
 * recibe de este registro (prueba de contrato) y no los repite a mano.
 */

/**
 * Clase de fuente. Distingue lo oficial, lo institucional, lo científico y la revisión editorial propia de lo
 * comunitario y lo comercial, que NUNCA bastan por sí solos para afirmar nada.
 */
export const SOURCE_CLASSES = [
  'official',
  'institutional',
  'scientific',
  'editorial_review',
  'community',
  'commercial',
] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

export const FIELD_GROUPS = [
  'overview',
  'access',
  'restrictions',
  'safety',
  'visit',
  'facts',
] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];

export type ValueKind = 'text' | 'quantity';

export interface EvidenceRule {
  /** Clases que cuentan como evidencia suficiente. Hace falta al menos `minCount` de ellas. */
  readonly classes: readonly SourceClass[];
  readonly minCount: number;
  /** Antigüedad máxima (días) de la consulta de la fuente respecto a la verificación. */
  readonly maxAgeDays: number;
}

export interface ContentField {
  readonly key: string;
  readonly group: FieldGroup;
  readonly valueKind: ValueKind;
  /** Reutiliza la política editorial: lo no `general` exige traducción revisada por una persona. */
  readonly sensitivity: Sensitivity;
  readonly evidence: EvidenceRule;
  /**
   * Vigencia máxima (días) desde la verificación. `null` = hecho estable que no caduca. Con un número, la
   * verificación DEBE fijar `valid_until` y no puede superar este plazo.
   */
  readonly maxValidityDays: number | null;
  readonly appliesTo: 'all' | readonly DestinationKind[];
  /** Unidad de una cantidad (solo `quantity`). */
  readonly unit?: 'm';
}

const ANY_REPUTABLE = ['official', 'institutional', 'scientific', 'editorial_review'] as const;

export const CONTENT_FIELDS = [
  {
    key: 'overview.summary',
    group: 'overview',
    valueKind: 'text',
    sensitivity: 'general',
    evidence: { classes: ANY_REPUTABLE, minCount: 1, maxAgeDays: 730 },
    maxValidityDays: null,
    appliesTo: 'all',
  },
  {
    key: 'access.how_to_get_there',
    group: 'access',
    valueKind: 'text',
    sensitivity: 'general',
    evidence: {
      classes: ['official', 'institutional', 'editorial_review'],
      minCount: 1,
      maxAgeDays: 365,
    },
    maxValidityDays: 365,
    appliesTo: 'all',
  },
  {
    key: 'restrictions.entry_rules',
    group: 'restrictions',
    valueKind: 'text',
    sensitivity: 'restrictions',
    evidence: { classes: ['official'], minCount: 1, maxAgeDays: 180 },
    maxValidityDays: 180,
    appliesTo: 'all',
  },
  {
    key: 'restrictions.legal_status',
    group: 'restrictions',
    valueKind: 'text',
    sensitivity: 'legal',
    evidence: { classes: ['official'], minCount: 1, maxAgeDays: 365 },
    maxValidityDays: 365,
    appliesTo: 'all',
  },
  {
    key: 'safety.hazards',
    group: 'safety',
    valueKind: 'text',
    sensitivity: 'safety',
    evidence: { classes: ['official', 'institutional', 'scientific'], minCount: 1, maxAgeDays: 90 },
    maxValidityDays: 90,
    appliesTo: 'all',
  },
  {
    key: 'visit.best_season',
    group: 'visit',
    valueKind: 'text',
    sensitivity: 'general',
    evidence: { classes: ANY_REPUTABLE, minCount: 1, maxAgeDays: 730 },
    maxValidityDays: 365,
    appliesTo: 'all',
  },
  {
    key: 'visit.accessibility',
    group: 'visit',
    valueKind: 'text',
    sensitivity: 'general',
    evidence: {
      classes: ['official', 'institutional', 'editorial_review'],
      minCount: 1,
      maxAgeDays: 365,
    },
    maxValidityDays: 365,
    appliesTo: 'all',
  },
  {
    key: 'facts.elevation_m',
    group: 'facts',
    valueKind: 'quantity',
    sensitivity: 'general',
    evidence: {
      classes: ['official', 'institutional', 'scientific'],
      minCount: 1,
      maxAgeDays: 3650,
    },
    maxValidityDays: null,
    appliesTo: ['volcano'],
    unit: 'm',
  },
] as const satisfies readonly ContentField[];

export type FieldKey = (typeof CONTENT_FIELDS)[number]['key'];
export const FIELD_KEYS = CONTENT_FIELDS.map((f) => f.key) as readonly FieldKey[];

export function getField(key: string): ContentField | undefined {
  return (CONTENT_FIELDS as readonly ContentField[]).find((f) => f.key === key);
}

export function isFieldKey(value: string): value is FieldKey {
  return (FIELD_KEYS as readonly string[]).includes(value);
}

/** Campos que se pueden afirmar para un destino de ese tipo, en el orden del registro. */
export function fieldsFor(kind: DestinationKind): readonly ContentField[] {
  return (CONTENT_FIELDS as readonly ContentField[]).filter(
    (f) => f.appliesTo === 'all' || f.appliesTo.includes(kind),
  );
}

export function appliesTo(field: ContentField, kind: DestinationKind): boolean {
  return field.appliesTo === 'all' || field.appliesTo.includes(kind);
}
