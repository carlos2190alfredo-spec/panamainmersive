# 0006 — PostgreSQL/PostGIS con SQL portable a Supabase

- Estado: Aceptada
- Fecha: 2026-10-20

## Contexto

El documento rector prefiere PostgreSQL+PostGIS con Supabase como opción gestionada, con RLS. Aquí hay PostgreSQL 16.15, PostGIS 3.4.2 y pgvector 0.6.0 instalados (E-02), pero **no hay Docker ni Supabase CLI**, y no hay proyecto Supabase ni credenciales.

## Decisión

- Migraciones **SQL puro y versionado** en `db/migrations/`, aplicables tanto a un PostgreSQL local/CI como a Supabase.
- RLS con **funciones propias** (`app.current_user_id()`, `app.has_role(...)`) que leen `request.jwt.claims` (el mecanismo que Supabase/PostgREST establece) y no dependen de `auth.uid()`; así se prueban en local sin esquema `auth`.
- Roles `anon` y `authenticated` (existen en Supabase) se crean **solo si no existen** en entornos locales.
- La autorización de aplicación se hace **en servidor**; RLS es la última barrera. Ambas se prueban con visitante, usuario, propietario de empresa, editor y administrador.
- pgvector y búsqueda semántica **no** se habilitan hasta tener necesidad demostrada.

## Alternativas descartadas

Depender de funciones exclusivas de Supabase (no verificables aquí); ORM que oculte PostGIS.

## Consecuencias

Las pruebas de BD corren contra un clúster temporal real (`pnpm db:test`), no contra mocks. Un despliegue en Supabase queda **IMPLEMENTED pero no VERIFIED** hasta contar con un proyecto (ver `docs/setup.md`).

## Revisar cuando

Se cree un proyecto Supabase real (se verifican migraciones y RLS allí) o se descarte Supabase.
