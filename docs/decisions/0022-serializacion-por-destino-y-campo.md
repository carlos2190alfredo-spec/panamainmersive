# 0022 — Serialización por destino y campo de las versiones y las verificaciones

- Estado: Aceptada
- Fecha: 2026-10-23
- Completa a: ADR-0019 (modelo de contenido) y ADR-0020 (endurecimiento)
- Relacionadas: `docs/testing.md`, migración `0011`, backlog F4-8

## Contexto

«Verificado, versionado e inmutable» es la promesa central del modelo de contenido, y hasta ahora solo se había probado con **una conexión a la vez**. Dos personas pueden actuar a la vez sobre el mismo campo del mismo destino. El código tenía dos puntos sensibles:

- `assertion_before_insert` calcula la versión como `max(version) + 1`, sin ningún bloqueo.
- `assertion_before_update` reemplaza la versión vigente con un `UPDATE` que solo ve lo ya **confirmado**.

La hipótesis era que las dos redes de seguridad (`assertion_unique_version` y el índice parcial `field_assertions_one_current`) evitaban la corrupción pero producían errores espurios. Se escribieron pruebas con **dos conexiones reales** y la intercalación **fijada** a propósito (una transacción retiene sus cambios, la otra se lanza sin esperarla y no se continúa hasta que `pg_stat_activity` confirma que está bloqueada), sin `sleep`. Resultado **antes de la corrección** (7 de 10 fallaban):

- **No hubo corrupción**: nunca dos verificadas vigentes del mismo campo, nunca una versión repetida.
- Dos borradores simultáneos: el segundo recibía `23505` (de **ocho** a la vez, **cuatro** fallaban).
- Verificar a la vez v1 y v2: la segunda, una verificación **legítima**, recibía `23505` porque no veía a la primera sin confirmar.
- Verificar una versión **anterior** a otra recién verificada daba «clave duplicada» en vez del error de regla `assertion_older_version`.

Es un error espurio: obliga a reintentar a quien no ha hecho nada mal, con un mensaje que no dice qué pasó.

## Decisión

Un **bloqueo consultivo de transacción** (`pg_advisory_xact_lock`) sobre `(destino, campo)`, tomado por un disparador mínimo, `field_assertions_00_serialize`, **al insertar y al cambiar de estado**, antes que cualquier otro disparador.

1. **El segundo espera al primero.** Al confirmar o deshacer éste, el segundo continúa y su `max(version)` o su reemplazo ya ven lo confirmado (cada sentencia de la función toma su propia instantánea en `READ COMMITTED`; lo comprueban las pruebas, no lo asumo).
2. **El orden es parte del diseño.** Los disparadores BEFORE se ejecutan por orden alfabético del nombre; `00_serialize` va el primero. Una prueba lo exige para `INSERT` y para `UPDATE`: otro disparador que corriera antes leería el estado sin haber bloqueado.
3. **Granularidad exacta.** Dos campos del mismo destino, o el mismo campo de dos destinos, no se esperan entre sí; **editar el texto de un borrador** (una fila, solo su autor) tampoco bloquea. Las tres cosas tienen prueba.
4. **Condición explícita** (`if tg_op = 'INSERT' … else …`), sin depender del cortocircuito del `OR`: en un `INSERT`, `old` no está asignado, y el orden de evaluación no está garantizado por la documentación.
5. **Las redes de seguridad se quedan.** Los dos índices únicos siguen siendo la última defensa.
6. **No se reescriben** las funciones grandes de la 0007/0008: el cambio es una migración nueva y un disparador.

## Alternativas descartadas

- **Reintentar en la aplicación.** No existe todavía la aplicación de autoría (F4-2) y trasladaría a cada cliente la obligación de reconocer un `23505` y de distinguir cuál de los dos índices fue; además el error sigue siendo engañoso.
- **Aislamiento `SERIALIZABLE`.** Cubre más de lo necesario, devuelve `40001` que también hay que reintentar y encarece todo el modelo.
- **`SELECT … FOR UPDATE` sobre la fila de `content_fields`.** Serializaría ese campo en **todos** los destinos: demasiado grueso.
- **Una tabla de contadores por (destino, campo).** Más esquema y una segunda fuente de verdad.
- **Redefinir `assertion_before_insert` y `assertion_before_update` con el bloqueo dentro.** Reescribe funciones grandes ya comprometidas (riesgo de regresión) y deja implícito el orden respecto de otros disparadores.
- **Quitar los índices únicos** una vez serializado: eliminaría la red de seguridad.

## Consecuencias

- Una transacción larga que haya tocado un campo **bloquea ese (destino, campo)** hasta terminar. La interfaz de autoría (F4-2) debe usar transacciones cortas.
- Una transacción que escriba **varios** campos podría interbloquear con otra que los tome en orden contrario; PostgreSQL lo detecta y aborta una (`40P01`). Ninguna ruta actual lo hace (cada afirmación se escribe por separado).
- Es un bloqueo **de transacción** (`xact`): se libera solo y es compatible con un _pooler_ en modo transacción. **No lo probé con un _pooler_** (ni con Supabase).
- Una colisión de la función de hash solo serializa **de más**, nunca de menos.
- El error de «versión anterior» pasa a ser el de regla (`assertion_older_version`, `23514`), que es el que describe lo ocurrido.
- Sin cambios en reglas, datos, API ni ficha.

## Evidencia

`tests/integration/content-concurrency.test.ts` (11 pruebas, con dos y con ocho conexiones; estables en 9 repeticiones) y las mutaciones Z1–Z8 de `scripts/mutation/db.py` (`docs/testing.md`, «Entrega 4e»). Medido **solo en PostgreSQL 16 local por socket Unix**: no se ha medido el coste de la contención ni el de las políticas RLS con más datos (la segunda mitad de F4-8 sigue pendiente).

## Revisar cuando

- Exista la interfaz de autoría (F4-2): revisar la duración de sus transacciones.
- Se añada otro disparador BEFORE a `field_assertions` (su nombre no puede ordenarse antes de `00_serialize`).
- Se pase a un _pooler_ o a una base remota: repetir las pruebas allí.
- Se escriban varios campos en una misma transacción (importaciones masivas).
