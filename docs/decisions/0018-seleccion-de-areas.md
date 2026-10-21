# 0018 — Selección de áreas en el mapa: clic y lista por teclado equivalentes, ficha en dos niveles de verdad

- Estado: Aceptada
- Fecha: 2026-10-21
- Relacionadas: ADR-0014 (mapa), ADR-0016 (API espacial), ADR-0017 (registro de capas), `docs/gis.md` §14

## Contexto

Con el mapa, el registro de capas y la API espacial ya existentes, falta lo que une todo: que una persona pueda **elegir un área protegida** y ver qué se sabe de ella, sin que la interfaz afirme más de lo que hay. Tres tensiones: (1) el clic es una interacción de puntero y la accesibilidad exige una alternativa de teclado **equivalente**; (2) las teselas llevan el ID de **Overture** (`ovid`), no el UUID interno de la BD, y la BD puede no estar (hoy ningún despliegue la tiene) o no tener publicada el área; (3) lo único verificable de un área es poco (nombre local de la fuente, que es OSM derivado, y —si hay BD— superficie con método, fuente, versión y licencia): **no hay** datos verificados de actividades, accesos ni restricciones.

## Decisión

1. **La selección es estado de la URL**: `a=<ID de Overture>` (UUID, validado como `d`, `c` y `l`: lo inválido se descarta con aviso y nunca se «corrige»; jamás un nombre). Elegir añade una entrada de historial (Atrás la deshace); elegir un **destino** descarta el área (otro contexto); quitar el destino la conserva. El selector de idioma ya conserva toda la query.
2. **Clic** (`MapStage`): consulta `queryRenderedFeatures` sobre las capas que el **registro** declara seleccionables (`picking.styleLayerIds`, propiedad `ovid`, comprobada contra el pipeline). Solo cuenta si el clic cae sobre el **lienzo** (un clic en el marcador de un destino o en un control no selecciona el área de debajo). Con áreas **superpuestas** (en la vista de Coiba hay varias áreas protegidas con nombre) se elige la de más arriba; las demás se eligen desde la lista.
3. **Lista por teclado equivalente** (`AreasInView`): las áreas que el mapa **dibuja en la vista actual**, como botones (`aria-pressed`, ≥ 44 px), con el mismo efecto que el clic (escribe `a`). Se publica al terminar cada movimiento; ordenada con las reglas del idioma (Ñ, números como números), las **sin nombre al final** y por ID (determinista); acotada a 30 con el **total real** informado y la indicación de acercar. Dice cuándo no hay lista y por qué (capa apagada, mapa no disponible, aún sin dibujar, vacía).
4. **Resalte** declarado en el registro de capas: contorno **sólido y grueso con halo** (no depende solo del color) sobre el borde discontinuo y fino. Cambiar la selección solo cambia el **filtro** de dos capas (`setFilter`), sin reaplicar el estilo entero (lo que además evita ocultar sin querer el aviso de un relieve fallido); el estilo también recibe la selección para no perderla al cambiar idioma, tema o capas.
5. **La ficha tiene dos niveles de verdad.** Siempre: lo que lleva el mapa (el nombre local de la tesela y la frase «el mapa base deriva de OpenStreetMap vía Overture; no es un límite oficial»). Si hay datos de la BD (`GET /api/spatial/areas/by-overture/{ovid}`, ADR-0016): superficie **con su método**, versión de la geometría, fuente, versión, fecha de obtención, licencia (enlace **solo `https:`**, `noopener`) y estado de derechos, y el nombre con su procedencia. Estados explícitos: cargando · **no disponible** (sin BD, red, tiempo o respuesta con forma inesperada) · **bloqueada** por derechos · **sin ficha publicada** (el 404 es el mismo para inexistente, no público e inválida). **Siempre** se dice: «no hay datos verificados de actividades, restricciones de acceso ni cómo llegar».
6. **Desconocido ≠ sin nombre.** Solo se escribe «sin nombre en la fuente» cuando **se sabe** (la API lo dice o la tesela se vio sin nombre); con un enlace cuyo nombre aún no conocemos el título es neutro («Área protegida seleccionada»).
7. **Encuadre explícito.** Un botón «Mostrar el área en el mapa» (desde la geometría de la ficha) pide el encuadre al lienzo por un almacén mínimo; **la cámara nunca se mueve sola** (respeta `prefers-reduced-motion`).
8. **La respuesta de la API se valida en el cliente con un validador escrito a mano**, no con zod: zod 4 sondea `new Function` al construir un esquema y bajo nuestra CSP (sin `unsafe-eval`) eso dispara una violación `script-src eval` aunque se capture (E-51). Además el validador y el componente que dibuja los datos se cargan **de forma diferida** (solo cuando llega una ficha).
9. **Endpoint nuevo `/api/spatial/areas/by-overture/{ovid}`** que reutiliza la lógica de la ficha (misma RLS, mismos derechos, mismas respuestas); la ruta estática tiene prioridad sobre `areas/[id]`.

