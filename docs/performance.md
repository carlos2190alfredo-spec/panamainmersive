# Rendimiento y accesibilidad

> Los números de esta página son **presupuestos y objetivos**, no resultados. Los resultados medidos se registran aparte en la sección «Mediciones» con fecha, dispositivo, red y qué incluye cada medición. Hoy **no hay mediciones**.

## Presupuestos iniciales (del documento rector)

| Métrica | Presupuesto | Qué incluye la medición |
| --- | --- | --- |
| LCP público, p75 | ≤ 2,5 s | Página pública (home/destino) en dispositivo y red de referencia |
| INP, p75 | ≤ 200 ms | Interacciones del panel y selector de idioma |
| CLS | ≤ 0,1 | Carga inicial, incluido el reservado del mapa |
| Mapa 2D utilizable | ≤ 3 s | Hasta que se puede arrastrar/acercar con capa base visible |
| Primera vista 3D útil | ≤ 6 s | Solo si se activa 3D (hoy: relieve MapLibre) |
| Respuesta visual a una acción | ≤ 200 ms | Clic/tecla → cambio visible |
| Nueva vista de destino | 2–4 s | Vuelo + datos del destino |
| Fluidez escritorio / móvil | 60 FPS / ≥ 30 FPS estables | Durante pan/zoom |
| API búsqueda/detalle, p95 | ≤ 500 ms | En servidor, sin red cliente |
| Routing (servicio caliente), p95 | ≤ 1,5 s | Cuando exista |

### Dispositivo y red de referencia [propuesta, a confirmar]

- **Móvil de referencia**: un Android de gama media de ~2021 (emulado con *CPU throttling* 4× en Chromium hasta tener hardware real).
- **Red**: 10 Mbps, 100 ms RTT (perfil de Lighthouse/Playwright *slow 4G* ajustado).
- Resultados con hardware **real** pendientes; hasta entonces se etiquetan «emulado».

### Presupuestos de transferencia por modo

| Modo | Primer recorrido útil | Notas |
| --- | --- | --- |
| **Ligero** (MVP) | ≈ **1,5 MB** (JS + CSS + fuentes + primeras teselas) | Punto de partida del documento rector; se ajusta con evidencia |
| **3D** | ≈ **6 MB** | **No verificado como realista** con Cesium completo (ver architecture A5) |

Descargas posteriores (más teselas, medios) **no se esconden**: se miden y se declaran por separado.

## Cómo se medirá

| Qué | Cómo |
| --- | --- |
| Bundle JS por ruta | Salida de `next build` + analizador; **falla** si una ruta pública excede el presupuesto (prueba) |
| Transferencia del primer recorrido | Playwright + CDP (`Network.loadingFinished`) con red limitada |
| Mapa utilizable | Marca `performance.mark` desde navegación hasta primer `idle` del mapa con capa base |
| Frame time / FPS | `requestAnimationFrame` muestreado durante un recorrido guionizado |
| Errores de teselas, pérdida de contexto GL, *fallbacks* | Eventos del mapa → contadores locales (sin PII) |
| Memoria | **No** se depende de `performance.memory` (no universal); se observan errores y pérdida de contexto |
| Descargas / coste por sesión | Agregado de bytes por origen en el recorrido de prueba |

## Técnicas obligatorias

Carga progresiva, `lazy loading` del mapa (no bloquea el LCP del texto), división de bundles, un solo visor pesado, cancelación de solicitudes obsoletas, `requestRenderMode`/render bajo demanda cuando aplique, clustering/culling/LOD, imágenes autorizadas optimizadas, prioridad de solicitudes, **no repetir cálculos GIS pesados por frame**, workers donde ayuden.

## Accesibilidad (WCAG 2.2 AA)

Flujos implementados: teclado completo, foco visible y gestionado, contraste (**probado** sobre los tokens), textos alternativos, anuncios `aria-live`, controles etiquetados, `prefers-reduced-motion`, **alternativa textual al mapa**, objetivos táctiles ≥ 24×24 px (2.5.8), sin trampas de foco, reflow a 320 px (1.4.10). Se comprueba con axe y manualmente en **los cinco idiomas**. Un lienzo WebGL no es accesible por sí mismo: la lista de destinos y entidades es la vía **equivalente**, no un complemento.

## Mediciones

*(vacío — se rellena con fecha, commit, dispositivo emulado/real, red, y qué incluye cada medición)*
