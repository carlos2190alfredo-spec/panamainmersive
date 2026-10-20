# Rendimiento y accesibilidad

> Los números de esta página son **presupuestos y objetivos**, no resultados. Los resultados medidos se registran aparte en la sección «Mediciones» con fecha, dispositivo, red y qué incluye cada medición. Hoy **no hay mediciones**.

## Presupuestos iniciales (del documento rector)

| Métrica                          | Presupuesto                | Qué incluye la medición                                          |
| -------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| LCP público, p75                 | ≤ 2,5 s                    | Página pública (home/destino) en dispositivo y red de referencia |
| INP, p75                         | ≤ 200 ms                   | Interacciones del panel y selector de idioma                     |
| CLS                              | ≤ 0,1                      | Carga inicial, incluido el reservado del mapa                    |
| Mapa 2D utilizable               | ≤ 3 s                      | Hasta que se puede arrastrar/acercar con capa base visible       |
| Primera vista 3D útil            | ≤ 6 s                      | Solo si se activa 3D (hoy: relieve MapLibre)                     |
| Respuesta visual a una acción    | ≤ 200 ms                   | Clic/tecla → cambio visible                                      |
| Nueva vista de destino           | 2–4 s                      | Vuelo + datos del destino                                        |
| Fluidez escritorio / móvil       | 60 FPS / ≥ 30 FPS estables | Durante pan/zoom                                                 |
| API búsqueda/detalle, p95        | ≤ 500 ms                   | En servidor, sin red cliente                                     |
| Routing (servicio caliente), p95 | ≤ 1,5 s                    | Cuando exista                                                    |

### Dispositivo y red de referencia [propuesta, a confirmar]

- **Móvil de referencia**: un Android de gama media de ~2021 (emulado con _CPU throttling_ 4× en Chromium hasta tener hardware real).
- **Red**: 10 Mbps, 100 ms RTT (perfil de Lighthouse/Playwright _slow 4G_ ajustado).
- Resultados con hardware **real** pendientes; hasta entonces se etiquetan «emulado».

### Presupuestos de transferencia por modo

| Modo             | Primer recorrido útil                                | Notas                                                                     |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| **Ligero** (MVP) | ≈ **1,5 MB** (JS + CSS + fuentes + primeras teselas) | Punto de partida del documento rector; se ajusta con evidencia            |
| **3D**           | ≈ **6 MB**                                           | **No verificado como realista** con Cesium completo (ver architecture A5) |

Descargas posteriores (más teselas, medios) **no se esconden**: se miden y se declaran por separado.

## Cómo se medirá

| Qué                                                     | Cómo                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Bundle JS por ruta                                      | Salida de `next build` + analizador; **falla** si una ruta pública excede el presupuesto (prueba)   |
| Transferencia del primer recorrido                      | Playwright + CDP (`Network.loadingFinished`) con red limitada                                       |
| Mapa utilizable                                         | Marca `performance.mark` desde navegación hasta primer `idle` del mapa con capa base                |
| Frame time / FPS                                        | `requestAnimationFrame` muestreado durante un recorrido guionizado                                  |
| Errores de teselas, pérdida de contexto GL, _fallbacks_ | Eventos del mapa → contadores locales (sin PII)                                                     |
| Memoria                                                 | **No** se depende de `performance.memory` (no universal); se observan errores y pérdida de contexto |
| Descargas / coste por sesión                            | Agregado de bytes por origen en el recorrido de prueba                                              |

## Técnicas obligatorias

Carga progresiva, `lazy loading` del mapa (no bloquea el LCP del texto), división de bundles, un solo visor pesado, cancelación de solicitudes obsoletas, `requestRenderMode`/render bajo demanda cuando aplique, clustering/culling/LOD, imágenes autorizadas optimizadas, prioridad de solicitudes, **no repetir cálculos GIS pesados por frame**, workers donde ayuden.

## Accesibilidad (WCAG 2.2 AA)

