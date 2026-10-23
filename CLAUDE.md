@AGENTS.md

# Panamá Immersive — instrucciones para Claude Code

Documento rector: `docs/PROMPT-MAESTRO.md` (no modificar). Estado y continuidad: `docs/progress.md` y `docs/backlog.md`. Comunícate en **español**; identificadores de código en inglés.

## Comandos verificados

```bash
pnpm check                                                 # = typecheck + lint + format + test (typecheck/lint generan antes los tipos de rutas: `next typegen`)
pnpm test:integration                                      # PostgreSQL+PostGIS temporal (necesita binarios)
SITE_ENV=development pnpm build && pnpm check:bundle       # build + secretos en bundle + presupuesto JS (+ mapa diferido)
pnpm test:e2e                                              # Playwright sobre el build de producción (incluye el mapa con WebGL real)
CI=true pnpm test:e2e && pnpm check:e2e-skips --max-skipped 56   # como en CI: informe JSON en test-results/ + presupuesto de omitidas (56 sin el mapa base; con él, 0)
pnpm data:anchors && pnpm data:build                       # datos del mapa (Python + tippecanoe; ver docs/setup.md §6)
. .venv/bin/activate && pnpm test:pipelines                # ETL de Python (90 pruebas, sin red; `.venv` activado porque los scripts usan `python3 -I`)
pnpm data:ingest && pnpm db:import-areas --manifest …      # ingesta controlada de áreas (docs/setup.md §7, ADR-0015)
pnpm test:e2e:content                                      # ficha con contenido verificado: PG temporal → exportación → copia de la app → Next (docs/testing.md)
pnpm content:export [--check|--dry-run]                    # contenido público de DATABASE_URL → data/content/published.json (docs/setup.md §8, ADR-0019)
pnpm perf:vitals [--runs N] [--json ruta]                  # Web Vitals en móvil EMULADO sobre el build (docs/performance.md M-06; informativo, no es una puerta)
python3 scripts/mutation/{db,ts,cli,ci}.py [ID …]            # pruebas de MUTACIÓN reproducibles (scripts/mutation/README.md); ninguna debe sobrevivir sin justificarse; salida 0/1/2/3
```

Actualiza `docs/progress.md` en cada entrega: qué funciona, cómo ejecutarlo, qué pruebas se corrieron, qué queda.

## Reglas esenciales

- **No inventes** datos turísticos, geometrías, cobertura, imágenes ni verificaciones. Lo no comprobado es `UNKNOWN` con su motivo. Una geometría sin fuente oficial se etiqueta `osm_derived` o `editorial`, **nunca** oficial.
- **Nunca relaciones por nombre**: hay homonimias (distrito _Barú_ ≠ _Volcán Barú_; cuatro «Santa Catalina»). Todo por clave estable y `destination_areas` con rol.
- **Texto visible solo desde `messages/*.json`** (hay una prueba que falla ante literales en JSX). Al añadir una clave, añádela en los **cinco** idiomas; la paridad, el ICU y los marcadores se comprueban.
- **Una traducción automática nunca es `reviewed`**. Solo `published` es indexable; fuera de producción todo es `noindex`.
- `src/domains/**` es lógica pura: no importa UI, `react`, `next*` ni adaptadores (lo impone ESLint).
- Sin secretos con prefijo `NEXT_PUBLIC_`; el cliente solo importa `src/config/public-env.ts`, nunca `env.ts`.
- Las migraciones **no se editan** una vez aplicadas (checksum): crea una nueva. Todo en `public` lleva RLS (una prueba lo exige); PostGIS vive en `extensions`.
- No contrates servicios, no publiques, no migres bases remotas sin autorización explícita.

## Trampas conocidas (con evidencia)

