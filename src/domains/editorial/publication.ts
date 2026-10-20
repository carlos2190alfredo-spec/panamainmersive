/**
 * Política de publicación editorial (ADR-0008, docs/i18n.md §3 y §6). Lógica pura.
 * Nada de lo que produce una máquina se marca nunca como revisado por una persona.
 */
export const TRANSLATION_STATUSES = [
  'draft',
  'machine_translated',
  'reviewed',
  'published',
  'outdated',
] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

/** Categorías sensibles (restricciones, seguridad, legal) exigen revisión humana sin excepción. */
export const SENSITIVITIES = ['general', 'safety', 'restrictions', 'legal'] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export type SiteEnv = 'development' | 'staging' | 'production';

export function requiresHumanReview(sensitivity: Sensitivity): boolean {
  return sensitivity !== 'general';
}

export function isHumanReviewed(status: TranslationStatus): boolean {
  return status === 'reviewed' || status === 'published';
}

export type IndexingReason =
  | 'ok'
  | 'not_production'
  | 'missing_required_fields'
  | 'sensitive_requires_human_review'
  | 'machine_translated_not_allowed'
  | 'status_not_publishable'
  | 'reviewed_not_indexed_by_policy';

export interface IndexingInput {
  readonly status: TranslationStatus;
  readonly sensitivity: Sensitivity;
  readonly siteEnv: SiteEnv;
  /** Título, descripción y cuerpo mínimos presentes en ese idioma (no se indexan páginas vacías). */
  readonly hasRequiredFields: boolean;
  /** Política del sitio: ¿se indexa `reviewed` o solo `published`? Por defecto solo `published`. */
  readonly indexReviewed?: boolean;
  /**
   * Excepción explícita para contenido NO sensible traducido automáticamente.
   * Por defecto `false`: una traducción automática no se indexa.
   */
  readonly allowMachineTranslatedGeneral?: boolean;
}

export interface IndexingDecision {
  readonly indexable: boolean;
  readonly reason: IndexingReason;
}

export function decideIndexing(input: IndexingInput): IndexingDecision {
  // Todo lo que no sea producción es noindex: desarrollo y staging nunca se indexan.
  if (input.siteEnv !== 'production') return { indexable: false, reason: 'not_production' };
  if (!input.hasRequiredFields) return { indexable: false, reason: 'missing_required_fields' };
  if (requiresHumanReview(input.sensitivity) && !isHumanReviewed(input.status)) {
    return { indexable: false, reason: 'sensitive_requires_human_review' };
  }
  switch (input.status) {
    case 'published':
      return { indexable: true, reason: 'ok' };
    case 'reviewed':
      return input.indexReviewed === true
        ? { indexable: true, reason: 'ok' }
        : { indexable: false, reason: 'reviewed_not_indexed_by_policy' };
    case 'machine_translated':
      return input.allowMachineTranslatedGeneral === true && input.sensitivity === 'general'
        ? { indexable: true, reason: 'ok' }
        : { indexable: false, reason: 'machine_translated_not_allowed' };
    case 'draft':
    case 'outdated':
      return { indexable: false, reason: 'status_not_publishable' };
  }
}
