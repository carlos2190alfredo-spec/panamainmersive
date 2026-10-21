import type { Sensitivity, TranslationStatus } from '@/domains/editorial/publication';
import type { DestinationKind } from '@/domains/tourism/destinations';
import type { Locale } from '@/i18n/locales';
import type { AssertionRecord, EvidenceItem, FieldNotice, Quantity } from './assertion';
import { CONTENT_FIELDS, type ContentField, type FieldKey } from './fields';
import { fieldState } from './state';
import { resolveText, type ResolvedText } from './text';

/**
 * Lo que la ficha puede decir de un destino en un idioma, y lo que NO. Nada de aquí se inventa: cada elemento
 * `verified` lleva su afirmación (con sus fuentes) y todo lo demás es ausencia explícita.
 */
export interface VerifiedItem {
  readonly field: ContentField;
  readonly assertion: AssertionRecord;
  /** `null` en campos de cantidad. */
  readonly text: Exclude<ResolvedText, { kind: 'none' }> | null;
  readonly quantity: Quantity | null;
  readonly confidence: NonNullable<AssertionRecord['confidence']>;
  readonly verifiedAt: string;
  readonly validUntil: string | null;
  /** Solo las que respaldan (las que contradicen impiden la verificación). */
  readonly sources: readonly EvidenceItem[];
}

export interface DestinationContentView {
  readonly verified: readonly VerifiedItem[];
  readonly expired: readonly { readonly field: ContentField; readonly validUntil: string }[];
  readonly disputed: readonly ContentField[];
  /** Campos aplicables sin nada verificado. Es ausencia de verificación, no prueba de inexistencia. */
  readonly unknown: readonly ContentField[];
}

export function buildContentView(
  assertions: readonly AssertionRecord[],
  notices: readonly FieldNotice[],
  kind: DestinationKind,
  locale: Locale,
  today: string,
): DestinationContentView {
  const verified: VerifiedItem[] = [];
  const expired: { field: ContentField; validUntil: string }[] = [];
  const disputed: ContentField[] = [];
  const unknown: ContentField[] = [];

  for (const field of CONTENT_FIELDS) {
    const state = fieldState(assertions, notices, field, kind, today);
    switch (state.status) {
      case 'VERIFIED': {
        const a = state.assertion;
        const text = field.valueKind === 'text' ? resolveText(a, locale) : null;
        // Las puertas garantizan un original; si faltara, no se inventa nada: queda como desconocido.
        if (text?.kind === 'none' || (field.valueKind === 'quantity' && a.quantity === null)) {
          unknown.push(field);
          break;
        }
        verified.push({
          field,
          assertion: a,
          text,
          quantity: a.quantity,
          confidence: a.confidence ?? 'low',
          verifiedAt: state.verifiedAt,
          validUntil: state.validUntil,
          sources: a.evidence.filter((e) => e.stance === 'supports'),
        });
        break;
      }
      case 'EXPIRED':
        expired.push({ field, validUntil: state.validUntil });
        break;
      case 'DISPUTED':
        disputed.push(field);
        break;
      case 'UNKNOWN':
        if (state.reason === 'not_investigated') unknown.push(field);
        break;
    }
  }
  return { verified, expired, disputed, unknown };
}

/** Campo que la página necesita para ser indexable: un resumen verificado EN ESE IDIOMA (no un original en otro). */
export const REQUIRED_FOR_INDEXING: FieldKey = 'overview.summary';

export function hasRequiredFields(view: DestinationContentView): boolean {
  const summary = view.verified.find((v) => v.field.key === REQUIRED_FOR_INDEXING);
  return summary?.text?.kind === 'exact';
}

/**
 * Estado editorial del CONTENIDO de la página en ese idioma: `published` si su resumen verificado está en ese idioma
 * (el original, que se publica al verificar, o una traducción humana revisada y publicada); si no, `draft`. Un
 * original mostrado «de reserva» en otro idioma NO convierte la página en publicada en el idioma pedido.
 */
export const contentStatusFor = (view: DestinationContentView): TranslationStatus =>
  hasRequiredFields(view) ? 'published' : 'draft';

const STATUS_RANK: Readonly<Record<TranslationStatus, number>> = {
  outdated: 0,
  draft: 1,
  machine_translated: 2,
  reviewed: 3,
  published: 4,
};

/** El más débil de dos estados: una página es tan publicable como su parte menos revisada (interfaz o contenido). */
export const weakestStatus = (a: TranslationStatus, b: TranslationStatus): TranslationStatus =>
  STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;

/** Sensibilidad de la página: la de lo más delicado que muestra (restricciones, seguridad, legal exigen revisión humana). */
export function pageSensitivity(views: readonly DestinationContentView[]): Sensitivity {
  for (const view of views) {
    for (const item of view.verified) {
      if (item.field.sensitivity !== 'general') return item.field.sensitivity;
    }
  }
  return 'general';
}
