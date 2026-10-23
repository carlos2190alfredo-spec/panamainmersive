-- 0010 · Idioma del documento citado por una fuente (F4-15; WCAG 3.1.2 «Idioma de las partes», nivel AA).
--
-- El título, la institución, el nombre de la licencia y el localizador de una fuente están en el idioma del DOCUMENTO,
-- que puede no ser el de la página: sin `lang`, un lector de pantalla los lee con la voz del idioma de la interfaz (la
-- segunda revisión independiente lo registró como R2-12 y se aplazó a propósito: una columna opcional se puede añadir
-- después sin romper nada). 0007, 0008 y 0009 son inmutables: el cambio va en una migración nueva.
--
--  · La columna es OPCIONAL: `null` significa «no se sabe» y la ficha no marca `lang` (no se adivina). No es una puerta
--    de verificación (no cambia qué es verificable), así que `app.assertion_gate_issues` y `gates.ts` no se tocan.
--  · Se guarda como etiqueta BCP 47 en su forma CANÓNICA y solo se comprueba que está BIEN FORMADA (no que esté
--    registrada en IANA). El patrón es EL MISMO que usan el esquema de la instantánea y el componente
--    (`src/domains/content/language-tag.ts`): la BD no puede ser más laxa que el dominio (ADR-0020). Una prueba de
--    integración compara los veredictos de la restricción y de la expresión sobre un corpus y sobre cadenas aleatorias.
--  · `source_records` es de solo inserción (disparador de la 0009): añadir una columna es DDL y no lo dispara, y las filas
--    existentes quedan en `null`. Corregir el idioma de una fuente ya citada es crear otra fuente, como con cualquier
--    otro campo suyo.
--  · `anon` lee solo columnas concretas: se concede la nueva a propósito (la exportación corre como `anon`). El personal
--    (`authenticated`) tiene SELECT e INSERT a nivel de tabla y la hereda.
alter table public.source_records
  add column language text
    constraint source_records_language_check
    check (language is null or language ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$');

comment on column public.source_records.language is
  'Idioma del documento citado (etiqueta BCP 47 canónica: es, pt-BR, zh-Hant-TW) o null si no se sabe. Título, institución, licencia y localizador están en él (WCAG 3.1.2).';

grant select (language) on public.source_records to anon;