- **TypeScript fijado en 6.0.3** (ADR-0002): `typescript-eslint` no soporta TS ≥ 6.1; TS 7 compila pero rompe el lint tipado.
- **`next start -H 127.0.0.1` provoca un bucle 307** en rutas localizadas (Next normaliza el host a `localhost` y trata la reescritura del `proxy` como externa). Usa `localhost`.
- **CSP**: `script-src 'self' 'unsafe-inline'` es una decisión basada en evidencia (ADR-0010); `'self'` a secas impide la hidratación. No lo «endurezcas» sin comprobar la hidratación (hay una prueba E2E que lo fija).
- **No uses `pkill -f`** con patrones que aparezcan en tu propia línea de comandos (mata el shell).
- **Orquestadores de pruebas** (`scripts/e2e-content.ts`, `e2e-db.ts`, `scripts/lib/e2e-run.ts`): se lanzan con `node --import tsx`, **nunca con el CLI `tsx`**, que ante Ctrl+C mata al hijo con SIGKILL y deja servidor, Playwright y clúster huérfanos (E-66). En **CI «no puedo ejecutar la suite» es un fallo**, no una omisión (`omission()`); el puerto lo elige el sistema y se verifica que responde **el servidor propio**. `PI_PG_BIN_DIR` apunta a los binarios de PostgreSQL (si manda, no se busca otro). Comprueba siempre `ls -d /tmp/pi-pg-* /tmp/pi-e2e-server-*` tras interrumpir.
- **Un verde que no midió nada es peor que un rojo** (F4-17): `check:bundle` valida sus presupuestos, falla ante un recurso ausente o una página sin scripts y escanea `.mjs`; `check:e2e-skips` limita las pruebas omitidas; la herramienta de mutación no emite 0 si no evaluó nada. **Nunca envuelvas una aserción en `.catch(() => undefined)`** (no puede fallar: E-71) y **comprueba que una mutación se aplicó** antes de fiarte de un «pasó».
- **`ci.yml` es IMPLEMENTED, no VERIFIED** (no hay remoto) y **local usa Chromium 141 mientras el CI instalará el 156** (E-68). La sintaxis YAML la valida `pnpm format` (un `: ` sin comillas en un `name:` la rompe: E-70); las pruebas de `ci-workflow.test.ts` son textuales. `test:e2e:db` **no** está en el CI (necesita datos gitignorados; en CI faltar datos es fallo). Acciones por etiqueta, no por hash (F4-17b).
- Hosts bloqueados por la política de red del entorno: ver `docs/research/evidence-log.md` E-00 y `docs/setup.md` §2. No se rodea.
- Next 16: `middleware` → `proxy.ts`; `next/root-params` no funciona en Route Handlers. La documentación versionada está en `node_modules/next/dist/docs/`.

