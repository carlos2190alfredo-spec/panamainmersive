# Backlog

Vocabulario de estado: **IMPLEMENTED** (existe) · **VERIFIED** (existe y se observó una prueba pasando) · **BLOCKED** (falta credencial/acceso/decisión externa) · **DEFERRED** (decidido posponer). Una integración deshabilitada o una pantalla con fixtures **no** es VERIFIED.

## Bloqueos de lanzamiento (no impiden probar en local)

| ID   | Bloqueo                                                                                                      | Impacto                                                           | Desbloqueo                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| L-01 | Ninguna política de derechos es `verified` (Overture, terreno AWS y glifos de Noto Sans están `provisional`) | **El mapa y el relieve están bloqueados en producción** (probado) | Leer licencias en fuente primaria (hosts en `docs/setup.md` §2) |
| L-02 | Ningún idioma tiene revisión humana (UI `draft`/`machine_translated`)                                        | Nada es indexable en producción                                   | Revisores por idioma                                            |
| L-03 | Geometrías oficiales (IGN/ANATI, MiAmbiente) sin acceso ni licencia                                          | Los límites son `osm_derived`, no oficiales                       | Acceso + licencia                                               |
| L-04 | Revisión legal (ODbL, privacidad, cookies)                                                                   | No se pueden recoger datos de usuarios                            | Asesoría legal                                                  |
| L-05 | Cobertura Google 3D/Street View/Mapillary `UNKNOWN`                                                          | 3D fotorrealista y calle no disponibles                           | Claves/tokens + red                                             |

## Por fase

### Fase 1 — Foundation

Ver `docs/progress.md` para el estado exacto de cada elemento.

### Fase 2 — Exploración de Panamá

**IMPLEMENTED y VERIFIED** (ver `docs/progress.md`, Entrega 2): MapLibre con PMTiles propio construido por un pipeline reproducible y con puerta de verificación; cámara 2D↔altitud; enlaces profundos `d`/`c`/`l`; selección de destino (botón, marcador, teclado, Atrás/Adelante); marcadores accesibles con agrupamiento; alternativa textual; capas y leyenda generada; relieve **opt-in**; estados de error; Experience Resolver v1 + evaluador de derechos; StrictMode; HTTP Range del PMTiles; presupuesto de bundle del mapa.

**DEFERRED / pendiente en esta fase**:

| ID   | Tema                                                                                                                                        | Estado   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| F2-1 | Carreteras (`base/transportation`, 478 k segmentos) y picos (`land/physical peak`) en el basemap                                            | DEFERRED |
| F2-2 | Etiquetas de destino con colisión (los marcadores a zoom ≥ 10 pueden solaparse sus píldoras; el agrupamiento solo evita solapes de botones) | DEFERRED |
| F2-3 | Servir el PMTiles desde un CDN/bucket y probar Range + CORS **entre orígenes**                                                              | PENDING  |
| F2-4 | Relieve autoalojado (≈ 250 MB [estimación]; exige derechos de redistribución)                                                               | DEFERRED |
| F2-5 | Medir tiempo de mapa utilizable, LCP/INP/FPS en dispositivo de referencia; valorar `prewarm()` y reducir la tesela máxima (416 KB gzip)     | PENDING  |
| F2-6 | Pruebas de regresión visual del mapa (capturas) y pruebas unitarias del ETL de Python                                                       | PENDING  |
| F2-7 | Probar con NVDA/VoiceOver/TalkBack y con personas usuarias                                                                                  | PENDING  |
| F2-8 | Experience Resolver con cobertura (hoy solo derechos): 3D, calle, imagen                                                                    | Fases 5+ |

### Fase 3 — GIS

Pipeline de importación controlada y reproducible; geometrías versionadas; Layer Engine y Legend Engine; clustering; consultas espaciales con API acotada.

### Fase 4 — Destinos

Nueve fichas con fuentes, traducciones, medios autorizados, SEO. **Sin rellenar huecos con afirmaciones inventadas.** Depende de L-01…L-03.

### Fases 5–10

Street imagery e historias · Empresas · Actividades · Rutas y viajes · IA · Offline/PWA. Ver `docs/PROMPT-MAESTRO.md` §22.

## Deuda técnica y mejoras registradas

| ID   | Tema                                                                                                                                                         | Estado              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| T-01 | Job informativo de CI con TypeScript 7 para detectar cuándo typescript-eslint lo soporte (ADR-0002)                                                          | DEFERRED            |
| T-02 | Pasar a ESLint 10 cuando `eslint-plugin-jsx-a11y` lo declare compatible (ADR-0012)                                                                           | DEFERRED            |
| T-03 | Copiar el terreno Terrarium a almacenamiento propio para producción (términos y estabilidad)                                                                 | DEFERRED            |
| T-04 | Decisión de proveedor de imagen satelital abierta (Sentinel-2 COG requiere servicio de teselas)                                                              | DEFERRED            |
| T-05 | Decidir variante del portugués (BR/PT) y tono por idioma                                                                                                     | BLOCKED (editorial) |
| T-06 | Puente XYZ sobre PMTiles para `MVTDataProvider` de Cesium (solo si se activa Cesium)                                                                         | DEFERRED            |
| T-07 | Fuente de extracto OSM para Valhalla (Geofabrik bloqueado)                                                                                                   | BLOCKED             |
| T-08 | Observabilidad (Sentry/OpenTelemetry) cuando se conozca el despliegue                                                                                        | DEFERRED            |
| T-09 | La URL del worker de MapLibre depende de que Turbopack emita el activo (E-46); revisar al actualizar MapLibre/Next                                           | DEFERRED            |
| T-10 | `.next/static/media` incluye `maplibre-gl-dev*.mjs` y `-shared*.mjs` (≈ 3,7 MB sin comprimir) que no se piden en producción: valorar podarlos del despliegue | DEFERRED            |
| T-11 | Caché de desarrollo de Turbopack obsoleta puede provocar un bucle de recarga («HMR hash mismatch»): borrar `.next/dev` (ver CLAUDE.md)                       | NOTA                |
