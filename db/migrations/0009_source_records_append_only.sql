-- 0009 · `source_records` es de solo inserción también para quien tiene todos los privilegios.
-- 0007 y 0008 son inmutables (comprometidas, con checksum): todo cambio va en una migración nueva.
--
-- La ADR-0019 dice que una verificación nunca apunta a un enlace que cambió, y la 0007 lo conseguía quitando el
-- privilegio UPDATE a los roles de la aplicación. Pero el propietario (migraciones, intervención manual) sí podía
-- reescribir la URL, la clase, la fecha de consulta o la licencia de una fuente ya citada por algo verificado, y el
-- exportador lo publicaría sin avisar (la segunda revisión independiente lo reprodujo: rowCount = 1). A diferencia de
-- las demás tablas del modelo, esta no tenía disparador. Ahora lo tiene: corregir una fuente es crear otra y citarla
-- en una versión nueva de la afirmación.
--
-- Quien necesite de verdad reescribir una fuente (p. ej. un error de carga antes de publicar nada) tiene que
-- desactivar el disparador a propósito (`session_replication_role = replica` o `alter table … disable trigger`): es
-- un acto deliberado y visible, no un `update` que pasa sin que nadie lo note.
create function app.source_records_append_only() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  raise exception 'source_records_are_append_only' using errcode = 'check_violation';
end
$$;

create trigger source_records_append_only before update on public.source_records
  for each row execute function app.source_records_append_only();
