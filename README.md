# Panamá Immersive

Plataforma turística geoespacial, multilingüe y honesta con sus datos, para explorar Panamá con mapas, relieve y fuentes verificables. Nombre **provisional** (centralizado en `src/config/site.ts`).

> **Estado:** Fases 0 (Discovery), 1 (Foundation), 2 (mapa real de Panamá) y 3 (GIS: ingesta controlada de áreas, API espacial, capas/leyenda declarativas y selección de áreas) completadas en local. **Fase 4 (Destinos) en curso**: está hecho el **modelo de contenido** (afirmaciones con evidencia, estado derivado, puertas de verificación en BD y dominio, publicación por instantánea) y la ficha que lo muestra; **todavía no hay ninguna afirmación verificada real**, así que cada ficha dice «sin datos verificados». El mapa está **bloqueado en producción** hasta verificar derechos (L-01). Ver [`docs/progress.md`](docs/progress.md) para el estado exacto, lo verificado y lo pendiente.
> Documento rector del proyecto: [`docs/PROMPT-MAESTRO.md`](docs/PROMPT-MAESTRO.md) (copia literal).

## Qué funciona hoy

- Navegación y contenido en **cinco idiomas** (`es` por defecto, `en`, `pt`, `fr`, `de`) con rutas localizadas, slugs por registro con redirecciones 308 y selector de idioma que conserva el contexto.
- Interfaz **mapa primero** con diseño accesible (WCAG 2.2 AA verificado con axe en los cinco idiomas, tema claro/oscuro, 320 px).
- Registro de los **nueve destinos** con identidad estable y evidencia de cobertura con caducidad.
- SEO: canonical por idioma, hreflang/sitemap **solo de variantes publicadas**; todo `noindex` fuera de producción.
- Base de datos PostgreSQL/PostGIS con migraciones, **RLS en todas las tablas** y auditoría inmutable, probadas contra un PostgreSQL real.

- **Mapa interactivo de Panamá** (MapLibre) con cartografía propia derivada de OpenStreetMap vía Overture (PMTiles de 36 MB), nueve destinos como marcadores accesibles y agrupables, estado compartible por URL, capas y leyenda, relieve **opcional** (opt-in) y estados de error honestos. **Sin límites oficiales ni geometrías de destino inventadas.**
- Pipeline reproducible de datos con **puerta de verificación** (`pnpm data:build`).
- **Ingesta controlada de áreas protegidas** (Overture → PostGIS) con cuarentena, manifiesto con hash, derechos ejecutables, versionado y superficie geodésica; **137 áreas** importadas en pruebas, todas **no oficiales** y **no públicas** (`pnpm data:ingest`, `pnpm db:import-areas`, ADR-0015).
- **API espacial** (`/api/spatial/areas`, `/areas/{id}`, `/locate`) bajo el rol `anon` con RLS, límites duros, derechos antes que datos y errores sin fugas (ADR-0016, `docs/gis.md` §12). Con la política `provisional` **no sirve nada en producción**.
- **Siete capas seleccionables** (cinco propias activas por defecto, dos de relieve de un tercero apagadas) con un **registro declarativo** del que salen el estilo y la leyenda (ADR-0017, `docs/gis.md` §13).
- **Selección de áreas protegidas** por clic o por una lista equivalente por teclado, con resalte, enlace compartible (`a`) y una **ficha honesta en dos niveles** (lo que lleva el mapa / lo que dice la BD, con superficie **con su método**, fuente y licencia; y siempre «no hay datos verificados de actividades ni accesos») (ADR-0018, `docs/gis.md` §14).

**Lo que NO existe todavía** (no hay que darlo por hecho): datos turísticos editoriales, imágenes, 3D, rutas, IA, offline, carreteras en el mapa. Detalle y motivos en [`docs/progress.md`](docs/progress.md) y [`docs/backlog.md`](docs/backlog.md).

## Requisitos

