# 0005 — PMTiles + tippecanoe para capas estables

- Estado: Aceptada
- Fecha: 2026-10-20

## Contexto

Las capas (divisiones, áreas protegidas, agua, costa, caminos) son **relativamente estáticas** y de ámbito nacional. No se deben enviar GeoJSON enormes al navegador. `tippecanoe 2.49.0` y la CLI `pmtiles` de Python (`pmtiles==3.8.1`) están disponibles (E-02). El cliente `pmtiles` 4.5 se registra como protocolo de MapLibre.

## Decisión

- Teselado con **tippecanoe** a **MVT empaquetado en PMTiles**, versionado y con manifiesto (fuente, release, licencia, atribución, checksum, bbox, fecha).
- Servido **estáticamente** (CDN/almacenamiento compatible con S3); requiere **HTTP Range** y **CORS**, que se comprueban con una prueba automática (no se asume).
- Terreno: `raster-dem` Terrarium del bucket público de AWS para **desarrollo y MVP**, declarando fuente/fecha (E-25); para producción se evalúa copiar a almacenamiento propio por estabilidad y términos.
- Martin (servidor dinámico) se evalúa **solo** si aparecen necesidades dinámicas.
- Si se activa Cesium: puente `/{z}/{x}/{y}.mvt` sobre PMTiles para `MVTDataProvider`.

## Alternativas descartadas

GeoJSON directo (peso); servidor de tiles propio desde el día 1 (coste operativo sin necesidad); tiles públicos de OSM (políticas, E-39).

## Consecuencias

Las capas dinámicas (p. ej. filtros por BD) requieren otra vía: API espacial acotada (`docs/gis.md`). Los PMTiles derivados de ODbL se publican con atribución y licencia declaradas.

## Revisar cuando

La latencia p95 de lecturas Range supere el presupuesto, o el volumen de capas dinámicas justifique Martin.
