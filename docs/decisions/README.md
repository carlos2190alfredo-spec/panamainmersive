# Decisiones de arquitectura (ADR)

Un ADR registra **una** decisión, su contexto, las alternativas descartadas y cuándo debe revisarse. No se editan los históricos: un cambio es un ADR nuevo que declara `Reemplaza a`.

| ID                                       | Decisión                                                                                                                                  | Estado   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| [0001](0001-monolito-modular.md)         | Monolito modular; ETL fuera del proceso web                                                                                               | Aceptada |
| [0002](0002-typescript-6.md)             | TypeScript 6.0.3 fijado (no 7.x)                                                                                                          | Aceptada |
| [0003](0003-i18n-rutas-y-slugs.md)       | next-intl con `proxy.ts`; slugs de destino en registro propio; `alternateLinks:false`                                                     | Aceptada |
| [0004](0004-motor-de-mapa.md)            | MapLibre como motor principal; Cesium diferido tras un adaptador                                                                          | Aceptada |
| [0005](0005-tiles-pmtiles.md)            | PMTiles + tippecanoe para capas estables; puente XYZ solo si se activa Cesium                                                             | Aceptada |
| [0006](0006-postgres-portable.md)        | PostgreSQL/PostGIS con SQL portable a Supabase                                                                                            | Aceptada |
| [0007](0007-proveedores-y-derechos.md)   | Proveedores por capacidad; derechos y cobertura deny-by-default                                                                           | Aceptada |
| [0008](0008-traducciones-editoriales.md) | Entidades separadas de traducciones tipadas con estado editorial                                                                          | Aceptada |
| [0009](0009-etl-python.md)               | Pipeline ETL en Python, separado de la aplicación                                                                                         | Aceptada |
| [0010](0010-csp-y-cabeceras.md)          | CSP con `script-src 'self' 'unsafe-inline'` + controles compensatorios (SRI y nonce descartados con evidencia)                            | Aceptada |
| [0011](0011-estilos-y-tipografia.md)     | CSS Modules + tokens + propiedades lógicas; tipografías autoalojadas                                                                      | Aceptada |
| [0012](0012-herramientas.md)             | pnpm, Vitest 5, Playwright, Prettier (ESLint: ver 0013)                                                                                   | Aceptada |
| [0013](0013-eslint-10.md)                | ESLint 10 (9 está fuera de soporte; `jsx-a11y` verificado con control positivo)                                                           | Aceptada |
| [0014](0014-basemap-y-mapa.md)           | Basemap de una sola fuente (Overture) en PMTiles con verificación; URL como estado del mapa; relieve opt-in; derechos bloquean producción | Aceptada |

## Cuándo se revisa un ADR

1. Una **medición** contradice la hipótesis (bundle, memoria, tiempo de mapa útil, coste por sesión).
2. Cambia una **licencia o condición** de un proveedor.
3. Aparece **evidencia de cobertura** que cambia el valor de una opción.
4. Una **dependencia** rompe compatibilidad o queda sin mantenimiento.

## Plantilla

```
# NNNN — Título
- Estado: Propuesta | Aceptada | Reemplazada por NNNN
- Fecha: AAAA-MM-DD
## Contexto
## Decisión
## Alternativas descartadas
## Consecuencias
## Evidencia
## Revisar cuando
```
