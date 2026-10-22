import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  PANAMA_TIME_ZONE,
  formatCalendarDate,
  formatCurrency,
  formatDistance,
  formatElevation,
  formatLanguageName,
  formatList,
  formatNumber,
  formatPanamaDateTime,
} from '@/i18n/format';
import { LOCALES, LOCALE_INFO } from '@/i18n/locales';

// 15:30 UTC = 10:30 en Panamá (UTC−5, sin horario de verano).
const instant = new Date('2026-10-20T15:30:00Z');

describe('formatos con Intl', () => {
  it('la zona de eventos es America/Panama', () => {
    expect(PANAMA_TIME_ZONE).toBe('America/Panama');
  });

  it.each(LOCALES)(
    '%s: la hora local se muestra en Panamá, no en la zona del proceso',
    (locale) => {
      const text = formatPanamaDateTime(locale, instant, { timeStyle: 'short' });
      expect(text).toMatch(/10[:.]30/);
      expect(text).not.toMatch(/15[:.]30/);
    },
  );

  it('la hora de Panamá no depende de la zona del proceso en el cambio de día', () => {
    // 03:00 UTC del 21 = 22:00 del día 20 en Panamá.
    const late = new Date('2026-10-21T03:00:00Z');
    expect(formatPanamaDateTime('en', late, { dateStyle: 'medium' })).toContain('20');
  });

  it('separadores de número por idioma', () => {
    const n = 1234567.89;
    expect(formatNumber('en', n)).toBe('1,234,567.89');
    expect(formatNumber('de', n)).toBe('1.234.567,89');
    expect(formatNumber('es', n)).toBe('1.234.567,89');
    expect(formatNumber('pt', n)).toBe('1.234.567,89');
    expect(formatNumber('fr', n).replace(/\s/g, ' ')).toBe('1 234 567,89');
  });

  it('la región de formato es independiente del idioma (es + PA usa punto decimal)', () => {
    expect(formatNumber('es', 1234567.89, undefined, 'PA')).toBe('1,234,567.89');
  });

  it('cambiar de idioma NO cambia la moneda: siempre USD por defecto, sin conversión', () => {
    for (const locale of LOCALES) {
      const text = formatCurrency(locale, 1234.5, DEFAULT_PREFERENCES);
      expect(text, locale).toMatch(/\$/);
      expect(text, locale).not.toMatch(/€|£/);
      expect(text, locale).toMatch(/1[\s.,]?234/); // \s ya cubre U+00A0 y U+202F
    }
  });

  it('la moneda es una preferencia explícita', () => {
    expect(formatCurrency('en', 10, { currency: 'EUR' })).toContain('€');
  });

  it('una fecha calendario no salta de día por la zona horaria', () => {
    expect(formatCalendarDate('en', '2026-01-01')).toContain('1');
    expect(formatCalendarDate('en', '2026-01-01')).toContain('2026');
    expect(formatCalendarDate('es', '2027-01-18')).toContain('18');
    expect(() => formatCalendarDate('es', 'no-es-fecha')).toThrow(RangeError);
  });

  it('distancia: métrico en m/km, imperial en ft/mi; no mezcla sistemas', () => {
    expect(formatDistance('en', 500, 'metric')).toMatch(/500\s?m/);
    expect(formatDistance('en', 2500, 'metric')).toMatch(/2\.5\s?km/);
    expect(formatDistance('en', 100, 'imperial')).toMatch(/328\s?ft/);
    expect(formatDistance('en', 3218.688, 'imperial')).toMatch(/2\s?mi/);
  });

  it('elevación: 3 475 m × 3,28084 = 11 400,9 ft → 11 401 ft', () => {
    expect(formatElevation('en', 3475, 'metric')).toMatch(/3,475\s?m/);
    expect(formatElevation('en', 3475, 'imperial')).toMatch(/11,401\s?ft/);
  });

  it('listas con la conjunción de cada idioma', () => {
    expect(formatList('en', ['a', 'b', 'c'])).toBe('a, b, and c');
    expect(formatList('es', ['a', 'b', 'c'])).toBe('a, b y c');
    expect(formatList('de', ['a', 'b', 'c'])).toBe('a, b und c');
  });
});

describe('nombre de un idioma en el idioma de la interfaz', () => {
  it.each([
    ['es', 'es', 'español'],
    ['es', 'en', 'inglés'],
    ['en', 'es', 'Spanish'],
    ['pt', 'es', 'espanhol'],
    ['fr', 'es', 'espagnol'],
    ['de', 'es', 'Spanisch'],
    ['de', 'fr', 'Französisch'],
    ['fr', 'de', 'allemand'],
  ] as const)('en %s, «%s» se llama %s', (ui, language, expected) => {
    expect(formatLanguageName(ui, language)).toBe(expected);
  });

  it('nunca es el endónimo en una frase de otro idioma (salvo que coincida con el idioma de la página)', () => {
    for (const ui of LOCALES) {
      for (const language of LOCALES) {
        const name = formatLanguageName(ui, language);
        expect(name.length).toBeGreaterThan(0);
        if (ui !== language) {
          expect(name, `${ui}/${language}`).not.toBe(LOCALE_INFO[language].endonym);
        }
      }
    }
  });
});
