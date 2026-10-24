# 0024 — Experience Resolver: función pura, exclusión con motivo y histéresis por estabilidad de la candidata

- Estado: Aceptada (como contrato de dominio; **sin cablear a la interfaz**)
- Fecha: 2026-10-24
- Completa a: `docs/architecture.md` §H–J y PROMPT-MAESTRO §10; reutiliza ADR-0007 (cobertura con caducidad) y ADR-0014 (derechos)
- Relacionadas: `src/domains/experience/`, backlog F5-1…F5-4 y T-19

## Contexto

El documento rector pide un **Experience Resolver** determinista que, dado destino, intención, cobertura, derechos, dispositivo, salud de proveedores, presupuesto e idioma, produzca un `ExperienceManifest` con representación, calidad, fallbacks ordenados y motivo observable, **sin perder** selección, idioma, cámara ni información. Estaba diseñado en `architecture.md` §J pero no existía como código: lo único que había era `resolveMapExperience` (¿se permite el mapa base y el relieve?), una decisión ad hoc de la página Explorar.

Es la Fase 5 (imágenes de calle e historias) la que lo necesita de verdad, y esa fase está bloqueada por todo lo externo: ningún proveedor de imágenes de calle tiene credencial, política de derechos ni cobertura verificada, y no hay historias con contenido permitido. Pero el resolver **no depende de nada de eso**: sus entradas son parámetros. Es un componente independiente (PROMPT-MAESTRO §22) cuyo valor es fijar el contrato antes de que lleguen los proveedores, y probarlo con los datos reales de hoy.

## Decisión

1. **Función pura y determinista** `resolveExperience(input) → ExperienceManifest`. Sin reloj, sin red, sin aleatoriedad: el día (`today`, para caducar la cobertura) y el tiempo transcurrido llegan como parámetros. La misma entrada da la misma salida byte a byte, y la entrada no se modifica (se prueba con la entrada congelada).
2. **Representación separada de calidad.** Siete representaciones (`PHOTOREALISTIC_3D … MAP_2D`) y tres calidades (`LITE | STANDARD | HIGH`, sin `ULTRA`). Un equipo potente no crea cobertura: la calidad nunca amplía lo elegible.
3. **Exclusión primero, con el motivo.** Cada representación declara lo que necesita (mapa base, terreno, capacidades externas, WebGL, descarga pesada, contenido). Lo que no se cumple se excluye con un motivo de un conjunto **cerrado** (`rights`, `not-configured`, `no-provider`, `coverage-unavailable`, `coverage-unknown` con causa `unknown | expired | error | no-evidence`, `provider-down`, `over-budget`, `no-webgl`, `data-saver`, `no-content`) y **se dicen todos los motivos**, no solo el primero. Una cobertura **caducada** pasa a «sin saber», nunca a «no disponible» (ADR-0007); ausente, caducada, sin medir y con error son cuatro cosas distintas.
4. **Elección.** Orden de preferencia = lo que pide la intención + la tabla H por tipo de destino + `MAP_2D` al final. Se elige la primera elegible. Los **fallbacks** son lo elegible que queda **por debajo** (a lo que se degrada, en ese orden). Si nada es elegible, `TEXT_ONLY` (la información turística en texto, que la página ya muestra hoy): no está en la lista del documento rector y se nombra a propósito.
5. **Proveedores como entrada.** Cada uno declara su capacidad, si está configurado, su salud y su cuota; el **orden de la lista es la prioridad**; el sujeto de derechos es su `id` y se evalúa con `evaluateRights` (denegar por defecto). Con varios para una capacidad se elige el primero que pasa todo y se registra cuál.
6. **Calidad con histéresis** (`quality.ts`): sin medición, `STANDARD` (nunca se supone un equipo potente); el ahorro de datos manual y la pérdida de contexto gráfico dan `LITE` al instante; hay una **banda** entre el umbral de entrada y el de salida de cada nivel, bajar es inmediato y subir exige aguantar `minHoldMs` y solo un nivel cada vez.
7. **Histéresis de la representación por _estabilidad de la candidata_.** Empeorar (la actual deja de ser elegible) es inmediato. Mejorar exige dos cosas: que la actual lleve 15 s mostrándose **y** que la mejor lleve 15 s **elegible sin interrupción**. `advancePrevious` es la **única** forma prevista de construir la memoria (los contadores no se reimplementan fuera). Un cambio de intención o de destino es una orden de la persona y no se retrasa.
8. **Se conservan siempre** idioma, cámara y selección (destino y área): se devuelven tal cual en el manifiesto, se degrade lo que se degrade.

## Lo que se aprendió al probarlo (y por qué la decisión 7 es la que es)

La primera versión de la histéresis medía **cuánto llevaba la representación actual** en pantalla. Parecía suficiente y el comentario decía que un proveedor que parpadea no haría oscilar la experiencia. **Era falso**, y lo vi al simular a mano mi propia prueba de oscilación antes de ejecutarla: tras 15 s en `MAP_2D`, una muestra «proveedor arriba» ascendía a 3D y la siguiente «abajo» la degradaba al instante, de modo que un proveedor intermitente producía un cambio cada ~16 s. Lo que debe aguantar es **la candidata**, no la actual. La prueba de oscilación (600 s con el proveedor alternando cada segundo → **un solo** cambio, el inicial sin historia) y la de parpadeo lento (cada subida llega tras ≥ 15 s de estabilidad) lo fijan; las mutaciones R22–R24 lo vigilan.

