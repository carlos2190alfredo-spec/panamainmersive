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

### M-07 · Coste de lectura, escritura y contención de la base de datos (2026-10-23)

- **Qué mide**: `pnpm perf:db` (`scripts/perf/db-cost.ts`) con **datos sintéticos** a tres escalas: 200 / 2 000 / 20 000 destinos × los 7 campos que aplican a una localidad, con dos versiones por campo (una reemplazada y una vigente con su fuente), un 5 % con una versión 3 en revisión y otro 5 % con un borrador, un 30 % de las vigentes con una traducción humana publicada y un 10 % de destinos sin publicar: **2 940 / 29 400 / 294 000 filas** en `field_assertions`. Se siembra por SQL con los disparadores desactivados. Mide (1) el **exportador real** (se registran sus consultas; no se copia su SQL), (2) la **lectura con RLS frente a lo mismo escrito a mano** (propietario con el filtro explícito: la diferencia es la maquinaria de la política, no el filtro) con `EXPLAIN`, (3) la **escritura** con los disparadores completos, sin el de serialización (0011) y sin éste ni la auditoría, y (4) la **contención** con `pgbench` (8 conexiones: claves repartidas y una sola clave caliente), en un clúster **relajado** (el de pruebas: `fsync`, `synchronous_commit` y `full_page_writes` apagados) y en otro **durable** (valores por defecto de PostgreSQL).
- **Equipo**: Intel Xeon ×4 (que comparte `pgbench`), 15,7 GB, PostgreSQL 16.15 (`shared_buffers` 128 MB, `work_mem` 4 MB), socket Unix, Node 22.22.0. «Antes» = `828b893`; «después» = la 0012 y el agrupado del exportador (`2b33feb`, `4c095a7`). Datos en bruto: `docs/research/perf-db-2026-10-23-before.json` y `…-after.json`.

**Exportador real** (ms, clúster relajado; antes → después)

| Destinos | Afirmaciones públicas |           Total |           SQL | Montaje y validación de forma |
| -------- | --------------------: | --------------: | ------------: | ----------------------------: |
| 200      |                 1 260 |         83 → 68 |       29 → 29 |                       53 → 40 |
| 2 000    |                12 600 |     2 527 → 277 |     296 → 250 |                    2 231 → 27 |
| 20 000   |               126 000 | 176 551 → 4 608 | 4 459 → 4 096 |                 172 092 → 512 |

**Lectura del personal** (mediana en ms; con la política antes → después · escrito a mano)

| Consulta                      |       2 940 filas |              29 400 |              294 000 |
| ----------------------------- | ----------------: | ------------------: | -------------------: |
| Cola de revisión (50)         | 176 → 0,63 · 0,35 | 1 762 → 1,95 · 1,55 | 17 858 → 19,7 · 16,6 |
| Contar todas las afirmaciones |  179 → 0,45 · 0,2 | 1 748 → 1,66 · 1,18 | 17 792 → 16,6 · 14,9 |
| Mis borradores (50)           |  86 → 0,61 · 0,39 |   395 → 1,33 · 1,22 |     81 → 0,55 · 0,34 |

**Lectura pública (`anon`)** (mediana en ms; con la política antes → después · escrito a mano)

| Consulta                                      |      2 940 filas |             29 400 |            294 000 |
| --------------------------------------------- | ---------------: | -----------------: | -----------------: |
| Todas las públicas (forma del exportador)     |  4,4 → 3,4 · 1,9 |       35 → 23 · 18 |    420 → 360 · 333 |
| Las de un destino (por clave)                 | 0,5 → 0,9 · 0,25 | 0,28 → 0,38 · 0,22 | 0,30 → 0,29 · 0,19 |
| Fuentes (RLS anidada: fuente → evidencia → …) |  3,6 → 2,2 · 1,6 |     291 → 300 · 12 |    615 → 475 · 231 |

**Escritura** (mediana en ms por operación, tras la corrección; relajado / durable)

| Operación                              | 2 940 filas |      29 400 |     294 000 |
| -------------------------------------- | ----------: | ----------: | ----------: |
| Nuevo borrador, disparadores completos | 0,73 / 1,07 | 0,70 / 0,93 | 0,73 / 1,05 |
| … sin el de serialización              | 0,83 / 0,87 | 0,70 / 0,88 | 0,75 / 1,02 |
| … sin serialización ni auditoría       | 0,56 / 0,87 | 0,58 / 0,79 | 0,58 / 0,77 |
| Verificar una versión, completos       | 1,68 / 1,97 | 1,52 / 1,83 | 1,60 / 1,89 |
| … sin el de serialización              | 1,52 / 1,79 | 1,49 / 1,78 | 1,51 / 1,82 |

**Contención** (`pgbench`, transacciones por segundo, tras la corrección; 8 conexiones salvo indicación)

