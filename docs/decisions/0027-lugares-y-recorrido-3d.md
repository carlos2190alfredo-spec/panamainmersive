# 0027 — Lugares y recorrido 3D: ampliar lo abierto ahora, 3D fotorrealista solo donde se verifique

- Estado: Aceptada (la persona propietaria eligió «A, luego B» el 2026-11-11)
- Fecha: 2026-11-11
- Completa a: ADR-0004 (sus tres condiciones para activar Cesium **no cambian**), ADR-0007 (derechos y cobertura), ADR-0014 (relieve opt-in), ADR-0024 (Experience Resolver); PROMPT-MAESTRO §3, §8–10 y §22 (Fases 5–7)
- Numeración: el 0026 queda para la Travesía (rama `feat/travesia`, citado en `src/domains/tourism/travesia.ts`)
- Evidencia: E-101 a E-105 (`docs/research/evidence-log.md`) y `docs/research/places-probe-2026-11-11.json`

## Contexto

Petición de la persona propietaria (2026-11-11): que la plataforma sea un mapa interactivo y que, al tocar un lugar, este se abra en 3D con un recorrido 3D; que también aparezcan la información del lugar y sus actividades, restaurantes y hoteles.

**Lo que ya existe.** Explorar: MapLibre, marcadores de los nueve destinos, ficha al elegir uno y «Relieve en 3D» (opt-in) con el terreno de AWS (≈ 30 m, sin imagen satelital): se ven las montañas, no los edificios (el Casco Antiguo sale plano). En producción el mapa y el relieve están **bloqueados** porque las políticas de derechos son `provisional` (L-01).

**Hechos que condicionan la decisión** (fiabilidad entre paréntesis):

1. **La cobertura fotorrealista de Google en Panamá es `UNKNOWN`** (E-30 sigue vigente). Google habla de «más de 49 países» sin publicar la lista; la página de cobertura de 3D Maps distingue el terreno (mundial) de la superficie fotorrealista (solo en zonas marcadas). Solo se resuelve con una clave y un sondeo por destino (E-103, S).
2. **Los lugares de Google Places solo pueden mostrarse sobre un mapa de Google**: su página de políticas prohíbe usarlos en un mapa que no lo sea (E-103, S). Con el mapa base de MapLibre, Places queda fuera.
3. **Las teselas 3D de Google** se dibujan con CesiumJS o deck.gl; admiten datos propios encima si la atribución de Google no queda tapada, y no se pueden cachear ni usar sin conexión (E-31, E-103, S).
4. **Precios** (E-104, S; sin confirmar para 2026): Map Tiles API, 1 000 solicitudes de tesela raíz gratis al mes y después 6 USD por cada 1 000; Cesium ion Community solo para uso no comercial, Commercial desde 149 USD al mes.
5. **Overture Places en Panamá** (E-101, P, sondeo propio): hay volumen en los destinos urbanos y de playa, **nada útil** en Coiba ni en la cumbre del Barú, el 96 % viene de un solo proveedor (Meta), casi ningún registro dice si el negocio sigue abierto y la mayoría trae teléfono o correo (datos personales).
6. **Afiliados** (E-105, S): Viator da acceso básico gratuito e inmediato (la compra se completa en viator.com); la Demand API de Booking.com exige un contrato de afiliado gestionado; la Content API de Tripadvisor da 5 000 llamadas gratis al mes con requisitos de presentación estrictos.

## Decisión

**A ahora, B solo donde se verifique.** B es A más un módulo: no sustituye nada, así que empezar por A no se pierde.

### A1 — Recorrido 3D sobre el relieve (MapLibre)

