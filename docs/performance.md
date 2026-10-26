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

### M-08 · Explorar inmersivo: HUD, hoja de MapLibre recortada y lienzo como isla diferida (2026-10-25)

- **Qué mide**: `pnpm check:bundle` (gzip de los `<script>` y hojas que referencia el HTML prerrenderizado, como M-01/M-02) y `pnpm perf:vitals --runs 5` (como M-06; datos en bruto: `docs/research/perf-m08-2026-10-25.json`). Entrega 5j, parte «HUD de escritorio» (ADR-0025 §8, §11).
- **Por qué se midió**: Explorar partía con el presupuesto agotado (**205,6 KB de JS y 19,7 KB de CSS** de 210 / 20 en `30ed83a`; F3-10) y el HUD le añade ficha, carrusel, paneles y piel de los controles. El contrato (ADR-0025 §11) manda **primero intentar caber** y recalibrar solo con medición. **No hizo falta subir ningún presupuesto**: caben los dos.
- **Qué se hizo para caber** (cada paso medido sobre el anterior):

| Paso                                                                                                 | JS gzip Explorar | CSS gzip Explorar |
| ---------------------------------------------------------------------------------------------------- | ---------------: | ----------------: |
| `30ed83a` (antes del HUD)                                                                            |         205,6 KB |           19,7 KB |
| HUD + **hoja de MapLibre recortada** (`vendor/maplibre-gl.trimmed.css`), lienzo estático             |         207,1 KB |           15,9 KB |
| + dock, píldora del panel, estados sin mapa, encuadre alcanzable                                     |         208,7 KB |           16,2 KB |
| + **lienzo como isla diferida** (`MapStageLazy`, `next/dynamic` con `ssr: false`) — **estado final** |     **203,4 KB** |       **13,4 KB** |

1. **Hoja de MapLibre recortada**: `maplibre-gl.css` pesa 71,6 KB (**10,3 KB gzip**, lo mayor del CSS de Explorar); la recortada, 12,1 KB (**2,4 KB gzip**, −7,9 KB). Se quita **solo** lo que la aplicación no usa (logotipo, controles de globo, terreno, ubicación y pantalla completa, ventanas emergentes, punto de ubicación) y **todo lo desconocido se conserva**: una regla nueva de una versión posterior no se pierde en silencio. Es un archivo derivado y versionado, con su origen y licencia (BSD-3-Clause) en la cabecera; `pnpm map:css` lo regenera y `pnpm map:css -- --check` lo comprueba. **Fragilidad y su freno**: depende de la versión de `maplibre-gl` (6.15.0), así que `tests/unit/scripts/maplibre-css.test.ts` regenera la hoja en memoria y la compara byte a byte (**actualizar `maplibre-gl` sin regenerar la hace fallar**), comprueba que cada selector que el mapa usa sigue ahí y que nada de lo quitado queda; y un E2E (`explore-hud.spec.ts`) lee los estilos CALCULADOS con el mapa dibujado (lienzo y esquinas absolutos, `z-index` 2, iconos, créditos compactos, marcador absoluto, sin logotipo). Lo que **no** protege: un cambio de comportamiento de MapLibre sin cambio de CSS (no es de este recorte).
2. **El lienzo como isla diferida**: `MapStage` (ciclo de vida de MapLibre, marcadores, URL ↔ cámara y los dos CSS) pesaba ≈ 5,6 KB de JS y ≈ 2,9 KB de CSS en la carga inicial y no hace falta para pintar ni hidratar el HUD. Se carga **después de hidratar** (`ssr: false`; el hueco lo reserva el CSS de la página: CLS 0,000 medido). MapLibre y PMTiles ya iban aparte. Lo que sí necesita el servidor —el aviso «mapa desactivado por derechos»— sale en un componente propio (`MapBlocked`, sin MapLibre), también sin JavaScript.

