# Registro de evidencias (Fase 0)

Fecha de consulta de todas las entradas: **2026-10-20**, salvo indicación. Cada afirmación de otros documentos que dependa de un hecho externo apunta a un ID de este registro.

**Niveles de fiabilidad**

- **P — primaria**: observada directamente en el recurso oficial (paquete npm, repositorio oficial de documentación, datos de Overture/AWS, ejecución local).
- **S — secundaria**: resumen de un buscador o blog de terceros. Orienta, **no basta** para integrar ni para fijar precios o términos legales.
- **N — no accesible**: la fuente primaria no pudo leerse desde este entorno (política de red). La decisión queda marcada como no verificada.

## Limitación del entorno (E-00)

La política de red del entorno de trabajo devuelve `403` (CONNECT) o no resuelve DNS para casi todos los hosts. No se ha rodeado esa política.

| Alcanzable (verificado) | No alcanzable (verificado) |
| --- | --- |
| `registry.npmjs.org`, `pypi.org`, `archive.ubuntu.com` | `nextjs.org`, `next-intl.dev`, `cesium.com`, `ion.cesium.com`, `maplibre.org` |
| `*.s3.amazonaws.com` (Overture, Natural Earth, terreno AWS, Copernicus DEM, Sentinel-2 COGs) | `developers.google.com`, `docs.overturemaps.org`, `docs.protomaps.com` |
| `raw.githubusercontent.com` (repos públicos), `api.github.com` (sin acceso a repos de terceros) | `operations.osmfoundation.org`, `tile.openstreetmap.org`, `www.openstreetmap.org` |
| `tile.googleapis.com` (responde 404 en la raíz; sin clave no hay verificación posible) | `commons.wikimedia.org`, `*.wikipedia.org`, `www.wikidata.org` |
| | `graph.mapillary.com`, `api.kartaview.org`, `overpass-api.de`, `nominatim.openstreetmap.org` |
| | `www.ign.gob.pa`, `www.anati.gob.pa`, `miambiente.gob.pa`, `www.atp.gob.pa`, `whc.unesco.org` |
| | `www.geoboundaries.org`, `data.humdata.org`, `download.geofabrik.de`, `build.protomaps.com` |
| | `cdn.jsdelivr.net`, `unpkg.com`, `cdnjs.cloudflare.com`, `demotiles.maplibre.org` |

**Impacto**: toda la verificación contra las fuentes oficiales panameñas, Wikimedia, Mapillary, KartaView y los términos de Google/OSM queda **sin comprobar en fuente primaria**. Para desbloquear: añadir esos hosts a *Allowed domains* del entorno (ver `docs/setup.md`).

## Entorno y herramientas

