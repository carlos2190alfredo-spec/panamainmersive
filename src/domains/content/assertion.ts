import type { TranslationStatus } from '@/domains/editorial/publication';
import type { DestinationKey } from '@/domains/tourism/destinations';
import type { Locale } from '@/i18n/locales';
import type { FieldKey, SourceClass } from './fields';

/**
 * Ciclo de vida editorial de una afirmación. NO es lo que se muestra: el estado visible se DERIVA de evidencia y
 * caducidad (`state.ts`). `draft` → `in_review` → `verified`; una verificada puede quedar `disputed` o `retracted`;
 * una revisión puede terminar `rejected`.
 */
export const ASSERTION_STATUSES = [
  'draft',
  'in_review',
  'verified',
  'disputed',
  'rejected',
  'retracted',
] as const;
export type AssertionStatus = (typeof ASSERTION_STATUSES)[number];

/**
 * Transiciones permitidas del ciclo editorial. Lo verificado nunca vuelve atrás: se disputa o se retira, y una
 * corrección es una versión NUEVA que reemplaza a la anterior. La BD impone la misma tabla (disparador
 * `assertion_before_update`); una prueba de integración comprueba las 30 combinaciones.
 */
export const ASSERTION_TRANSITIONS: Readonly<Record<AssertionStatus, readonly AssertionStatus[]>> =
  {
    draft: ['in_review'],
    in_review: ['draft', 'verified', 'rejected'],
    verified: ['disputed', 'retracted'],
    disputed: ['retracted'],
    rejected: [],
    retracted: [],
  };

export const canTransition = (from: AssertionStatus, to: AssertionStatus): boolean =>
  ASSERTION_TRANSITIONS[from].includes(to);

export const CONFIDENCES = ['low', 'medium', 'high'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const TEXT_PROVENANCES = ['original', 'human_translation', 'ai_translation'] as const;
export type TextProvenance = (typeof TEXT_PROVENANCES)[number];

export const MAX_TEXT_LENGTH = 4000;
export const MAX_EXCERPT_LENGTH = 300;

export interface EvidenceItem {
  readonly id: string;
  readonly sourceClass: SourceClass;
  readonly institution: string;
  readonly title: string;
  /** Solo `https:`: es lo que verá la persona lectora como enlace. */
  readonly url: string;
  /** Fecha de publicación de la fuente (actualidad del documento), si se conoce. */
  readonly publishedOn: string | null;
  /** Instante en que se CONSULTÓ la fuente (no cuándo se publicó). */
  readonly retrievedAt: string;
  readonly license: { readonly name: string; readonly url: string | null };
  /**
   * Idioma del DOCUMENTO citado (etiqueta BCP 47 canónica; `null` si no se sabe): título, institución, licencia y
   * localizador están en él. La ficha lo marca con `lang` (WCAG 3.1.2) y nunca lo adivina.
   */
  readonly language: string | null;
  readonly stance: 'supports' | 'contradicts';
  /** Dónde dentro de la fuente (sección, página). */
  readonly locator: string | null;
  /** Cita breve (≤ 300 caracteres), nunca el documento. */
  readonly excerpt: string | null;
}

export interface TextVariant {
  readonly locale: Locale;
  readonly text: string;
  readonly provenance: TextProvenance;
  readonly status: TranslationStatus;
}

export interface Quantity {
  readonly value: number;
  readonly unit: string;
}

export interface AssertionRecord {
  readonly id: string;
  readonly destinationKey: DestinationKey;
  readonly fieldKey: FieldKey;
  readonly version: number;
  readonly status: AssertionStatus;
  /** Idioma en el que se redactó el original. */
  readonly sourceLocale: Locale;
  readonly quantity: Quantity | null;
  readonly texts: readonly TextVariant[];
  readonly confidence: Confidence | null;
  /** Instante de la verificación humana. */
  readonly verifiedAt: string | null;
  readonly validFrom: string | null;
  /** Último día de vigencia (incluido), `AAAA-MM-DD`. */
  readonly validUntil: string | null;
  readonly supersededAt: string | null;
  readonly evidence: readonly EvidenceItem[];
  /** Solo en la BD: el instantánea publicada no lleva identidades de personas. */
  readonly authorId: string | null;
  readonly verifiedById: string | null;
}

/**
 * Aviso público de un campo SIN contenido. La RLS solo deja ver afirmaciones vigentes y verificadas; para que la
 * ficha pueda decir «vencido» o «en disputa» (y no confundirlo con «nunca investigado») la BD publica solo el
 * estado, sin el texto, que podría estar desactualizado o discutido.
 */
export type FieldNotice =
  | {
      readonly destinationKey: DestinationKey;
      readonly fieldKey: FieldKey;
      readonly state: 'EXPIRED';
      readonly verifiedAt: string;
      readonly validUntil: string;
    }
  | {
      readonly destinationKey: DestinationKey;
      readonly fieldKey: FieldKey;
      readonly state: 'DISPUTED';
    };