- **Mapa diferido** (solo `/explorar`): 462,2 KB → **465,0 KB gzip en 5 ficheros** (presupuesto 500 KB): el lienzo pasó de la carga inicial a este grupo.
- **Otras páginas** (mismo build, `check:bundle`): JS +0,1 KB (191,2 → 191,3; Inicio 192,6 → 192,7). **CSS: Inicio 10,9 → 13,4 KB y Ficha 9,8 → 12,4 KB (+2,5 KB cada una)**: al sacar el CSS del lienzo de Explorar, el agrupador de Turbopack (`cssChunking: true`, el valor por defecto, que fusiona fragmentos pequeños) lo funde en una hoja compartida con esas páginas. Siguen muy por debajo de 20 KB, pero **es un coste que paga el resto del sitio** y se declara. Se midió `experimental.cssChunking: 'graph'` (solo Turbopack, **no aplicado**): Inicio 11,2 · Explorar 14,6 · Destinos 7,6 · Ficha 9,2 · **Fuentes 9,4 (antes 6,1)** KB; reparte distinto, no mejora en conjunto y es experimental, así que no se cambia la configuración global por esto.
- **Web Vitals en móvil emulado** (Chromium 156, Pixel 5, CPU ×4, 10 Mbps / 100 ms; mediana de 5; **no es comparable 1 a 1 con M-06**: otro equipo —i7 ×12, Node 25.9— y fuentes nuevas en todo el sitio):

| Página        | FCP (ms) | LCP (ms) |   CLS | TBT≈ (ms) | Transferido (KB) | Peticiones | Mapa listo (ms) |
| ------------- | -------: | -------: | ----: | --------: | ---------------: | ---------: | --------------: |
| Inicio (es)   |      772 |      772 | 0,000 |        67 |              376 |         27 |               — |
| Explorar (es) |      656 |    2 604 | 0,000 |       562 |            1 376 |         45 |           3 660 |

- **Lectura honesta**:
  1. **El LCP de Explorar subió de ≈ 0,37 s a 2,6 s y no es un retraso del contenido**: lo observé con `PerformanceObserver`. El título y el HUD se pintan a los ≈ 0,66 s; el «mayor texto» pasa a ser el de los **créditos de MapLibre** (≈ 11 000 px², más que el título, ≈ 6 500), que aparece cuando el mapa está listo. Antes el panel lateral tenía bloques de texto mayores y el LCP se quedaba en el primer pintado. Es un efecto de cómo se mide, pero **es la cifra que verá una herramienta de laboratorio**. No se «arregla» ocultando los créditos (licencia ODbL).
  2. FCP de Inicio también sube (508 → 772 ms): es del equipo y de las fuentes nuevas, no de Explorar. Explorar transfiere +101 KB (1 275 → 1 376 KB; entran Montserrat y Playfair y las marcas); el presupuesto «ligero» de ≈ 1,5 MB se conserva.
  3. TBT sin cambio apreciable (562 frente a 564 ms).
- **Lo que NO dice**: no es hardware ni red reales; WebGL por software; **no se midió el coste de `backdrop-filter` sobre WebGL** (en una GPU real es barato; en SwiftShader encarece cada fotograma: es la razón de que las pruebas de axe de Explorar tarden 15–18 s a un trabajador y rocen el límite de 30 s con tres en paralelo); no hay INP ni FPS. **No se afirma cumplimiento de ningún presupuesto de rendimiento**, solo el de bytes de `check:bundle`.
- **Palancas no aplicadas** (sin evidencia en GPU real): quitar el `backdrop-filter` **mientras el mapa se mueve o carga** (con opacidad 0,88 el desenfoque apenas se aprecia y es lo que se vuelve a pintar en cada fotograma); en una prueba de carga con ocho ejecuciones simultáneas de Explorar, sin desenfoque cada prueba tardó ≈ 15 % menos y fallaron por plazo 0, 0 y 1 de 8 (con él, 3, 0 y 4). Diferir el arranque del mapa a un momento ocioso del hilo principal.
- **Margen que queda**: **6,6 KB de JS y 6,6 KB de CSS** en Explorar. Cierra el riesgo F3-10 de la entrega 5i (margen de 4,6 KB) **mientras lo que añadan el filtro, el buscador, las herramientas y la hoja móvil vaya en islas con `ssr: false`** (lo que entra en el HTML cuenta; lo que se carga tras hidratar, no).
- **Reproducir**: `SITE_ENV=development pnpm build && pnpm check:bundle` y `pnpm perf:vitals --runs 5 --json <ruta>`; `pnpm map:css -- --check` para la hoja recortada.