## Alternativas descartadas

| Alternativa                                           | Por qué no                                                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolver el clic con `/api/spatial/locate` (BD)       | Sin BD no habría selección; la tesela ya trae el `ovid` y el nombre. La BD enriquece, no es requisito                                          |
| Elegir la de menor superficie entre las superpuestas  | La tesela solo trae trozos recortados: no se puede medir; con BD sería posible pero acopla el clic a la red. Se documenta y se ofrece la lista |
| Mover la cámara al elegir de la lista                 | El área ya está en la vista; mover sin que se pida desorienta y rompe `prefers-reduced-motion` por defecto                                     |
| Popup sobre el mapa en lugar de una ficha en el panel | Un popup no es una región con foco ni se lee bien; el panel es el patrón ya usado para destinos y es accesible por teclado                     |
| Parámetro `area=<slug>`                               | Un nombre no es identidad (homonimias, E-41); el ID es estable                                                                                 |
| zod en el cliente con `z.config({ jitless: true })`   | Funciona pero lleva zod al navegador (peso) para validar una forma pequeña; el validador a mano es más pequeño y sin sondeos de `eval`         |
| Mostrar siempre «sin nombre» si falta el nombre       | Afirma una ausencia que no se ha comprobado                                                                                                    |

## Consecuencias

- **JS inicial de Explorar: 201,4 → 205,4 KB** (presupuesto 210; margen ≈ 4,6 KB) y mapa diferido 456,8 → 460,7 KB (presupuesto 500). El chunk de la página crece (de 8,8 a 14,2 KB desde F3.b); el componente de datos (≈ 1,8 KB gzip) **no** está en el HTML inicial, pero la medición total no baja, así que el resto del código nuevo es el que pesa. **Riesgo registrado** (F3-10): la próxima mejora de Explorar exige diferir el panel o recalibrar el presupuesto con evidencia.
- **Áreas superpuestas**: el clic elige la de más arriba (puede no ser la más específica). La lista es la vía completa.
- **La lista solo contiene lo dibujado** (puede haber más fuera de la vista o por debajo de 30) y no se ha evaluado con lectores de pantalla reales ni con personas usuarias.
- **Con la política `provisional` el mapa se bloquea en producción** (ADR-0014), así que allí no hay selección ni ficha; la API responde 403 por su parte (ADR-0016).
- La ficha con datos de la BD **no se ha probado contra una base remota ni con un _pooler_**; sí contra PostgreSQL+PostGIS temporal con las 137 áreas reales.

## Evidencia

E-51 (zod y CSP). Pruebas: `tests/unit/domains/area-selection.test.ts` (41: IDs hostiles, candidatos deduplicados y ordenados por idioma, nombres con control/HTML/longitud, caja envolvente con anidamiento enorme, validador de la respuesta, `https` solo), `map-url-state.test.ts` (`a`), `layers.test.ts` (resalte: solo cambia su filtro, sólido y grueso, `pickableLayers`), handlers y `spatial-api.test.ts` (by-overture con RLS y derechos), `e2e/map-areas*.spec.ts` (13: lista por teclado, clic, marcador, historial, destino vs área, título neutro, `a` hostil, capa apagada, inglés, axe claro/oscuro, móvil) y `e2e-db/area-card.spec.ts` (7: ficha contra la API con PostGIS real, enlace profundo, encuadre, **despublicada = sin ficha**, API por HTTP real con ETag/304, inglés, axe). Mutaciones comprobadas: clic sin la guarda del lienzo (E2E), título «sin nombre» sin saberlo (E2E), token CSS inexistente (unitaria).

## Revisar cuando

- Se evalúe la lista y la ficha con lectores de pantalla y personas usuarias.
- Se quiera elegir entre áreas superpuestas por tamaño o con un selector explícito.
- Existan más tipos seleccionables (límites administrativos, lugares): el registro ya admite `picking` por capa; la ficha necesitará otro modelo.
- Se despliegue con BD real: rol dedicado, _pooler_, medición de latencia de la ficha.