- **Mapa**: el estado vive en la **URL** (`d`, `c`, `l`). Escribe con `history.pushState/replaceState(**null**, …)`: con `window.history.state` Next se salta su integración y `useSearchParams` no se entera (E-47).
- **PMTiles**: **no** uses `tippecanoe:minzoom` por entidad ni `--drop-*-as-needed` (pierden 25–75 % de las entidades en silencio, E-44). El zoom se fija por capa. `pnpm data:build` tiene una **puerta de verificación**; no la saltes.
- **MapLibre 6** necesita `setWorkerUrl` (E-46) y su CSS pisa `position` de una sola clase: usa selectores de dos clases (ver `MapStage.module.css`). Los marcadores son **botones HTML** y se agrupan por distancia en pantalla.
- **El relieve (AWS) es opt-in**: nunca lo actives por defecto ni lo cargues sin que la persona lo pida. Con política de derechos `provisional` el mapa y el relieve se **bloquean en producción** (`resolveMapExperience`).
- **No traduzcas topónimos**: el estilo usa `name_<idioma>` solo si la fuente lo trae (E-43).
- **Ingesta (ADR-0015)**: lo que incumple una regla va a **cuarentena**, nunca se repara con `ST_MakeValid` ni se recorta. Las políticas de derechos salen de `data/rights/policies.json` (una sola fuente para TS y Python); el manifiesto **no** puede mejorarlas. Importar **no publica**. `fsspec` sigue redirecciones: usa `open_remote` (E-50). Al relacionar áreas con destinos, por **ID** y rol `context`, nunca por nombre.
- **API espacial (ADR-0016)**: código de BD solo en `src/server/spatial/` (ESLint impide `pg` y `@/server/*` en dominio y componentes). Siempre rol `anon` en transacción de solo lectura: **la RLS decide qué se ve**; consultas estáticas y parametrizadas (nunca concatenes valores). Derechos antes que datos (`SPATIAL_SERVE_ACTIONS`); errores sin mensajes de la BD. El truncado es **explícito**. Si la superficie no tiene método, no se publica.
- **Capas (ADR-0017)**: se declaran en `src/domains/geography/layers.ts`; de ahí salen el estilo **y** la leyenda (símbolo compartido: no escribas la leyenda a mano). Una capa nueva = una entrada del registro + `Map.layers.<id>.{label,hint}` y las claves de `Map.legend` en los **cinco** idiomas + las clases `fill<Clave>`/`stroke<Clave>` en `MapLegend.module.css` (una prueba las exige). `l` en la URL es la lista **completa** de capas seleccionables activas. Las de un tercero nunca van por defecto. El océano va encima del relieve.
- **Selección de áreas (ADR-0018)**: `a` en la URL es el **ID de Overture** (nunca un nombre). Lo de la tesela y de la red es entrada hostil: nombres limpios y pintados como texto, respuesta de la API **validada** antes de usarla, enlaces solo `https`. **No importes zod en código que viaje al navegador** (viola la CSP: E-51; usa un validador a mano). «Sin nombre» solo si **se sabe**; si no, título neutro. La cámara nunca se mueve sola. `pnpm test:e2e:db` prueba la ficha con PostgreSQL temporal.
- **Contenido de la ficha (ADR-0019)**: **no hay un booleano «verificado»**: el estado se **deriva** (`src/domains/content/state.ts`: VERIFIED/EXPIRED/DISPUTED/UNKNOWN). Las **puertas de verificación viven en la BD y en el dominio y deben coincidir** (`app.assertion_gate_issues` ↔ `gates.ts`; `content-parity.test.ts` lo vigila: si cambias una, cambia la otra). Lo verificado es **inmutable**: corregir = versión nueva. Un campo nuevo = entrada en `fields.ts` + **migración nueva** (no edites la 0007) + `Content.fields.*` en los **cinco** idiomas. La web lee `data/content/published.json` (**nunca la BD**); no lo edites a mano: `pnpm content:export` (revalida y no escribe si algo falla). **No se muestra una traducción automática, ni etiquetada**: original con indicador o traducción humana publicada. Metadatos y sitemap de la ficha salen de `destinationSeo` (no los separes). Los **umbrales de cada campo son una propuesta mía sin validar** (F4-1). **La BD debe ser al menos tan estricta como el dominio y el exportador** (lo que la BD acepta, ellos también: ADR-0020); solo quien creó un borrador lo edita; una migración nueva por cada cambio (la 0008 corrige huecos de la 0007). `pnpm content:export` **excluye con ruido** (código 4) lo que ya no cumple el registro vigente y falla ante lo malformado. **Los CLI rechazan lo que no entienden** (código 2) y la guardia de base remota decide sobre el host que **`pg` resuelve** (`?host=`, socket, `[::1]`; por nombre: un túnel a `localhost` pasa). `source_records` es de **solo inserción también para el propietario** (migración 0009). **ISR es _stale-while-revalidate_**: la caducidad se aplica al regenerar (la primera visita tras el plazo recibe la versión anterior); `pnpm check:bundle` comprueba `revalidate` de la ficha **y** del sitemap. `published.json` coherente pero falsificado **no se detecta** (F4-14): revisa el `git diff`. Las puertas de identidad no se revalidan fuera de la BD. Los textos de las pruebas son **sintéticos** («sintético E2E», `example.org`): nunca los presentes como contenido del producto.
- **Trampas de SQL/PostgreSQL (con evidencia)**: en PL/pgSQL `text[] || 'x'` interpreta el literal como array → usa `array_append` (E-53); **califica** las columnas en las subconsultas de políticas RLS (`source_records.id`, no `id`: E-54); los disparadores `BEFORE` van **antes** que el `WITH CHECK` de la RLS, y un `UPDATE`/`DELETE` que la política no ve afecta 0 filas sin error (E-55); `pg` devuelve `enum[]` como **texto** y las fechas como `Date` (formatea en SQL con `to_char`: E-56); `Date.parse('2026-02-31')` **no** da NaN (E-52).
- **Mutación** (`scripts/mutation/`, E-64; códigos de salida 0 todas muertas · 1 sobrevive alguna · 2 no se pudo evaluar · 3 alguna INVÁLIDA): al mutar para comprobar pruebas, exige primero una base **verde** (una roja «mata» cualquier mutación sin probar nada) y comprueba que la mutación **se aplicó** (Prettier cambia comillas y saltos). Una mutación que rompe los tipos o la migración no es una muerte válida (corre menos pruebas: `INVÁLIDA`). **Se muta la definición vigente** (la 0008 reemplaza funciones de la 0007).
- **`.e2e-content-app/`** (copia temporal de la app de `pnpm test:e2e:content`) está en `.gitignore`, `tsconfig`, ESLint y Prettier y se borra sola; si quedó por un fallo, bórrala.
- **Infraestructura de pruebas**: toda base temporal debe destruirse (teardown **y** al salir); comprueba con `ls -d /tmp/pi-pg-*` que no quedan huérfanos. Un `var(--token)` inexistente no da error: hay una guarda (`css-tokens.test.ts`).
- **`.venv/` en la raíz**: ESLint, Prettier y `tsc` lo excluyen explícitamente; no lo muevas ni lo versiones.
- **Bucle de recarga en `next dev`** («HMR hash mismatch» en la consola): caché de Turbopack obsoleta. Borra `.next/dev`. Los E2E usan el build de producción y no se ven afectados.
- **`style=""` está prohibido por la CSP** (`style-src 'self'`): usa clases CSS sobre tokens, también en SVG.
- **No imprimas el progreso de tippecanoe** (miles de líneas): redirige `2>/dev/null`.

## Dónde mirar

`docs/architecture.md` (visión y revisión crítica) · `docs/decisions/` (ADR) · `docs/i18n.md` (rutas, traducciones, SEO) · `docs/data-model.md` (BD y RLS) · `docs/gis.md` (§9 basemap) · `docs/provider-rights.md` · `docs/testing.md` · ADR-0014.
