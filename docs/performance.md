# Rendimiento y accesibilidad

> Los números de esta página son **presupuestos y objetivos**, no resultados. Los resultados medidos se registran aparte en la sección «Mediciones» con fecha, dispositivo, red y qué incluye cada medición. Las **únicas** mediciones son las de abajo (M-01…M-06) y **ninguna** es en hardware ni red reales.

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

### M-03 · Efecto de las rutas de la API espacial (2026-10-21)

- Al añadir las tres rutas `/api/spatial/*` el JS compartido pasó de **190,6 a 191,1 KB** (Explorar 199,5 → **199,9 KB**), +0,4–0,5 KB. Comparación por _chunk_ con y sin los cambios: **todos los ficheros de código de la aplicación son idénticos**; solo cambia el _chunk_ de _runtime_ de Turbopack (`turbopack-*.js`, 3 972 → 4 423 B gzip, **+451 B**). Es coste de infraestructura de la compilación, no código del cliente. No se investigó la causa exacta más allá de aislarla (hipótesis: el registro de _chunks_ crece con las nuevas entradas). Margen restante frente al presupuesto de 210 KB: ≈ 18,9 KB.
- El servidor (`pg`, consultas) no entra en el bundle del navegador (comprobado por `pnpm check:bundle` y por una regla de ESLint).
- **Latencia de la API y carga: sin medir** (ver `docs/testing.md`).

### M-04 · Efecto del registro de capas (2026-10-21)

- **Explorar 199,9 → 201,4 KB** de JS gzip y **mapa diferido 455,4 → 456,8 KB** (+1,4 KB en cada uno: el registro declarativo, el motor y el nuevo componente de leyenda). Resto de páginas sin cambio (191,1 KB). Dentro de presupuesto (210 / 500 KB); margen de Explorar ≈ 8,6 KB.
- **Sin medir**: coste de reaplicar el estilo con `setStyle(…, { diff: true })` al conmutar capas, FPS con las siete capas activas en dispositivos reales, y la leyenda de 12 entradas en pantallas pequeñas más allá de la comprobación de desbordes en el emulador.

### M-05 · Selección de áreas (2026-10-21)

- **Explorar 201,4 → 205,4 KB** de JS gzip (presupuesto 210; **margen ≈ 4,6 KB**) y **mapa diferido 456,8 → 460,7 KB** (presupuesto 500). El chunk específico de la página pasó de 8,8 KB (F3.b) a 14,2 KB (F3.c +1,4; F3.d ≈ +4). Resto de páginas sin cambio (191,1 KB).
- **Diferido y verificado**: el componente que dibuja los datos de la BD y el validador de la respuesta (≈ 1,8 KB gzip) van en un _chunk_ aparte **que no aparece en el HTML inicial**; sin embargo la medición total de Explorar no bajó (205,2 → 205,4 KB), así que el resto del código nuevo es el que pesa. No se investigó más allá de eso.
- **Sin zod en el cliente** (E-51): evita una violación de CSP y su peso.
- **Riesgo**: con ≈ 4,6 KB de margen, la siguiente mejora de Explorar obliga a diferir el panel o a recalibrar el presupuesto con evidencia (F3-10).
- **Sin medir**: latencia de la ficha, coste de `queryRenderedFeatures` en cada `idle` con las siete capas, FPS al elegir áreas con geometrías grandes en dispositivos reales.

### M-06 · Línea base de Web Vitals en móvil EMULADO (2026-10-22)

- **Qué mide**: `pnpm perf:vitals` (`scripts/perf/vitals.ts`) sobre el build de producción, con Chromium 141, **Pixel 5 emulado, CPU ×4 y red de 10 Mbps / 100 ms RTT** (CDP), **caché fría** (contexto nuevo en cada pasada), **5 pasadas por página**. Se informa la **mediana** y el rango. FCP, LCP, CLS (mayor ventana de sesión), TBT **aproximado** (tareas largas desde FCP), bytes transferidos **comprimidos** y peticiones. En Explorar, además, el tiempo hasta `data-map-status="ready"`. Datos en bruto: `docs/research/perf-baseline-2026-10-22.json`.
- **Equipo**: Intel Xeon ×4 (calibración: 74 ms para 50 M iteraciones **sin** limitar), Node 22.22.0. **No es un Android de gama media**: la limitación ×4 es una aproximación.

| Página                | FCP = LCP (ms, mediana) | CLS   | TBT≈ (ms) | Transferido (KB) | Peticiones |     Mapa listo (ms) |
| --------------------- | ----------------------: | ----- | --------: | ---------------: | ---------: | ------------------: |
| Inicio (es)           |           508 (412–884) | 0,000 |       107 |              294 |         29 |                   — |
| Destinos (es)         |           468 (424–480) | 0,000 |       101 |              355 |         47 |                   — |
| Ficha de destino (es) |           412 (388–604) | 0,000 |        82 |              296 |         29 |                   — |
| Ficha de destino (de) |           400 (396–472) | 0,000 |        77 |              296 |         29 |                   — |
| Fuentes (es)          |           376 (368–428) | 0,000 |        78 |              295 |         29 |                   — |
| Explorar (es)         |           372 (356–416) | 0,000 |       564 |            1 275 |         47 | 3 145 (3 099–3 580) |

- **Lectura honesta**: en estas condiciones emuladas, las páginas de texto pintan su contenido principal en ≈ 0,4–0,5 s, sin cambios de diseño, con ≈ 300 KB transferidos y un bloqueo de hilo aproximado de ≈ 80–110 ms (hidratación). Explorar tarda ≈ 3,1 s hasta que el mapa está listo y acumula ≈ 560 ms de tareas largas, **pero ese tiempo no es representativo**: el mapa se dibuja con WebGL por **software** (SwiftShader). El primer recorrido de Explorar transfiere ≈ 1,3 MB (dentro del presupuesto «ligero» de ≈ 1,5 MB, **sin contar** las teselas posteriores, que se declaran aparte: M-02).
- **Valores atípicos**: la primera pasada de cada página suele ser la más lenta (calentamiento del servidor y del navegador); se muestran en el rango, no se descartan.
- **Lo que NO dice**: no es hardware ni red reales; no mide **INP** (necesita interacción real) ni **FPS**; el TBT es una aproximación; con 5 pasadas el p75 no es fiable (se da la mediana); LCP/CLS de una página **estática y sin imágenes** son favorables por construcción: no se extrapolan a fichas con medios (Fase 4 en adelante). **No se afirma cumplimiento de ningún presupuesto.**
- **Reproducir**: `SITE_ENV=development pnpm build && pnpm perf:vitals --runs 5 --json <ruta>` (omite Explorar si falta el mapa base). No es una puerta de CI: las cifras dependen del equipo.
