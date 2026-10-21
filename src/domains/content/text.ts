import type { Locale } from '@/i18n/locales';
import type { AssertionRecord, TextVariant } from './assertion';

/**
 * Qué texto se muestra en un idioma, sin presentar una página en español como si estuviera traducida (docs/i18n.md
 * §3). Se muestra una traducción SOLO si una persona la revisó y está `published` (igual que la RLS); el original
 * se muestra siempre, y cuando se cae al original se dice. Nunca se muestra una traducción automática, un borrador
 * ni una traducción desactualizada.
 */
export type FallbackReason =
  'no_translation' | 'translation_not_published' | 'translation_outdated';

export type ResolvedText =
  | {
      readonly kind: 'exact';
      readonly locale: Locale;
      readonly text: string;
      readonly translated: boolean;
    }
  | {
      readonly kind: 'original_fallback';
      /** Idioma del original que se muestra. */
      readonly locale: Locale;
      readonly text: string;
      readonly reason: FallbackReason;
    }
  | { readonly kind: 'none' };

const isOriginal = (v: TextVariant, a: AssertionRecord): boolean =>
  v.locale === a.sourceLocale && v.provenance === 'original';

export function resolveText(assertion: AssertionRecord, locale: Locale): ResolvedText {
  const original = assertion.texts.find((v) => isOriginal(v, assertion));
  if (!original) return { kind: 'none' };
  if (locale === assertion.sourceLocale) {
    return { kind: 'exact', locale, text: original.text, translated: false };
  }
  const candidate = assertion.texts.find((v) => v.locale === locale && !isOriginal(v, assertion));
  if (candidate?.status === 'published' && candidate.provenance !== 'ai_translation') {
    return { kind: 'exact', locale, text: candidate.text, translated: true };
  }
  // Una traducción automática puede llegar a `published` solo por error de datos: se trata como no publicada.
  const reason: FallbackReason = !candidate
    ? 'no_translation'
    : candidate.status === 'outdated'
      ? 'translation_outdated'
      : 'translation_not_published';
  return { kind: 'original_fallback', locale: original.locale, text: original.text, reason };
}
