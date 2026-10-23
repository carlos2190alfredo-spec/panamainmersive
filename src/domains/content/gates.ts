import type { DestinationKind } from '@/domains/tourism/destinations';
import type { AssertionRecord } from './assertion';
import { MAX_TEXT_LENGTH } from './assertion';
import { dayOf, daysBetween, isIsoDate, isIsoInstant } from './dates';
import { appliesTo, getField, type ContentField } from './fields';

/**
 * Puertas de verificación: lo que DEBE cumplirse para que una afirmación se pueda mostrar como verificada.
 * La BD las impone con restricciones y disparadores (migraciones 0007 y 0008); el exportador y la carga de la instantánea
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
  'validity_starts_after_verification',
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
   * `required` (datos de la BD): se comprueban verificador y autor. `unavailable` (instantánea publicada): no lleva
   * identidades (`anon` no puede leerlas), así que NI el exportador NI el cargador revalidan `verifier_missing` ni
   * `verifier_is_author`: solo se garantizan al verificar, con el disparador y el `CHECK` de la BD. Quien edite a mano
   * `published.json` no tropieza con ellas (docs/security.md, ADR-0020).
   */
  readonly people: 'required' | 'unavailable';
}

/** Enlace `https` que `new URL()` acepta. La BD (`app.is_https_url`) es más estricta: lo suyo es un subconjunto. */
export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Longitud en PUNTOS DE CÓDIGO (lo que cuenta `char_length` de PostgreSQL), no en unidades UTF-16 (`String.length`):
 * 2 500 emojis son 2 500 caracteres para la BD y 5 000 unidades para JavaScript; medir distinto dejaba pasar en la
 * BD lo que el exportador rechazaba y, al ser lo verificado inmutable, bloqueaba toda la exportación.
 */
export const codePointLength = (text: string): number => Array.from(text).length;

/**
 * Identidad de una fuente a efectos de contar «dos fuentes»: el enlace sin fragmento y en minúsculas. Citar dos
 * veces el mismo documento no cumple «dos fuentes». Espejo de `lower(regexp_replace(url, '#.*$', ''))` en la BD.
 */
export const normalizeSourceUrl = (url: string): string =>
  (url.split('#', 1)[0] ?? url).toLowerCase();

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
    if (!isHttpsUrl(e.url)) issues.add('evidence_insecure_url');
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
  // Se cuentan fuentes DISTINTAS, no filas de evidencia.
  const classSources = new Set(byClass.map((e) => normalizeSourceUrl(e.url)));
  if (classSources.size < rule.minCount) issues.add('evidence_class_insufficient');

  if (verifiedDay) {
    const freshSources = new Set<string>();
    for (const e of byClass) {
      if (!isIsoInstant(e.retrievedAt)) continue;
      const age = daysBetween(dayOf(e.retrievedAt), verifiedDay);
      if (age === null) continue;
      // Una fuente «consultada» después de verificar no puede respaldar esa verificación
      if (age < 0) issues.add('evidence_after_verification');
      else if (age <= rule.maxAgeDays) freshSources.add(normalizeSourceUrl(e.url));
    }
    if (
      classSources.size >= rule.minCount &&
      freshSources.size < rule.minCount &&
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
  // Algo que aún no rige no se verifica como vigente: se redacta cuando aplica.
  if (verifiedDay && validFrom !== null && validFrom > verifiedDay) {
    issues.push('validity_starts_after_verification');
  }
  if (field.maxValidityDays !== null && validUntil === null) return [...issues, 'validity_missing'];
  // Una vigencia ya vencida al verificar nace vencida: se rechaza en TODOS los campos, también los estables.
  if (verifiedDay && validUntil !== null) {
    const span = daysBetween(verifiedDay, validUntil);
    if (span !== null && span < 0) issues.push('validity_before_verification');
    else if (span !== null && field.maxValidityDays !== null && span > field.maxValidityDays)
      issues.push('validity_too_long');
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
  if (record.texts.some((t) => t.text.trim() === '' || codePointLength(t.text) > MAX_TEXT_LENGTH))
    issues.push('text_invalid');
  return issues;
}

export function verificationIssues(
  record: AssertionRecord,
  kind: DestinationKind,
  options: GateOptions,
  /** Solo para pruebas: evalúa con un campo distinto al del registro (p. ej. umbrales que hoy nadie usa). */
  fieldOverride?: ContentField,
): GateCode[] {
  const { field, issues } = fieldOverride
    ? {
        field: fieldOverride,
        issues: appliesTo(fieldOverride, kind) ? [] : (['field_not_applicable'] as GateCode[]),
      }
    : fieldIssues(record, kind);
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