| ID | Hecho | Fiab. | Cómo se obtuvo |
| --- | --- | --- | --- |
| E-01 | Node `v22.22.0`, npm `10.9.4`, pnpm `10.28.0`, Python `3.13.16`, Git `2.43.0`, PostgreSQL cliente/servidor `16.15`. Docker CLI presente **sin demonio**. Chromium preinstalado (Playwright). `/home/user` estaba vacío: sin proyectos previos, sin CLAUDE.md/AGENTS.md, sin Git. | P | Shell |
| E-02 | Instalados vía `apt` y verificados: PostGIS `3.4.2`, pgvector `0.6.0`, tippecanoe `2.49.0`, GDAL `3.8.4`, PROJ `9.4.0`. | P | `apt-get install` + `--version` |
| E-03 | Versiones estables en npm: next `16.4.2`, react/react-dom `19.3.1`, next-intl `4.14.9`, typescript `7.0.2` (latest), `6.0.3` (última 6.0.x), cesium `1.146.0`, maplibre-gl `6.15.0`, pmtiles `4.5.0`, zustand `5.0.15`, @tanstack/react-query `5.104.5`, zod `4.6.7`, vitest `5.0.5`, vite `8.3.4`, @playwright/test `1.64.1`, @axe-core/playwright `4.14.0`, eslint `10.13.0` (`9.39.5` última 9.x), typescript-eslint `8.72.0`, jsdom `30.1.3`, @testing-library/react `16.3.3`, prettier `3.9.10`. | P | `npm view` |
| E-04 | **Spike**: `next build` (16.4.2) con `typescript@7.0.2` **compila y genera páginas**. `require('typescript')` solo expone 2 claves (`createProgram` es `undefined`): la API JS clásica ya no existe en el paquete principal. | P | `scratchpad/spike-next` (ver `pipelines/spikes/README.md`) |
| E-05 | `typescript-eslint@8.72.0` y `@typescript-eslint/parser`: peer `typescript >=4.8.4 <6.1.0`. Con TS 7 el lint tipado no es soportado. `eslint-plugin-jsx-a11y@6.10.2` declara peer `eslint` hasta `^9`; `eslint-plugin-react-hooks@7.1.1` admite `^10`; `eslint-config-next@16.4.2` admite `>=9`. | P | `npm view … peerDependencies` |
| E-06 | **Cesium**: `cesium@1.146.0` (publicado 2026-10-01, Apache-2.0, Node ≥22) depende de `@cesium/engine ^26.4.0`. El motor contiene `MVTDataProvider` (**`@experimental`**, solo plantilla `{z}/{x}/{y}`), `createGooglePhotorealistic3DTileset`, `Google2DImageryProvider`, `GoogleStreetViewCubeMapPanoramaProvider`. **No** existe lector de PMTiles ni un `ImageryProvider` de MVT. | P | `npm pack @cesium/engine@26.4.0` + lectura del código |
| E-07 | Licencias npm: maplibre-gl BSD-3-Clause; pmtiles BSD-3-Clause; cesium Apache-2.0; deck.gl MIT; three MIT; resium MIT; mapbox-gl `3.33.0` con licencia propia (`LICENSE.txt`, no OSI); fuentes @fontsource-variable (Fraunces, Figtree, Inter, …) OFL-1.1. | P | `npm view … license` |
| E-40 | `eslint@9.39.5` figura en npm como **«This version is no longer supported»**. ESLint 10.13.0 funciona con `eslint-plugin-jsx-a11y@6.10.2` (peer declarado hasta ^9, aviso de pnpm) verificado con control positivo. | P | `npm view eslint@9.39.5 deprecated`; ejecución local |

## Documentación oficial leída (repositorios oficiales en GitHub, rama `main`/`canary`)

| ID | Hecho | Fiab. | URL |
| --- | --- | --- | --- |
| E-10 | next-intl: `src/proxy.ts` con `createMiddleware(routing)`; `proxy.ts` se llamaba `middleware.ts` hasta Next 16. `next/root-params` está **activo por defecto desde Next 16.3**; permite render estático sin `setRequestLocale`; **no funciona en Route Handlers ni Server Actions**. | P | https://raw.githubusercontent.com/amannn/next-intl/main/docs/src/pages/docs/routing/setup.mdx |
| E-11 | next-intl `pathnames` es **configuración estática** (pares ruta interna ↔ externa por idioma). Para URLs de CMS/BD hay que localizar solo la parte estática y resolver el slug aparte. `alternateLinks` (cabecera `Link` hreflang automática) debe desactivarse si hay páginas disponibles solo en algunos idiomas o rutas gestionadas por CMS. `localeCookie`: por defecto cookie de sesión (sin `max-age`, para cumplir RGPD "de fábrica"). `x-default` apunta a la raíz que redirige (307). | P | https://raw.githubusercontent.com/amannn/next-intl/main/docs/src/pages/docs/routing/configuration.mdx |
| E-12 | Next.js: la convención `middleware` está **deprecada y renombrada a `proxy`**. CSP con nonce **obliga a render dinámico**; sin nonce se requiere `'unsafe-inline'`; existe **SRI experimental** (`experimental.sri`) como alternativa hash-based que mantiene generación estática. | P | https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/02-guides/content-security-policy.mdx y `…/03-file-conventions/proxy.mdx` |

## Datos abiertos reales

