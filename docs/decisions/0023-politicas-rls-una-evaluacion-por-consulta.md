# 0023 — Políticas RLS: una evaluación por consulta, no una por fila

- Estado: Aceptada
- Fecha: 2026-10-23
- Completa a: ADR-0019 (modelo de contenido; RLS de la 0007) y la matriz RLS de la Foundation (0005)
- Relacionadas: `docs/performance.md` (M-07), `docs/testing.md`, migración `0012`, backlog F4-8

## Contexto

La segunda mitad de F4-8 era una pregunta abierta desde hacía dos entregas: «¿cuánto cuestan las políticas RLS con más datos?». No había ninguna cifra, solo la sospecha de que las políticas con `exists` anidados (la lectura pública) o con funciones de rol (la del personal) podían escalar mal. Se construyó un banco reproducible (`pnpm perf:db`) que mide con EXPLAIN la lectura con política frente a **lo mismo escrito a mano** (propietario con el filtro explícito), de modo que la diferencia es el coste de la maquinaria de la política y no el del filtro.

Resultado, con datos sintéticos (PostgreSQL 16.15, socket local):

- **Lectura pública (`anon`)**: ×1,1–2,7 sobre lo manual, de milisegundos. Aceptable.
- **Lectura del personal**: ×500–1500 sobre lo manual, y **crece linealmente con las filas**: 176 ms con 2 940 filas, 1,76 s con 29 400 y **17,9 s con 294 000** (la cola de revisión: 50 filas pedidas). El plan lo explica: la política `app.is_staff()` se aplicaba como un **filtro fila a fila**, `app.has_role('editor') OR app.has_role('reviewer') OR app.has_role('admin')`. Cada `has_role` es `security definer` (no se incrusta en la consulta) y lee `user_roles`: ≈ 60 µs por fila.
- Y se aplicaba **antes** que los filtros de la propia consulta (PostgreSQL ejecuta las condiciones de la política primero para que una función ajena no vea filas ocultas), así que `where status = 'in_review'` no ahorraba nada: la cola de revisión pagaba lo mismo que contar todo.

Hoy no tiene consecuencias visibles: el registro tiene nueve destinos y el esquema de la instantánea admite como mucho 5 000 afirmaciones (ver «Lo que no resuelve»), así que el personal leería del orden de cientos de filas (decenas de milisegundos). Pero **cada pantalla de personal futura** (cola de revisión, «mis borradores», historial) heredaría el coste, y 45 políticas tienen esa forma. Es mejor corregirlo antes de que exista la interfaz que lo haría visible.

## Decisión

1. **Cada llamada a `app.is_*()` y a `app.current_user_id()` en una política va envuelta en `(select …)`**: `using ((select app.is_staff()))`. La subconsulta no depende de la fila, así que PostgreSQL la planifica como un _InitPlan_ y la evalúa **una vez por sentencia**. El significado no cambia: las funciones son `stable`, el JWT es constante dentro de una sentencia y la función ve la misma instantánea.
2. **La migración `0012` reescribe las existentes con `ALTER POLICY` a partir del catálogo** (`pg_policies`), envolviendo lo que no esté ya dentro de un `SELECT`. No se vuelven a teclear 45 políticas (con el riesgo de olvidar una o cambiar su sentido); nombre, roles y comando no se tocan. Si el patrón no encontrara nada, la migración **falla**.
3. **Una prueba sobre `pg_policies` exige la forma envuelta también en las futuras** (`rls-initplan.test.ts`): una política nueva con la forma antigua falla en CI, no en producción. Otra comprueba el plan (aparece un InitPlan y desaparece `has_role` como filtro de fila), y otra que **volver a ejecutar** la migración no cambia nada y falla en voz alta (fija que no reenvuelve lo ya envuelto y que una pasada vacía no se da por buena).
4. **El significado queda protegido por las pruebas RLS que ya existían**, sin tocarlas: las 368 pruebas de integración previas pasan, incluida la matriz por rol, el flujo editorial y la visibilidad columna por columna.

