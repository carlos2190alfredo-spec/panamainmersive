# 0008 — Entidades separadas de traducciones tipadas con estado editorial

- Estado: Aceptada
- Fecha: 2026-10-20

## Contexto

Un destino tiene una identidad y una geometría; el texto varía por idioma. Se prohíbe un EAV genérico que pierda integridad referencial. Una traducción automática **nunca** debe marcarse como revisada por una persona ni como oficial. Si cambia el original, las traducciones afectadas deben marcarse para revisión.

## Decisión

- Tablas tipadas: `destination_translations`, `activity_translations`, `business_translations`, `story_translations`, `layer_translations`, cada una con `(entity_id, locale)` único y FK.
- Campos de gobierno comunes: `source_language`, `source_version`, `translation_status ∈ {draft, machine_translated, reviewed, published, outdated}`, `translated_at`, `reviewed_at`, `reviewed_by`, `provenance`.
- **Disparador SQL**: al incrementar la versión de la entidad origen, las traducciones con `source_version` anterior pasan a `outdated` (no se borran).
- **Restricciones SQL**: `reviewed`/`published` exigen `reviewed_by` y `reviewed_at`; `machine_translated` **prohíbe** `reviewed_by`.
- **Política de publicación** en código (`src/domains/editorial/publication.ts`): solo `published` es indexable; `machine_translated` no es publicable en producción salvo que la categoría sea no sensible **y** una bandera explícita lo permita; restricciones, seguridad y legal **exigen** revisión humana.
- Si falta una traducción, la UI muestra el original con aviso visible; nunca se presenta la página en español como si estuviera traducida.

## Alternativas descartadas

JSON por idioma en la entidad (sin integridad ni consultas); tabla genérica `translations(entity, field, value)` (EAV).

## Consecuencias

Más tablas, pero integridad y consultas claras. El estado editorial de cada cadena de **interfaz** se declara en `docs/i18n.md` (hoy `machine_translated`/`draft`, pendiente de revisión humana).

## Revisar cuando

Se integre un CMS externo o un flujo de traducción con proveedor.