| ID | Hecho | Fiab. | Detalle |
| --- | --- | --- | --- |
| E-20 | **Overture** release `2026-09-23.1` (también `2026-09-23.0`) en `s3://overturemaps-us-west-2/release/<v>/`. Temas: addresses, base, buildings, divisions, places, transportation. `divisions` tiene `division`, `division_area`, `division_boundary`. | P | Listado S3 |
| E-21 | Los parquet de Overture tienen estadísticas por grupo de filas sobre `bbox.*`; con `pyarrow`+HTTP Range se extrae Panamá sin bajar los ficheros (`division_area`: 8 ficheros, 4,53 GB totales, extracción de Panamá en 11 s). DuckDB `httpfs` **no** funciona aquí (descarga de extensión bloqueada). | P | `pipelines/spikes/ov_extract.py` |
| E-22 | **Divisiones de Panamá** en Overture: 1 `country` (+1 marítimo), 14 `region` terrestres (+12 marítimas), 84 `county`, 482 `locality`, 697 `neighborhood`, 47 `microhood`, 6 `macrohood`. | P | Extracción `division_area` |
| E-23 | **Búsqueda por nombre de los nueve destinos** (ver `docs/coverage.md`): polígono propio para Boquete (county), Bocas del Toro (region/county/locality), Distrito de Panamá (county), Santa Catalina (locality, Veraguas). **Sin polígono de división** para Casco Antiguo, Canal, El Valle de Antón, Volcán Barú, Coiba. Polígonos OSM de áreas protegidas (`base/land_use`): Parque Nacional Volcán Barú, Parque Nacional Coiba, P. N. Marino Golfo de Chiriquí. Isla de Coiba (`base/land`, Wikidata Q741636). Para Casco Antiguo solo existe `landuse=retail` «Casco Viejo» (**no** es el distrito histórico). | P | `pipelines/spikes/ov_names.py` |
| E-23b | **Canal de Panamá**: en Overture solo hay `LineString` `waterway=canal` («Canal de Panamá», ~25 segmentos), `Lago Gatún` (MultiPolygon, `reservoir`), polígonos de «Esclusas de Gatún/Miraflores», `Lago Miraflores`, la presa de Gatún (Wikidata Q11702782). **No hay polígono de «zona del Canal»** ni límite oficial. | P | `ov_names.py` (base/water, base/infrastructure) |
| E-23c | **Homonimia «Santa Catalina»**: 3 localidades (`division` puntos en lat/lon 8.1398/−81.2641, 7.6342/−81.2546, 8.783/−81.3101), 1 distrito («Santa Catalina o Calovébora», Comarca Ngäbe-Buglé) y 1 microzona en Chiriquí. Con polígono (`division_area`): la localidad de Veraguas (bbox ≈ 1,2 km), el distrito y la microzona. | P | `division_area` + `division` |
| E-24 | Volumen de Overture en el bbox de Panamá (filas candidatas): water 42 k, land 113 k, land_use 128 k, land_cover 74 k, infrastructure 261 k, bathymetry 27 k, transportation/segment 478 k, places 89 k. `places` incluye campos de contacto (teléfonos, emails, redes). | P | `pipelines/spikes/ov_schema.py` |
| E-25 | **Terreno AWS (Terrarium)** `elevation-tiles-prod`: `Access-Control-Allow-Origin: *`, método GET. Metadatos `x-amz-meta-x-imagery-sources` por tile (SRTM, GMTED, ETOPO1). `Last-Modified` 2017. Elevación observada a z12 (ventana 5×5 px, puntos de sondeo **aproximados**): Barú ≈ 3 438 m (solo orden de magnitud), Boquete ≈ 1 225 m, El Valle ≈ 589 m, Panamá ≈ 33 m, Casco Antiguo ≈ 23 m, Miraflores ≈ 23 m, Bocas ≈ 7 m, Santa Catalina ≈ 50 m, Coiba ≈ 138 m. Fuentes por tile: SRTM en tierra, ETOPO1/GMTED en el entorno marino. **A z12 en mar abierto devuelve 0,0 m (sin batimetría); a z8/z10 devuelve ≈ −90 m.** | P | `pipelines/spikes/terrain_probe.py` |
| E-26 | **Natural Earth** (S3 `naturalearth`): existen `10m_physical/ne_10m_{land,ocean,coastline,lakes,rivers_lake_centerlines,bathymetry_L_0,reefs,geography_marine_polys}` y `10m_cultural/ne_10m_{admin_0_countries,admin_1_states_provinces,populated_places_simple,parks_and_protected_lands,airports,ports}`. Licencia de dominio público: **no verificada hoy en la fuente** (conocimiento general). | P/N | Listado S3 |

## Información de terceros (secundaria o no accesible)