### M-09 · Explorar inmersivo, interacciones: filtro por tipo, buscador y herramientas como islas diferidas (2026-10-26)

- **Qué mide**: `pnpm check:bundle` (gzip del HTML prerrenderizado, como M-08) y, **desde esta medición**, el chunk de las islas del HUD, que `check:bundle` no veía (su JS no está en el HTML). Entrega 5j, parte «Interacciones» (ADR-0025 §8 y §11).
- **Por qué se midió**: tras M-08 quedaban **6,6 KB de JS y de CSS** en Explorar y el contrato (§11) manda que lo que añaden el filtro, el buscador y las herramientas **quepa** antes de recalibrar nada. **No hizo falta subir ningún presupuesto.**
- **Cómo se logró**: las cuatro islas (`FilterChips`, `SearchBox`, `MapTools`, `CarouselFilterStatus`) viven en UN módulo (`HudIslands.tsx`) que se importa con `next/dynamic` y `ssr: false` desde `HudIslandsLazy.tsx`: el empaquetador las emite en **un solo chunk** que se pide tras hidratar. El filtro por tipo del mapa y de la lista no necesita el almacén en la carga inicial: la lista la sigue pintando el servidor (una vez, con su enlace y su botón) y la isla solo decide qué tarjetas se ven con `hidden`. El sitio que ocupan lo reserva el CSS de la página (`--hud-search-h`, `--filter-rows`), así que al llegar nada se mueve.

| Estado                                                 | JS gzip Explorar | CSS gzip Explorar | Islas del HUD (JS, diferido) | Mapa diferido |
| ------------------------------------------------------ | ---------------: | ----------------: | ---------------------------: | ------------: |
| Final de M-08 (E1: HUD de escritorio)                  |         203,4 KB |           13,4 KB |                            — |      465,1 KB |
| **Con filtro, buscador, herramientas y recuento (E2)** |     **203,5 KB** |       **13,2 KB** |                   **3,8 KB** |  **465,9 KB** |

- **Lectura honesta**:
  1. **+0,1 KB de JS y −0,2 KB de CSS en la carga inicial**; las islas pesan **3,8 KB gzip** (11,4 KB sin comprimir) en un único fichero y se piden después de hidratar. Su CSS **sí** va en la hoja de la página (Turbopack agrupa el CSS de los módulos de `next/dynamic` con la ruta): ya está en los 13,2 KB.
  2. **Lo que `check:bundle` no medía**: un chunk diferido que no sea el mapa. Se añadió la comprobación 3b (marcador `data-hud-island` en las raíces de las islas; presupuesto `HUD_LAZY_BUDGET_KB` = 12 KB, ≈ 3 veces lo medido) y **falla si no encuentra el chunk** (un verde que no midió nada). Está cubierta por `tests/unit/scripts/check-bundle.test.ts`.
  3. **El mapa diferido sube +0,8 KB** (465,1 → 465,9): el lienzo ahora lee el almacén del filtro y atiende la orden de inclinar (presupuesto 500 KB).
  4. **Otras páginas**: sin cambio (Inicio 192,7 / 13,8; Destinos 191,3 / 13,2; Ficha 191,3 / 13,6; Fuentes 191,3 / 6,1).
