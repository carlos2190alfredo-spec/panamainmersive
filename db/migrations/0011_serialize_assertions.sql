-- 0011 · Serializa por (destino, campo) la asignación de versión y los cambios de estado (F4-8).
-- 0007 y 0008 son inmutables: el cambio va en una migración nueva y NO reescribe sus funciones.
--
-- Lo que mostraron las pruebas de concurrencia (`tests/integration/content-concurrency.test.ts`), con dos conexiones
-- reales y la intercalación fijada a propósito:
--  · `assertion_before_insert` calcula la versión como `max(version) + 1`. Dos borradores simultáneos del mismo campo
--    calculaban la misma y el segundo fallaba con 23505 (`assertion_unique_version`): de ocho a la vez, cuatro.
--  · El reemplazo de la versión vigente (`assertion_before_update`) solo ve lo ya CONFIRMADO. Verificar a la vez v1 y v2
--    hacía que la segunda no viera a la primera y chocara con `field_assertions_one_current` (23505), aunque fuera una
--    verificación legítima; y intentar verificar una versión anterior a otra recién verificada daba «clave duplicada» en
--    vez del error de regla `assertion_older_version`.
-- NO había corrupción: ambos índices únicos hacían su trabajo y siguen ahí como red de seguridad. Era un error espurio
-- que obligaba a reintentar a quien no había hecho nada mal.
--
-- Solución: un disparador mínimo que toma un bloqueo consultivo (`pg_advisory_xact_lock`) sobre (destino, campo) al
-- insertar y al cambiar de estado, ANTES que cualquier otro. El segundo espera a que el primero confirme o deshaga y,
-- como cada sentencia de una función volátil toma su propia instantánea en READ COMMITTED, el `max(version)` y el
-- reemplazo ya ven lo confirmado.
--
--  · El orden importa: los disparadores BEFORE se ejecutan por orden alfabético del nombre. `00_serialize` va el primero
--    (un dígito precede a una letra); una prueba lo comprueba, porque otro disparador que corriera antes leería el
--    estado sin haber bloqueado.
--  · El bloqueo es de transacción (`xact`): se libera solo al terminar y es seguro con un _pooler_ en modo transacción.
--  · Solo se bloquea al INSERTAR o al cambiar `status`: editar el texto de un borrador (solo su autor, y una fila) no
--    lo necesita. El reemplazo interno de otra versión (`superseded_at`) no cambia el estado: no vuelve a bloquear.
--  · La granularidad es la del problema: dos campos del mismo destino, o el mismo campo de dos destinos, no se esperan
--    entre sí (una prueba lo exige). Una colisión de la función de hash solo serializa de más, nunca de menos.
--  · Una transacción que toque varios campos a la vez podría interbloquear con otra que los tome en orden contrario;
--    PostgreSQL lo detecta y aborta una (40P01). Ninguna ruta actual lo hace: cada afirmación se escribe por separado.
create function app.assertion_serialize() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
declare
  lock_needed boolean;
begin
  -- Explícito a propósito: en un INSERT `old` no está asignado y referenciarlo da error. Un `tg_op = 'INSERT' or … old …`
  -- funcionaría por el cortocircuito de izquierda a derecha, que la documentación no garantiza.
  if tg_op = 'INSERT' then
    lock_needed := true;
  else
    lock_needed := new.status is distinct from old.status;
  end if;
  if lock_needed then
    perform pg_advisory_xact_lock(hashtextextended(new.destination_id::text || ':' || new.field_key, 0));
  end if;
  return new;
end
$$;

create trigger field_assertions_00_serialize before insert or update on public.field_assertions
  for each row execute function app.assertion_serialize();
