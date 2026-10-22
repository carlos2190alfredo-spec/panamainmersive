# 0020 — Endurecimiento del modelo de contenido tras una revisión independiente

- Estado: Aceptada
- Fecha: 2026-10-22
- Enmienda a: ADR-0019 (modelo de contenido). No lo reemplaza: lo corrige y lo completa.
- Relacionadas: ADR-0008 (traducciones), `docs/security.md`, `docs/testing.md`

## Contexto

La ADR-0019 se cerró con pruebas verificadas por mutación que **yo mismo** había escrito: mis puntos ciegos eran, por definición, los que esas pruebas no veían. Se encargó una **revisión adversarial independiente** (revisores sin contexto previo, cada uno con un enfoque distinto, y después verificadores que intentan reproducir y refutar cada hallazgo).

Dos cosas que conviene decir sin adornos:

1. **La primera ejecución fue parcial y su resultado era engañoso.** Se agotó el límite de sesión: solo terminaron 2 de las 7 dimensiones y **ninguno** de los verificadores. Mi script trataba un verificador que falla como «no refutado», así que marcó los 16 hallazgos como «confirmados». No lo estaban. Los traté como **no verificados** y reproduje cada uno yo mismo con una **prueba que fallaba antes del arreglo** (22 pruebas rojas y 3 verdes, por las razones esperadas, antes de escribir la migración). El script se corrigió: un verificador que falla ya no confirma nada.
2. Los hallazgos eran reales y varios eran **graves para el propósito del modelo**: la regla «nadie verifica lo que redactó» tenía un hueco, y una traducción «revisada» podía acompañar a un texto distinto del que revisó la persona.

La segunda tanda de revisión (5 dimensiones restantes) se ejecutó sobre una **copia congelada** del commit para no revisar código en movimiento; sus resultados se tratan en `docs/progress.md` (Entrega 4b).

## Decisión

El principio que ordena todo: **la BD debe ser al menos tan estricta como el dominio y el exportador** (lo que la BD acepta, ellos también). Si no, una sola fila verificada —e inmutable— dejaba sin poder exportar el sitio entero.

1. **Separación de funciones real (R-1).** Solo **quien creó un borrador** modifica su contenido y su evidencia (RLS + disparador). Antes, cualquier editor reescribía el borrador de otra persona y, con rol de revisor, lo verificaba: la puerta «verificador ≠ autor» solo miraba `created_by`. Verificar lo que otra persona redactó **sigue siendo posible** y es el caso legítimo.
2. **Las traducciones no sobreviven a un cambio del original (R-2, R-3).** Si cambia el texto, la cantidad o el idioma del original de un borrador, sus traducciones ya hechas pasan a `outdated`; una `outdated` **no se republica sin reescribirla**. `translated_by` es **inmutable** (también en `destination_translations`). Cambiar el idioma del original a uno que ya tiene traducción se rechaza.
3. **El orden de versiones se respeta (R-5).** Verificar una versión anterior después de una posterior se rechaza (`assertion_older_version`); antes la reemplazaba en silencio.
4. **Vigencia (R-8, R-10).** `valid_from` posterior al día de verificación se rechaza (`validity_starts_after_verification`, un 24.º código de puerta): **se redacta cuando aplica**, no se muestra «próximamente» (eso exigiría un estado y una interfaz nuevos y no hay caso de uso). Una `valid_until` anterior a la verificación se rechaza **en todos los campos**, no solo en los que caducan.
5. **Una fuente repetida no cuenta como dos (R-9).** `minCount` cuenta **documentos distintos** (enlace sin fragmento y en minúsculas), no filas de evidencia. Hoy todo `minCount` es 1, pero F4-1 propone subirlo para peligros.
6. **La BD no acepta lo que el exportador rechazaría (R-4, R-7).** «En blanco» exactamente como `String.prototype.trim` (función `app.is_blank`, comparada **punto de código por punto de código** con JavaScript); tamaños en **puntos de código** en BD, dominio y esquema de la instantánea (2 500 emojis son 2 500 caracteres, no 5 000); enlaces `https` que `new URL()` también acepta (`app.is_https_url`, conservadora y comparada contra miles de URL hostiles); identificadores asignados por el servidor; como mucho 20 evidencias por afirmación; unidad ≤ 8 caracteres, cantidad ≥ 10⁻⁶, fechas entre 1900 y 9999 y sin infinitos; un destino con afirmaciones **no cambia de tipo ni de clave**.
7. **Endurecer un umbral no bloquea el sitio (R-11).** Las puertas se evalúan en la BD al verificar, y el exportador las repite con el registro **vigente**. Si se endurece un umbral, lo ya verificado (inmutable) puede dejar de cumplir. Antes eso hacía fallar la exportación entera; ahora el exportador **excluye con ruido** lo afectado (lo lista en `stderr` con sus códigos, lo cuenta en el resumen y termina con **código 4**; `--allow-exclusions` lo acepta) y **sigue fallando** ante lo malformado (forma inválida, duplicados, traducciones no publicables, destino desconocido). No es reparar: lo excluido no se publica. La salida es retirarlo o verificar una versión nueva. La escritura del archivo es **atómica**.
8. **Fugas por canales laterales (R-6).** `app.assertion_gate_issues` ya no la ejecuta cualquier persona autenticada; el personal previsualiza con `app.preview_assertion_gates(id)`, que comprueba que lo es. Los guardianes de evidencia y traducciones responden `42501` a quien no es del personal (antes revelaban el estado con otro código). La vista `field_public_state` es `security_barrier` (un predicado hostil de `anon` ya no se evalúa antes de su filtro: **probado** con un `::regclass` que antes filtraba el nombre de un destino sin publicar).