- **Margen que queda en Explorar**: 6,5 KB de JS y 6,8 KB de CSS. Sigue valiendo la regla de M-08: todo lo nuevo (la hoja móvil, por ejemplo) **va en islas con `ssr: false`**; lo que entra en el HTML cuenta.
- **Web Vitals en móvil emulado** (`pnpm perf:vitals --runs 3`, mediana; datos en bruto: `docs/research/perf-m09-2026-10-26.json`): Explorar FCP 756 ms, LCP 3 524 ms, **CLS 0,000**, TBT≈ 976 ms, 1 368 KB, 41 peticiones, mapa listo 4 654 ms. **CLS 0,000 con las islas llegando tras hidratar**: lo que reservan `--hud-search-h` y `--filter-rows` es suficiente. **No es comparable con M-08** (otra hora y otra carga del equipo: Inicio, que no cambió, también subió de 772 a 988 ms de FCP), así que **no se puede decir cuánto cuestan las islas** en LCP ni en TBT con estas cifras; solo que no mueven la maquetación.
- **Lo único que sí se aisló**: el coste de las islas en el tiempo de las pruebas de axe de Explorar (`goto` + `networkidle` + axe, cinco idiomas, un trabajador, mismo equipo, build con y sin islas): **21,9 s sin islas frente a 23,2 s con ellas (+1,3 s, ≈ 6 %)**. Las tres pruebas de axe de Explorar de `a11y.a11y.spec.ts` tardan ≈ 22–27 s con un trabajador (límite 30 s) **con o sin islas**: el margen lo consume el mapa y axe, no el HUD nuevo.
- **Lo que NO dice**: no es hardware ni red reales; no hay INP ni FPS; **no es una puerta de rendimiento** en navegador real, solo de bytes.
- **Reproducir**: `SITE_ENV=development pnpm build && pnpm check:bundle`.

### M-10 · Explorar inmersivo, móvil: la hoja inferior (2026-10-26)

- **Qué mide**: `pnpm check:bundle` (gzip del HTML prerrenderizado y del chunk de las islas, como M-08 y M-09) tras añadir la hoja inferior móvil (`HudSheet`, `sheet-store`, `sheet-gesture`; ADR-0025 §8). Entrega 5j, parte «Móvil».
- **Por qué se midió**: tras M-09 quedaban **6,5 KB de JS y 6,8 KB de CSS** en Explorar y la regla de M-08/M-09 era meter lo nuevo en islas con `ssr: false`. **La hoja no puede serlo**: es la caja que envuelve las zonas del HUD y su contenido (los nueve enlaces del carrusel, el título, el panel) tiene que estar en el HTML del servidor (es la alternativa al mapa y funciona sin JavaScript); un componente `ssr: false` no pintaría sus hijos en el servidor. Se importa de forma estática y solo se le pidió que cupiera. **No hizo falta subir ningún presupuesto.**

| Estado                                              | JS gzip Explorar | CSS gzip Explorar | Islas del HUD (JS, diferido) | Mapa diferido |
| --------------------------------------------------- | ---------------: | ----------------: | ---------------------------: | ------------: |
| Final de M-09 (E2: filtro, buscador y herramientas) |         203,5 KB |           13,2 KB |                       3,8 KB |      465,9 KB |
| **Con la hoja inferior móvil (E3)**                 |     **205,0 KB** |       **14,1 KB** |                   **3,9 KB** |  **461,2 KB** |

- **Lectura honesta**:
  1. **+1,5 KB de JS y +0,9 KB de CSS en la carga inicial** de Explorar. La parte de JS es el asa (botón, Escape, arrastre), el resumen del destino y los almacenes de la hoja y del tamaño de pantalla. **Margen que queda: 5,0 KB de JS y 5,9 KB de CSS.** Palanca no aplicada, por si hiciera falta: sacar el arrastre y el resumen (≈ 0,7 KB) al chunk diferido de las islas.
  2. **El CSS de la hoja lo pagan también Inicio, Destinos y Ficha (+0,8, +0,9 y +0,8 KB)**: Turbopack funde los fragmentos pequeños de CSS en una hoja compartida (el mismo efecto que M-08 declaró para el lienzo). Inicio 13,8 → 14,6 · Destinos 13,2 → 14,1 · Ficha 13,6 → 14,4 · Fuentes 6,1 (sin cambio) KB; todos muy por debajo de 20.
  3. **El mapa diferido baja 4,7 KB (465,9 → 461,2) y no sé por qué.** Descartado que sea desactivar los gestos cooperativos (se midió con ellos activados: 461,2 igual). La hipótesis es que los módulos que ahora importa también la hoja (`hud-store`, `use-map-url-state`, los almacenes) pasaron de ese grupo al chunk común de la página (+1,5 KB allí), pero **no la he comprobado**.
  4. **Las islas del HUD**: 3,8 → 3,9 KB (el botón «Capas y leyenda» ahora también abre la hoja).
