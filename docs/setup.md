# Puesta en marcha: cuentas, credenciales y configuración pendiente

Este documento lista **exactamente** lo que falta para pasar integraciones de `BLOCKED` a `VERIFIED`. Mientras tanto la aplicación funciona con datos abiertos (ver `docs/progress.md`).

> Ninguna cuenta se ha creado, ningún servicio se ha contratado y nada se ha publicado. No se ha gastado dinero.

## 1. Entorno de desarrollo (hecho)

Requisitos: Node ≥ 22, pnpm 10, Python ≥ 3.12, PostgreSQL 16 + PostGIS 3.4 (+ pgvector si se usa), tippecanoe, GDAL. Instrucciones de arranque en `README.md`.

## 2. Red del entorno de trabajo (bloqueo actual)

La política de red del entorno cloud **deniega** casi todos los hosts (E-00). Para poder leer documentación primaria y verificar fuentes, el propietario del entorno debe añadir a **Allowed domains** (menú del entorno de la sesión → _Edit_ → _Network access_; guía: https://code.claude.com/docs/en/cloud-environments#network-access):

| Prioridad | Hosts                                                                                                 | Para qué                                                 |
| --------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Alta      | `developers.google.com`, `mapsplatform.google.com`                                                    | Políticas y cobertura de Map Tiles/3D/Street View/Routes |
| Alta      | `docs.overturemaps.org`, `overturemaps.org`                                                           | Licencia por tema de Overture (bloquea publicar capas)   |
| Alta      | `sigigntg.anati.gob.pa`, `www.ign.gob.pa`, `ignpanama.anati.gob.pa`, `www.anati.gob.pa`               | Geometrías oficiales (ANATI/IGN)                         |
| Alta      | `miambiente.gob.pa` (+ su geoportal), `www.atp.gob.pa`                                                | Áreas protegidas y turismo oficial                       |
| Media     | `whc.unesco.org`                                                                                      | Límites de Casco Antiguo y Coiba                         |
| Media     | `commons.wikimedia.org`, `www.wikidata.org`, `*.wikipedia.org`                                        | Medios con licencia por archivo y QIDs                   |
| Media     | `graph.mapillary.com`, `www.mapillary.com`, `help.mapillary.com`, `api.kartaview.org`                 | Street imagery                                           |
| Media     | `operations.osmfoundation.org`, `download.geofabrik.de`                                               | Política de teselas y extracto OSM (routing)             |
| Baja      | `nextjs.org`, `next-intl.dev`, `maplibre.org`, `cesium.com`, `docs.protomaps.com`, `cdn.jsdelivr.net` | Documentación y comodidad                                |

## 3. Credenciales y cuentas (todas **pendientes**; ninguna creada)

| Servicio                 | Para qué                                                  | Qué hace falta                                                                                                      | Variable (ver `.env.example`)                                                                                              | Se necesita en        |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Google Maps Platform** | Verificar cobertura 3D/Street View; opcionalmente usarlas | Proyecto con facturación, **Map Tiles API** habilitada, clave **restringida por origen y API**, cuota y presupuesto | `GOOGLE_MAPS_API_KEY` (servidor) / `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (solo si es imprescindible pública)                       | Fase 2 (cobertura), 5 |
| **Cesium ion**           | Solo si se activa Cesium                                  | Token de acceso                                                                                                     | `CESIUM_ION_TOKEN`                                                                                                         | Opcional              |
| **Mapillary**            | Street imagery                                            | Token de cliente                                                                                                    | `MAPILLARY_ACCESS_TOKEN`                                                                                                   | Fase 5                |
| **Supabase**             | BD gestionada, Auth, RLS en producción                    | Proyecto (región), URL, clave anónima                                                                               | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; **`SUPABASE_SERVICE_ROLE_KEY` solo servidor, nunca expuesta** | Fase 6+ / despliegue  |
| **Cloudflare R2** (o S3) | PMTiles y medios con CDN                                  | Bucket + CORS (`GET`, `HEAD`, cabecera `Range`) + dominio                                                           | `TILES_BASE_URL`, credenciales de subida (solo CI)                                                                         | Despliegue            |
| **Vercel** (u otro)      | Alojamiento                                               | Proyecto y dominio                                                                                                  | —                                                                                                                          | Despliegue            |
| **Sentry**               | Errores                                                   | DSN                                                                                                                 | `SENTRY_DSN`                                                                                                               | Fase 10               |
| **Proveedor de IA**      | Concierge/traducción asistida                             | Clave API (servidor)                                                                                                | `AI_API_KEY`                                                                                                               | Fase 9                |
| **Dominio y marca**      | Nombre definitivo                                         | Decisión de negocio                                                                                                 | `NEXT_PUBLIC_SITE_URL`, `src/config/site.ts`                                                                               | Lanzamiento           |

## 4. Decisiones que solo puede tomar una persona

1. **Licencias** de IGN/ANATI y MiAmbiente: solicitud por escrito (o confirmación de datos abiertos).
2. **Revisión legal**: ODbL/share-alike de capas derivadas, privacidad (cookie de idioma persistente, geolocalización), marco de datos personales.
3. **Revisores humanos** por idioma (`es`, `en`, `pt`, `fr`, `de`) y variante del portugués (BR/PT).
4. **Nombre/dominio definitivo** (hoy «Panamá Immersive» provisional, centralizado en `src/config/site.ts`).
5. **Autorización de gasto** antes de activar cualquier servicio de pago (propuesta concreta con coste y efecto primero).

## 5. Variables de entorno

Plantilla sin secretos: `.env.example`. La configuración se valida al arrancar (`src/config/env.ts`); un valor inválido **detiene** la aplicación con un mensaje claro.

## 6. Datos del mapa (Fase 2)

La aplicación **arranca sin** los datos del mapa y lo dice (estado «faltan los datos del mapa base»). Para generarlos:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r pipelines/requirements.txt          # pyarrow, shapely, pmtiles, mapbox-vector-tile…
# tippecanoe ≥ 2.17 (salida PMTiles) en el PATH
pnpm data:anchors    # anclas por ID de Overture → data/anchors/destination-anchors.json (se versiona)
pnpm data:build      # extrae, tesela y VERIFICA; publica public/data/panama-basemap.{pmtiles,manifest.json}
```

- Red necesaria: `overturemaps-us-west-2.s3.amazonaws.com` (lista blanca en `pipelines/lib/overture.py`). `data:build` tarda ≈ 5 min.
- `--reuse-extract` repite solo el teselado y la verificación; `--verify-only` solo verifica el artefacto existente.
- Los artefactos (`data/build/`, `public/data/*`) **no se versionan**. Los glifos (`public/map-assets/glyphs/`) y las anclas **sí**.
- **Hosting de producción** [pendiente]: cualquier almacén estático con **HTTP Range** y CORS si es de otro origen; configurar `NEXT_PUBLIC_TILES_BASE_URL` (su origen entra solo en `connect-src`). Hoy el mapa de producción está **desactivado** por L-01.
- Relieve: `NEXT_PUBLIC_TERRAIN_TILES_URL` (por defecto AWS Terrarium); se valida la plantilla `{z}/{x}/{y}` y, en producción, https.

## 7. Ingesta de áreas a la base de datos (Fase 3)

Necesita el entorno de §6 (`.venv` activado; `pip install -r pipelines/requirements.txt -r pipelines/requirements-dev.txt` para tener también `pytest`), una base PostgreSQL+PostGIS migrada (`DATABASE_URL`, `pnpm db:migrate`) y red hacia el S3 de Overture.

```bash
. .venv/bin/activate
pnpm test:pipelines                 # 90 pruebas del ETL (sin red)
pnpm data:ingest                    # extrae, valida y escribe data/build/ingest/<dataset>/<release>/ (fuera de git)
pnpm db:import-areas --manifest data/build/ingest/overture-protected-areas/2026-09-23.1/manifest.json
pnpm db:import-areas --manifest data/build/ingest/overture-destination-references/2026-09-23.1/manifest.json
```

- Importar no publica: las áreas quedan con `is_public = false`. `--publish` es una decisión editorial y solo funciona si la política de derechos lo permite (hoy `provisional`: no, L-01).
- Una base que no sea local exige `IMPORT_CONFIRM_REMOTE=<host>`. **No se ha importado a ninguna base remota.**
- Repetir la importación del mismo contenido no escribe nada (`noop`, queda en `import_runs`).

### 7.1 API espacial y base de datos (Fase 3.b, ADR-0016)

La API (`/api/spatial/areas`, `/areas/{id}`, `/locate`) lee de la base indicada en `DATABASE_URL` **con el rol `anon`, en una transacción de solo lectura**. Sin `DATABASE_URL` responde `503 database_unavailable` (nunca inventa datos).

```bash
# Local: una base PostgreSQL+PostGIS migrada
pnpm db:migrate && pnpm db:import-areas --manifest …      # ver §7
DATABASE_URL=postgresql://… pnpm dev
curl 'http://localhost:3000/api/spatial/areas?bbox=-81,7.5,-77,9.5&zoom=6&layers=protected_areas'
```

- Las áreas importadas **no son públicas** (`is_public = false`): la API no las devuelve hasta que alguien las publique (decisión editorial) **y** la política de derechos lo permita. En producción con la política `provisional` responde `403 rights_blocked`.
- **Pendiente con el despliegue** (no hecho; no hay base remota): (1) crear un rol de login **dedicado** miembro solo de `anon` y usar su cadena en `DATABASE_URL` en lugar del propietario; (2) usar un _pooler_ de conexiones si el entorno es sin servidor (el pool es de 5 por proceso); (3) limitación de tasa en la infraestructura. Las migraciones **no** crean roles ni contraseñas.

### 7.2 E2E con base de datos (`pnpm test:e2e:db`)

Prueba la **ficha de un área con datos reales** de punta a punta. Necesita: el build (`SITE_ENV=development pnpm build`), el mapa base (`pnpm data:build`, §6), los artefactos de ingesta (`pnpm data:ingest`, §7) y los binarios de PostgreSQL 16 + PostGIS (los mismos que la integración). El script `scripts/e2e-db.ts` levanta un clúster **temporal** (socket Unix, directorio propio), migra, importa y **publica** las áreas, despublica una a propósito, arranca `next start` apuntando a esa BD (puerto `E2E_DB_PORT`, 3200 por defecto), ejecuta Playwright con `playwright.db.config.ts` y lo destruye todo al terminar (también con Ctrl-C). Si falta algo, **se omite y lo dice** (no cuenta como «pasó»). **No toca ninguna base remota.**

## 8. Contenido verificado de las fichas (Fase 4, ADR-0019)

La aplicación **no lee la base de datos para mostrar el contenido**: lee `data/content/published.json`, una instantánea que escribe `pnpm content:export`. **Hoy está vacía** (`"assertions": []`): cada ficha dice que no hay datos verificados.

```bash
pnpm db:migrate                                         # crea las tablas del modelo de contenido (migración 0007)
# … el contenido se redacta y verifica por el flujo editorial (hoy por SQL; interfaz pendiente: F4-2) …
DATABASE_URL=postgresql://… pnpm content:export --dry-run   # resumen, sin escribir
DATABASE_URL=postgresql://… pnpm content:export             # escribe data/content/published.json
DATABASE_URL=postgresql://… pnpm content:export --check     # sale con 1 si el archivo difiere de la BD
```

- **Solo lee**, con el rol `anon` y en una transacción de solo lectura: sale únicamente lo verificado, vigente, no reemplazado y de destinos publicados, sin identidades de personas.
- **Revalida** todo con las puertas del dominio. Si algo no cuadra **lanza y no escribe nada** (no repara ni recorta). Lo mismo hace el build con un `published.json` inválido.
- Una base que **no** sea local exige `CONTENT_CONFIRM_REMOTE=<host>`. **No se ha exportado desde ninguna base remota.**
- Revisa el `git diff` de `data/content/published.json` antes de desplegar: es el contenido que verá el público.
- **Una disputa o retirada hecha en la BD no llega a la web hasta exportar y desplegar** (F4-4).
- `pnpm test:e2e:content` prueba todo el recorrido con contenido **sintético** en una base temporal y una copia temporal de la app (`.e2e-content-app/`, ignorada por git y borrada al terminar): no toca `data/content/published.json` ni el build del proyecto.

### 8.1 Exclusiones al exportar y cambio de umbrales (ADR-0020)

- Si algo verificado **ya no cumple** las puertas del registro **vigente** (típicamente, tras endurecer un umbral), `pnpm content:export` **no lo publica**: lo lista en `stderr` con sus códigos (`EXCLUIDA destino/campo@versión …`), lo cuenta en el resumen JSON (`excluded`) y termina con **código 4**. El archivo se escribe igualmente, de forma **atómica**, sin esa afirmación. `--allow-exclusions` acepta las exclusiones (código 0). Lo malformado (forma inválida, duplicados, traducciones no publicables, destino desconocido) sigue haciendo fallar **toda** la exportación sin escribir nada.
- **Para cambiar un umbral** (F4-1): una migración **nueva** que actualice `content_fields` **y** el registro de `src/domains/content/fields.ts`; después `pnpm content:export --dry-run` lista qué dejaría de cumplir; cada afirmación afectada se **retira** o se **verifica de nuevo como versión nueva**. Aún no se guarda con cada verificación la versión del registro (DEFERRED).