| ID | Tema | Hecho | Fiab. | Fuente |
| --- | --- | --- | --- | --- |
| E-30 | Google Photorealistic 3D Tiles | La página de producto dice «más de 49 países». **Ninguna búsqueda devolvió una lista que incluya Panamá.** La página oficial de cobertura no pudo leerse. | S/N | https://mapsplatform.google.com/maps-products/map-tiles |
| E-31 | Política de Map Tiles API | Resumen: se restringe el pre-fetch, almacenamiento o caché más allá de lo permitido; el uso offline queda excluido; hay que mostrar logo de Google sin alterar y la atribución por tile (`asset.copyright` del glTF), agregada y ordenada. Respetar `Cache-Control`. | S | https://developers.google.com/maps/documentation/tile/policies |
| E-32 | Precio Google 3D | Fuentes en conflicto: 6 USD/1 000 solicitudes de tile raíz según foro Cesium y blog; no se confirmó el tramo gratuito. Es SKU Enterprise. | S | https://developers.google.com/maps/documentation/tile/usage-and-billing |
| E-33 | Licencias de Overture por tema | Resumen: Places = CDLA Permissive 2.0; Buildings, Base y Transportation derivan de OSM (ODbL); Divisions: una fuente la cita como derivada de OSM (ODbL). Atribución propuesta: «© OpenStreetMap contributors, Overture Maps Foundation». **Tratar todo salvo Places como ODbL hasta leer la fuente primaria.** | S | https://docs.overturemaps.org/attribution |
| E-34 | Fuentes oficiales panameñas | El IGN «Tommy Guardia» es una entidad de la ANATI; su ArcGIS Server está en `sigigntg.anati.gob.pa/arcgisserver/rest/services/` (hay capa `Distrito` actualizada a 2024). No se confirmó capa provincial ni licencia de reutilización. **MiAmbiente/SINAP y ATP: nada encontrado.** | S/N | https://sigigntg.anati.gob.pa/arcgisserver/rest/services/Distrito/MapServer/layers |
| E-35 | UNESCO en Panamá | Cinco sitios: Panamá Viejo y Distrito Histórico (1997/2003), Fortificaciones Portobelo-San Lorenzo (1980), P. N. Coiba (2005), P. N. Darién (1981), Cordillera de Talamanca-La Amistad (1983, compartido con Costa Rica). Una fila de Wikipedia menciona una «Ruta Colonial Transístmica» (2025) cuyo estado de inscripción **no se pudo confirmar**. | S | https://en.wikipedia.org/wiki/List_of_World_Heritage_Sites_in_Panama |
| E-36 | Mapillary | Ayuda oficial: imágenes bajo CC BY-SA. Términos de API sobre almacenamiento/caché y cómo distinguir panoramas: **no confirmados**. | S/N | https://help.mapillary.com/hc/en-us/articles/115001770409-Licenses |
| E-37 | Google Routes | Resumen de la política: los resultados mostrados en un mapa deben mostrarse en un mapa de Google; en proyectos con facturación EEA posteriores al 2025-07-08 la restricción «con cualquier mapa» es más estricta. El texto vinculante son los Service Specific Terms. | S | https://developers.google.com/maps/documentation/routes/policies |
| E-38 | Precios (todos secundarios) | Supabase Pro 25 USD/mes con 8 GB BD, 250 GB egress y 10 USD de crédito de cómputo (fuentes en conflicto en MAU). R2: 0,015 USD/GB-mes, Clase A 4,50 USD/M, Clase B 0,36 USD/M, egress gratis. Vercel Pro 20 USD/puesto con 1 TB de transferencia y 10 M de peticiones edge incluidos (fuentes en conflicto en funciones). Cesium ion: Community gratis (5 GB almac., 15 GB streaming), Commercial 149/524 USD, Premium 499/874 USD. | S | makerkit.dev, cesium.com/platform/cesium-ion/pricing |
| E-39 | Políticas OSM de tiles | **No se pudo leer.** Se asume (conocimiento general, sin verificar hoy) que `tile.openstreetmap.org` no admite descarga masiva ni uso comercial intensivo. El proyecto **no** usa ese servidor. | N | https://operations.osmfoundation.org/policies/tiles/ |

## Cómo reproducir

Los scripts de los sondeos están en `pipelines/spikes/` (con su README). Requieren red hacia S3 y PyPI y las dependencias de `pipelines/requirements.txt`.
