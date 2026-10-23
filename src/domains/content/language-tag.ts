/**
 * Idioma de una fuente citada (F4-15; WCAG 3.1.2 «Idioma de las partes», AA).
 *
 * El título, la institución, el nombre de la licencia y el localizador de una fuente están en el idioma del DOCUMENTO,
 * que puede no ser el de la página: sin `lang`, un lector de pantalla los lee con la voz del idioma de la interfaz. Se
 * guarda como etiqueta BCP 47 en su forma CANÓNICA (idioma en minúsculas, escritura con inicial mayúscula y región en
 * mayúsculas o tres dígitos: `es`, `pt-BR`, `es-419`, `zh-Hant-TW`) y solo se comprueba que está BIEN FORMADA, no que
 * esté registrada en IANA. `null` es «no se sabe»: la ficha no marca `lang` y NO lo adivina.
 *
 * La BD (`source_records_language_check`, migración 0010), el esquema de la instantánea y el componente usan ESTE patrón:
 * la BD no puede ser más laxa que el dominio (ADR-0020).
 */
export const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/;

/**
 * El mismo texto del patrón, tal como lo lleva la restricción de la BD (`~`). Una prueba de integración comprueba que la
 * BD y esta expresión dan el mismo veredicto sobre un corpus (incluidos los casos en que JavaScript y PostgreSQL pueden
 * diferir: salto de línea final, cifras de ancho completo).
 */
export const LANGUAGE_TAG_SQL_PATTERN = LANGUAGE_TAG.source;

export function isLanguageTag(value: unknown): value is string {
  return typeof value === 'string' && LANGUAGE_TAG.test(value);
}
