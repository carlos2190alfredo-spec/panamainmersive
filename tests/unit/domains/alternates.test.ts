import { describe, expect, it } from 'vitest';
import { buildAlternates, type LocaleVariant } from '@/domains/editorial/alternates';
import { LOCALE_INFO, LOCALES, type Locale } from '@/i18n/locales';

const options = {
  defaultLocale: 'es' as const,
  htmlLangOf: (l: Locale) => LOCALE_INFO[l].htmlLang,
};
const url = (l: Locale) => `https://example.org/${l}/x`;

function variants(indexable: Partial<Record<Locale, boolean>>): LocaleVariant[] {
  return LOCALES.map((locale) => ({
    locale,
    url: url(locale),
    indexable: indexable[locale] ?? false,
  }));
}

describe('hreflang y canonical desde variantes publicadas', () => {
  it('canonical propio por idioma: nunca todos a español', () => {
    const v = variants({ es: true, en: true, de: true });
    expect(buildAlternates('de', v, options).canonical).toBe(url('de'));
    expect(buildAlternates('en', v, options).canonical).toBe(url('en'));
  });

  it('solo aparecen las variantes publicadas, con autorreferencia y x-default', () => {
    const v = variants({ es: true, en: true });
    const r = buildAlternates('en', v, options);
    expect(r.languages).toEqual({ es: url('es'), en: url('en'), 'x-default': url('es') });
    expect(r.robots).toEqual({ index: true, follow: true });
  });

  it('es recíproco: todas las variantes indexables declaran el mismo conjunto', () => {
    const v = variants({ es: true, en: true, fr: true });
    const sets = (['es', 'en', 'fr'] as const).map((l) => buildAlternates(l, v, options).languages);
    expect(sets[1]).toEqual(sets[0]);
    expect(sets[2]).toEqual(sets[0]);
  });

  it('una variante no publicada no declara alternates y es noindex', () => {
    const v = variants({ es: true });
    const r = buildAlternates('de', v, options);
    expect(r.languages).toEqual({});
    expect(r.robots).toEqual({ index: false, follow: false });
  });

  it('una variante pendiente nunca aparece en los alternates de las demás', () => {
    const v = variants({ es: true, en: true });
    expect(Object.keys(buildAlternates('es', v, options).languages)).not.toContain('de');
  });

  it('sin variante en español indexable no se inventa x-default', () => {
    const v = variants({ en: true, fr: true });
    expect(buildAlternates('en', v, options).languages).not.toHaveProperty('x-default');
  });

  it('xDefaultUrl explícito (home que negocia idioma) tiene prioridad', () => {
    const v = variants({ es: true, en: true });
    const r = buildAlternates('es', v, { ...options, xDefaultUrl: 'https://example.org/' });
    expect(r.languages['x-default']).toBe('https://example.org/');
  });

  it('falla de forma explícita si falta la variante actual', () => {
    expect(() => buildAlternates('es', [], options)).toThrow(RangeError);
  });
});