| Escenario                      | Relajado 2 940 | 29 400 | 294 000 | Durable 2 940 | 29 400 | 294 000 |
| ------------------------------ | -------------: | -----: | ------: | ------------: | -----: | ------: |
| Repartidas · con serialización |          4 731 |  5 594 |   5 419 |         3 457 |  3 981 |   3 776 |
| Repartidas · sin serialización |          4 779 |  5 628 |   5 478 |         3 556 |  4 100 |   3 693 |
| Una sola clave · 1 conexión    |          1 335 |  1 263 |   1 309 |         1 017 |    991 |     737 |
| Una sola clave · 8 conexiones  |          1 637 |  1 609 |   1 631 |         1 105 |  1 152 |     992 |

La latencia media de la clave caliente con 8 conexiones fue ≈ 4,9 ms (relajado) y ≈ 7–8 ms (durable), frente a ≈ 0,75 y ≈ 1,0–1,4 ms con una.

- **Lectura honesta**:
  1. **Había un defecto real, y no el que yo esperaba.** La lectura del personal escalaba **linealmente con las filas** (176 ms → 1,8 s → 17,9 s): la política evaluaba `app.has_role(…)` fila a fila (≈ 60 µs) y antes que los filtros de la consulta. Con `(select app.is_staff())` el plan pasa a un _InitPlan_ y la misma consulta cuesta 19,7 ms (×1,2 sobre lo manual). Se corrigió con la migración `0012` (ADR-0023) y una prueba que lo exige también a las políticas futuras. Hoy no se notaba (cientos de filas), pero 45 políticas tenían esa forma.
  2. **El exportador era cuadrático** en el montaje (176,6 s con 126 000 afirmaciones, de los que el SQL son 4,5 s). Corregido (`4c095a7`). No tenía efecto con el contenido actual; sí hacía que, por encima del tope del esquema, la exportación gastara minutos en rechazar.
  3. **La RLS pública es barata**: ×1,1–2,7 sobre lo manual, en milisegundos. El valor atípico es la lectura anónima de **fuentes** (RLS anidada: ×25 a 29 400 filas, 300 ms frente a 12 ms; el planificador elige otro plan). No está en ninguna ruta del producto y la 0012 no la cambia: **queda anotada, no corregida**.
  4. **La escritura cuesta ≈ 0,7 ms (relajado) / ≈ 1,0 ms (durable) y no crece con el tamaño** de la tabla en dos órdenes de magnitud. El disparador de serialización **no se distingue del ruido** (≤ 0,2 ms); la auditoría suma ≈ 0,1–0,2 ms. La decisión del ADR-0022 aguanta.
  5. **Una sola clave caliente admite ≈ 1 000–1 600 versiones por segundo** en este entorno, con 8 escritores. Una persona editora produce del orden de una por minuto: sobra margen incluso si la red o el disco lo empeoran 100 veces.
- **Lo que NO dice**:
  - **No es producción.** Datos **sintéticos**, socket Unix (sin red, sin _pooler_ ni PostgREST), un equipo que comparte sus cuatro núcleos con `pgbench` y un disco de contenedor cuyo `fsync` cuesta ≈ 0,3 ms; **uno de producción puede costar 1–10 ms y el bloqueo de la 0011 se mantiene hasta el `COMMIT`**. El modo durable acota el efecto, no lo reproduce.
  - **Ruido**: entre dos ejecuciones idénticas hubo hasta un 20 % de diferencia en tps (5 903 frente a 4 731 con la misma configuración a 200 destinos); la contención es **una sola pasada de 5 s** por celda y las lecturas, la mediana de 5 (2 si pasan de 1 s). Las diferencias pequeñas **no son conclusiones**.
  - **Los datos se sembraron saltándose los disparadores** (la forma la validan las pruebas de integración y el exportador real los lee sin quejarse, pero no «pasaron» por las puertas). **La revalidación de puertas del exportador no se midió a escala**: necesitaría destinos del registro (E-79); por lectura es lineal.
  - **Solo una localidad** (7 campos; un volcán tiene 8), sin lecturas concurrentes con las escrituras, sin _bloat_ ni `VACUUM` y solo PostgreSQL 16.15.
  - **El régimen real es mucho menor**: el registro tiene **9 destinos** y la instantánea admite **5 000 afirmaciones** (E-79), así que hoy son ≤ 72. Estas escalas miden el **margen** si el modelo creciera, y crecer exige otro diseño (F4-18).
- **Reproducir**: `pnpm perf:db [--scales 200,2000,20000] [--runs 5] [--seconds 5] [--json <ruta>]` (≈ 20 minutos a las tres escalas, con **nada más en marcha**: cualquier otra carga falsea los tiempos); `--smoke` ejecuta la escala mínima en segundos y es lo que prueba `db-cost-smoke.test.ts`. Salida 0 medido · 1 la premisa de la medición no se cumplió · 2 no se pudo medir (sin PostgreSQL o sin `pgbench`). No es una puerta de CI: las cifras dependen del equipo.