1. **Qué es, dicho con honestidad**: un vuelo de cámara guiado sobre el terreno del destino. **No** es un paseo a nivel de calle ni un recorrido por interiores (eso exige panoramas de Street View/Mapillary, Fase 5, o captura propia, prohibida por el rector §2).
2. **Lo inicia la persona** con un botón en la ficha; la cámara nunca se mueve sola (ADR-0018).
3. **Primera versión sin datos nuevos**: aproximación y órbita sobre el **ancla y el encuadre** del destino, que ya tienen fuente (`data/anchors/destination-anchors.json`). Las paradas concretas (miradores, playas, museos) solo cuando existan **con fuente y clave estable**; nunca coordenadas escritas a mano.
4. **Activa el relieve**, así que lleva el **mismo aviso previo** que «Relieve en 3D» (opt-in: sin pulsar, cero peticiones a AWS).
5. **Se cancela** con cualquier interacción; con `prefers-reduced-motion` va por pasos («anterior»/«siguiente») sin animación; no empieza hasta que el mapa está `ready` (lo que se anima mientras arranca le cuesta `ready`, M-11).
6. **El destino queda a la vista**: el ancla cae en el centro del hueco que el HUD deja libre (`offset` de MapLibre, medido en cada paso; **no** `padding`, que persiste en el mapa). En móvil, pulsar **pliega la hoja inferior** y el foco pasa a su asa.
7. **El guion es lógica pura** en `src/domains/experience/` (sin reloj ni red: la duración llega como parámetro) y el visor solo ejecuta comandos. Va en un trozo diferido: no entra en la carga inicial de Explorar (margen ≈ 4,6 KB, F3-10).

### A2 — Lugares: actividades, dónde comer y dónde dormir (Overture Places)

1. **Pestañas en la ficha y una capa en el mapa.** Cada lugar se muestra como **«Sin verificar»**, con su fuente (proveedor y licencia por registro).
2. **Sin teléfonos, correos ni redes sociales** hasta la revisión de privacidad (L-04). **Sin horarios ni «abierto ahora»**: la fuente casi nunca dice si el negocio sigue funcionando (E-101).
3. **Por clave estable** (`id` de Overture) y una proximidad **declarada** al ancla del destino, **nunca por nombre** (hay homónimos: E-102).
4. **Filtro mínimo** (propuesta, sin validar): categorías de una **lista cerrada** (la del sondeo, `pipelines/spikes/places_probe.py`) y una confianza mínima por decidir mirando una muestra a mano. `historic_site` (1 216 en Panamá) no entra sin revisión.
5. **Sin datos, se dice**: en Coiba, Santa Catalina (hasta corregir su ancla, E-102) o la cumbre del Barú la pestaña dice que no hay datos; no se rellena.
6. **Datos estáticos** como el mapa base: el pipeline genera la capa (PMTiles, ADR-0005/0014) con una puerta de verificación. Las tablas `businesses` y `activities` (Fases 6–7) siguen siendo para lo **verificado**: Overture es la semilla, no el catálogo.
7. **Producción bloqueada** mientras la política de Overture Places sea `provisional` (L-01).

### A3 — Actividades comerciales (afiliados)

Viator como **enlace de afiliado etiquetado** («Ofrecido por Viator») si la persona propietaria abre la cuenta. Un enlace externo **no** es disponibilidad ni reserva (rector §15: un enlace externo de reserva no representa inventario disponible). Booking.com y Tripadvisor quedan **diferidos** (contrato; requisitos de presentación).

### B — Modo 3D fotorrealista (CesiumJS + Google Photorealistic 3D Tiles), por destino

Se activa en un destino **solo si se cumplen todas**:

1. Las tres condiciones de ADR-0004: cobertura **VERIFIED** de ese destino en `visual_coverage`, credencial válida y medición de bundle y memoria dentro del presupuesto.
2. **Tope de gasto y _circuit breaker_** antes de encenderlo (`docs/costs.md` §5): una alerta de presupuesto no es un límite.
3. **Experience Resolver cableado** a Explorar (F5-3) para elegir `PHOTOREALISTIC_3D` y degradar a A sin perder destino, cámara ni idioma.
4. **Política de derechos de Google registrada** (mostrar con logo y atribución por tesela; sin caché ni uso sin conexión).

Un solo visor pesado a la vez; en móvil, nunca Cesium y MapLibre completos juntos (rector §8).

**Sondeo previo** (necesita una clave de Google Maps Platform con facturación: decisión de la persona propietaria): para cada ancla, recorrer el árbol de teselas hasta el punto y registrar el menor error geométrico alcanzado, más una captura revisada a mano. Son ≈ 9–20 solicitudes de tesela raíz, dentro del tramo gratuito declarado (E-104, sin confirmar).

