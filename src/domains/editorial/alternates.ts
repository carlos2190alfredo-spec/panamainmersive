import type { Locale } from '@/i18n/locales';

/**
 * hreflang / canonical / robots a partir de las variantes REALMENTE publicadas
 * (docs/i18n.md §6). Lógica pura: recibe URLs ya construidas.
 *
 * Reglas:
 *  - canonical propio por variante (nunca todo a español);
 *  - hreflang recíproco: todas las variantes indexables comparten el mismo conjunto;
 *  - autorreferencia incluida; una variante no indexable no declara alternates;
 *  - `x-default` apunta a la variante del idioma por defecto si es indexable.
 */
export interface LocaleVariant {
  readonly locale: Locale;
  readonly url: string;
  readonly indexable: boolean;
}

export interface AlternatesOptions {
  readonly defaultLocale: Locale;
  readonly htmlLangOf: (locale: Locale) => string;
  /** Sobrescribe `x-default` (p. ej. la raíz que negocia idioma en la home). */
  readonly xDefaultUrl?: string;
}

export interface AlternatesResult {
  readonly canonical: string;
  readonly languages: Readonly<Record<string, string>>;
  readonly robots: { readonly index: boolean; readonly follow: boolean };
}

export function buildAlternates(
  current: Locale,
  variants: readonly LocaleVariant[],
  options: AlternatesOptions,
): AlternatesResult {
  const self = variants.find((v) => v.locale === current);
  if (!self) throw new RangeError(`No hay variante para el idioma actual «${current}»`);

  if (!self.indexable) {
    return { canonical: self.url, languages: {}, robots: { index: false, follow: false } };
  }

  const languages: Record<string, string> = {};
  for (const v of variants) {
    if (v.indexable) languages[options.htmlLangOf(v.locale)] = v.url;
  }

  const defaultVariant = variants.find((v) => v.locale === options.defaultLocale && v.indexable);
  const xDefault = options.xDefaultUrl ?? defaultVariant?.url;
  if (xDefault) languages['x-default'] = xDefault;

  return { canonical: self.url, languages, robots: { index: true, follow: true } };
}
