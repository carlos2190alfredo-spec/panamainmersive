/**
 * Registro central de idiomas (docs/i18n.md §1).
 * Añadir un idioma = una entrada aquí + messages/<código>.json + su fila en las tablas de rutas.
 * Idioma ≠ región ≠ moneda ≠ zona horaria: este registro solo habla de idioma.
 */
export const LOCALES = ['es', 'en', 'pt', 'fr', 'de'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

export interface LocaleInfo {
  /** Nombre del idioma en su propio idioma. El selector usa nombres, nunca banderas. */
  readonly endonym: string;
  /** Valor de `<html lang>` y de hreflang. */
  readonly htmlLang: string;
  /** Etiqueta BCP 47 para `Intl`. La región es una preferencia aparte (docs/i18n.md §4). */
  readonly formatTag: string;
  /** Valor de `og:locale` (requiere territorio). */
  readonly ogLocale: string;
  /** Solo `ltr` está probado: no se afirma soporte RTL. */
  readonly dir: 'ltr';
}

export const LOCALE_INFO: Readonly<Record<Locale, LocaleInfo>> = {
  es: { endonym: 'Español', htmlLang: 'es', formatTag: 'es', ogLocale: 'es_LA', dir: 'ltr' },
  en: { endonym: 'English', htmlLang: 'en', formatTag: 'en', ogLocale: 'en_US', dir: 'ltr' },
  pt: { endonym: 'Português', htmlLang: 'pt', formatTag: 'pt', ogLocale: 'pt_BR', dir: 'ltr' },
  fr: { endonym: 'Français', htmlLang: 'fr', formatTag: 'fr', ogLocale: 'fr_FR', dir: 'ltr' },
  de: { endonym: 'Deutsch', htmlLang: 'de', formatTag: 'de', ogLocale: 'de_DE', dir: 'ltr' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
