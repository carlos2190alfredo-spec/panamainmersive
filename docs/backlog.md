# Backlog

Vocabulario de estado: **IMPLEMENTED** (existe) · **VERIFIED** (existe y se observó una prueba pasando) · **BLOCKED** (falta credencial/acceso/decisión externa) · **DEFERRED** (decidido posponer). Una integración deshabilitada o una pantalla con fixtures **no** es VERIFIED.

## Bloqueos de lanzamiento (no impiden probar en local)

| ID   | Bloqueo                                                                                               | Impacto                                     | Desbloqueo                                                      |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| L-01 | Ninguna política de derechos es `verified` (Overture, Natural Earth, terreno AWS están `provisional`) | No se puede publicar a producción           | Leer licencias en fuente primaria (hosts en `docs/setup.md` §2) |
| L-02 | Ningún idioma tiene revisión humana (UI `draft`/`machine_translated`)                                 | Nada es indexable en producción             | Revisores por idioma                                            |
| L-03 | Geometrías oficiales (IGN/ANATI, MiAmbiente) sin acceso ni licencia                                   | Los límites son `osm_derived`, no oficiales | Acceso + licencia                                               |
| L-04 | Revisión legal (ODbL, privacidad, cookies)                                                            | No se pueden recoger datos de usuarios      | Asesoría legal                                                  |
| L-05 | Cobertura Google 3D/Street View/Mapillary `UNKNOWN`                                                   | 3D fotorrealista y calle no disponibles     | Claves/tokens + red                                             |

## Por fase

### Fase 1 — Foundation

Ver `docs/progress.md` para el estado exacto de cada elemento.

### Fase 2 — Exploración de Panamá

- Mapa MapLibre con PMTiles locales y terreno AWS; cámara con conversión 2D↔altitud; deep links; selección de destino; alternativa textual; StrictMode; fallback.
- Medir bundle y tiempo de mapa utilizable (presupuestos de `docs/performance.md`).
- Probar HTTP Range/CORS de PMTiles.
- Experience Resolver v1 (puro) con pruebas.

### Fase 3 — GIS

Pipeline de importación controlada y reproducible; geometrías versionadas; Layer Engine y Legend Engine; clustering; consultas espaciales con API acotada.

### Fase 4 — Destinos

Nueve fichas con fuentes, traducciones, medios autorizados, SEO. **Sin rellenar huecos con afirmaciones inventadas.** Depende de L-01…L-03.

### Fases 5–10

Street imagery e historias · Empresas · Actividades · Rutas y viajes · IA · Offline/PWA. Ver `docs/PROMPT-MAESTRO.md` §22.

## Deuda técnica y mejoras registradas

| ID   | Tema                                                                                                | Estado              |
| ---- | --------------------------------------------------------------------------------------------------- | ------------------- |
| T-01 | Job informativo de CI con TypeScript 7 para detectar cuándo typescript-eslint lo soporte (ADR-0002) | DEFERRED            |
| T-02 | Pasar a ESLint 10 cuando `eslint-plugin-jsx-a11y` lo declare compatible (ADR-0012)                  | DEFERRED            |
| T-03 | Copiar el terreno Terrarium a almacenamiento propio para producción (términos y estabilidad)        | DEFERRED            |
| T-04 | Decisión de proveedor de imagen satelital abierta (Sentinel-2 COG requiere servicio de teselas)     | DEFERRED            |
| T-05 | Decidir variante del portugués (BR/PT) y tono por idioma                                            | BLOCKED (editorial) |
| T-06 | Puente XYZ sobre PMTiles para `MVTDataProvider` de Cesium (solo si se activa Cesium)                | DEFERRED            |
| T-07 | Fuente de extracto OSM para Valhalla (Geofabrik bloqueado)                                          | BLOCKED             |
| T-08 | Observabilidad (Sentry/OpenTelemetry) cuando se conozca el despliegue                               | DEFERRED            |
