@AGENTS.md

# Panamá Immersive — instrucciones para Claude Code

Documento rector: `docs/PROMPT-MAESTRO.md` (no modificar). Estado y continuidad: `docs/progress.md` y `docs/backlog.md`. Comunícate en **español**; identificadores de código en inglés.

## Comandos verificados

```bash
pnpm typecheck && pnpm lint && pnpm format && pnpm test   # rápido, sin red ni BD
pnpm test:integration                                      # PostgreSQL+PostGIS temporal (necesita binarios)
SITE_ENV=development pnpm build && pnpm check:bundle       # build + secretos en bundle + presupuesto JS (+ mapa diferido)
pnpm test:e2e                                              # Playwright sobre el build de producción (incluye el mapa con WebGL real)
pnpm data:anchors && pnpm data:build                       # datos del mapa (Python + tippecanoe; ver docs/setup.md §6)
. .venv/bin/activate && pnpm test:pipelines                # ETL de Python (90 pruebas, sin red; `.venv` activado porque los scripts usan `python3 -I`)
pnpm data:ingest && pnpm db:import-areas --manifest …      # ingesta controlada de áreas (docs/setup.md §7, ADR-0015)
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
- Hosts bloqueados por la política de red del entorno: ver `docs/research/evidence-log.md` E-00 y `docs/setup.md` §2. No se rodea.
- Next 16: `middleware` → `proxy.ts`; `next/root-params` no funciona en Route Handlers. La documentación versionada está en `node_modules/next/dist/docs/`.

- **Mapa**: el estado vive en la **URL** (`d`, `c`, `l`). Escribe con `history.pushState/replaceState(**null**, …)`: con `window.history.state` Next se salta su integración y `useSearchParams` no se entera (E-47).
- **PMTiles**: **no** uses `tippecanoe:minzoom` por entidad ni `--drop-*-as-needed` (pierden 25–75 % de las entidades en silencio, E-44). El zoom se fija por capa. `pnpm data:build` tiene una **puerta de verificación**; no la saltes.
- **MapLibre 6** necesita `setWorkerUrl` (E-46) y su CSS pisa `position` de una sola clase: usa selectores de dos clases (ver `MapStage.module.css`). Los marcadores son **botones HTML** y se agrupan por distancia en pantalla.
- **El relieve (AWS) es opt-in**: nunca lo actives por defecto ni lo cargues sin que la persona lo pida. Con política de derechos `provisional` el mapa y el relieve se **bloquean en producción** (`resolveMapExperience`).
- **No traduzcas topónimos**: el estilo usa `name_<idioma>` solo si la fuente lo trae (E-43).
- **Ingesta (ADR-0015)**: lo que incumple una regla va a **cuarentena**, nunca se repara con `ST_MakeValid` ni se recorta. Las políticas de derechos salen de `data/rights/policies.json` (una sola fuente para TS y Python); el manifiesto **no** puede mejorarlas. Importar **no publica**. `fsspec` sigue redirecciones: usa `open_remote` (E-50). Al relacionar áreas con destinos, por **ID** y rol `context`, nunca por nombre.
- **`.venv/` en la raíz**: ESLint, Prettier y `tsc` lo excluyen explícitamente; no lo muevas ni lo versiones.
- **Bucle de recarga en `next dev`** («HMR hash mismatch» en la consola): caché de Turbopack obsoleta. Borra `.next/dev`. Los E2E usan el build de producción y no se ven afectados.
- **`style=""` está prohibido por la CSP** (`style-src 'self'`): usa clases CSS sobre tokens, también en SVG.
- **No imprimas el progreso de tippecanoe** (miles de líneas): redirige `2>/dev/null`.

## Dónde mirar

`docs/architecture.md` (visión y revisión crítica) · `docs/decisions/` (ADR) · `docs/i18n.md` (rutas, traducciones, SEO) · `docs/data-model.md` (BD y RLS) · `docs/gis.md` (§9 basemap) · `docs/provider-rights.md` · `docs/testing.md` · ADR-0014.
