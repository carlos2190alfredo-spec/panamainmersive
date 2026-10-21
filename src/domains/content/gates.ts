import type { DestinationKind } from '@/domains/tourism/destinations';
import type { AssertionRecord } from './assertion';
import { MAX_TEXT_LENGTH } from './assertion';
import { dayOf, daysBetween, isIsoDate, isIsoInstant } from './dates';
import { appliesTo, getField, type ContentField } from './fields';

/**
 * Puertas de verificación: lo que DEBE cumplirse para que una afirmación se pueda mostrar como verificada.
 * La BD las impone con restricciones y disparadores (migración 0007); el exportador y la carga de la instantánea
 * las vuelven a comprobar con ESTA función (defensa en profundidad). Una prueba de integración comprueba que
 * ambas coinciden. Devuelve códigos de máquina; la interfaz no los muestra, el exportador y las pruebas sí.
 */
export const GATE_CODES = [
  'unknown_field',
  'field_not_applicable',
  'status_not_verified',
  'superseded',
  'verifier_missing',
  'verifier_is_author',
  'verified_at_invalid',
  'confidence_missing',
  'evidence_none',
  'evidence_class_insufficient',
  'evidence_stale',
  'evidence_after_verification',
  'evidence_contradicts',
  'evidence_insecure_url',
  'evidence_date_invalid',
  'validity_missing',
  'validity_invalid',
  'validity_before_verification',
  'validity_too_long',
  'original_text_missing',
  'text_invalid',
  'quantity_missing',
  'quantity_invalid',
] as const;
export type GateCode = (typeof GATE_CODES)[number];

export interface GateOptions {
  /**
   * `required` (datos de la BD): se comprueban verificador y autor. `unavailable` (instantánea publicada): no
   * lleva identidades, así que esa puerta la garantiza el exportador contra la BD.
   */
  readonly people: 'required' | 'unavailable';
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function fieldIssues(
  record: AssertionRecord,
  kind: DestinationKind,
): { field: ContentField | null; issues: GateCode[] } {
  const field = getField(record.fieldKey) ?? null;
  if (!field) return { field: null, issues: ['unknown_field'] };
  return { field, issues: appliesTo(field, kind) ? [] : ['field_not_applicable'] };
}

/** Exportada para probar umbrales que el registro actual no usa (p. ej. `minCount` > 1). */
export function evidenceIssues(record: AssertionRecord, field: ContentField): GateCode[] {
  const issues = new Set<GateCode>();
  const verifiedDay =
    record.verifiedAt && isIsoInstant(record.verifiedAt) ? dayOf(record.verifiedAt) : null;
  const rule = field.evidence;

  for (const e of record.evidence) {
    if (!isHttps(e.url)) issues.add('evidence_insecure_url');
    if (!isIsoInstant(e.retrievedAt) || (e.publishedOn !== null && !isIsoDate(e.publishedOn))) {
      issues.add('evidence_date_invalid');
    }
  }
  if (record.evidence.some((e) => e.stance === 'contradicts')) issues.add('evidence_contradicts');

  const supporting = record.evidence.filter((e) => e.stance === 'supports');
  if (supporting.length === 0) {
    issues.add('evidence_none');
    return [...issues];
  }
  const byClass = supporting.filter((e) => rule.classes.includes(e.sourceClass));
  if (byClass.length < rule.minCount) issues.add('evidence_class_insufficient');

  if (verifiedDay) {
    let fresh = 0;
    for (const e of byClass) {
      if (!isIsoInstant(e.retrievedAt)) continue;
      const age = daysBetween(dayOf(e.retrievedAt), verifiedDay);
      if (age === null) continue;
      // Una fuente «consultada» después de verificar no puede respaldar esa verificación
      if (age < 0) issues.add('evidence_after_verification');
      else if (age <= rule.maxAgeDays) fresh++;
    }
    if (
      byClass.length >= rule.minCount &&
      fresh < rule.minCount &&
      !issues.has('evidence_after_verification')
    ) {
      issues.add('evidence_stale');
    }
  }
  return [...issues];
}

function validityIssues(record: AssertionRecord, field: ContentField): GateCode[] {
  const verifiedDay =
    record.verifiedAt && isIsoInstant(record.verifiedAt) ? dayOf(record.verifiedAt) : null;
  const { validFrom, validUntil } = record;
  const issues: GateCode[] = [];
  if (
    (validFrom !== null && !isIsoDate(validFrom)) ||
    (validUntil !== null && !isIsoDate(validUntil))
  ) {
    return ['validity_invalid'];
  }
  if (validFrom !== null && validUntil !== null && validFrom > validUntil)
    issues.push('validity_invalid');
  if (field.maxValidityDays !== null) {
    if (validUntil === null) return [...issues, 'validity_missing'];
    if (verifiedDay) {
      const span = daysBetween(verifiedDay, validUntil);
      if (span !== null && span < 0) issues.push('validity_before_verification');
      else if (span !== null && span > field.maxValidityDays) issues.push('validity_too_long');
    }
  }
  return issues;
}

function valueIssues(record: AssertionRecord, field: ContentField): GateCode[] {
  if (field.valueKind === 'quantity') {
    const q = record.quantity;
    if (!q) return ['quantity_missing'];
    return Number.isFinite(q.value) && q.value > 0 && q.unit === field.unit
      ? []
      : ['quantity_invalid'];
  }
  const original = record.texts.find(
    (t) => t.locale === record.sourceLocale && t.provenance === 'original',
  );
  const issues: GateCode[] = [];
  if (!original || original.text.trim() === '') issues.push('original_text_missing');
  if (record.texts.some((t) => t.text.trim() === '' || t.text.length > MAX_TEXT_LENGTH))
    issues.push('text_invalid');
  return issues;
}

export function verificationIssues(
  record: AssertionRecord,
  kind: DestinationKind,
  options: GateOptions,
): GateCode[] {
  const { field, issues } = fieldIssues(record, kind);
  if (!field) return issues;
  const out = new Set<GateCode>(issues);

  if (record.status !== 'verified') out.add('status_not_verified');
  if (record.supersededAt !== null) out.add('superseded');
  if (record.verifiedAt === null || !isIsoInstant(record.verifiedAt))
    out.add('verified_at_invalid');
  if (record.confidence === null) out.add('confidence_missing');
  if (options.people === 'required') {
    if (record.verifiedById === null) out.add('verifier_missing');
    else if (record.authorId !== null && record.authorId === record.verifiedById)
      out.add('verifier_is_author');
  }
  for (const code of [
    ...evidenceIssues(record, field),
    ...validityIssues(record, field),
    ...valueIssues(record, field),
  ]) {
    out.add(code);
  }
  return [...out];
}

/** ¿Se puede mostrar como verificada? (todas las puertas superadas). */
export const passesGates = (
  record: AssertionRecord,
  kind: DestinationKind,
  options: GateOptions,
): boolean => verificationIssues(record, kind, options).length === 0;