## Alternativas descartadas

| Alternativa                                           | Por qué no                                                                                                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabla de colaboradores y exigir `verified_by ≠ todos` | Más piezas (disparadores en tres tablas) para un equipo editorial pequeño; «solo quien creó edita» es más simple, más fuerte y más fácil de probar. Cuesta la co-redacción (ver Consecuencias) |
| Mantener «falla todo» en el exportador                | Una fila verificada (inmutable) bloqueaba la publicación de una disputa o retirada **urgente** de otro destino: peor que excluir con ruido                                                     |
| Estado «próximamente» para `valid_from` futuro        | Exige un estado, avisos y mensajes en cinco idiomas sin caso de uso; rechazar es más simple y honesto                                                                                          |
| Aflojar el dominio para aceptar lo que acepta la BD   | Aceptaría cosas que `new URL()` o `trim()` consideran inválidas o vacías: se prefirió que la BD sea más estricta                                                                               |
| Replicar `new URL()` entero en una expresión regular  | Imposible con fidelidad; se prefirió un subconjunto conservador **demostrado** contra el comportamiento real                                                                                   |
| Seguir comparando longitudes en UTF-16                | No coincide con `char_length`; el sitio podía quedar bloqueado por un texto de 2 500 emojis                                                                                                    |

## Consecuencias

- **Fricción editorial.** No hay co-redacción de un borrador: si quien lo creó no está, otra persona lo **recrea** (un admin puede borrarlo) en lugar de continuarlo. Se acepta a cambio de un principio de cuatro ojos que ahora sí es cierto (F4-12).
- **La regla de enlaces es deliberadamente estrecha**: rechaza IDN sin _punycode_, IPv6, credenciales y hosts numéricos que no sean un cuádruple decimal estricto. Son enlaces válidos para un navegador pero no para este modelo; hay que citarlos en forma ASCII.
- **Un mutante equivalente** sobrevive por defensa en profundidad: la política RLS de evidencia nunca llega a decidir porque el disparador rechaza antes (los dos existen a propósito).
- **El código de salida 4** del exportador obliga a quien automatice la exportación a decidir qué hacer con las exclusiones; no es un error de la herramienta.
- **Procedimiento para cambiar umbrales** (F4-1): migración **nueva** que actualice `content_fields` **y** el registro de código; `pnpm content:export --dry-run` lista qué dejaría de cumplir; cada afirmación afectada se retira o se verifica de nuevo como versión nueva. Sigue sin haber versionado de las reglas (guardar con cada verificación la versión del registro): DEFERRED.
- Los hallazgos de la segunda tanda y su resolución están en `docs/progress.md` (Entrega 4b); lo no resuelto, en `docs/backlog.md`.

## Evidencia

`tests/integration/content-hardening.test.ts` (regresiones R-1…R-11, cada una escrita **antes** y fallando contra `0007`), paridad ampliada en `content-parity.test.ts` (**modo directo** con instantes explícitos alrededor de medianoche UTC y umbrales distintos del registro: antes, las mutaciones `at time zone 'America/Panama'`, `age < 0` y `minCount` sobrevivían), barrido de miles de URL contra `new URL()`, barrido de los 65 535 puntos de código BMP contra `trim()`. Mutaciones: todas las de la migración `0008` y del dominio mueren salvo la equivalente indicada arriba. Evidencia de comportamiento de plataforma: E-57 (hosts numéricos en `new URL`), E-58 (`btrim`/`trim`/longitudes), E-59 (caracteres literales vs. escapes en una migración), E-60 (guardianes `SECURITY DEFINER` y `current_setting('role')`).

## Revisar cuando

- Haya un equipo editorial real: decidir si hace falta co-redacción (F4-12) y el versionado de las reglas.
- Se cambie algún umbral del registro (F4-1): aplicar el procedimiento de arriba.
- Se necesiten enlaces con IDN o IPv6.
