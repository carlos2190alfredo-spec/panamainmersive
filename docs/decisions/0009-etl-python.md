# 0009 — Pipeline ETL en Python, separado de la aplicación

- Estado: Aceptada
- Fecha: 2026-10-20

## Contexto

La extracción real de Overture con poda por grupo de filas y HTTP Range funcionó con `pyarrow`+`fsspec` en segundos (E-21); DuckDB `httpfs` no es utilizable aquí (E-21). GDAL, PROJ, tippecanoe y PostGIS están instalados (E-02). El ETL debe ser idempotente, con checkpoints, y protegerse contra SSRF, zip bombs, rutas relativas, XML inseguro y geometrías excesivas.

## Decisión

- Pipeline en **Python 3.13** con dependencias **fijadas** (`pipelines/requirements.txt`), herramientas CLI (GDAL, tippecanoe) invocadas con listas de argumentos (sin `shell=True`).
- Etapas: **extraer → comprobar derechos → cuarentena → validar → normalizar → deduplicar → publicar versión**. Cada etapa deja un manifiesto con hash, release, licencia y atribución.
- **Idempotente** (misma entrada ⇒ misma salida y mismo hash); reintentos limitados; registra cambios de fuente.
- **Sin geocodificación masiva con API de pago.**
- Validación GIS (CRS, ejes, bbox, geometrías vacías, anillos, topología) **reporta**; **no** repara en silencio datos oficiales (`ST_MakeValid` solo en derivados, con registro).
- Solo se descargan **hosts permitidos** por lista blanca explícita en configuración (anti-SSRF).

## Alternativas descartadas

ETL en TypeScript (herramientas GIS inmaduras para este volumen); ejecutar ETL dentro de Route Handlers.

## Consecuencias

Dos ecosistemas (Node y Python) en el repo; se documenta en `docs/setup.md` y se separa en CI.

## Revisar cuando

Un ecosistema TS cubra extracción Parquet espacial y teselado con paridad medida.