## Alternativas descartadas

- **Una puntuación con pesos.** Opaca y difícil de explicar a quien edita; el documento rector pide un motivo observable por decisión. Una lista de preferencia + exclusiones lo da gratis.
- **Que el resolver guarde su propio estado o lea el reloj.** Dejaría de ser pura y de poder probarse con una simulación determinista.
- **Decidir la calidad por clase de dispositivo** (agente de usuario, memoria, red). El documento rector lo prohíbe: son APIs que no existen en todos los navegadores y no miden lo que importa; se usan observaciones reales.
- **Devolver solo el primer motivo de exclusión.** Quien configura un proveedor necesita ver que le falta la credencial **y** la política **y** la cobertura, no descubrirlo de uno en uno.
- **Exigir la histéresis solo a la calidad.** El resolver también oscila si la elegibilidad de un proveedor parpadea.
- **Cablearlo ya a Explorar.** La página solo sabe pintar un mapa 2D con relieve opcional; el resolver devolvería siempre `MAP_2D` o `TOPOGRAPHIC_TERRAIN` y no habría cambio visible. Cablearlo es un paso aparte (F5-3), cuando exista una segunda representación que pintar.

## Lo que NO resuelve

- **No está cableado a la interfaz.** Hoy la única decisión de producto es «mapa permitido o no» (`resolveMapExperience`), que el resolver reutiliza: no hay dos fuentes de verdad.
- **Con los datos de hoy solo alcanza `TOPOGRAPHIC_TERRAIN`, `MAP_2D` o `TEXT_ONLY`** (una prueba lo recorre para los nueve destinos, todas las intenciones, los tres entornos, con y sin WebGL y con y sin ahorro de datos). Nada de lo demás tiene credencial, política de derechos ni cobertura verificada. Es lo correcto, no algo que esconder.
- **Los umbrales de calidad y la tabla de preferencias por tipo de destino son PROPUESTAS mías sin validar** (F5-1): ninguna se midió en dispositivos reales (lo único medido es M-06, móvil emulado). Están en un solo sitio y nombradas para que cambiarlas sea una decisión visible.
- **La tabla por tipo de destino es burda, y lo demuestra su primer resultado real**: Santa Catalina es una localidad **costera** y recibe `TOPOGRAPHIC_TERRAIN` solo porque su tipo es `locality`, igual que Boquete o El Valle (de montaña). Un tipo no distingue entorno; hará falta un atributo de entorno por destino (montaña, costa, ciudad…) si la preferencia ha de ser acertada (F5-1).
- **El conjunto de intenciones** (`explore | terrain | street | story | photos`) lo propuse yo; el documento rector no lo enumera.
- **Las restricciones de combinación no están modeladas** (p. ej. «la 3D de un proveedor solo con el mapa del mismo proveedor»): el documento rector las lista como entrada y el evaluador de derechos tiene la acción `combine`, pero el resolver no la usa todavía (F5-2).
- **Cada representación que no es mapa se supone sin mapa base**, salvo las que lo declaran; si un proveedor exigiera el suyo, hay que declararlo en `NEEDS` (y es el punto anterior).
- **La cuota y la salud son datos que alguien tiene que medir**: el resolver las consume, no las obtiene.

## Consecuencias

- **El 2027-01-18 caduca la evidencia de cobertura de terreno de los nueve destinos** (`COVERAGE_EXPIRES_AT`, 90 días): desde ese día el resolver degradaría a `MAP_2D` (con causa `expired`). Una prueba con los datos reales lo fija y T-19 pide **reobservar** antes. _Actualización (entrega 5f)_: ya hay un aviso automático, `pnpm check:coverage` (falla desde 30 días antes) y el job semanal `coverage` de `audit.yml` (IMPLEMENTED, no VERIFIED: no hay remoto); **reobservar sigue siendo manual**.
- `NEEDS` y `KIND_ORDER` son `Record<…>` sobre los tipos cerrados: añadir una representación o un tipo de destino **no compila** hasta decidir qué necesita y dónde va.
- Un proveedor nuevo es una fila de entrada (`ProviderState`) y una política de derechos, no un cambio de código del resolver.

## Evidencia

`tests/unit/domains/experience/` (90 pruebas: cada motivo de exclusión, propiedades sobre 3 000 entradas aleatorias con semilla fija —solidez con un cálculo independiente, monotonía, partición, determinismo—, histéresis con oscilación y los nueve destinos reales) y las mutaciones Q1–Q19 y R1–R32 de `scripts/mutation/ts.py` (`docs/testing.md`, «Entrega 5a»).

## Revisar cuando

- Se integre el primer proveedor de imágenes de calle (credencial, política de derechos y cobertura verificada): probar el camino `STREET_EXPLORER` con datos reales.
- Haya mediciones en dispositivos reales: validar o cambiar los umbrales (F5-1).
- Exista una segunda representación que pintar: cablear el resolver a Explorar (F5-3).
- Se modelen las restricciones de combinación (F5-2).
- Se acerque el 2027-01-18 sin haber reobservado la cobertura (T-19).
