# 0017 — Layer Engine y Legend Engine declarativos

- Estado: Aceptada
- Fecha: 2026-10-21
- Relacionadas: ADR-0004 (motor de mapa), ADR-0014 (basemap), ADR-0016 (API espacial), `docs/gis.md` §6 y §13

## Contexto

Hasta la Fase 3.b el estilo del mapa era un bloque imperativo (`buildMapStyle`) y la leyenda se escribía aparte (`buildLegend`). El comentario del código decía que la leyenda «se deriva de las mismas reglas que el estilo», pero **era una copia manual** y ya divergía: los guiones del mapa eran `[5,2]` y `[1,2]` y los de la leyenda `6 3` y `1.5 3`; la muestra de áreas protegidas tenía el trazo discontinuo (`stroke-dasharray: 4 2`) **horneado en una clase CSS**, mientras el mapa usaba `[3,2]`. Además solo había tres capas seleccionables (áreas protegidas y dos de relieve): fronteras, ríos, cobertura del suelo y lugares estaban siempre activas y la persona no podía apagarlas.

## Decisión

1. **Un registro declarativo en código puro** (`src/domains/geography/layers.ts`). Cada capa declara: `id` estable (valor de `l` en la URL y base de las claves `Map.layers.<id>.*`), `group` (`base` siempre activa · `firstParty` · `thirdParty`), `defaultOn`, `priority` (orden de dibujo), `geometry`, `source` (id, **sujeto de la política de derechos**, atribución y **de dónde sale su versión**), `minzoom`/`maxzoom`, `picking`, `rules` y `legend`.
2. **Símbolo compartido por estilo y leyenda.** Una regla _simbolizada_ declara color de paleta, grosor, opacidad y trazo **una vez**; de ella salen la capa de MapLibre **y** la muestra de la leyenda. Una entrada de leyenda con `fromRule` recibe **la misma referencia** al símbolo de la regla (prueba), así que no pueden divergir. Las reglas que no se pueden expresar así (etiquetas, interpolaciones, relieve) son `custom`, **declaran las capas que emiten** (`emits`, comprobado contra lo que `build` produce) y su muestra de leyenda es explícita.
3. **Un único motor.** `buildMapStyle` y `buildLegend` son capas finas sobre `styleLayersFor` y `legendFor`. El estilo se compone de abajo arriba por `priority` (tierra 10 → cobertura 20 → relieve 30 → fronteras 40 → agua 50 → ríos 60 → áreas protegidas 70 → lugares 80); el océano sigue **encima** del relieve (E-25). La leyenda va en orden inverso (la capa de más arriba primero), cada entrada con texto, no solo color.
4. **Más capas seleccionables.** Ahora son seleccionables siete: `protectedAreas`, `boundaries`, `places`, `waterways`, `landcover` (propias, **activas por defecto**) y `hillshade`, `terrain3d` (de un tercero, **nunca por defecto**). Las capas base (`land`, `water`) no se pueden apagar.
5. **`l` es la lista completa de capas seleccionables activas** (antes: «extras»). Sin `l`, mandan los valores por defecto. Un enlace antiguo con `l=protectedAreas` sigue siendo válido pero ahora significa «solo esas» (sin fronteras, lugares, ríos ni cobertura). **Aceptado** porque no hay enlaces públicos (nada está publicado, L-01); queda probado y documentado.
6. **Selección por clic declarada solo donde es real.** Únicamente `protectedAreas` declara `picking` (`styleLayerIds: ['protected-fill']`, `idProperty: 'ovid'`); la propiedad `ovid` (ID de Overture) **existe en las teselas** (la escribe `build_basemap.py`, comprobado por una prueba de contrato). La interacción en sí es de la F3.d. Ninguna otra capa promete una ficha que no existe.
7. **La versión de la fuente no se copia.** El registro declara `version: { from: 'manifest', field: 'release' }` (el manifiesto del PMTiles es un artefacto de compilación) o `{ from: 'none', reason }` (el relieve de AWS no publica versiones, E-48).
8. **Muestras de leyenda dibujadas desde el símbolo.** El componente usa color, opacidad, grosor y trazo del símbolo (el trazo se escala con el grosor, como en el mapa). Los colores van por **clases** con convención `fill<Clave>` / `stroke<Clave>` (la CSP prohíbe `style=""`); una prueba unitaria exige que el CSS tenga la clase de **cada** muestra del registro y un E2E comprueba el color calculado en tema claro y oscuro (un SVG sin clase se pinta de negro).
9. **Observabilidad del estado real del mapa.** `MapStage` vuelca `data-style-layers` = `map.getLayersOrder()` (lo que MapLibre tiene tras el diff de estilo, no lo que se pidió); los E2E lo usan para comprobar que apagar una capa quita **exactamente** sus capas.
10. **Textos.** 4 capas y 6 entradas de leyenda nuevas en los cinco idiomas (mismo estado editorial que el resto de la interfaz: español `draft`, el resto traducción automática sin revisión). Una prueba exige nombre y descripción de cada capa y texto de cada entrada de leyenda en los cinco idiomas.

