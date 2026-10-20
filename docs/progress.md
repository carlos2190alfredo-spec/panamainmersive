# Progreso

Última actualización: **2026-10-20**. Proyecto nuevo en `/home/user/panama-immersive` (no se ha tocado nada fuera de esta carpeta; `/home/user` estaba vacío).

## Estado por fase

| Fase | Estado | Notas |
| --- | --- | --- |
| 0 — Discovery | **IMPLEMENTED** (documentación completa; evidencias con fiabilidad declarada) | Fuentes primarias oficiales no accesibles: ver `docs/research/evidence-log.md` E-00 |
| 1 — Foundation | EN CURSO | |
| 2 — Exploración de Panamá | PENDIENTE | |
| 3 — GIS | PENDIENTE | |
| 4–10 | PENDIENTE | |

## Entrega 0 — Discovery y Architecture v1

### Qué se hizo
- Se inspeccionó el entorno: carpeta vacía, sin Git, sin CLAUDE.md/AGENTS.md, sin proyectos previos. Versiones instaladas verificadas (E-01, E-02).
- Se conservó el documento rector sin modificar: `docs/PROMPT-MAESTRO.md` (misma suma SHA-256 que el original).
- **Spikes que podían invalidar la arquitectura** (resultados en `docs/research/evidence-log.md`):
  1. Next 16.4.2 + TypeScript 7.0.2: **compila**, pero typescript-eslint no soporta TS ≥ 6.1 → TS 6.0.3 fijado (ADR-0002).
  2. Cesium 1.146: MVT solo experimental y **sin PMTiles** → MapLibre es el motor del MVP (ADR-0004).
  3. next-intl: `pathnames` estático y hreflang automático inadecuado para publicación parcial → slugs en registro propio y `alternateLinks:false` (ADR-0003).
  4. Overture en S3 con poda por bbox: **datos reales de Panamá extraídos en segundos** (E-21…E-24).
  5. Terreno AWS: CORS verificado; **sin batimetría a z12** (E-25).
- Documentos: `architecture.md`, 12 ADR, `coverage.md`, `data-sources.md`, `provider-rights.md`, `i18n.md`, `gis.md`, `data-model.md`, `security.md`, `performance.md`, `costs.md`, `setup.md`, `backlog.md`.

### Hallazgos que cambian el plan
- **Homonimia**: distrito *Barú* ≠ *Volcán Barú*; hay **cuatro «Santa Catalina»**. → nada se relaciona por nombre.
- **Casco Antiguo, Canal, El Valle, Volcán Barú y Coiba no tienen polígono de división** en Overture; Barú y Coiba solo tienen polígonos OSM de áreas protegidas (**no oficiales**). → etiqueta de procedencia obligatoria.
- **Casi toda la cobertura de proveedores es `UNKNOWN`** por falta de acceso/credenciales, no por ausencia (ver `coverage.md`).

### Qué no pudo verificarse
Todo lo que depende de hosts bloqueados (E-00): términos de Google/OSM/Mapillary, geoportales oficiales, UNESCO, Wikimedia. Los precios de `costs.md` son de fuentes secundarias.

### Siguiente acción concreta
Foundation: scaffold de Next 16 con cinco idiomas, tokens, componentes accesibles, migraciones PostGIS+RLS probadas, cabeceras de seguridad, CI y pruebas.
