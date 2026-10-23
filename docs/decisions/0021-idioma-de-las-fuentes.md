# 0021 — Idioma de las fuentes citadas

- Estado: Aceptada
- Fecha: 2026-10-23
- Completa a: ADR-0019 (modelo de contenido) y ADR-0020 (la BD, al menos tan estricta como el dominio)
- Relacionadas: `docs/security.md` (R2-12), `docs/i18n.md`, `docs/testing.md`, migración `0010`

## Contexto

La ficha muestra, bajo cada afirmación verificada, sus fuentes: título, institución, nombre de la licencia y dónde dentro del documento. Todo eso está en el idioma del **documento**, que puede no ser el de la página (un informe en inglés citado desde una ficha en español). Sin `lang`, un lector de pantalla lo pronuncia con la voz del idioma de la interfaz. Es el criterio **WCAG 3.1.2 «Idioma de las partes»** (nivel AA); la segunda revisión independiente lo registró como R2-12 y se aplazó (F4-15) porque una columna opcional se puede añadir después sin romper nada.

La norma exime los nombres propios, los términos técnicos, las palabras de idioma indeterminado y el vernáculo del texto que las rodea. **Esto no resuelve el caso**: el título de un documento es una frase, no un nombre propio, y «Licencia de uso abierto» no es un identificador. (El texto de la norma está citado de memoria: `w3.org` está bloqueado por la política de red de este entorno, E-76. Se revisará contra la fuente primaria.)

## Decisión

1. **`source_records.language`, opcional.** `null` significa «no se sabe»: la ficha **no marca `lang` y no lo adivina**. Marcar un idioma equivocado es peor que no marcar (el lector pronunciaría con la voz de otro idioma y el texto sería ininteligible).
2. **Etiqueta BCP 47 en forma canónica y solo bien formada**: idioma en minúsculas (2–3 letras), escritura opcional con inicial mayúscula (`Hant`), región opcional en mayúsculas o tres dígitos (`BR`, `419`): `es`, `pt-BR`, `es-419`, `zh-Hant-TW`. No se comprueba que esté **registrada** en IANA (sin datos ni red; backlog T-16).
3. **El mismo patrón en las tres capas** (`src/domains/content/language-tag.ts`): la restricción de la BD (`source_records_language_check`), el esquema de la instantánea y el componente (que además no pasa al atributo nada que no lo cumpla, como hace con `safeHttpsUrl`). La BD no puede ser más laxa que el dominio (ADR-0020); una prueba de integración compara la restricción real con la expresión sobre un corpus y sobre 400+ cadenas aleatorias con semilla fija.
4. **No es una puerta de verificación.** No cambia qué es verificable; `app.assertion_gate_issues` y `gates.ts` no se tocan. El control blando es un **aviso** del CLI `content:export` («N fuente(s) sin idioma declarado»), que no cambia el código de salida.
5. **Instantánea**: `language` es obligatoria en cada evidencia (con `null` = desconocido), de modo que una instantánea de la forma anterior **falla en voz alta** en vez de leerse como «desconocido». **`schema` sigue en 1**: no existe ninguna instantánea publicada con la forma anterior (la real está vacía) y no hay más consumidores que esta aplicación.
6. **Ficha**: `lang` en el título, la institución, el nombre de la licencia y el localizador. El nombre de la licencia y el localizador viajan **dentro de una frase traducida** («Consultada el … · Licencia: …»), así que los mensajes de los cinco idiomas usan `t.rich` con una etiqueta `<doc>`; los textos de la interfaz que los rodean **no** se marcan. El aviso oculto «se abre en una pestaña nueva» está dentro del enlace marcado y **vuelve** al idioma de la interfaz.
7. **Fuera de alcance, a propósito**: las fuentes del mapa (`data_sources`: Overture, ODbL, Noto…) son nombres propios e identificadores de licencia exentos, y su idioma es conocido y fijo; no se tocan.

## Alternativas descartadas

- **Detectar el idioma automáticamente** o **inferirlo** del idioma de la página o de `source_locale`: es adivinar, y el proyecto no inventa datos.
- **Limitarlo a los cinco idiomas de la interfaz**: las fuentes pueden estar en cualquier idioma (italiano, chino…).
- **Validarlo contra el registro IANA**: requiere datos que no tenemos y red; `Intl` no distingue «bien formado» de «registrado» de forma fiable. Aplazado (T-16).
- **Hacerlo obligatorio o una puerta de verificación**: rechazaría contenido válido y todavía no existe la interfaz de autoría que lo pida (F4-2). El aviso del exportador es el control proporcionado hoy.
- **Subir `schema` a 2**: sin consumidores que distingan versiones; una forma anterior ya falla en voz alta.
- **Ponerlo en `assertion_evidence`**: el idioma es del documento, no de la cita (el localizador y la cita comparten el idioma del documento).

## Consecuencias

- Quien edite fuentes debe **rellenar el idioma** cuando difiera del de la página; hoy no hay interfaz que se lo recuerde (F4-2) y las filas existentes quedan en `null`.
- **axe no detecta la ausencia de `lang`** en un pasaje en otro idioma (su regla `valid-lang`, etiquetada `wcag2aa`/`wcag312` en axe-core 4.14.0, solo valida que el valor sea una etiqueta válida): por eso hay pruebas que comprueban la **presencia** del atributo (componente y E2E), no solo que axe pase.
- La **dirección del texto** (`dir`) de fuentes en idiomas de derecha a izquierda no se maneja (T-16): ninguna fuente prevista lo necesita todavía.
- El tamaño de la ficha no cambia (191,1 KB gzip).

## Evidencia

Unitarias (etiqueta con corpus; esquema; componente con los cinco idiomas, el atributo, el aviso oculto y el idioma malformado), integración (restricción de la BD ≡ dominio sobre corpus y fuzz, privilegios de columna exactos, solo-inserción, exportador y CLI) y E2E de contenido con axe en cinco idiomas y dos temas (`docs/testing.md`). Mutaciones nuevas en `ts.py`, `db.py` y `cli.py` (`docs/testing.md`, «Entrega 4d»).

## Revisar cuando

- Exista la interfaz de autoría (F4-2): entonces el idioma debe pedirse al crear la fuente.
- Haya una primera fuente real, o una fuente en un idioma de derecha a izquierda.
- Se pueda leer la norma en su fuente primaria (comprobar la cita y las excepciones).
- Se decida validar contra el registro IANA (T-16).