## Alternativas descartadas

| Alternativa                                                                  | Por qué no                                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tablas `layers`, `layer_translations`, `style_versions` en la BD             | Nadie edita capas en caliente; añade migraciones, RLS y un viaje a la BD para pintar el mapa. Las traducciones ya viven en `messages/*.json`. **DEFERRED** (siguen PLANIFICADAS en `data-model.md`)  |
| Reglas 100 % datos (JSON con referencias a la paleta)                        | Las expresiones de MapLibre (interpolaciones, `match`, `coalesce` por idioma) y las etiquetas no caben sin reimplementar un lenguaje; se prefirió el símbolo compartido + reglas `custom` declaradas |
| Mantener la leyenda a mano «con cuidado»                                     | Es lo que ya había y ya divergía                                                                                                                                                                     |
| Derivar la leyenda leyendo el estilo ya resuelto de MapLibre                 | Los colores del estilo son hexadecimales sin la clave de paleta, que necesita el CSS (CSP sin `style=""`)                                                                                            |
| Conservar el significado antiguo de `l` («extras») y añadir un parámetro `o` | Dos parámetros para lo mismo; sin enlaces públicos que proteger, es complejidad sin beneficio                                                                                                        |

## Consecuencias

- **Refactor sin cambios visibles, demostrado**: antes de tocar nada se volcó el estilo de las 40 combinaciones (5 idiomas × 8 conjuntos de capas) y el motor nuevo produce el **mismo** estilo en las 40 (comparación profunda, incluyendo el orden de capas). Las pruebas unitarias del estilo cambian de **entradas** (las capas propias ahora hay que activarlas), no de afirmaciones.
- **Tamaño**: Explorar 199,9 → **201,4 KB**; mapa diferido 455,4 → **456,8 KB** (+1,4 KB en cada uno: el registro y el nuevo componente). Dentro de presupuesto (210 / 500 KB).
- **La leyenda no es sensible al zoom**: lista lo que cada capa activa dibuja, no lo que se ve a ese zoom (p. ej. «Bosque» aparece aunque la cobertura del suelo solo se dibuja desde el zoom 8). El registro conoce `minzoom`; falta que la leyenda lo use. **DEFERRED**.
- La leyenda crece (12 entradas con todo activo). Se verificó en móvil (E2E) sin desbordes; no se ha evaluado con personas usuarias ni lectores de pantalla reales.
- Cada interruptor reaplica el estilo con `setStyle(…, { diff: true })`; no se ha medido el coste en dispositivos reales.

## Evidencia

Pruebas: `tests/unit/domains/layers.test.ts` (23: ids/prioridades únicos, `emits` = lo construido, `minzoom` derivado de las reglas, orden por prioridad, apagar = quitar exactamente, 128 combinaciones válidas con el validador oficial, leyenda `fromRule` por referencia, mensajes y clases CSS por muestra, contrato de `ovid` con el pipeline, URL), `tests/unit/domains/map-style.test.ts`, `e2e/map.spec.ts` (7 nuevos: valores por defecto, 4 interruptores, color de las muestras en claro y oscuro). Mutaciones comprobadas: quitar la clase CSS de una muestra (unitaria y E2E), `boundaries` ignorando su interruptor (3 unitarias). Una prueba de derivación **cazó un error mío** en el registro: `places` declaraba `minzoom: 5` pero las etiquetas de región se dibujan desde el zoom 0.

## Revisar cuando

- Haya que editar capas sin desplegar (entonces, tablas en la BD con versionado de estilo).
- Se añadan capas desde la API espacial (F3.d en adelante): el registro necesitará un origen `geojson` además de `vector` y `raster-dem`.
- Se evalúe la leyenda con personas usuarias o se quiera hacerla sensible al zoom.
