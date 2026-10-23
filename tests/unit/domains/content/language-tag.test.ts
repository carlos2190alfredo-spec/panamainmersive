import { describe, expect, it } from 'vitest';
import {
  LANGUAGE_TAG,
  LANGUAGE_TAG_SQL_PATTERN,
  isLanguageTag,
} from '@/domains/content/language-tag';
import { INVALID_TAGS, VALID_TAGS } from './language-tag-corpus';

/**
 * Idioma de una fuente (F4-15, WCAG 3.1.2 «Idioma de las partes», AA). Se guarda como etiqueta BCP 47 en su forma
 * CANÓNICA (idioma en minúsculas, escritura con inicial mayúscula, región en mayúsculas o tres dígitos) y solo se
 * comprueba que está BIEN FORMADA: no que esté registrada en IANA. Una etiqueta mal escrita en `lang` hace que un
 * lector de pantalla deje de usar la voz correcta (y axe la marca como `valid-lang`), así que se rechaza en la BD, en el
 * esquema de la instantánea y otra vez en el componente.
 */

describe('etiqueta de idioma de una fuente', () => {
  it.each(VALID_TAGS)('«%s» es una etiqueta canónica válida', (tag) => {
    expect(isLanguageTag(tag)).toBe(true);
    expect(LANGUAGE_TAG.test(tag)).toBe(true);
  });

  it.each(INVALID_TAGS)('%j se rechaza', (tag) => {
    expect(isLanguageTag(tag)).toBe(false);
    expect(LANGUAGE_TAG.test(tag)).toBe(false);
  });

  it('solo acepta cadenas (null, números y objetos no son etiquetas)', () => {
    for (const value of [null, undefined, 0, 5, {}, [], ['es'], true]) {
      expect(isLanguageTag(value)).toBe(false);
    }
  });

  it('el patrón de la BD es el MISMO texto que el del dominio (la BD no puede ser más laxa)', () => {
    expect(LANGUAGE_TAG.source).toBe(LANGUAGE_TAG_SQL_PATTERN);
  });
});