- **Reservas de maquetación (CLS)**: la hoja cerrada ocupa el mismo sitio antes y después de hidratar (el asa tiene su hueco reservado como `<span>` decorativo y el botón lo sustituye; el cuerpo mide 0 en los dos estados) y se anima solo `block-size` del cuerpo con una acción de la persona.
- **Web Vitals en móvil emulado** (`pnpm perf:vitals --runs 3`, mediana; datos en bruto: `docs/research/perf-m10-2026-10-26.json`; mismo equipo y método que M-08/M-09, **no comparable** con ellos 1 a 1 por la carga del equipo): Explorar FCP 640 ms, LCP 2 940 ms, **CLS 0,000**, TBT≈ 573 ms, 1 279 KB, 49 peticiones, mapa listo 3 764 ms; Inicio FCP 824 ms, CLS 0,000.
  1. **La primera medición dio CLS 0,040** (E2: 0,000): plegar los créditos de MapLibre al terminar de cargar movía los controles de la esquina inferior derecha (393×62 → 50×38 px a los 2 483 ms). Lo vi con un `PerformanceObserver` de `layout-shift`; **ningún E2E ni `check:bundle` lo habría visto**. Se pliegan ahora en cuanto MapLibre los abre (`MutationObserver`, en la misma microtarea y antes del primer dibujo): **CLS 0,000**, con una prueba E2E que mide los `layout-shift` y que falla contra la versión anterior (E-96).
  2. El LCP sigue siendo el de los créditos del mapa (M-08, lectura 1); TBT sin cambio apreciable.
- **Lo que NO dice**: no es hardware ni red reales; WebGL por software; no hay INP ni FPS de la animación de la hoja (que anima `block-size`, una propiedad de maquetación: sobre un mapa WebGL en un móvil real podría notarse; la alternativa sin coste de maquetación sería `transform`, pero obliga a un contenedor recortado o a un cuerpo de alto fijo —lo que prohíbe WCAG 1.4.12— y se descartó); **no se afirma cumplimiento de ningún presupuesto de rendimiento**, solo el de bytes de `check:bundle`.
- **Reproducir**: `SITE_ENV=development pnpm build && pnpm check:bundle`.

**Cierre de la entrega 5j (revisión final, 2026-10-26)**: tras el carril de ≥ 80rem (`@media (min-width: 80rem)` en `page.module.css`) y la regla de la hoja sin JavaScript, `pnpm check:bundle` da **Explorar 205,0 KB de JS y 14,1 KB de CSS (sin cambio)**, Inicio 192,7 / 14,7 (+0,1 KB de CSS), Destinos 191,3 / 14,1, Ficha 191,3 / 14,5 (+0,1), Fuentes 191,3 / 6,1; islas del HUD 3,9 KB; mapa diferido 461,2 KB. **En ninguna parte de la entrega se subió un presupuesto** (210 KB de JS y 20 KB de CSS por página, 12 KB de islas, 500 KB de mapa): no hizo falta recalibrar nada y, por tanto, no hay recalibración que justificar. Margen final de Explorar: **5,0 KB de JS y 5,9 KB de CSS**. No se repitió `pnpm perf:vitals` en el cierre: los cambios son CSS de escritorio ≥ 80rem y de la hoja sin JavaScript y no tocan la medición móvil emulada de M-10 (CLS 0,000; LCP 2 940 ms por los créditos del mapa). Lo que sí costó el carril ancho es **maquetación, no bytes**: con un destino elegido a 1280×800 el carrusel mide 410 px, parte su cabecera en dos líneas y el dock pasa de 198 a 234 px (el hueco libre, de 386 a 362 px).
