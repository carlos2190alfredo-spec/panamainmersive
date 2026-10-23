-- 0012 · Las políticas RLS evalúan `app.is_*()` y `app.current_user_id()` UNA vez por consulta, no una por fila (F4-8.3).
-- 0005–0008 son inmutables: el cambio va en una migración nueva.
--
-- Lo que mostró `pnpm perf:db` (EXPLAIN con datos sintéticos): la política del personal se aplicaba como un filtro
-- FILA A FILA, `app.has_role('editor') OR app.has_role('reviewer') OR app.has_role('admin')`. Cada `has_role` es una
-- función `security definer` (no se puede incrustar en la consulta) que consulta `user_roles`: ≈ 60 µs por fila leída. Y
-- las condiciones de una política se evalúan ANTES que las de la consulta (para que una función ajena no vea filas que
-- la política oculta), así que `where status = 'in_review'` no ahorraba nada: la función corría igual en cada fila.
-- Una cola de revisión sobre 300 000 filas costaba del orden de 17 segundos.
--
-- Solución estándar: `(select app.is_staff())`. La subconsulta no depende de la fila, PostgreSQL la planifica como un
-- InitPlan y la evalúa una vez por sentencia. El significado NO cambia: las funciones son `stable`, el JWT es constante
-- dentro de una sentencia y la función ve la misma instantánea.
--
-- Se reescribe con `ALTER POLICY` a partir de lo que dice el catálogo (no se vuelven a teclear 45 políticas, y con ello
-- no se pierde ninguna): se envuelve cada llamada a `app.is_*()` / `app.current_user_id()` que NO esté ya dentro de un
-- `SELECT`. Los roles, el comando y el nombre de cada política no se tocan.
--
--  · Si el patrón no encontrara nada, la migración FALLA: un cambio que no cambió nada no puede darse por bueno.
--  · Que NO quede ninguna política sin envolver (también las futuras) lo exige una prueba de integración sobre
--    `pg_policies` (`rls-initplan.test.ts`), no esta migración: una política nueva con la forma antigua debe fallar
--    allí, en CI, antes de llegar a producción.
--  · `app.panama_today()` no se envuelve: es SQL incrustable y barato (una conversión de zona horaria por fila).
do $$
declare
  p record;
  wrapped_using text;
  wrapped_check text;
  clauses text;
  changed int := 0;
  -- Una llamada sin `SELECT ` justo delante: `pg_get_expr` imprime una ya envuelta como `( SELECT app.is_staff() AS …`.
  pattern constant text := '(?<!SELECT )app\.(is_[a-z]+|current_user_id)\(\)';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
     order by tablename, policyname
  loop
    wrapped_using := regexp_replace(p.qual, pattern, '(select app.\1())', 'g');
    wrapped_check := regexp_replace(p.with_check, pattern, '(select app.\1())', 'g');
    clauses := '';
    if wrapped_using is distinct from p.qual then
      clauses := clauses || format(' using (%s)', wrapped_using);
    end if;
    if wrapped_check is distinct from p.with_check then
      clauses := clauses || format(' with check (%s)', wrapped_check);
    end if;
    if clauses <> '' then
      execute format('alter policy %I on %I.%I%s', p.policyname, p.schemaname, p.tablename, clauses);
      changed := changed + 1;
    end if;
  end loop;
  if changed = 0 then
    raise exception 'la migración 0012 no reescribió ninguna política: el patrón no encontró llamadas a app.is_*()';
  end if;
  raise notice '0012: % políticas reescritas', changed;
end
$$;