Flujos implementados: teclado completo, foco visible y gestionado, contraste (**probado** sobre los tokens), textos alternativos, anuncios `aria-live`, controles etiquetados, `prefers-reduced-motion`, **alternativa textual al mapa**, objetivos táctiles ≥ 24×24 px (2.5.8), sin trampas de foco, reflow a 320 px (1.4.10). Se comprueba con axe y manualmente en **los cinco idiomas**. Un lienzo WebGL no es accesible por sí mismo: la lista de destinos y entidades es la vía **equivalente**, no un complemento.

## Mediciones

### M-01 · JS y CSS de la primera carga (2026-10-20)

- **Qué mide**: bytes **gzip** de los `<script src>` y hojas de estilo que referencia el HTML prerrenderizado de cada página, sumando los ficheros de `.next/` (`pnpm check:bundle`). **No** incluye fuentes (se cargan bajo demanda por `unicode-range`), imágenes ni teselas, ni la red real: es una **medida estática**, no un LCP.
- **Entorno**: build de producción de Next 16.4.2 (Turbopack), commit de la Foundation.

| Página           |  JS gzip | CSS gzip | Ficheros JS |
| ---------------- | -------: | -------: | ----------: |
| Inicio (es / de) | 190,5 KB |   4,0 KB |           9 |
| Explorar         | 190,5 KB |   4,3 KB |           9 |
| Destinos         | 190,5 KB |   3,1 KB |           9 |
| Ficha de destino | 190,5 KB |   4,0 KB |           9 |
| Fuentes          | 190,5 KB |   4,0 KB |           9 |

- **Lectura**: el JS es **idéntico en todas las páginas** (190,5 KB): es el coste base de React 19 + Next App Router + `next-intl` cliente. Es una **línea base**, no un logro: el presupuesto del script (210 KB) se fijó como línea base + ≈10 % **después de medir** (una primera suposición de 160 KB resultó incorrecta). Cuando se integre MapLibre se medirá de nuevo y se declarará el coste del mapa por separado.
- **Sin medir todavía**: LCP, INP, CLS, FPS, memoria, tiempo de mapa utilizable, transferencia total real. Requieren dispositivo y red de referencia.

### M-02 · Explorar con mapa (2026-10-20)

- **Primera carga** (`pnpm check:bundle`, gzip): Explorar **199,5 KB de JS** y 15,7 KB de CSS (incluye `maplibre-gl.css`); el resto de páginas, sin cambios (190,6 KB). El mapa **no** entra en esa cifra: se carga **diferido** tras hidratar.
- **Mapa diferido** (solo en `/explorar`): **455,4 KB gzip** en 4 ficheros (MapLibre ≈ 285, worker ≈ 143, PMTiles y lienzo ≈ 22). Presupuesto del script: 500 KB (`MAP_LAZY_BUDGET_KB`). Se sirve con `Cache-Control: immutable` (`/_next/static`).
- **Datos** (E-45, E-48): PMTiles 36,1 MB en servidor; mediana de tesela 187 B, p99 7,8 KB, **máxima 416 KB gzip**. Sesión típica (carga + dos destinos): ≈ 3,7 MB de teselas en 70 peticiones Range + 154 KB de glifos. Los números son bytes **decodificados** en Chromium sobre bucle local.
- **Lectura honesta**: el coste del mapa es **grande** (≈ 455 KB de JS antes de ver el primer píxel útil). Es lo habitual en MapLibre, pero es el primer candidato a optimizar si el tiempo de mapa utilizable incumple el presupuesto en el dispositivo de referencia. Palancas, **no aplicadas aún**: precalentar con `prewarm()`, dividir el worker, reducir capas detalladas a zoom bajo, servir el PMTiles desde un CDN.
- **Sin medir todavía**: LCP, INP, CLS, FPS, memoria, tiempo de mapa utilizable y transferencia real comprimida en dispositivo y red de referencia. **No se afirma ningún cumplimiento.**