Resultado medido tras la corrección: la cola de revisión sobre 294 000 filas, **17,9 s → 19,7 ms** (×1,2 sobre lo manual; contar todas las filas, de 17,8 s a 16,6 ms).

## Alternativas descartadas

- **Reescribir las 45 políticas a mano en la migración.** Más legible a primera vista, pero 45 transcripciones sin un barrido del catálogo habrían dejado una sin envolver tarde o temprano; la prueba-guarda sobre `pg_policies` es precisamente lo que hace innecesario confiar en eso.
- **Envolver solo las de las tablas de contenido.** Las demás (destinos, traducciones, geografía) tienen la misma forma y la guarda no podría distinguir «a propósito» de «se olvidó».
- **Poner el rol en el JWT (`app_metadata`) y no consultar `user_roles`.** Quita la lectura por fila, pero cambia el modelo de confianza (el rol viaja en un token que dura mientras no caduca: revocar un rol dejaría de ser inmediato). Decisión de seguridad que no me corresponde tomar por rendimiento.
- **Añadir índices (`status`, `created_by`).** No era la causa: con la función por fila, un índice solo reduce las filas que la pagan; sin ella, una lectura secuencial de 294 000 filas cuesta ≈ 20 ms. Se medirá cuando exista la pantalla real (T-17).
- **No hacer nada hasta que exista la interfaz.** El cambio es pequeño, la migración falla en voz alta y la guarda impide que vuelva; esperar solo habría trasladado el descubrimiento a una pantalla lenta en producción.

## Lo que esta decisión NO resuelve

- **No es una prueba formal de equivalencia.** La evidencia es que las pruebas RLS previas pasan sin cambios y que la prueba de plan observa la forma esperada. Una política con una semántica sutil que ninguna prueba cubra podría haber cambiado sin que nadie lo notara. La matriz por rol de la Foundation y la visibilidad columna por columna del modelo de contenido son lo bastante densas para que lo considere improbable, no imposible.
- **La lectura pública anidada** (fuente → evidencia → afirmación → destino) cuesta ×2,1 sobre lo manual a 294 000 filas y **×25 a 29 400** (300 ms frente a 12 ms; el planificador elige otro plan). No está en una ruta del producto (el exportador une evidencia y fuente por su cuenta) y la 0012 no la toca: no tiene funciones por fila. Queda anotada, no corregida.
- **`app.panama_today()` no se envuelve**: es SQL incrustable y barato (una conversión de zona horaria por fila).
- **Los números son de un solo equipo**, con datos sintéticos, socket local y sin _pooler_ (`docs/performance.md`, M-07).

## Consecuencias

- Toda política nueva debe escribirse `(select app.is_x())`; la prueba lo exige y su mensaje lista las infractoras. Está en `CLAUDE.md`.
- Las políticas ya no se leen como antes en `pg_policies` (`( SELECT app.is_staff() AS is_staff)`); es cosmético.
- La 0012 es una migración irreversible de hecho (reescribe el catálogo): volver atrás exigiría otra migración.
- Sin cambios en la API, los datos ni la ficha.

## Evidencia

`docs/performance.md` M-07 (antes y después, tres escalas) y `docs/research/evidence-log.md` E-78…E-82; datos en bruto en `docs/research/perf-db-2026-10-23-before.json` y `…-after.json`; `tests/integration/rls-initplan.test.ts` y las mutaciones R1–R7 de `scripts/mutation/db.py` (`docs/testing.md`, «Entrega 4f»).

## Revisar cuando

- Se escriba una política nueva (la guarda la obliga, pero revisar que el _InitPlan_ aparece).
- Exista la interfaz de autoría (F4-2): medir las pantallas reales y decidir los índices (T-17).
- Se cambie el modelo de roles (por ejemplo, rol en el JWT): las políticas y esta decisión cambian juntas.
- Cambie la versión mayor de PostgreSQL: repetir `pnpm perf:db`.