### Orden de trabajo

1. Sondeo de Overture Places (**hecho**, E-101).
2. Sondeo de Google 3D (bloqueado por la clave).
3. A1, el recorrido sobre el relieve (**hecho en local**, 2026-11-11: ver `docs/progress.md`; sin dispositivo real ni CI todavía).
4. A2, los lugares sin verificar.
5. A3, los afiliados (bloqueado por la cuenta).
6. B en los destinos verificados.

## Alternativas descartadas

- **C — Todo Google** (3D Maps de Maps JavaScript API + Places + Street View). Es lo más rápido para ver fotorrealismo y fichas con fotos y horarios, pero vuelve a Google **indispensable** (rector §2: el producto debe sobrevivir sin él); Places obliga a un mapa de Google y eso supone **rehacer Explorar** (MapLibre, PMTiles, HUD y cientos de pruebas); y sus datos no se pueden guardar ni pasar por el modelo de contenido con evidencia (ADR-0019).
- **Google Places sobre nuestro mapa**: prohibido por su política (E-103).
- **Captura propia** (drones, fotogrametría, _Gaussian splats_, 360): prohibida por el rector §2.
- **deck.gl (`Tile3DLayer`) dentro de MapLibre en vez de Cesium.** Sería un solo visor y más ligero, pero mezcla las teselas de Google con nuestro mapa base en el mismo lienzo. Queda como **variante de B** que se evalúa cuando los términos estén leídos en la fuente primaria.

## Matriz ponderada

Calculada con la matriz del _skill_ de arquitectura. Los pesos salen de la petición y del rector:

| Criterio                    | Peso | A (abierto) | B (híbrido) | C (todo Google) |
| --------------------------- | ---: | ----------: | ----------: | --------------: |
| Realismo 3D                 |   20 |           2 |           4 |               5 |
| Cumple el rector y derechos |   20 |           4 |           4 |               1 |
| Reutiliza lo construido     |   15 |           5 |           4 |               1 |
| Información de lugares      |   15 |           3 |           3 |               4 |
| Costo y previsibilidad      |   10 |           5 |           3 |               2 |
| Rendimiento en móvil        |   10 |           4 |           3 |               3 |
| Plazo de la primera versión |   10 |           4 |           3 |               2 |
| **Total (0–100)**           |      |      **74** |      **71** |          **53** |

Moviendo cada peso un ±20 % el orden se mantiene, pero entre A y B solo hay 3 puntos: deciden **el riesgo y la reversibilidad**. B incluye A y su ventaja depende de una cobertura sin verificar. Las puntuaciones son juicio mío, no mediciones.

## Consecuencias

- **Mensajes nuevos en los cinco idiomas** (botón y pasos del recorrido, pestañas, «Sin verificar», «Ofrecido por…»), con las pruebas de paridad e ICU.
- **Una capa nueva en el registro** (ADR-0017) con su leyenda y sus clases CSS; los lugares son **entrada hostil**: nombres limpios y pintados como texto (ADR-0018).
- **Privacidad**: el extracto completo de Overture Places trae teléfonos y correos; **no se versiona** (el repositorio es público) y el pipeline los descarta antes de teselar.
- **Costo**: A ≈ 0 de infraestructura; B crece de forma lineal con las sesiones 3D (`docs/costs.md`, sensibilidad A).
- **Hallazgo colateral** (E-102): el ancla de `santa-catalina` apunta a una localidad homónima a ≈ 56 km del pueblo turístico. Hay que corregirla, por ID, antes de enseñar lugares allí.

## Revisar cuando

- El sondeo de Google 3D da `VERIFIED` en algún destino (B en esos destinos) o `UNAVAILABLE` en todos (B en suspenso).
- Una muestra revisada a mano muestra que Overture Places no sirve (adelantar el catálogo propio, Fase 6).
- Cambian los términos de Google (Places sobre mapas ajenos, teselas 3D) o los precios.
- Se decide vender o reservar (el rector lo trata como extensión futura).