- Node ≥ 22.12 (`.nvmrc`), pnpm 10 (`corepack enable`).
- Para las pruebas de integración: PostgreSQL 16 y PostGIS 3.4 (binarios; las pruebas levantan su propio clúster temporal).
- Para las pruebas E2E: Chromium (`pnpm exec playwright install chromium`, o el preinstalado del entorno).
- Para generar los datos del mapa: Python ≥ 3.12 (`pipelines/requirements.txt`) y `tippecanoe` ≥ 2.17 (ver `docs/setup.md` §6). La aplicación arranca sin ellos y lo dice.

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local        # sin secretos reales; todo tiene valores por defecto seguros
pnpm dev                          # http://localhost:3000  (usa «localhost», no 127.0.0.1)
```

Producción local (lo que prueban los E2E):

```bash
SITE_ENV=development pnpm build
pnpm start                        # NO añadir -H 127.0.0.1 (ver docs/testing.md)
```

## Comandos

| Comando                                                          | Qué hace                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` (o `typecheck` · `lint` · `format` por separado)    | Tipos (TS 6, estricto), ESLint (incl. a11y y fronteras de dominio), Prettier y las unitarias; `typecheck` y `lint` generan antes los tipos de rutas de Next (`next typegen`)                                                      |
| `pnpm test`                                                      | Unitarias (Vitest): i18n, dominio, configuración, contraste WCAG, SEO                                                                                                                                                             |
| `pnpm test:integration`                                          | PostgreSQL+PostGIS reales: migraciones, RLS por rol, restricciones, GIS, auditoría                                                                                                                                                |
| `pnpm build && pnpm check:bundle`                                | Compilación + escaneo de secretos en el bundle + presupuesto de JS por página                                                                                                                                                     |
| `pnpm test:e2e`                                                  | Playwright contra el build de producción (escritorio y móvil, axe, CSP)                                                                                                                                                           |
| `CI=true pnpm test:e2e && pnpm check:e2e-skips --max-skipped 56` | Los E2E como en CI (informe JSON en `test-results/`) y el **presupuesto de pruebas omitidas** (56 sin el mapa base; con él, 0)                                                                                                    |
| `pnpm db:migrate`                                                | Aplica `db/migrations` a `DATABASE_URL` (rechaza bases remotas sin confirmación)                                                                                                                                                  |
| `pnpm data:anchors` · `pnpm data:build`                          | Anclas por ID de Overture y basemap PMTiles verificado (Python + tippecanoe)                                                                                                                                                      |
| `pnpm test:e2e:db`                                               | E2E con PostgreSQL **temporal** y datos reales (necesita build y datos; si falta algo, se omite y lo dice)                                                                                                                        |
| `pnpm test:pipelines`                                            | Pruebas del ETL de Python (`.venv` activado; sin red)                                                                                                                                                                             |
| `pnpm test:e2e:content` · `pnpm content:export`                  | Ficha con contenido verificado de punta a punta (PostgreSQL temporal → exportación → copia de la app → Next) · exporta el contenido público de `DATABASE_URL` a `data/content/published.json` (`docs/setup.md` §8)                |
| `python3 scripts/mutation/{db,ts,cli,ci}.py`                     | Pruebas de **mutación** reproducibles (SQL y exportador, ruta de producción en TypeScript, CLI, y las guardas de orquestación y CI): rompen a propósito una pieza y exigen que alguna prueba falle (`scripts/mutation/README.md`) |
| `pnpm perf:vitals`                                               | Línea base de Web Vitals (FCP/LCP/CLS/TBT≈) en móvil **emulado** sobre el build; informativa, con sus límites (`docs/performance.md` M-06)                                                                                        |
| `pnpm data:ingest` · `pnpm db:import-areas`                      | Ingesta controlada de áreas a PostGIS (`docs/setup.md` §7); no publica                                                                                                                                                            |

## Estructura

```
src/app/[locale]/…     rutas (SSR/estático), un layout raíz por idioma
src/domains/…          lógica pura por dominio (sin UI ni framework): editorial, tourism, geography, content
src/components/        componentes accesibles (CSS Modules + tokens)
src/i18n/              registro de idiomas, rutas, navegación, formatos (Intl)
src/config/            entorno validado (zod), marca, cabeceras de seguridad
messages/              textos de interfaz por idioma (ICU)
db/migrations/         SQL versionado con checksum (PostGIS, RLS, auditoría, modelo de contenido)
data/content/          instantánea del contenido verificado y público (la escribe `pnpm content:export`; hoy vacía)
scripts/               migraciones, importación de áreas, exportación de contenido, orquestadores de E2E
pipelines/             ETL en Python: anclas, basemap PMTiles y sondeos (spikes)
e2e/ e2e-db/ e2e-content/  Playwright (sin BD · con áreas reales · con contenido verificado)
tests/                 Vitest (unit e integration)
docs/                  arquitectura, ADR, cobertura, derechos, i18n, GIS, seguridad, costes, progreso
```

## Documentación

Empieza por [`docs/architecture.md`](docs/architecture.md) y [`docs/decisions/`](docs/decisions/README.md). Datos y licencias: [`docs/data-sources.md`](docs/data-sources.md), [`docs/provider-rights.md`](docs/provider-rights.md), [`docs/coverage.md`](docs/coverage.md). Cuentas y credenciales pendientes: [`docs/setup.md`](docs/setup.md).

## Principios que no se negocian

1. **No se inventan datos**: ni geometrías, ni cobertura, ni imágenes, ni verificaciones. Lo no comprobado es `UNKNOWN`, nunca «no existe».
2. **Procedencia visible**: cada dato dice su fuente, licencia y fecha. Lo derivado de OpenStreetMap se etiqueta como **no oficial**.
3. **Nada se publica sin derechos leídos en la fuente primaria** (política de derechos `deny-by-default`).
4. **Una máquina nunca figura como revisora** de una traducción; solo se indexa lo `published`.

## Licencia

Código: sin licencia aún (`UNLICENSED`, decisión pendiente). Los datos de terceros conservan sus licencias (ver `docs/data-sources.md`).
