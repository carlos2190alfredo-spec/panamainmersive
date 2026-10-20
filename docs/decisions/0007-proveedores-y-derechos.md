# 0007 — Proveedores por capacidad; derechos y cobertura deny-by-default

- Estado: Aceptada
- Fecha: 2026-10-20

## Contexto

Los proveedores difieren en lo que ofrecen y permiten. Un `VisualProvider` universal obliga a mentir sobre capacidades. «Lo público no implica licencia abierta». Las políticas de Google restringen caché y uso offline (E-31); Google Routes restringe mostrar resultados fuera de un mapa de Google (E-37).

## Decisión

1. Contratos por **capacidad** (`ImageryProvider`, `TerrainProvider`, `Tiles3DProvider`, `StreetImageryProvider`, `MediaProvider`, `InstitutionalDataSource`, `RoutingProvider`) con identificación, capacidades, **restricciones de combinación**, atribución, cobertura comprobada, control de errores y cancelación (`AbortSignal`).
2. **`RightsPolicyEvaluator` deny-by-default**: una acción (`display | combine | cache | download | transform | redistribute | offline | ai_process`) solo está permitida si hay una política **registrada y vigente** que la autorice para ese activo/proveedor. Cada política tiene estado `verified` (permite siempre) o `provisional` (permite solo fuera de producción y bloquea el lanzamiento); sin política, **deniega**. Así el desarrollo local no se bloquea y la producción no puede publicar nada cuyo derecho no se haya leído en la fuente primaria.
3. **`CoverageCatalog`**: estados `UNKNOWN | VERIFIED | PARTIAL | UNAVAILABLE | ERROR` con método, extensión, calidad observada, proveedor, fecha, versión, evidencia y **caducidad**. `UNKNOWN` y `ERROR` no se tratan como ausencia ni como presencia.
4. **`AttributionComposer`**: atribución visible, por activo y agregada (p. ej. `asset.copyright` por tile de Google si se llegara a usar).
5. Un proveedor desactivado o caído **no** rompe el flujo básico: el resolver degrada.

## Alternativas descartadas

Interfaz común mínima (falsa uniformidad); permitir por defecto y prohibir lo conocido (riesgo legal).

## Consecuencias

Más código inicial, pero cada pantalla puede explicar por qué muestra lo que muestra. Las matrices de `docs/provider-rights.md` y `docs/coverage.md` son **datos** que alimentan estos servicios.

## Revisar cuando

Cambien los términos de un proveedor o se añada uno nuevo.
