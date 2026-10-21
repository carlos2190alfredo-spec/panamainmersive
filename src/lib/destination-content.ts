import {
  buildContentView,
  contentStatusFor,
  hasRequiredFields,
  pageSensitivity,
  weakestStatus,
  type DestinationContentView,
} from '@/domains/content/completeness';
import type { DestinationContent } from '@/lib/content-snapshot';
import type { Sensitivity, TranslationStatus } from '@/domains/editorial/publication';
import { UI_TRANSLATION_STATUS } from '@/domains/editorial/ui-status';
import type { DestinationKind } from '@/domains/tourism/destinations';
import { LOCALES, type Locale } from '@/i18n/locales';

/**
 * Lo que la ficha de un destino dice en cada idioma y cómo se indexa, a partir del contenido publicado. Una sola
 * función para la página, sus metadatos y el sitemap: así no pueden discrepar.
 */
export interface DestinationSeo {
  readonly views: Readonly<Record<Locale, DestinationContentView>>;
  readonly hasRequiredFields: (locale: Locale) => boolean;
  readonly statusFor: (locale: Locale) => TranslationStatus;
  readonly sensitivity: Sensitivity;
}

export function destinationSeo(
  content: DestinationContent,
  kind: DestinationKind,
  today: string,
): DestinationSeo {
  const views = Object.fromEntries(
    LOCALES.map((l) => [l, buildContentView(content.assertions, content.notices, kind, l, today)]),
  ) as Record<Locale, DestinationContentView>;
  return {
    views,
    hasRequiredFields: (locale) => hasRequiredFields(views[locale]),
    // La página es tan publicable como su parte menos revisada: la interfaz (hoy borrador/automática) o el contenido.
    statusFor: (locale) =>
      weakestStatus(UI_TRANSLATION_STATUS[locale], contentStatusFor(views[locale])),
    sensitivity: pageSensitivity(Object.values(views)),
  };
}
