# Progreso

Última actualización: **2026-11-12**. Proyecto nuevo en `/home/user/panama-immersive` (`/home/user` estaba vacío: no se ha tocado nada fuera de esta carpeta).

Vocabulario: **IMPLEMENTED** (existe) · **VERIFIED** (existe y se observó una prueba pasando) · **BLOCKED** (falta credencial/acceso/decisión externa) · **DEFERRED** (pospuesto a propósito).

**Nota de veracidad (2026-11-03).** Varias entregas anteriores (4c a 5f) dicen «no hay remoto», «`ci.yml` nunca se ejecutó» y «Chromium 141 en local frente al 156 del CI». Eran ciertas cuando se escribieron y **son falsas desde el 2026-10-24**: existe `origin` (repositorio de GitHub, **público**: decía «privado» por error, corregido el 2026-11-11), el CI corrió en verde sobre `a0f9fd5` y `6193226` con Chromium 156.0.8078.4 en Linux (195 E2E, 0 omitidas), el semanal corrió dos veces y Dependabot abrió cinco PR (E-98). Esas frases se conservan más abajo **como historia**; lo vigente está en `docs/testing.md`, `docs/deploy.md` §7, `docs/backlog.md` (T-15) y `CLAUDE.md`. Lo que sigue siendo cierto, y es lo que importa: **nada de la entrega 5j ni de su revisión ha pasado por GitHub** (sus commits no están en `origin`).

## Estado por fase

| Fase                              | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Notas                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 0 — Discovery                     | **VERIFIED** (documentación completa, evidencias con fiabilidad declarada)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Fuentes oficiales no accesibles: `docs/research/evidence-log.md` E-00                                |
| 1 — Foundation                    | **VERIFIED** (el CI corrió en GitHub el 2026-10-24, en verde, sobre lo anterior a la entrega 5j)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Detalle abajo                                                                                        |
| 2 — Exploración de Panamá         | **VERIFIED** (mapa real en local); producción **bloqueada por derechos**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Entrega 2: mapa con PMTiles propio, anclas por ID, derechos                                          |
| 3 — GIS                           | **VERIFIED en local** (F3.a–e); producción **bloqueada** por derechos (L-01) y sin límites oficiales (L-03)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Entregas 3, 3b, 3c y 3d; cierre abajo                                                                |
| 4 — Destinos                      | **EN CURSO**: modelo de contenido y ficha **VERIFIED en local** (F4.a–e, ADR-0019) y **endurecidos tras dos revisiones independientes** (ADR-0020) más una **tercera de orquestación y CI** (entrega 4c; el CI **se ejecutó después en GitHub** y salió verde: E-98) el **idioma de las fuentes** (4d, WCAG 3.1.2) la **concurrencia** del modelo (4e) y su **coste con volumen** (4f: una lectura de personal que escalaba con las filas y un montaje cuadrático del exportador, corregidos); **sin ninguna afirmación verificada real**                                                                                                    | Entregas 4a, 4b, 4c, 4d, 4e y 4f; contenido real bloqueado por L-01…L-03 y decisiones F4-1/F4-3/F4-5 |
| 5 — Imágenes de calle e historias | **EN CURSO, solo componentes independientes**: **Experience Resolver** como dominio puro (entrega 5a, ADR-0024), los **orquestadores de pruebas probados de punta a punta** (5b, T-14), las **acciones de terceros del CI fijadas por hash** (5c, F4-17b), el **control de licencias y avisos de las dependencias** que `docs/security.md` declaraba sin tenerlo (5d, T-20) **WCAG 1.4.12 y 2.4.11 con un defecto real del mapa corregido** (5e) y el **aviso automático antes de que caduque la cobertura** (5f, T-19); lo demás **BLOQUEADO** por lo externo (sin credencial, acceso, derechos ni historias con contenido permitido: F5-4) |
| 6–10                              | PENDIENTE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ver `docs/backlog.md`                                                                                |

## Entrega 1 — Foundation

### Qué funciona

- **Cinco idiomas** (`es` por defecto, `en`, `pt`, `fr`, `de`): rutas con prefijo y **localizadas** (`/es/explorar`, `/en/explore`, `/pt/explorar`, `/fr/explorer`, `/de/entdecken`), slugs de destino por registro con **redirecciones 308** (slug de otro idioma, alias), 404 localizado, negociación de idioma (cookie > `Accept-Language` > `es`, sin geolocalización), selector sin banderas que **conserva destino, query y estado**.
- **Interfaz mapa primero** (≈70/30 en escritorio; apilada en móvil), sistema de diseño con tokens, tipografías autoalojadas, tema claro/oscuro, `prefers-reduced-motion`, propiedades lógicas.
- **Nueve destinos** con clave estable, nombres/slugs por idioma, avisos de homonimia y **evidencia de cobertura con caducidad** (`UNKNOWN` ≠ ausencia).
- **SEO**: `lang` correcto, canonical propio por idioma, hreflang/sitemap **solo de variantes publicadas** (hoy ninguna ⇒ vacíos), `noindex` fuera de producción (meta + cabecera + `robots.txt`).
- **Seguridad**: configuración validada (zod) con flags que se desactivan con motivo observable, cabeceras y CSP (ADR-0010), escaneo de secretos del bundle, migraciones que rechazan bases remotas sin confirmación.
- **BD** PostgreSQL/PostGIS: 5 migraciones, **RLS en todas las tablas**, auditoría inmutable, restricciones de integridad editorial y GIS, probadas contra un PostgreSQL real.

### Cómo ejecutarlo

```bash
pnpm install
pnpm dev                                   # http://localhost:3000 (usa «localhost»)
SITE_ENV=development pnpm build && pnpm start
```

Comandos de verificación en `README.md` y `docs/testing.md`.

### Pruebas ejecutadas (observadas el 2026-10-20)

| Comprobación                                          | Resultado                                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck` (TS 6.0.3 estricto)                  | sin errores                                                                                                                                |
| `pnpm lint` (ESLint 10 + a11y + fronteras de dominio) | sin errores                                                                                                                                |
| `pnpm format`                                         | sin diferencias                                                                                                                            |
| `pnpm test`                                           | **188 / 188** (16 ficheros)                                                                                                                |
| `pnpm test:integration`                               | **92 / 92** (7 ficheros) contra PostgreSQL 16.15 + PostGIS 3.4.2                                                                           |
| `pnpm test:e2e`                                       | **97 / 97** (69 escritorio + 28 móvil): axe WCAG 2.2 AA × 7 páginas × 5 idiomas × claro/oscuro, CSP con hidratación, i18n, teclado, 320 px |
| `pnpm check:bundle`                                   | sin secretos en el bundle; JS 190,5 KB gzip por página (línea base, ver `performance.md`)                                                  |
| Test de mutación de las migraciones                   | 4/4 garantías rotas a propósito fueron detectadas (ver `testing.md`)                                                                       |

### Lo que se encontró y cambió (honestamente)

- **ADR-0002**: TypeScript 7.0.2 compila pero rompe el lint tipado ⇒ TS 6.0.3.
- **ADR-0010**: `script-src 'self'` **rompe la hidratación** (3 scripts en línea de Next; SRI cubre 6/9) ⇒ `'unsafe-inline'` con controles compensatorios, decisión basada en evidencia.
- **ADR-0013**: ESLint 9 está fuera de soporte ⇒ ESLint 10 (verificado con control positivo).
- **Bucle 307**: `next start -H 127.0.0.1` rompe las rutas localizadas. **No era un defecto del código** (verificado con varios `Host`); documentado como trampa.
- **axe**: detectó una violación real (WCAG 2.5.3, `aria-label` ≠ texto visible) y otra solo en móvil (tablas desplazables no enfocables, 2.1.1): corregidas.
- **PostGIS**: `spatial_ref_sys` quedaba sin RLS en `public` ⇒ extensiones en el esquema `extensions`.
- **Portugués**: mi primer borrador salió con giros europeos; se rehízo en **portugués brasileño** y se dejó la variante como decisión humana pendiente.
- **Presupuesto de JS**: mi suposición (160 KB) era errónea; la medición (190,5 KB) lo recalibró.

### Qué no pudo verificarse

- **CI en GitHub Actions**: `.github/workflows/ci.yml` existe pero no se ha podido ejecutar (IMPLEMENTED, no VERIFIED).
- **Todo lo que depende de hosts bloqueados**: términos de Google/OSM/Mapillary, geoportales oficiales, UNESCO, Wikimedia (E-00). Precios de `docs/costs.md` de fuentes secundarias.
- **Revisión humana** de los cinco idiomas, lectores de pantalla reales, dispositivos reales, rendimiento (LCP/INP), Supabase real.

### Bloqueos de lanzamiento (no impiden probar en local; actualizado en la Entrega 2)

`docs/backlog.md` L-01…L-05: ninguna política de derechos `verified`; ningún idioma con revisión humana; geometrías oficiales sin acceso; revisión legal pendiente; cobertura Google/Mapillary `UNKNOWN`.

## Entrega 2 — Fase 2: mapa real de Panamá

### Qué funciona

- **Mapa interactivo** (MapLibre) con **cartografía propia** de Overture `2026-09-23.1` en un solo PMTiles de 36,1 MB: costa, agua, ríos, cobertura del suelo, áreas protegidas, límites administrativos y 3 085 localidades. Claro y oscuro, con contraste WCAG probado. **Es referencia derivada de OpenStreetMap, no oficial**, y la interfaz lo dice.
- **Nueve destinos** como botones HTML (≥ 44 px, con teclado), **agrupados** si están cerca en pantalla; tarjeta del destino seleccionado con su estado de cobertura y enlace a la ficha. Sus ubicaciones salen de **IDs de Overture verificados**, sin emparejar por nombre. **No se dibuja ningún límite de destino.**
- **Estado en la URL** (`d` destino, `c` cámara con conversión 2D↔altitud, `l` capas): se puede compartir, vuelve con Atrás/Adelante, se valida y avisa si algo era inválido.
- **Capas y leyenda** derivadas de las mismas reglas (el trazo distingue fronteras y áreas protegidas, no solo el color). **Relieve y relieve 3D** de AWS, **desactivados por defecto**: solo se piden al activarlos y la interfaz avisa de que AWS verá tu IP.
- **Estados honestos**: cargando, sin WebGL2, faltan datos, error con «Reintentar», relieve que falla, sin JavaScript, enlace inválido. La lista de destinos es siempre la alternativa completa.
- **Cinco idiomas** también en el mapa: textos, controles de MapLibre y leyenda. Los **topónimos no se traducen**: casi ninguno tiene nombre por idioma en la fuente (E-43).
- **Derechos como código**: con políticas `provisional` el mapa y el relieve **se bloquean en producción** (verificado con un build de producción real).
- **Pipeline reproducible** (`pnpm data:anchors`, `pnpm data:build`) con **puerta de verificación**: conservación exacta a z14, cobertura z7 y ancla ↔ lugar dibujado. La puerta cazó dos defectos graves de mi primer teselado (se perdían 25–75 % de las entidades; ver E-44).

### Cómo ejecutarlo

```bash
pnpm install
pnpm dev                                   # http://localhost:3000/es/explorar  (si ves un bucle de recarga: borra .next/dev)
# Datos del mapa (una vez; necesita Python + tippecanoe, ver docs/setup.md §6):
pnpm data:anchors && pnpm data:build
SITE_ENV=development pnpm build && pnpm start
```

Sin los datos la aplicación arranca y el mapa dice «faltan los datos del mapa base».

### Pruebas ejecutadas (observadas el 2026-10-20)

| Comprobación                                              | Resultado                                                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck` · `pnpm lint` · `pnpm format`            | sin errores                                                                                                                          |
| `pnpm test`                                               | **326 / 326** (23 ficheros)                                                                                                          |
| `pnpm test:integration`                                   | **92 / 92** (PostgreSQL 16 + PostGIS)                                                                                                |
| `pnpm test:e2e`                                           | **135 / 135** (103 escritorio + 32 móvil): 34 + 4 del mapa con WebGL real, axe WCAG 2.2 AA con el mapa dibujado, CSP sin violaciones |
| `pnpm check:bundle`                                       | sin secretos; Explorar 199,5 KB JS (presupuesto 210) y **mapa diferido 455,4 KB** (presupuesto 500)                                  |
| `pnpm data:build`                                         | verificación **100 %** (E-45)                                                                                                        |
| Mapa bajo **StrictMode** (servidor de desarrollo, a mano) | 1 mapa, 1 lienzo, 9 marcadores (sin duplicados), sin violaciones de CSP                                                              |
| **Compuerta de derechos** (build de producción, a mano)   | estado `blocked`, sin lienzo, relieve deshabilitado aunque el enlace lo pida, 0 peticiones a AWS/PMTiles                             |
| Relieve **real** de AWS (a mano)                          | sombreado visible, sin violaciones de CSP; los E2E usan un fixture                                                                   |

### Lo que se encontró y cambió (honestamente)

- **Mi cobertura del 2026-10-20 tenía errores** (E-41): «El Valle» **sí** tiene polígono (lo busqué con otro nombre) y el «Casco Viejo» `landuse=retail` está en **Veraguas**, no en Ciudad de Panamá. Corregido en datos, mensajes, pruebas y docs.
- **El punto representativo de un polígono no es el centro del lugar**: en «Bocas del Toro» quedaba a ≈ 6 km del pueblo. El marcador usa el punto `division` enlazado por ID.
- **tippecanoe descartaba en silencio** hasta el 75 % de las entidades (E-44) con las opciones «razonables» que usé al principio; lo detectó mi propia prueba de conservación, no una revisión visual.
- **Natural Earth figuraba como fuente «en uso» sin usarse**: corregido en la página de Fuentes y en el pie.
- **axe halló un defecto de usabilidad real**: marcadores solapados (Ciudad de Panamá y Casco Antiguo a 2 km). Solución: agrupamiento por distancia en pantalla, con prueba de propiedad.
- **Casillas de capas que «revertían»** y **`useSearchParams` que no reaccionaba** (E-47): estado optimista y `pushState(null)`.
- **El relieve de AWS estaba activo por defecto** en mi primer montaje: lo cambié a opt-in por privacidad. El sombreado sobre el mar (batimetría ruidosa) se oculta dibujando el océano encima.

### Qué no pudo verificarse

- **Rendimiento real** (LCP, INP, FPS, tiempo de mapa utilizable) y **dispositivos reales**: SwiftShader sobre bucle local no es representativo. **Lectores de pantalla** reales y personas usuarias.
- **PMTiles desde otro origen** (CDN/bucket) y cualquier **hosting** de producción.
- **Derechos**: las tres políticas siguen `provisional` (L-01). Para los glifos de Noto Sans se leyó la licencia del repositorio de Noto, pero no una declaración propia del empaquetado.
- **Límites oficiales** (IGN/ANATI, MiAmbiente, UNESCO): hosts bloqueados (E-00).
- **CI en GitHub Actions**: definido, no ejecutable aquí.

### Pendiente (ver `docs/backlog.md`, F2-1…F2-8)

Carreteras y picos; etiquetas de destino con colisión; CDN/Range entre orígenes; medición de rendimiento; regresión visual y pruebas del ETL; lectores de pantalla reales; Experience Resolver con cobertura (3D/calle) en fases posteriores.

### Siguiente acción concreta

**Fase 3 (GIS)**: importación controlada y versionada de geometrías a PostGIS, Layer Engine y Legend Engine sobre datos publicados, consultas espaciales con API acotada (`docs/gis.md` §5) y las pruebas de seguridad del pipeline (SSRF, importaciones maliciosas). Las tareas independientes de credenciales pueden avanzar; las que dependen de geometrías oficiales siguen bloqueadas por L-03.

## Entrega 3 — Fase 3: GIS (en curso) · F3.a Ingesta controlada de áreas

### Qué funciona (VERIFIED, 2026-10-20)

- **Pipeline de ingesta** (`pipelines/ingest/`): extrae de Overture `2026-09-23.1`, valida (ejes, rango, anillos, vértices, área de trabajo), manda a **cuarentena** lo que incumple (nunca repara ni recorta) y escribe artefactos + **manifiesto** con hash. Derechos comprobados **antes** de descargar.
- **Cargador a PostGIS** (`pnpm db:import-areas`): revalida manifiesto y hash, una transacción, la BD vuelve a validar (defensa en profundidad), versiona (`source_version`, geometría v1/v2/histórico), es idempotente (`noop`), calcula la superficie con `ST_Area(geography)` y **no publica** por defecto.
- **Migración 0006**: `geographic_area_names` (nombres por procedencia, sin traducir topónimos), `import_runs`, ID de Overture único; RLS y auditoría.
- **Derechos ejecutables con una sola fuente** (`data/rights/policies.json`) para TypeScript y Python.
- **Datos reales**: 137 áreas protegidas válidas y 2 en cuarentena (E-49); 11 entidades poligonales de referencia de destinos. Todo `osm_derived` (**no oficial**) y **no público** (política `provisional`, L-01).

### Cómo ejecutarlo

```bash
. .venv/bin/activate && pip install -r pipelines/requirements.txt -r pipelines/requirements-dev.txt   # una vez
pnpm test:pipelines                                   # 90 pruebas, sin red
pnpm data:ingest                                      # necesita red hacia el S3 de Overture
pnpm db:import-areas --manifest data/build/ingest/overture-protected-areas/2026-09-23.1/manifest.json   # necesita DATABASE_URL local
pnpm test:integration                                 # incluye la importación y la RLS nueva (PostgreSQL temporal)
```

### Pruebas ejecutadas (observadas el 2026-10-20)

| Comando                                        | Resultado                                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` · `pnpm lint` · `pnpm format` | Sin errores                                                                                              |
| `pnpm test`                                    | 23 ficheros / **327** pruebas                                                                            |
| `pnpm test:pipelines`                          | 5 ficheros / **90** pruebas (Python 3.13, `.venv`)                                                       |
| `pnpm test:integration`                        | 9 ficheros / **120** pruebas: +20 de importación (incluye datos reales) y +8 de RLS de las tablas nuevas |

### Lo que se encontró y cambió (honestamente)

- `fsspec` **sigue redirecciones** por defecto (riesgo SSRF): se forzó `allow_redirects=False` y tamaño conocido (E-50).
- Dos áreas reales de Overture quedan fuera de nuestra área de trabajo (una cruza el antimeridiano): cuarentena, no recorte (E-49).
- Una prueba de RLS aceptaba **cualquier** error como «denegado» y su título afirmaba que «solo el admin escribe» `import_runs` (falso: nadie con rol de aplicación escribe). Corregida para exigir SQLSTATE 42501 y comprobar editor y admin.
- Faltaba `pytest` en el entorno al reanudar: se recreó `.venv` (ESLint/Prettier/tsc ya lo excluyen).

### Qué no pudo verificarse

- La importación **no** se ha hecho contra una base remota/Supabase. La descarga de Overture no está en CI. Las políticas de derechos siguen `provisional` (L-01): **no se puede publicar** nada importado.
- **No hay límites oficiales** (L-03); estas áreas son de OpenStreetMap y deben etiquetarse así en la interfaz (F3.d).
- El job de pytest del CI está **IMPLEMENTED, no VERIFIED** (no ejecutable aquí).

### Pendiente de la Fase 3

F3.b API espacial acotada · F3.c Layer Engine y Legend Engine declarativos · F3.d selección de áreas en el mapa con ficha de fuente/superficie · F3.e cierre (documentación, E2E, commit). Detalle en `docs/backlog.md`.

## Entrega 3b — Fase 3: API espacial acotada (F3.b)

### Qué funciona (VERIFIED, 2026-10-21)

- **Tres endpoints** (`GET /api/spatial/areas`, `/areas/{id}`, `/locate`; contrato en `docs/gis.md` §12, ADR-0016): consulta por ventana, ficha por UUID y «qué áreas cubren este punto» (`ST_Covers`, el borde cuenta como dentro).
- **La RLS decide qué se ve** (rol `anon`, transacción de solo lectura, 3 s de tiempo máximo); consultas estáticas y parametrizadas; entrada con lista cerrada y límites duros (ventana ≤ 25 grados², lat/lon intercambiados → 400, `limit` ≤ 200, 1,5 MB).
- **Derechos antes que datos**: con la política `provisional`, **en producción responde 403 sin consultar la BD** (comprobado a mano con un build de producción); además se comprueba cada fila contra su fuente.
- **Honestidad de datos**: geometría simplificada para mostrar (declarada), superficie solo con método, nombre de la fuente sin traducir, procedencia y licencia en cada respuesta, `osm_derived` nunca como oficial, truncado explícito, mismo 404 para lo inexistente y lo no público.
- Caché por `ETag` + 304; errores sin fugas (503 sin BD, 504 por tiempo, 500 genérico).

### Cómo ejecutarlo

```bash
DATABASE_URL=postgresql://… pnpm dev          # BD migrada con áreas importadas (docs/setup.md §7, §7.1)
curl 'http://localhost:3000/api/spatial/areas?bbox=-81,7.5,-77,9.5&zoom=6&layers=protected_areas'
curl 'http://localhost:3000/api/spatial/locate?lon=-79.5&lat=8.5'
pnpm test && pnpm test:integration            # pruebas de la API (unitarias + PostGIS real)
```

### Pruebas ejecutadas (observadas el 2026-10-21)

| Comando                                        | Resultado                                                                                                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` · `pnpm lint` · `pnpm format` | Sin errores                                                                                                                                                                |
| `pnpm test`                                    | 26 ficheros / **428** (+101: validación con fuzz, ensamblado, manejadores, contratos con SQL/Python/políticas)                                                             |
| `pnpm test:integration`                        | 10 ficheros / **142** (+22 con PostGIS real: RLS, versión vigente, inválidas, simplificación, `ST_Covers`, solo lectura, 57014, derechos)                                  |
| `pnpm test:e2e`                                | **140** (108 escritorio + 32 móvil; +5 de la API en el build real)                                                                                                         |
| `pnpm check:bundle`                            | JS 191,1 KB (Explorar 199,9 KB), mapa diferido 455,4 KB: dentro de presupuesto (+451 B del _runtime_ de Turbopack, `performance.md` M-03)                                  |
| Mutaciones                                     | Se rompió a propósito y fallaron pruebas: sin `set local role anon` (4), `ST_Contains` por `ST_Covers` (1), sin filtro de geometrías inválidas (4), derechos ignorados (1) |
| Comprobación manual                            | Build con `SITE_ENV=production`: las tres rutas devuelven 403 `rights_blocked` (`no-store`) y 400 ante parámetros inválidos                                                |

### Lo que se encontró y cambió (honestamente)

- Dos capas comparten fuente, así que el bloqueo parcial por derechos no se podía ejercer con el registro real: se hizo `layerAccess` parametrizable y se probó con capas sintéticas (una prueba mía prometía más de lo que comprobaba).
- Una geometría **editorial** (nuestra) no tiene fuente de terceros: mi primera versión la retenía como «derechos»; ahora solo se retiene una fila **no editorial** sin fuente identificable.
- `lon=` (vacío) devolvía un fallo **sin motivo**; corregido y blindado con un fuzz que exige ≥ 1 motivo en cada fallo.
- Una de mis mutaciones «pasó» sin aplicarse (Prettier había cambiado las comillas); se repitió y quedó detectada.
- Se **descartó el parámetro `version`** de `gis.md` §5 a favor del `ETag` del cuerpo (ADR-0016).

### Qué no pudo verificarse

- **Latencia, carga y comportamiento con un _pooler_ o una base remota**: sin medir ni probar.
- **Limitación de tasa**: no existe (infraestructura, **DEFERRED**). **Rol de BD dedicado** para producción: documentado, no creado (no hay despliegue).
- No hay E2E de la API **con datos** (BD temporal detrás de `next start`): llega con la selección de áreas (F3.d).

### Pendiente de la Fase 3

F3.c Layer Engine y Legend Engine declarativos · F3.d selección de áreas en el mapa (picking + lista por teclado + ficha) · F3.e cierre. Detalle en `docs/backlog.md`.

## Entrega 3c — Fase 3: Layer Engine y Legend Engine declarativos (F3.c)

### Qué funciona (VERIFIED, 2026-10-21)

- **Un registro de capas en código** (`src/domains/geography/layers.ts`, ADR-0017, `docs/gis.md` §13) del que salen **el estilo de MapLibre y la leyenda**: cada capa declara id, grupo, prioridad de dibujo, geometrías, fuente (con su sujeto de derechos y el origen de su versión), zoom, selección por clic, reglas y leyenda. El símbolo (color, grosor, opacidad, trazo) se declara **una vez** y la leyenda recibe la misma referencia que la regla que dibuja.
- **Siete capas seleccionables** en la interfaz y en la URL: las cinco propias (áreas protegidas, límites administrativos, lugares, ríos y canales, cobertura del suelo) **activas por defecto**, y las dos de relieve (de un tercero) **apagadas por defecto**. La cartografía base (tierra, agua) no se apaga.
- **Leyenda con las muestras dibujadas desde el símbolo** y cuatro entradas más de cobertura, ríos y lugares; textos de 4 capas y 6 entradas en los **cinco idiomas**.
- **Selección por clic declarada** solo en áreas protegidas (propiedad `ovid` real de las teselas); la interacción llega en F3.d.

### Cómo ejecutarlo

```bash
pnpm dev          # abrir /es/explorar: panel «Capas» con siete casillas y leyenda que sigue a las activas
# Enlace de ejemplo (solo fronteras y lugares):  /es/explorar?l=boundaries,places
pnpm test && SITE_ENV=development pnpm build && pnpm test:e2e
```

### Pruebas ejecutadas (observadas el 2026-10-21)

| Comando                                        | Resultado                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck` · `pnpm lint` · `pnpm format` | Sin errores                                                                                                                                                              |
| `pnpm test`                                    | 27 ficheros / **454** (+26: 23 del registro; estilo y leyenda adaptados)                                                                                                 |
| `pnpm test:integration`                        | 10 ficheros / **142** (sin cambios)                                                                                                                                      |
| `pnpm test:e2e`                                | **147** (115 escritorio + 32 móvil; +7: valores por defecto, 4 interruptores, color de las muestras en claro y oscuro)                                                   |
| `pnpm check:bundle`                            | Explorar 201,4 KB (+1,4), mapa diferido 456,8 KB (+1,4): dentro de presupuesto                                                                                           |
| Oráculo de regresión                           | Se volcó el estilo de **40 combinaciones** (5 idiomas × 8 conjuntos de capas) **antes** del refactor: el motor nuevo da el **mismo** estilo en las 40 (también el orden) |
| Mutaciones                                     | Se rompió a propósito y fallaron pruebas: quitar la clase CSS de una muestra (unitaria **y** E2E: «Arrecife» salía en negro), `boundaries` ignorando su interruptor (3)  |

### Lo que se encontró y cambió (honestamente)

- La leyenda **ya divergía** del mapa (guiones `6 3` / `1.5 3` frente a `[5,2]` / `[1,2]`; el borde protegido con `4 2` horneado en CSS frente a `[3,2]`), aunque el código decía derivarse de las mismas reglas. Ahora salen del mismo símbolo y una prueba lo comprueba.
- La prueba de derivación **cazó un error mío**: `places` declaraba `minzoom: 5` y sus etiquetas de región se dibujan desde el zoom 0. Corregí el dato, no la prueba.
- **Cambio de significado de `l`** en la URL: ahora es la lista completa de capas seleccionables activas (antes, «extras» sobre cartografía siempre activa). Un enlace viejo `l=protectedAreas` queda válido pero muestra menos. Se aceptó porque no hay enlaces públicos; está probado y documentado. Un E2E (URL esperada tras activar el relieve) tuvo que actualizarse por esto, y es el único.
- Mi primer volcado JSON de los mensajes **convirtió los 34 escapes `\u00a0`** (espacio duro del francés) de `fr.json` en caracteres literales invisibles; lo vi en la revisión del diff y los restauré.
- Una de mis pruebas («falla en voz alta») era un marcador sin sentido; la sustituí por una que sí ejerce el motor con una definición rota.

### Qué no pudo verificarse

- **La leyenda no es sensible al zoom** (DEFERRED): «Bosque» aparece aunque la cobertura del suelo solo se dibuja desde el zoom 8.
- Rendimiento al conmutar capas, FPS con las siete activas en dispositivos reales, lectores de pantalla reales con la leyenda de 12 entradas.
- Las tablas `layers`/`style_versions` de la arquitectura **no existen** (DEFERRED: el registro está en código; ADR-0017).

### Pendiente de la Fase 3

F3.d selección de áreas en el mapa (picking sobre `protected-fill` + lista equivalente por teclado + ficha con fuente, método de superficie y «sin datos verificados»; necesita resolver el ID de Overture de la tesela contra la BD) · F3.e cierre (documentación, puertas completas, commit). Detalle en `docs/backlog.md`.

## Entrega 3d — Fase 3: selección de áreas en el mapa (F3.d)

### Qué funciona (VERIFIED, 2026-10-21)

- **Elegir un área protegida** por **clic** en el mapa o desde una **lista por teclado equivalente** («Áreas protegidas en esta vista», botones con `aria-pressed`, ≥ 44 px). La selección vive en la URL (`a=<ID de Overture>`, validado; nunca un nombre) y se **resalta** con un contorno sólido grueso con halo (no solo color).
- **Ficha en dos niveles de verdad** (ADR-0018): siempre lo que lleva el mapa (nombre local; «derivado de OpenStreetMap, no oficial») y «no hay datos verificados de actividades, restricciones ni cómo llegar»; **con BD**, además: superficie **con su método**, versión de la geometría, fuente, versión, fecha, licencia (enlace `https`) y derechos. Estados honestos: cargando · no disponible · bloqueada por derechos · sin ficha publicada.
- **Endpoint nuevo** `GET /api/spatial/areas/by-overture/{ovid}` (las teselas llevan el ID de Overture); «Mostrar el área en el mapa» encuadra a petición.
- **Suite E2E con base de datos** (`pnpm test:e2e:db`): PostgreSQL temporal con las **137 áreas reales** importadas y publicadas (y una despublicada) detrás de `next start`.

### Cómo ejecutarlo

```bash
pnpm dev                       # /es/explorar?d=coiba → haz clic en el parque, o usa la lista «Áreas protegidas en esta vista»
# Con datos de BD (docs/setup.md §7, §7.1):  DATABASE_URL=postgresql://… pnpm dev   → la ficha muestra superficie, fuente y licencia
SITE_ENV=development pnpm build && pnpm test:e2e && pnpm test:e2e:db
```

### Pruebas ejecutadas (observadas el 2026-10-21)

| Comando                                        | Resultado                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` · `pnpm lint` · `pnpm format` | Sin errores                                                                                                                                                               |
| `pnpm test`                                    | 29 ficheros / **521** (+67)                                                                                                                                               |
| `pnpm test:integration`                        | 10 ficheros / **145** (+3: búsqueda por ID de Overture con RLS y derechos); **0 clústeres huérfanos** al terminar                                                         |
| `pnpm test:e2e`                                | **160** (127 escritorio + 33 móvil; +13)                                                                                                                                  |
| `pnpm test:e2e:db`                             | **7** con PostgreSQL+PostGIS temporal y datos reales: ficha contra la API, enlace profundo, encuadre, despublicada = sin ficha, API por HTTP real (ETag/304), inglés, axe |
| `pnpm check:bundle`                            | Explorar **205,4 KB** (+4,0; margen ≈ 4,6 KB), mapa diferido 460,7 KB: dentro de presupuesto                                                                              |
| Mutaciones                                     | Se rompió a propósito y fallaron pruebas: clic sin la guarda del lienzo (E2E), título «sin nombre» sin saberlo (E2E), token CSS inexistente (unitaria)                    |
| Revisión visual                                | Capturas del mapa con el área resaltada y la ficha (clic real sobre el Parque Nacional Coiba)                                                                             |

### Lo que se encontró y cambió (honestamente)

- **zod 4 en el cliente violaba la CSP** (`script-src eval`, sin error de consola): lo cazó `watchPage` en los E2E. El validador de la respuesta se reescribió a mano (E-51).
- Mi primera ficha decía «sin nombre en la fuente» cuando **solo no se conocía** el nombre (enlace profundo): corregido a un título neutro y probado.
- Usé un **token CSS que no existe** (`--color-accent-contrast`): el navegador lo ignora en silencio. Añadí una guarda (`css-tokens.test.ts`) y comprobé que habría fallado.
- **Fuga en mi infraestructura de pruebas**: 32 PostgreSQL huérfanos y 2,3 GB en `/tmp` tras ejecuciones repetidas de la integración (el `teardown` con nombre junto a un `setup` por defecto no se ejecutaba en Vitest). Corregido en la raíz, con limpieza al salir (probado matando una ejecución con SIGTERM) y medida antes/después.
- Los E2E sin BD ven en la consola el 503 de la API (es el estado probado): el test exige que sea **el único** error, no los ignora.
- El orquestador del E2E con BD no fijaba `search_path` (PostGIS vive en `extensions`): corregido.
- Textos de F3.c: alineé el portugués a la variante brasileña ya usada y el francés al espacio duro; un texto idéntico en pt/es («Mostrando {shown} de {total}.») entró como excepción **justificada** de la heurística de traducciones, sin relajar el umbral.
- Diferir el componente de datos **no** redujo la medición total (205,2 → 205,4 KB), aunque su _chunk_ no está en el HTML inicial: lo dejé (es correcto y no cuesta) y lo documenté tal cual.

### Qué no pudo verificarse

- **Lectores de pantalla reales y personas usuarias** con la lista y la ficha (axe y teclado sí).
- **Áreas superpuestas**: el clic elige la de más arriba (no necesariamente la más específica); la lista es la vía completa.
- **La ficha con una BD remota o con _pooler_**, la **latencia** de la ficha y el coste de consultar las entidades en cada `idle`.
- **Producción**: mientras los derechos sean `provisional` el mapa se bloquea y la API responde 403; la ficha **no** se ha visto en ese entorno.
- `pnpm test:e2e:db` **no está en CI** (necesita artefactos de datos gitignorados).

### Pendiente de la Fase 3

F3.e: cierre (estado final de la fase, revisión de lo pendiente y entrega). Riesgo abierto: margen de ≈ 4,6 KB en el JS inicial de Explorar (F3-10).

## Cierre de la Fase 3 — GIS (2026-10-21)

Definición del documento rector (§22): _importación controlada, geometrías, capas seleccionables, estilos, leyendas, clustering y consultas espaciales_. Estado por elemento, sin adornos:

| Elemento                      | Estado                                                                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importación controlada        | **VERIFIED** (F3.a, ADR-0015): cuarentena, manifiesto con hash, derechos, versionado, defensa en profundidad; 137 áreas reales                                                                             |
| Geometrías                    | **VERIFIED**: versionadas en PostGIS, validez registrada sin reparar, superficie con `geography`; todas `osm_derived`, **no oficiales**                                                                    |
| Capas seleccionables          | **VERIFIED** (F3.c, ADR-0017): siete, con registro declarativo                                                                                                                                             |
| Estilos y leyendas            | **VERIFIED**: salen del mismo registro (símbolo compartido); la leyenda **no** es sensible al zoom (DEFERRED)                                                                                              |
| Clustering                    | **VERIFIED para los marcadores de destino** (Fase 2: agrupación por distancia en pantalla, prueba de propiedad). **No hay otro conjunto de puntos que agrupar** (los lugares son etiquetas de las teselas) |
| Consultas espaciales          | **VERIFIED** (F3.b, ADR-0016): ventana, punto y ficha; **las rutas `areas` y `locate` aún no las consume ninguna pantalla** (solo se prueban por HTTP); la interfaz usa `by-overture`                      |
| Selección de áreas en el mapa | **VERIFIED** (F3.d, ADR-0018): clic + lista por teclado + ficha honesta                                                                                                                                    |

**Criterio de «terminada»** (flujo funciona · pruebas pasan · limitaciones documentadas · sin errores arquitectónicos críticos): cumplido **en local**. Las limitaciones están en cada entrega y en `docs/backlog.md` (F3-5…F3-14).

### Estado final de las pruebas (observado el 2026-10-21)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **521** · `pnpm test:pipelines`: **90** · `pnpm test:integration`: **145** (0 clústeres huérfanos) · `pnpm test:e2e`: **160** · `pnpm test:e2e:db`: **7** · `pnpm check:bundle`: Explorar 205,4 KB (presupuesto 210), mapa diferido 460,7 KB (500).

### Bloqueos que siguen abiertos (visibles; no impiden probar en local)

- **L-01 derechos**: toda política es `provisional` → **en producción no se sirve el mapa ni la API** (por diseño). Hace falta leer los términos en las **fuentes primarias** (hosts bloqueados desde este entorno, E-00).
- **L-03 límites oficiales** (IGN/ANATI, MiAmbiente): sin acceso; todo lo mostrado es OpenStreetMap derivado y se etiqueta **no oficial**.
- **L-02 revisión editorial/humana**: ninguna traducción está revisada; el español es borrador de IA.
- **Sin despliegue**: no hay base remota, rol de BD dedicado, _pooler_, limitación de tasa ni medición de latencia (F3-6, F3-7).
- **CI**: definido, **no ejecutable aquí**, y **no genera el mapa base** (F3-14).
- **Sin dispositivos reales, lectores de pantalla reales ni personas usuarias**; rendimiento (LCP/INP/FPS) sin medir.

### Riesgos abiertos que conviene mirar antes de la Fase 4

1. **Margen de JS inicial de Explorar ≈ 4,6 KB** (F3-10).
2. **Dependencia total de Overture/OSM** como única fuente de geometrías hasta que haya acceso a fuentes oficiales.
3. Los datos de un solo _release_ (`2026-09-23.1`) y sin actualización incremental.

### Siguiente acción concreta

**Fase 4 (Destinos)** no puede rellenarse con contenido sin revisión editorial y derechos (L-01/L-02/L-03). Lo **independiente** que sí puede avanzar: (1) el modelo de contenido de la ficha de destino con **evidencia por afirmación** (`field_assertions`, `source_records`) y los estados «sin datos verificados» ya establecidos en F3.d; (2) la maquetación de las nueve fichas con campos vacíos honestos; (3) resolver F3-10 antes de añadir interactividad a Explorar. Antes de empezar, **pedir a la persona responsable** que decida el orden: ¿desbloquear primero los derechos (requiere acceso de red a las fuentes primarias) o avanzar el modelo de contenido?

## Entrega 4a — Fase 4: modelo de contenido de la ficha (F4.a–e)

Alcance de esta entrega: **lo independiente** de la Fase 4. El contenido real (redactar y verificar afirmaciones con fuentes primarias, traducirlas, revisarlas) es trabajo editorial humano y sigue **bloqueado** (L-01…L-03). Aquí está el modelo que lo hará **posible sin poder inventar nada**, y la ficha que lo muestra.

### Qué funciona (VERIFIED en local, 2026-10-21)

- **Registro de 8 campos** (`overview.summary`, `access.how_to_get_there`, `restrictions.entry_rules`, `restrictions.legal_status`, `safety.hazards`, `visit.best_season`, `visit.accessibility`, `facts.elevation_m`) con tipo, sensibilidad, clases de fuente admitidas, nº de fuentes, antigüedad máxima, vigencia máxima y tipos de destino. Sembrado en `content_fields`; una prueba de contrato comprueba que coincide con el código.
- **Dominio puro** (`src/domains/content/`): estado **derivado** VERIFIED/EXPIRED/DISPUTED/UNKNOWN (no existe un booleano), **23 puertas de verificación** con códigos de máquina, texto por idioma que **nunca finge traducción**, vista de la ficha, instantánea estricta y determinista.
- **Migración `0007`**: `content_fields`, `source_records`, `field_assertions`, `assertion_evidence`, `assertion_translations` y la vista `field_public_state`; flujo `draft → in_review → verified` (+ `disputed/rejected/retracted`), **lo verificado es inmutable** (también para el propietario), versiones que se reemplazan, verificador = persona del JWT y hora del servidor, verificador ≠ autor, **privilegios por columna** (`anon` no puede ni pedir identidades), RLS, auditoría y `TRUNCATE` bloqueado. Las puertas están **en la BD y en el dominio** y una prueba comprueba que coinciden código por código.
- **Exportador** `pnpm content:export` (rol `anon`, solo lectura, determinista, **revalida y no escribe nada si algo falla**) y **cargador** que rompe el build ante una instantánea inválida. Hoy `data/content/published.json` está **vacío**: la ficha dice «sin datos verificados».
- **Ficha**: por campo verificado, texto + fecha de verificación + vigencia + confianza + **fuentes** (enlaces `https`); **avisos por campo** de lo vencido y lo disputado **sin su contenido**; lista compacta de lo no verificado («no significa que no exista»); **original con indicador del motivo** cuando no hay traducción humana publicada; fechas en zona de Panamá; cantidades sin convertir. SEO por idioma (`destinationSeo`) y `revalidate = 3600` para que la caducidad se recalcule.
- **E2E con contenido** `pnpm test:e2e:content`: PostgreSQL temporal → contenido sintético por el flujo real → exportación → **copia temporal de la app** → Next en producción, con axe en cinco idiomas y dos temas y sin violaciones de CSP.
- Mensajes `Content.*` en los **cinco** idiomas (español `draft`; el resto, traducción automática sin revisar, como el resto de la interfaz).

### Cómo ejecutarlo

```bash
pnpm typecheck && pnpm lint && pnpm format && pnpm test        # 688 unitarias
pnpm test:integration                                           # 234 (incluye el modelo de contenido y el exportador)
pnpm test:e2e:content                                           # 21; solo necesita binarios de PostgreSQL
pnpm content:export --dry-run                                   # con DATABASE_URL: qué se publicaría (docs/setup.md §8)
```

### Pruebas ejecutadas (observadas el 2026-10-21)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **688** (36 ficheros; **133** del dominio de contenido, **23** de renderizado de la ficha, **11** de SEO/sitemap/cargador) · `pnpm test:pipelines`: **90** · `pnpm test:integration`: **234** (13 ficheros; **89** nuevas: 31 de flujo y roles, 51 de paridad de puertas y transiciones, 7 del exportador; 0 clústeres huérfanos) · `pnpm test:e2e`: **160** (incluye axe de la ficha vacía) · `pnpm test:e2e:db`: **7** · `pnpm test:e2e:content`: **21** · `pnpm check:bundle`: OK (ficha 191,1 KB de JS: el contenido es de servidor; Explorar 205,4 KB, sin cambios).

**Mutaciones: 93** (11 puertas del dominio, 21 estado/texto/vista/instantánea, 33 migración SQL, 9 exportador, 15 presentación, 4 E2E). Las que sobrevivían señalaron huecos de **mis pruebas** y se cerraron (ver `docs/testing.md`).

### Lo que se encontró y cambió (honestamente)

- **Errores reales cazados por las pruebas** (no por leer el código): `Date.parse` acepta `2026-02-31T…` (E-52); `text[] || 'literal'` en PL/pgSQL es un literal de array (E-53); una columna ambigua en una política RLS dejaba a `anon` sin ver ninguna fuente (E-54); el orden disparador/RLS que yo había supuesto al revés (E-55); `pg` devuelve `enum[]` como texto (E-56).
- **Mi verificación de las mutaciones estuvo contaminada una vez**: un `import` que no se aplicó dejó 4 pruebas rojas de base y yo leí «1 failed» como si la mutación hubiera muerto. Detectado al ver que `minCount` «moría» con exactamente 4 fallos (la línea base). Desde entonces cada serie exige una base verde y avisa si la mutación no se aplicó; y una mutación que rompe los tipos no cuenta (me pasó dos veces en el E2E).
- **Cambios de diseño sobre la marcha**: descarté `verification_events` (la auditoría y `status_note` ya cubren quién, qué, cuándo y por qué); descarté una variable de entorno para cambiar la ruta de la instantánea en el E2E (un camino alternativo para publicar dentro del código de producción) y construí una **copia temporal** de la app; añadí `revalidate` porque una página prerrenderizada congelaría «hoy».
- **README desactualizado** (decía «Fase 3 en curso» tras cerrarla): corregido.
- Mis primeras pruebas suponían que la RLS rechaza siempre con `42501`; en realidad un disparador `BEFORE` salta antes y un `UPDATE`/`DELETE` invisible afecta 0 filas. Se rehicieron con el orden real de defensas.

### Qué no pudo verificarse

- **Nada con contenido real**: todo usa datos sintéticos; la instantánea publicada está vacía.
- **Los umbrales por campo** (clases, nº de fuentes, antigüedad, vigencia) son **míos**; hasta que la persona responsable los valide no hay que fiarse de ellos (F4-1).
- **CI**: el job `e2e-content` está definido y **no se ha podido ejecutar fuera de este entorno**.
- **Lectores de pantalla reales y personas usuarias** con la ficha poblada (axe sí).
- **Concurrencia** de la asignación de versión, **rendimiento** de las políticas con más datos y la vista `field_public_state` en **Supabase real** (su asesor de seguridad puede advertir de una vista con derechos del propietario; aquí es deliberado).
- **Obsolescencia**: una disputa o retirada hecha en la BD **no llega a la web hasta exportar y desplegar**; nada vigila la edad de la instantánea (F4-4).

### Decisiones que necesitan a una persona (no puedo tomarlas yo)

1. **F4-1** validar los umbrales de evidencia por campo (¿basta **una** fuente oficial para un peligro?).
2. **F4-3** ¿se muestran traducciones automáticas etiquetadas del contenido, o solo original/humana (hoy)?
3. **F4-5** criterio legal sobre citar fuentes y política de derechos por fuente.
4. **F4-4** cadencia de exportación y despliegue (importa sobre todo para seguridad).

### Pendiente de la Fase 4

Contenido real (F4-6), interfaz de autoría y revisión (F4-2), medios e historias (F4-7), más campos (F4-11) y las decisiones de arriba. Ver `docs/backlog.md`.

### Siguiente acción concreta

Con una persona editora: (1) validar o cambiar los umbrales de `src/domains/content/fields.ts` (y su espejo en la migración, con una migración **nueva**); (2) elegir **un** destino y redactar su resumen con una fuente primaria oficial, verificarlo por el flujo y ejecutar `pnpm content:export` para ver la primera ficha real. Lo siguiente que más valor da sin depender de nadie es la **interfaz de autoría** (F4-2): hoy el cuello de botella es cargar contenido por SQL.

## Entrega 4b — Fase 4: endurecimiento tras dos revisiones independientes y línea base de rendimiento

Alcance: **no hay funcionalidad nueva de contenido**. Se encargaron dos tandas de revisión adversarial a agentes sin contexto previo para romper lo que construí en la 4a; esta entrega es lo que se halló, lo que se corrigió y lo que **no** se pudo comprobar. Además, una línea base de rendimiento (M-06).

### Qué funciona (VERIFIED en local, 2026-10-23)

- **Migraciones `0008` y `0009`** (la `0007` no se toca): solo quien creó un borrador lo edita; las traducciones no sobreviven a un cambio del original y `translated_by` es inmutable; una versión anterior no reemplaza a una posterior; vigencia coherente (`valid_from` ≤ día de verificación, `valid_until` no vencida); `minCount` cuenta documentos distintos; **la BD es al menos tan estricta como el dominio y el exportador**; ids asignados por el servidor, tamaños en puntos de código, enlaces que `new URL()` acepta, «en blanco» como `trim()`; vista `security_barrier`; función de puertas revocada a `authenticated`; **`source_records` de solo inserción también para el propietario** (0009).
- **Exportador**: excluye **con ruido** (código de salida 4) lo que ya no cumple el registro vigente y sigue **fallando** ante lo malformado; escritura **atómica** (con limpieza del temporal si falla el reemplazo); la instantánea valida `generatedAt` y los avisos; la edad se cuenta en el día de Panamá.
- **CLI endurecidos** (`db:migrate`, `db:import-areas`, `content:export`): la guardia de «base remota» decide sobre el host que **`pg` resuelve**; una URL malformada se rechaza **sin mostrarla**; los argumentos son **estrictos** (código 2).
- **Ficha**: sin el aviso contradictorio «no está redactada» junto a un campo vencido; la fecha de exportación se dice «del sitio» y no sale en un destino vacío; «Fiabilité :» con espacio duro; el idioma del original se nombra en el idioma de la página; sitemap con `revalidate` (medido: antes `false`), verificado en el build por `pnpm check:bundle`.
- **Pruebas de mutación reproducibles desde el repositorio** (`scripts/mutation/`): **80 mutaciones, 0 supervivientes** (51 de SQL y exportador, 23 de TypeScript, 6 del CLI). Una (`D1`, el reloj) solo se detecta entre las 00:00 y las 05:00 UTC y la herramienta lo avisa.
- **Línea base de rendimiento** (`pnpm perf:vitals`, M-06): móvil **emulado**; las páginas de texto pintan en ≈ 0,4–0,5 s sin cambios de diseño; Explorar tarda ≈ 3,1 s hasta mapa listo (WebGL por software: **no representativo**). Informativa, no es una puerta.

### Cómo ejecutarlo

```bash
pnpm typecheck && pnpm lint && pnpm format && pnpm test         # 787 unitarias
pnpm test:integration                                            # 336 (BD temporal; incluye el CLI como proceso real)
SITE_ENV=development pnpm build && pnpm check:bundle             # presupuestos + `revalidate` de la ficha y el sitemap
pnpm test:e2e && pnpm test:e2e:db && pnpm test:e2e:content       # 160 · 7 · 21
python3 scripts/mutation/db.py                                    # ≈ 7 min · también ts.py (≈ 2 min) y cli.py (≈ 1 min)
pnpm perf:vitals --runs 5                                         # línea base emulada (docs/performance.md M-06)
```

### Pruebas ejecutadas (observadas el 2026-10-23)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **787** (40 ficheros) · `pnpm test:integration`: **336** (16 ficheros; **43** de garantías del modelo de contenido, **13** del CLI como proceso, 0 clústeres huérfanos) · `pnpm test:pipelines`: **90** · `pnpm test:e2e`: **160** · `pnpm test:e2e:db`: **7** · `pnpm test:e2e:content`: **21** (con axe en cinco idiomas y dos temas) · `pnpm check:bundle`: OK (ficha 191,1 KB, Explorar 205,4 KB, mapa diferido 460,7 KB gzip; **la ficha y el sitemap se regeneran cada 3600 s**) · **80 mutaciones, 0 supervivientes** (`scripts/mutation/`).

### Lo que se encontró y cambió (honestamente)

- **Las dos revisiones terminaron a medias y eso me engañó una vez.** La primera ejecución agotó el límite de sesión: solo 2 de 7 dimensiones y **ningún** verificador. **Mi script contaba un verificador caído como «no refutado» y marcó los 16 hallazgos como «confirmados»**: era un error mío. Los traté como no verificados y los reproduje uno a uno con pruebas rojas; el script se corrigió (un verificador que falla ya no confirma nada). La segunda tanda terminó igual: 4 revisores con **31 hallazgos**, **ningún verificador** y **el revisor de orquestación y CI no corrió**. Los comprobé yo contra HEAD: **5** ya estaban corregidos (solo faltaba su guarda), **22** eran reales y se corrigieron con prueba roja → verde, **4** eran afirmaciones de documentación exageradas o falsas.
- **Hallazgos graves de la primera tanda** (ADR-0020): la separación de funciones tenía un hueco (un admin reescribía el borrador de otra persona y lo verificaba) y una traducción «revisada» podía acompañar a un texto distinto del que revisó la persona.
- **Lo que la segunda tanda demostró sobre mis pruebas**: **22 de 39 mutaciones del SQL y 12 de 23 de la ruta de producción sobrevivían con la suite en verde** y no eran equivalentes: `created_by` mutable (un editor podía reasignarse la autoría), `destination_id`/`field_key` mutables en lo verificado, la procedencia de una traducción (lavar una automática como humana), `reviewed_by` legible por `anon`, auditoría sin cubrir dos tablas, exportador sin `read only`, y: si `state.ts` exigiera identidades, **toda ficha real** quedaría «sin datos» con la suite verde (mis fixtures siempre llevaban autor y verificador).
- **Afirmaciones mías que eran falsas o exageradas, ya corregidas** (`docs/security.md`, ADR-0019 con nota explícita): «ni el propietario lo salta (probado)» (falso para las fuentes); «la ficha se regenera cada hora» presentado como control suficiente (ISR es _stale-while-revalidate_) y el sitemap **no se regeneraba**; «revalida todo con las puertas del dominio» (las dos de identidad no se pueden revalidar con `anon`); «probado columna por columna» (se probaban algunas); «las que sobreviven son equivalentes» (22 no lo eran); «`published.json` editado a mano rompe el build» (solo si es incoherente); el índice de ADR con filas sin «Estado».
- **Errores de mis propias pruebas descubiertos al corregir**: exportaban con un `NOW` fijo anterior al `verified_at` real de la BD (pasaban solo porque nadie comparaba los dos relojes); una prueba de «lavado» de traducciones también cambiaba `translated_by`, que otra cláusula ya rechazaba con el mismo mensaje, así que no aislaba la procedencia (la mutación sobrevivió y la reescribí); mi primer arnés de mutación **contaba como «superviviente» una mutación que rompía la migración** (corría 0 pruebas) y el ancla de otra mutación dejó de coincidir tras reformatear con Prettier (el script abortó antes de aplicar nada: lo vi por el error, no por un falso «verde»). Desde ahí las reglas están en `scripts/mutation/lib.py`.
- **Hallazgos que no se mantuvieron**: `valid_from` «ignorado» (ya lo rechazaba la 0008), `evidence_insecure_url` más débil en la BD (la 0008 lo igualó), >20 evidencias o fechas infinitas (ya cubiertas), escritura no atómica (ya lo era; sí faltaba limpiar el temporal).

### Qué no pudo verificarse

- **La dimensión de orquestación y CI no se revisó** (F4-17; **se revisó después: entrega 4c**): `.github/workflows/ci.yml` y los scripts de orquestación están **IMPLEMENTED, no VERIFIED** fuera de este entorno.
- **Nada con contenido real**: la instantánea publicada sigue **vacía** y todo usa datos sintéticos.
- **`published.json` falsificado con coherencia** no se detecta: no hay hash, firma ni comprobación contra la BD en CI. El único control real es la revisión del `git diff` (F4-14).
- **Caducidad en la primera visita**: ISR es _stale-while-revalidate_; un dato vencido puede mostrarse como vigente a la primera persona tras un periodo sin visitas. No hay regeneración programada (F4-16).
- **`app.panama_today()` en UTC** solo se detecta entre las 00:00 y las 05:00 UTC (no se puede falsear `now()`).
- **`generateMetadata` de la ficha** no tiene prueba unitaria (usa APIs de solicitud de Next); lo cubren `indexingOf` (compartido con el sitemap, que sí se prueba) y el E2E con el estado real de la interfaz. La rama «publicada» de un E2E no existe: con el estado real nada es publicable.
- **Los datos de las fuentes se pintan sin `lang`** (WCAG 3.1.2, AA): `source_records` no guarda su idioma (F4-15).
- **Nada se ejecutó contra una base remota ni contra Supabase**; la guardia de «base remota» es por nombre (un túnel a `localhost` pasa).

### Decisiones que necesitan a una persona (no puedo tomarlas yo)

1. **F4-1** validar los umbrales de evidencia por campo (¿basta **una** fuente oficial para un peligro?).
2. **F4-3** ¿se muestran traducciones automáticas etiquetadas del contenido, o solo original/humana (hoy)?
3. **F4-5** criterio legal sobre citar fuentes y política de derechos por fuente.
4. **F4-4 y F4-16** cadencia de exportación/despliegue y regeneración programada (importa sobre todo para seguridad).
5. **F4-12** ¿hace falta co-redacción de borradores? (hoy solo quien lo creó lo edita).
6. **F4-14** cómo se protege la procedencia de `published.json` antes de publicar contenido real (CODEOWNERS, comprobación en CI contra una base, o firma).

### Pendiente

Revisar orquestación y CI (F4-17, **hecho en la entrega 4c**), procedencia de la instantánea (F4-14), idioma de las fuentes (F4-15), regeneración programada (F4-16), ejecutar las mutaciones en CI (T-13), contenido real (F4-6), interfaz de autoría (F4-2) y las decisiones de arriba. Ver `docs/backlog.md`.

### Siguiente acción concreta

Con una persona editora, igual que en la 4a: validar los umbrales (F4-1) y redactar **un** resumen real con fuente primaria oficial para ver la primera ficha. Antes de **publicar** cualquier contenido real: decidir F4-14 (si no, un `published.json` coherente pero inventado pasa todos los controles) y F4-16. Lo que más valor da sin depender de nadie sigue siendo la **interfaz de autoría** (F4-2).

## Entrega 4c — Fase 4: revisión de la orquestación y el CI (F4-17)

Alcance: **no hay funcionalidad nueva de contenido ni de producto**. La dimensión que la segunda revisión no llegó a cubrir (orquestadores E2E, `check:bundle`, la herramienta de mutación y `ci.yml`) se encargó a un agente sin contexto previo sobre una copia congelada. El patrón que encontró: **puertas que podían dar verde sin haber medido ni ejecutado nada**. Esta entrega es lo que se halló, lo que se corrigió, lo que mis propias correcciones dejaron sin proteger (lo reveló la mutación) y lo que **sigue sin poder comprobarse**.

### Qué funciona (VERIFIED en local, 2026-10-23)

- **Orquestadores E2E** (`test:e2e:content`, `test:e2e:db`, sobre `scripts/lib/e2e-run.ts`): en **CI «no puedo ejecutar la suite» es un fallo** (antes salía con 0 y el job quedaba verde sin probar nada); puerto libre elegido por el sistema y **verificación de que responde el servidor propio** (un servidor ajeno ya no se da por bueno); build asíncrono con plazo; limpieza **una sola vez y sin bloquear** ante SIGINT/SIGTERM (**8 de 8 Ctrl+C emulados sin huérfanos**), lanzados con `node --import tsx` (el CLI de `tsx` mata al hijo); barrido de clústeres y registros huérfanos con comprobación de pid; `PI_PG_BIN_DIR` y selección de la versión de PostgreSQL **con PostGIS**.
- **Playwright**: `forbidOnly` y `failOnFlakyTests` en las **tres** configuraciones en CI; informe JSON en CI.
- **`pnpm check:e2e-skips`**: presupuesto de pruebas **omitidas** (56 en CI sin el mapa base, **medido**; con el mapa real, 0). Falla si no pasó ninguna prueba, hay fallos o intermitentes, el informe es incoherente o se supera el presupuesto, agrupando por motivo.
- **`pnpm check:bundle`**: presupuestos validados (`JS_BUDGET_KB=2l0` daba `NaN` y nunca comparaba), un recurso ausente o con `?dpl=` ya no cuenta como 0 KB, una página sin scripts falla, los `.mjs` (MapLibre) se escanean en busca de secretos. Probado como script completo sobre un `.next` sintético **y** contra el build real (recurso renombrado → falla).
- **Herramienta de mutación**: códigos de salida 0/1/2/3 documentados (un ID inexistente, mutaciones todas inválidas o pruebas **omitidas** ya no terminan en «0 supervivientes»; un árbol sucio ya no sale con el código de «sobrevive alguna»; `git` fallando no se lee como «limpio»), marca `equivalente` que **exige justificación escrita**, ejecutor de pytest y nombres de prueba duplicados sin pisarse.
- **`ci.yml`**: `timeout-minutes`, `main` no se cancela, job **`ci-ok`** (falla si algo falló, se canceló u omitió), trazas de Playwright si falla, versiones impresas, nombre honesto del job de E2E. `pnpm typecheck` y `pnpm lint` generan antes los tipos de rutas (fallaban en una copia limpia); `pnpm check` encadena las cuatro puertas.
- **`e2e/map.spec.ts`**: una aserción de leyenda envuelta en `.catch(() => undefined)` llevaba **desde la Fase 2** sin poder fallar y, además, era **falsa**; ahora comprueba la leyenda real (y la inversa al desactivar).

### Cómo ejecutarlo

```bash
pnpm check                                                        # typecheck + lint + format + 938 unitarias
pnpm test:integration                                             # 339 (incluye las señales del clúster con procesos reales)
. .venv/bin/activate && pnpm test:pipelines                       # 119 (ETL + herramienta de mutación)
SITE_ENV=development pnpm build && pnpm check:bundle              # presupuestos con guardas
CI=true pnpm test:e2e && pnpm check:e2e-skips --max-skipped 56    # 160 · presupuesto de omitidas (56 sin el mapa base)
pnpm test:e2e:content && pnpm test:e2e:db                         # 21 · 7
python3 scripts/mutation/ci.py                                    # 105 mutaciones de esta revisión (≈ 16 min) · también db.py, ts.py, cli.py
```

### Pruebas ejecutadas (observadas el 2026-10-23)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **938** (49 ficheros) · `pnpm test:integration`: **339** (17 ficheros; 0 clústeres huérfanos) · `pnpm test:pipelines`: **119** · `pnpm test:e2e` con `CI=true` y el mapa real: **160 pasan, 0 omitidas, 0 intermitentes**; con el mapa oculto (como el CI real): **104 pasan y 56 omitidas** · `pnpm test:e2e:content`: **21** · `pnpm test:e2e:db`: **7** (sin restos: ni procesos, ni `/tmp/pi-*`, ni `.e2e-content-app/`) · `pnpm check:bundle`: OK sobre un build nuevo (ficha 191,1 KB, Explorar 205,4 KB, mapa diferido 460,7 KB gzip) · **mutación: `ci.py` 105 (103 detectadas + 2 equivalentes justificadas, 0 supervivientes); las 80 de la entrega 4b **repetidas sobre el código final**: `cli.py` 6/6, `ts.py` 23/23 y `db.py` 50 detectadas + `D1` (el aviso del reloj: eran las 05:48 UTC, fuera de la ventana 00:00–05:00 en que se detecta), **0 supervivientes****.

### Lo que se encontró y cambió (honestamente)

- **La revisión** (un agente, **12 hallazgos**): no me fié del informe, los comprobé yo uno a uno contra HEAD. **Reproducidos**: 1, 2, 4, 5, 6 y 7; del 3 reproduje la **causa raíz** (un servidor ajeno en el puerto) pero **no** la cifra literal del revisor («21 pasan con un servidor viejo y una regresión sembrada»: mi ejecución sí detectó la regresión); **confirmados por inspección**: 8 y 12; **por lectura** o como nota de documentación: 9, 10 y 11. Todos los corregibles se corrigieron con prueba roja → verde.
- **Errores míos descubiertos al corregir:**
  1. **YAML inválido que mis pruebas no vieron.** El nombre del job de E2E contenía `: `; mis 20 guardas textuales de `ci.yml` pasaban y lo detectó Prettier. Desde entonces está dicho en la prueba: la sintaxis la vigila `pnpm format`.
  2. **Un «pasó» que no probaba nada.** Mi primera comprobación manual de que una aserción podía fallar usó un ancla que Prettier había reformateado: la mutación **no se aplicó** y salió «1 passed». Lo vi porque el script de reemplazo falló; repetí con un ancla verificada.
  3. **Mis pruebas nuevas eran más débiles de lo que creía.** La mutación de mis propias correcciones: **89 de 106 muertas en la primera pasada, 16 sobrevivían y 1 inválida.** Entre ellas, la más grave: un servidor ajeno que responde cuando el propio ya murió (**el caso del hallazgo #3**) no tenía prueba; tampoco la limpieza repetida ante una segunda señal (indetectable con mi fixture), `stopGroup` sobre nietos, el plazo del build, `PI_PG_BIN_DIR` vacío, los presupuestos del mapa y del CSS, y los valores por defecto de las señales del clúster. La prueba del «pid reutilizado» usaba **el pid del propio worker de Vitest**: si el código regresaba, habría matado al ejecutor.
  4. **Un defecto latente en mi código**: `waitForServer` lanzaba su error dentro de un `try` con un `catch` que lo tragaba todo y solo funcionaba por una segunda comprobación redundante (E-74). Simplificado a una comprobación fuera del `try`.
  5. **La herramienta de mutación tenía huecos propios** (selección mezclada con un ID inexistente, base incompleta, ancla duplicada, restauración y código de salida ante señales) y **perdía una prueba** por un título duplicado (937 frente a 938; E-75). Todo con prueba.
  6. **Dos «equivalentes» y una que no lo era.** Q1 y Q2 (quitar `if (postmasterAlive())`) son equivalentes de verdad y quedan justificadas por escrito; L1 parecía equivalente y era un hueco real.
  7. **Una sorpresa del entorno**: el PID 1 no recoge zombis, así que `kill(pid, 0)` da «vivo» para un proceso ya muerto (E-73); la prueba de nietos lee `/proc`.
- **Lo que no toqué y por qué**: `i18n.spec.ts:128` (una espera de sincronización cuyo fallo detecta el `click` siguiente) y `helpers.ts:93` (segundo canal de violaciones CSP ya sumado) tragan errores pero **no** vacían ninguna aserción.

### Qué no pudo verificarse

- **`ci.yml` nunca se ejecutó** (no hay remoto): es **IMPLEMENTED, no VERIFIED**. Sus guardas son textuales (no lo ejecutan) y el YAML lo valida Prettier.
- **Chromium 141 en local, 156 en el CI** (E-68): todo E2E/axe/WebGL/CSP se verificó con el 141; **nada se ejecutó sobre el 156** y este entorno no instala navegadores.
- **El presupuesto de 56 omitidas** se midió ocultando el mapa en local, no en GitHub.
- **Los guiones completos** `e2e-content.ts` y `e2e-db.ts` solo se comprobaron a mano (cada pieza tiene su prueba; T-14). El Ctrl+C se **emuló** con `setsid` y `kill -INT -- -PGID`, no en una terminal interactiva.
- **Acciones de terceros por etiqueta, no por hash** (F4-17b): no hay red hacia GitHub para consultarlos y uno supuesto sería peor.
- `test:e2e:db` **sigue fuera del CI**: necesita datos gitignorados y, desde esta entrega, en CI faltar datos es un fallo.
- **Las mutaciones prueban las pruebas locales**, no el CI. Lo demás de la Fase 4 sigue como en la 4b: **nada con contenido real** (la instantánea sigue vacía), `published.json` falsificado con coherencia no se detecta (F4-14), la caducidad en la primera visita (F4-16), datos de fuente sin `lang` (F4-15).

### Decisiones que necesitan a una persona (no puedo tomarlas yo)

Las seis de la 4b (**F4-1**, **F4-3**, **F4-5**, **F4-4/F4-16**, **F4-12**, **F4-14**) y dos nuevas:

7. **¿Se conecta un remoto?** Sin él, `ci.yml` no puede ejecutarse (T-15), no se pueden fijar las acciones por hash (F4-17b) ni exigir `ci-ok` como único check obligatorio. Publicar o crear un remoto necesita tu autorización explícita.
8. **¿Debe el CI generar el mapa base** (F3-14: Python + tippecanoe + red hacia Overture, ≈ 5 min)? Hoy 56 de 160 pruebas E2E se omiten en CI; con el mapa el presupuesto bajaría a 0.

### Pendiente

Primera ejecución real de `ci.yml` y comparación de Chromium (T-15, requiere remoto), fijar acciones por hash (F4-17b), pruebas de punta a punta de los guiones de orquestación y limpieza de señales de `perf:vitals` (T-14), ejecutar las mutaciones de forma periódica (T-13, ahora ≈ 26 min), y lo de la 4b: procedencia de la instantánea (F4-14), idioma de las fuentes (F4-15), regeneración programada (F4-16), contenido real (F4-6), interfaz de autoría (F4-2) y las decisiones de arriba. Ver `docs/backlog.md`.

### Siguiente acción concreta

Igual que en la 4a y la 4b, lo que más valor da depende de una persona: validar los umbrales de evidencia (F4-1) y redactar **un** resumen real con fuente primaria oficial para ver la primera ficha; antes de **publicar** contenido real, decidir F4-14 y F4-16. Para el CI, la acción que desbloquea todo lo pendiente es **conectar un remoto** (decisión 7) y mirar la primera ejecución. Lo que sigue sin depender de nadie es la **interfaz de autoría** (F4-2), que necesita antes una decisión de autenticación.

## Entrega 4d — Fase 4: idioma de las fuentes citadas (F4-15, WCAG 3.1.2)

Alcance: **una sola deuda, la de accesibilidad registrada como R2-12 y aplazada a propósito en la 4b**. Por qué esta y no otra: la Fase 4 ya no tenía trabajo independiente grande (la interfaz de autoría necesita una decisión de autenticación que no existe; F4-14 y F4-16 necesitan decisiones de despliegue y procedencia) y las fases 5–10 dependen de credenciales, derechos o contenido que no existen (L-01…L-05). Esta no depende de nadie y tiene un daño concreto: cuando llegue contenido real, un lector de pantalla pronunciaría el título de un documento en inglés con la voz del español.

### Qué funciona (VERIFIED en local, 2026-10-23)

- **Migración `0010`**: `source_records.language`, **opcional**. `null` significa «no se sabe»: la ficha **no marca `lang` y no lo adivina**. Etiqueta BCP 47 en forma canónica (`es`, `pt-BR`, `es-419`, `zh-Hant-TW`), **solo bien formada**. `anon` recibe SELECT de la columna; el disparador de solo inserción de la 0009 la cubre.
- **Un solo patrón en tres capas** (`src/domains/content/language-tag.ts`): la restricción de la BD, el esquema de la instantánea y el componente (que además no pasa al atributo nada que no lo cumpla). Una prueba de integración compara la **restricción real** con la expresión sobre un corpus (salto de línea final, cifras de ancho completo, mayúsculas fuera de ASCII…) y sobre **más de 400 cadenas aleatorias con semilla fija**: la BD nunca es más laxa que el dominio (ADR-0020).
- **Instantánea y exportador**: `language` es obligatoria en cada evidencia (con `null` = desconocido); una instantánea de la forma anterior **falla en voz alta**. `schema` sigue en 1 (no existe ninguna publicada con la forma anterior: la real está vacía). `pnpm content:export` **avisa** (no falla) de las fuentes sin idioma declarado.
- **Ficha**: `lang` en el título, la institución, el nombre de la licencia y el localizador **cuando se sabe**, en los cinco idiomas (`t.rich` con `<doc>`; el espacio duro del francés se conserva). El texto de la interfaz que los rodea no se marca, y el aviso oculto «se abre en una pestaña nueva», que está dentro del enlace marcado, **vuelve al idioma de la interfaz**. Tamaño de la ficha sin cambios (191,1 KB gzip).
- **ADR-0021** y documentación (data-model, i18n, security R2-12 resuelta con sus límites, backlog F4-15 cerrado y T-16).

### Cómo ejecutarlo

```bash
pnpm check                                                        # typecheck + lint + format + 1018 unitarias
pnpm test:integration                                             # 357 (incluye la paridad BD ≡ dominio y el exportador con idioma)
SITE_ENV=development pnpm build && pnpm check:bundle              # la ficha sigue en 191,1 KB
CI=true pnpm test:e2e && pnpm check:e2e-skips --max-skipped 56    # 160
pnpm test:e2e:content && pnpm test:e2e:db                         # 28 (con axe, cinco idiomas, dos temas) · 7
python3 scripts/mutation/{ts,db,cli}.py                           # incluyen las 30 mutaciones nuevas (I1–I18, Y1–Y10, L1–L2)
```

### Pruebas ejecutadas (observadas el 2026-10-23)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **1018** (50 ficheros) · `pnpm test:integration`: **357** (18 ficheros; 0 clústeres huérfanos) · `pnpm test:pipelines`: **119** · `pnpm test:e2e` con `CI=true` y el mapa real: **160 pasan, 0 omitidas** · `pnpm test:e2e:content`: **28** (21 previas + 7 nuevas) · `pnpm test:e2e:db`: **7** · `pnpm check:bundle`: OK sin cambios · **mutación: las 30 nuevas, 29 detectadas + 1 equivalente justificada; las **110** de `db.py`, `ts.py` y `cli.py` (80 previas + 30 nuevas) **repetidas sobre el código final: 108 detectadas, `D1` avisa** (depende del reloj: eran las 13:05 UTC, fuera de la ventana 00:00–05:00) **y `Y4` es la equivalente justificada; 0 supervivientes**. `ci.py` (105) no se repitió: esta entrega no tocó ningún archivo que muta**.

### Lo que se encontró y cambió (honestamente)

- **La mutación de mi propio trabajo: 28 de 30 en la primera pasada.** Los dos restantes: **I17 era un hueco real** (el título de una fuente sin enlace seguro se pinta como `<span>` y nada comprobaba que conservara su `lang`; ahora hay prueba) e **Y4 era equivalente y yo creía lo contrario**: quitar `language is null or` de la restricción no cambia nada, porque en PostgreSQL un `CHECK` se cumple cuando la expresión da `NULL`. Mi intuición de que «`null` se rechazaría» era falsa en SQL; queda marcada como equivalente con su justificación escrita.
- **Una interacción que no vi al diseñar**: el texto oculto «se abre en una pestaña nueva» queda **dentro** de un enlace con `lang="it"`, y un lector de pantalla lo leería con la voz del documento. Lo descubrí al escribir el E2E (la página inglesa tenía un segundo `[lang="en"]` y rompía una comprobación que contaba cualquier elemento); el aviso vuelve ahora al idioma de la interfaz y esa comprobación se acotó a `p[lang=…]`, que es lo que decía querer.
- **Un idioma sintético mal elegido en mi E2E**: con una fuente en francés, la página francesa tendría dos clases de elementos con `lang="fr"` y el recuento no distinguiría un caso del otro; la siembra usa `it` (ninguno de los cinco de la interfaz) y `pt-BR` (para ejercitar la región de punta a punta).
- **Errores de mi prueba de paridad que vi antes de fiarme de ella**: el propietario no tiene usuario (`created_by` es `not null`) y una cadena con NUL se rechaza con otro código (22021, no 23514). Se corrigieron antes de aceptar su veredicto.
- **Lo que axe no dice**: su regla `valid-lang` (etiquetada `wcag2aa`/`wcag312` en axe-core 4.14.0) solo valida el **valor** de `lang`; **no detecta su ausencia** en un pasaje en otro idioma. Un axe en verde no demuestra el criterio; por eso hay pruebas de **presencia** (componente y E2E).
- **No toqué** las fuentes del mapa (`data_sources`: Overture, ODbL, Noto…): son nombres propios e identificadores de licencia, y su idioma es conocido y fijo.

### Qué no pudo verificarse

- **El texto de WCAG 3.1.2 y sus excepciones, en su fuente primaria**: `w3.org` está bloqueado por la política de red (403, E-76) y no se rodea. Lo que cito de la norma es **de memoria**.
- **Lectores de pantalla reales** (NVDA, VoiceOver, TalkBack): solo se comprobó el DOM y axe. Que la voz cambie de verdad con `lang` en esos spans no está probado con personas ni con esos programas.
- **Que la etiqueta esté registrada en IANA** y la **dirección del texto** (`dir`) en idiomas de derecha a izquierda (T-16).
- **Ninguna fuente real**: la instantánea publicada sigue **vacía**; todo usa datos sintéticos. Hasta que alguien edite fuentes, **el idioma quedará en `null`** (no hay interfaz de autoría que lo pida: F4-2).
- Lo de la entrega 4c: `ci.yml` nunca se ejecutó (no hay remoto) y el CI instalará Chromium 156 frente al 141 de aquí (E-68).

### Decisiones que necesitan a una persona (no puedo tomarlas yo)

Las ocho de la 4c (**F4-1**, **F4-3**, **F4-5**, **F4-4/F4-16**, **F4-12**, **F4-14**, **conectar un remoto**, **¿debe el CI generar el mapa base?**) y una nueva:

9. **¿Se vuelve obligatorio el idioma de la fuente cuando exista la interfaz de autoría (F4-2)?** Hoy es opcional con un aviso del exportador, porque exigirlo sin esa interfaz rechazaría contenido válido.

### Pendiente

T-16 (registro IANA, `dir`, leer la norma), T-14 y T-15 (guiones de orquestación y primera ejecución del CI), F4-17b (acciones por hash), procedencia de la instantánea (F4-14), regeneración programada (F4-16), contenido real (F4-6), interfaz de autoría (F4-2) y las decisiones de arriba. Ver `docs/backlog.md`.

### Siguiente acción concreta

**Lo independiente de las personas en la Fase 4 está agotado**: lo que queda necesita una decisión (autenticación para F4-2, despliegue para F4-16, procedencia para F4-14) o contenido real. Las fases 5–10 están además bloqueadas por L-05 (cobertura Google/Mapillary `UNKNOWN`) y por no haber contenido que contar. Se puede preparar el esqueleto puro de un recorrido guiado (esquema de pasos con cámara y referencias a contenido verificado), pero **no lo recomiendo hasta que exista contenido**: construir la interfaz de un recorrido vacío sería inventar cobertura. Lo que más valor da sigue siendo una sesión corta contigo: validar los umbrales (F4-1), redactar **un** resumen real con fuente primaria oficial (con el idioma de la fuente) y decidir si se conecta un remoto.

## Entrega 4e — Fase 4: concurrencia del modelo de contenido (F4-8)

Alcance: **la mitad de F4-8 que se puede cerrar sin nadie**: qué pasa cuando dos personas actúan a la vez sobre el mismo campo del mismo destino. Hasta aquí «verificado, versionado e inmutable» —la promesa central del modelo— solo se había probado con una conexión a la vez. La otra mitad (coste de las políticas RLS con más datos) sigue pendiente. Esta fue una **hipótesis comprobada, no una corrección a ciegas**: primero se midió qué fallaba.

### Qué funciona (VERIFIED en local, 2026-10-23)

- **Pruebas de concurrencia reales** (`content-concurrency.test.ts`, 11): conexiones propias con la intercalación **fijada sin `sleep`** (una retiene su transacción; la otra se lanza sin esperarla y se sigue cuando `pg_stat_activity` dice `Lock`).
- **Qué se halló** antes de corregir (7 de 10 fallaban): **no había corrupción** (los índices únicos `assertion_unique_version` y `field_assertions_one_current` hacían su trabajo), pero sí **errores espurios** `23505`: de **ocho** borradores simultáneos, **cuatro** fallaban; la verificación **legítima** de una versión nueva fallaba si otra se verificaba a la vez; y verificar una versión anterior daba «clave duplicada» en vez de `assertion_older_version`.
- **Migración `0011`** (ADR-0022): un disparador mínimo, `field_assertions_00_serialize`, toma un bloqueo consultivo de transacción por (destino, campo) al insertar y al cambiar de estado, **el primero** por orden alfabético (una prueba lo exige). Granularidad exacta: campos o destinos distintos, y editar el texto de un borrador, **no esperan**. Las funciones grandes de la 0007/0008 **no se reescriben**; los índices únicos siguen como red de seguridad.

### Cómo ejecutarlo

```bash
pnpm test:integration                       # 368 (incluye content-concurrency: 11)
python3 scripts/mutation/db.py              # 69 mutaciones (≈ 10 min), con Z1–Z8 de la 0011
pnpm check && pnpm test:e2e:content && pnpm test:e2e:db   # 1018 · 28 · 7
```

### Pruebas ejecutadas (observadas el 2026-10-23)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **1018** · `pnpm test:integration`: **368** (19 ficheros; 0 clústeres huérfanos) · `pnpm test:e2e:content`: **28** · `pnpm test:e2e:db`: **7** · concurrencia: **9 repeticiones seguidas** sin un fallo · **mutación: Z1–Z8, 8 de 8 a la primera; `db.py` completo sobre el código final: 67 detectadas, `D1` avisa (reloj), `Y4` equivalente justificada, 0 supervivientes**.

### Lo que se encontró y cambió (honestamente)

- **Mi predicción acertó a medias, y es lo que conviene decir**: esperaba «sin corrupción pero con errores espurios» y fue exactamente así; lo que **no** esperaba era que de **ocho** simultáneos fallaran **cuatro** (la mitad), ni que la verificación legítima de una versión nueva fuera una de las víctimas.
- **Un defecto de diseño en mi propia migración, visto antes de confirmarla**: `if tg_op = 'INSERT' or new.status is distinct from old.status` depende del orden de evaluación del `OR` (en un `INSERT`, `old` no está asignado y referenciarlo da error). Funcionaba por el cortocircuito de izquierda a derecha, que la documentación no garantiza; la condición es ahora explícita.
- **Una decisión de diseño sin prueba**: «editar el texto de un borrador no necesita bloqueo» estaba dicha en el SQL y ninguna prueba la exigía (la mutación Z8 habría sobrevivido). Se cubrió **antes** de mutar.
- **Lo que no he comprobado**: cómo lee esto la documentación de PostgreSQL sobre instantáneas por sentencia (este entorno no puede consultarla); lo que sé es que **las pruebas pasan** (E-77).

### Qué no pudo verificarse

- **Un _pooler_ o una base remota (Supabase)**: probado solo por socket Unix local. El bloqueo es de transacción (`xact`), que en principio es compatible con un _pooler_ en modo transacción, pero **no lo probé**.
- **El coste de la contención y de las políticas RLS con más datos** (la otra mitad de F4-8): sin medir.
- **Transacciones largas** (bloquean ese destino y campo hasta terminar) y **varios campos por transacción** (podrían dar `40P01`): la interfaz de autoría (F4-2) deberá usar transacciones cortas.
- **Estabilidad en CI**: las pruebas de concurrencia son las más propensas a ser intermitentes; en local no fallaron en 9 repeticiones, pero `ci.yml` nunca se ejecutó (no hay remoto).
- Todo lo anterior: contenido real (la instantánea sigue **vacía**), lectores de pantalla reales, Chromium 141 local frente a 156 en CI.

### Decisiones que necesitan a una persona (no puedo tomarlas yo)

Las nueve de la 4d. Sin cambios.

### Pendiente

Coste de las políticas RLS y _pooler_ (F4-8, segunda mitad), T-16, T-14, T-15, F4-17b, F4-14, F4-16, F4-6, F4-2 y las decisiones de arriba. Ver `docs/backlog.md`.

### Siguiente acción concreta

Lo independiente de las personas **dentro del modelo de contenido** está agotado; lo que queda necesita decisión o contenido (F4-2, F4-14, F4-16, F4-6) o un entorno con red (T-15). Quedan dos deudas técnicas locales menores (T-14, medir el coste RLS). Lo que más valor da sigue siendo una sesión corta contigo: umbrales (F4-1), **un** resumen real con fuente primaria y su idioma, y si se conecta un remoto.

## Entrega 4f — Fase 4: coste de RLS y del exportador con volumen (F4-8, segunda mitad)

Alcance: **la otra mitad de F4-8**, la que llevaba dos entregas como «sin medir»: ¿cuánto cuestan las políticas RLS y los disparadores con más datos? Se construyó un banco reproducible (`pnpm perf:db`), se **midió antes de cambiar nada** y solo se corrigió lo que las cifras señalaron. El resultado **no fue el que yo esperaba**: lo que preocupaba (la serialización de la 0011 y la RLS pública) resultó barato, y lo que nadie vigilaba (una función de rol evaluada fila a fila y un montaje cuadrático del exportador) era lo caro.

### Qué funciona (VERIFIED en local con datos sintéticos, 2026-10-23)

- **Banco `pnpm perf:db`** (`scripts/perf/db-cost.ts`): a tres escalas (2 940 / 29 400 / 294 000 filas) mide el **exportador real** (se registran sus consultas, no se copia su SQL), la **lectura con RLS frente a lo mismo escrito a mano** (con `EXPLAIN`), la **escritura** con y sin los disparadores y la **contención** con `pgbench`, en un clúster relajado y en otro **durable**. Se **autocomprueba** (recuentos, disparadores realmente desactivados, filas realmente escritas, versiones contiguas bajo carga) y dice lo que **no** es. No es una puerta de CI.
- **Migración `0012` (ADR-0023)**: las políticas RLS evalúan `app.is_*()` y `app.current_user_id()` **una vez por consulta** (`(select …)`) y no por fila. La cola de revisión sobre 294 000 filas pasó de **17,9 s a 19,7 ms**. Se reescribieron las 45 políticas desde el catálogo (no a mano), sin cambiar roles, comando ni significado; una prueba sobre `pg_policies` lo **exige a las futuras**.
- **Exportador lineal**: evidencia y traducciones se agrupan por afirmación una vez. Con 126 000 afirmaciones, de **176,6 s a 4,6 s** (el SQL son 4,1 s).
- **El disparador de serialización de la 0011 cuesta menos que el ruido** (≤ 0,2 ms por inserción; −0 a −4 % de tps con claves repartidas). Una sola clave caliente admite ≈ 1 000–1 600 versiones por segundo con 8 escritores. La decisión del ADR-0022 aguanta.
- **`startTestCluster({ durable: true })`**: valores de producción de PostgreSQL (el valor por defecto no cambia); comprobado contra `pg_settings`.

### Cómo ejecutarlo

```bash
pnpm perf:db --smoke                                   # escala mínima, segundos (lo que prueba db-cost-smoke.test.ts)
pnpm perf:db --json docs/research/mi-medicion.json     # las tres escalas, ≈ 20 min, SIN nada más en marcha
pnpm test:integration                                  # 378 (incluye rls-initplan, pg-cluster-settings y db-cost-smoke)
python3 scripts/mutation/db.py R1 R2 R3 R4 R5 R6 R7 X1 X2   # las mutaciones nuevas
```

### Pruebas ejecutadas (observadas el 2026-10-23)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **1018** · `pnpm test:integration`: **22 ficheros / 378** (antes 19 / 368: +4 de RLS por consulta (guarda, detector, plan y re-ejecución), +2 de ajustes del clúster, +3 de humo del banco y +1 de caracterización del exportador) · `pnpm test:pipelines`: **119** · `pnpm test:e2e:content`: **28** · `pnpm test:e2e:db`: **7** (ambos ejercen el exportador y las políticas reescritas de punta a punta) · **mutación: `db.py` 78 (76 detectadas + `D1` por el reloj + `Y4` equivalente), `ci.py` 105 (103 + 2 equivalentes), `ts.py` 41, `cli.py` 8; 0 supervivientes. Las nueve nuevas (R1–R7, X1–X2) murieron a la primera.** Rojo→verde: la guarda y la prueba de plan **fallan sin la 0012**. Falsificación a mano de cuatro autocomprobaciones del banco: se disparan.

### Lo que se encontró y cambió (honestamente)

- **Mi hipótesis de partida estaba equivocada.** Esperaba que el coste estuviera en la serialización y en los `exists` anidados de la RLS pública. Medido: la serialización es indistinguible del ruido y la RLS pública cuesta ×1,1–2,7 en milisegundos. El coste estaba en `app.is_staff()`: ×500–1 500 sobre lo manual, **lineal en las filas** (176 ms → 1,76 s → 17,9 s), porque una función `security definer` sin envolver se evalúa fila a fila y **antes** que los filtros de la consulta.
- **Hoy nada de esto se notaba**, y conviene decirlo: el registro tiene **nueve destinos** y la instantánea admite **5 000 afirmaciones** (E-79), así que lo publicable son ≤ 72. Las escalas miden el **margen** si el modelo creciera, no el régimen actual. Se corrigió porque es barato, está medido y 45 políticas tenían la forma que se heredaría en cada pantalla de personal futura; **no** porque hubiera un problema visible.
- **El exportador fallaba tarde**: por encima del tope de 5 000 gastaba minutos en montar antes de rechazar. Lineal, rechaza a tiempo.
- **Dos supuestos míos desmentidos al construir el banco** (y por eso hay autocomprobaciones): que el exportador rechazaría los destinos sintéticos en la revalidación semántica (rechaza antes, en el esquema `z.enum`), y que `ALTER SYSTEM` podía cambiar `fsync` en un clúster ya arrancado (las opciones de línea de órdenes lo pisan: E-81).
- **Un hueco de mi propia migración, visto antes de mutar**: el `(?<!SELECT )` del patrón es equivalente en la primera ejecución. Se añadió la prueba de re-ejecución, que lo mata, y de paso fija que una pasada vacía falla en voz alta.
- **Contaminación evitada**: la medición «antes» migraba su clúster durable al final de la fase relajada y habría leído la 0012 ya escrita; se apartó el fichero mientras corría.
- **Anotado y no corregido**: la lectura **anónima** de `source_records` (RLS anidada) cuesta ×25 a 29 400 filas (300 ms frente a 12 ms). No está en ninguna ruta del producto y no tiene funciones por fila (T-17).

### Qué no pudo verificarse

- **Producción**: datos sintéticos, socket Unix (sin red, _pooler_ ni PostgREST), un equipo de cuatro núcleos compartido con `pgbench` y un disco cuyo `fsync` cuesta ≈ 0,3 ms (**uno de producción puede costar 1–10 ms y el bloqueo se mantiene hasta el `COMMIT`**).
- **Ruido**: hasta un 20 % entre dos ejecuciones idénticas; la contención es una pasada de 5 s por celda. Las diferencias pequeñas no son conclusiones.
- **La revalidación de puertas del exportador a escala** (necesita destinos del registro: F4-18) y los datos sembrados saltándose los disparadores.
- **La equivalencia formal de las 45 políticas**: la evidencia son las 368 pruebas de integración previas, sin tocar.
- **Que el exportador siga siendo lineal**: nada lo vigila fuera de ejecutar `perf:db`.
- Todo lo de antes: contenido real (la instantánea sigue **vacía**), `ci.yml` nunca ejecutado (no hay remoto), lectores de pantalla reales, Chromium 141 local frente a 156 en CI.

### Decisiones que necesitan a una persona (no puedo tomarlas yo)

Las nueve de la 4d, sin cambios. **Nueva**: si el crecimiento previsto (¿cuántos destinos en un año?) justifica ya diseñar el registro de destinos en la BD y una instantánea paginada (F4-18); mientras sean decenas, no.

### Pendiente

Repetir las mediciones con un _pooler_ o una base remota y un disco de producción (F4-8), pantallas de personal reales e índices (T-17), techo de diseño del contenido (F4-18), T-16, T-14, T-15, F4-17b, F4-14, F4-16, F4-6, F4-2 y las decisiones de arriba. Ver `docs/backlog.md`.

### Siguiente acción concreta

Lo independiente de las personas **dentro del modelo de contenido y su base de datos** está ahora agotado y medido. Cada paso que queda necesita una decisión (F4-1, F4-2, F4-3…), contenido real (F4-6) o un entorno con red y un remoto (T-15, F4-17b). La recomendación sigue siendo la misma, y más firme: una sesión corta para fijar los umbrales de verificación (F4-1) y verificar **un** resumen real con fuente primaria. Es lo único que probaría el modelo de punta a punta; seguir puliendo un modelo vacío empieza a tener rendimientos decrecientes.

## Entrega 5a — Fase 5: Experience Resolver (componente independiente)

Alcance: **la parte de la Fase 5 que no depende de nadie.** La fase pide imágenes y panoramas de calle, Guided Tour y Story Mode, y todo eso está **BLOQUEADO** por lo externo (F5-4): Street View no tiene credencial, `mapillary.com` y `kartaview.org` están bloqueados por la política de red (E-00, E-36), ningún proveedor tiene política de derechos ni cobertura verificada y no hay historias con contenido permitido. Pero el **Experience Resolver** (PROMPT-MAESTRO §10, `architecture.md` §J) está diseñado desde la Fase 0 y no existía como código; sus entradas son parámetros, así que se puede construir y probar ya, y fija el contrato del que colgarán los proveedores cuando lleguen.

### Qué funciona (VERIFIED en local, 2026-10-24)

- **`resolveExperience(input) → ExperienceManifest`** (`src/domains/experience/`, ADR-0024), pura y determinista: excluye lo que no tiene derechos, configuración, cobertura vigente, proveedor sano, cuota, WebGL o contenido, **con el motivo de cada exclusión** (conjunto cerrado; se dicen todos); elige según el tipo de destino y la intención; deja **fallbacks ordenados** (lo que queda por debajo) y conserva **siempre** idioma, cámara y selección. Reutiliza `evaluateRights`, `resolveMapExperience` y la cobertura con caducidad: no hay una segunda fuente de verdad.
- **Calidad con histéresis** (`LITE | STANDARD | HIGH`): sin medición, `STANDARD` (nunca se supone un equipo potente); bandas entre entrar y salir; bajar es inmediato, subir exige aguantar y un solo nivel.
- **Histéresis de la representación por estabilidad de la candidata**, con `advancePrevious` como única forma de avanzar la memoria. Un proveedor que parpadea cada segundo durante 600 s produce **un** cambio (sin histéresis, 599).
- **Con los datos REALES de hoy** (nueve destinos, su cobertura, las políticas de derechos): `TOPOGRAPHIC_TERRAIN` en las tres localidades (El Valle, Boquete y Santa Catalina) y en el volcán, `MAP_2D` en ciudades, canal, archipiélago e isla (**la tabla por tipo es burda**: Santa Catalina es una localidad costera y recibe terreno solo porque su tipo es `locality`; F5-1); la 3D fotorrealista queda excluida por tres motivos independientes (sin configurar, sin política, cobertura `UNKNOWN`) y la calle, proveedor a proveedor; en producción, `TEXT_ONLY` (coincide con lo que `resolveMapExperience` ya decide). Nada mejor que terreno o mapa es alcanzable pase lo que pase.

### Cómo ejecutarlo

```bash
pnpm test                                                        # 1108 (incluye las 90 del resolver y la calidad)
python3 scripts/mutation/ts.py Q1 Q2 … R32                       # las 51 mutaciones nuevas (o sin IDs: todas)
```

### Pruebas ejecutadas (observadas el 2026-10-24)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **53 ficheros / 1108** (antes 50 / 1018: +90) · `pnpm test:integration`: 22 / 378, sin cambios (no toca nada de lo que usa) · **mutación: 51 nuevas, 50 detectadas y 1 equivalente (R17); pasada completa de `ts.py` sobre el código final: 92 (91 detectadas + `R17` equivalente), 0 supervivientes.** No se reejecutaron los E2E: ningún fichero que cargan cambió (el resolver no está importado por la aplicación).

### Lo que se encontró y cambió (honestamente)

- **Mi primera histéresis no funcionaba, y su comentario decía que sí.** Medía cuánto llevaba la representación **actual**; con un proveedor intermitente, tras 15 s se subía y se bajaba al instante, **un cambio cada ~16 s**. Lo vi al **simular a mano** la prueba de oscilación **antes de ejecutarla**; el criterio correcto es cuánto lleva la **candidata** elegible sin interrupción (ADR-0024). Ninguna mutación lo habría descubierto: son las pruebas por simulación las que lo fijan.
- **Dos errores de mis propias pruebas, cazados al escribirlas**: una aserción tautológica (`m.why` comparado con una expresión que podía devolver `m.why`) y un caso basura que dejé a medias. Se sustituyeron por afirmaciones reales (con los datos de hoy, **toda** elección es un `fallback`, porque la 3D es siempre la primera preferencia y siempre está excluida).
- **Cuatro huecos reales de mis pruebas, cazados por la mutación**: los errores de teselas solo se probaban **sin memoria** (Q17–Q19) y `advancePrevious` no probaba el reinicio del tiempo en una calidad nueva (R32). Cerrados.
- **Una consecuencia real que nadie vigilaba**: la evidencia de cobertura de los nueve destinos (observada el 2026-10-20) **caduca el 2027-01-18**; ese día el resolver degradaría a `MAP_2D`. Hoy solo lo vigila una prueba (T-19).
- **Supuestos míos que quedan visibles y no validados** (F5-1): los umbrales de calidad, la tabla de preferencias por tipo de destino (tabla H) y el propio conjunto de intenciones (`explore | terrain | street | story | photos`).

### Qué no pudo verificarse

- El resolver con **proveedores o dispositivos reales**: no existen todavía (F5-4); lo que se prueba es el contrato.
- Que los **umbrales** y la **tabla de preferencias** sean los acertados: las pruebas fijan lo decidido, no su acierto (F5-1).
- Las **restricciones de combinación** (p. ej. «la 3D de un proveedor solo con el mapa del mismo proveedor») no están modeladas (F5-2).
- **Cableado a la interfaz** (F5-3): el resolver no cambia nada visible hoy.
- Todo lo de antes: contenido real (la instantánea sigue **vacía**), `ci.yml` nunca ejecutado (no hay remoto), lectores de pantalla reales, Chromium 141 local frente a 156 en CI.

### Decisiones que necesitan a una persona (no puedo tomarlas yo)

Las nueve de la 4d y la de la 4f (¿cuántos destinos en un año?). **Nuevas**: si los umbrales de calidad y la tabla de preferencias por tipo de destino son los que quieres, o se miden primero (F5-1); y si el conjunto de intenciones es el correcto.

### Pendiente

F5-1 (validar umbrales), F5-2 (combinación), F5-3 (cablear), F5-4 (la fase en sí, bloqueada), T-19 (reobservar la cobertura antes del 2027-01-18), y lo de antes: _pooler_ y disco de producción (F4-8), T-17, F4-18, T-16, T-14, T-15, F4-17b, F4-14, F4-16, F4-6, F4-2. Ver `docs/backlog.md`.

### Siguiente acción concreta

Lo independiente de las personas **en las Fases 4 y 5** está agotado: lo que queda es contenido real, proveedores con credencial, decisiones o un remoto. Dos cosas con **fecha**: reobservar la cobertura antes del **2027-01-18** (T-19) y, antes de cualquier proveedor de calle, resolver F5-4. La recomendación sigue siendo la misma, y ya es la tercera vez que la escribo: una sesión corta para fijar los umbrales de verificación (F4-1) y verificar **un** resumen real con fuente primaria. Sin eso, cada entrega nueva es andamiaje sobre un producto sin un solo dato verificado.

## Entrega 5b — T-14: los guiones de orquestación, de punta a punta

Alcance: la deuda técnica T-14, que era lo único independiente de las personas con **riesgo real**: los orquestadores de pruebas (`e2e-content`, `e2e-db`, `perf:vitals`) levantan clústeres, servidores y navegadores, y si Ctrl-C deja restos o se pierde, todo lo que se pruebe encima es sospechoso. Cada pieza tenía pruebas; el **guion completo** solo se había comprobado a mano (una señal, en un momento concreto). Al automatizarlo **fallaron las tres pruebas de Ctrl-C**, cada una por un defecto distinto.

### Qué funciona (VERIFIED en local, 2026-10-24)

- **Ctrl-C ya no deja restos ni sale con 1.** En el arranque del clúster, en el build, con una señal y con la doble que reenvía `tsx`: salida 130/143 y cero restos (directorios del clúster, copia de la app, procesos vivos).
- **`withTermination` y `exitWith`** (en `e2e-run.ts`): una sola implementación del ciclo de vida (limpieza única, esperada **antes** de soltar los manejadores; 130/143 sin imprimir como error lo que es consecuencia). Los usan `e2e-content`, `e2e-db` y `perf:vitals`.
- **`startTestCluster` interrumpido durante el arranque**: retiene las señales, limpia, para un postmaster a medias y sale con 130/143; una señal que llega en un tramo síncrono sin matar a ningún hijo **ya no se pierde**.
- **`perf:vitals`**: antes dejaba un `next-server` huérfano con Ctrl-C (y usaba el CLI `tsx`); ahora puerto libre, servidor propio verificado, `node --import tsx` y una sola limpieza para servidor y navegador. Verificado a mano antes y después, con una señal y con la doble.
- **Las pruebas** (ver `docs/testing.md`, «Entrega 5b»): los guiones de punta a punta, el arranque interrumpido con un `initdb` falso (determinista), los helpers con un guion mínimo y una guarda textual de que los tres guiones usan el ciclo de vida compartido.

### Cómo ejecutarlo

```bash
pnpm test:integration tests/integration/e2e-scripts.test.ts tests/integration/cluster-startup-signals.test.ts
pnpm exec vitest run --project unit tests/unit/scripts
python3 scripts/mutation/ci.py                                  # las mutaciones (con las 24 nuevas)
```

### Pruebas ejecutadas (observadas el 2026-10-24)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **54 ficheros / 1123** (antes 53 / 1108) · `pnpm test:integration`: **24 / 396** (antes 22 / 378; tres pasadas seguidas sin intermitencias) · `pnpm test:pipelines`: **119** · `pnpm test:e2e:content` y `pnpm test:e2e:db`: **28** y **7** (repetidos el 2026-10-24 sobre el código final) · `pnpm perf:vitals --runs 1`: completa en 29 s con las mismas cifras de transferencia que M-06 · **mutación: 24 nuevas, 23 detectadas y 1 equivalente (N23); una real sobrevivía (N15) y se cerró; pasada completa de `ci.py` sobre el código final: **129 mutaciones, 126 detectadas y 3 equivalentes justificadas (Q1, Q2, N23), 0 inválidas.**** Rojo→verde: las pruebas del arranque interrumpido fallan con el `pg-cluster.ts` anterior.

### Lo que se encontró y cambió (honestamente)

- **Tres defectos de la F4-17, que yo escribí y di por comprobados** («Ctrl-C 8/8» era una señal en un momento concreto): el arranque del clúster no tenía manejadores y dejaba el directorio; una señal durante el build salía con 1; y con la señal doble el `finally` soltaba los manejadores antes de esperar la limpieza, así que la segunda señal mataba el proceso dejando clúster y copia. **Y el mismo orden defectuoso lo repetí en `vitals.ts` una hora antes**; mi comprobación de una sola señal no lo habría visto.
- **Mi primer arreglo del arranque perdía el Ctrl-C en otra ventana**: una señal que llegaba durante el tramo síncrono sin matar a ningún hijo quedaba pendiente y se descartaba al soltar la retención. Lo demostró una prueba determinista, no una carrera de tiempos. Con `tsx` cargado la señal llega ≈ 0,4 ms después de volver (no en la vuelta de `setImmediate`, como en Node puro): se cede el bucle 20 ms (E-84).
- **Mi detector de huérfanos mentía**: daba «0 huérfanos» para la versión **antigua** (que sí dejaba uno) porque `next start` cambia su título de proceso a `next-server` (E-85). Lo descubrí **falsando el detector** contra la versión que dejaba restos.
- **Un superviviente real de la mutación (N15) por culpa de mi fixture**: sus manejadores permanentes impedían que la segunda señal matara el proceso con o sin el defecto. Con `process.once` la prueba detecta el defecto.
- **Dos errores míos al escribir las pruebas**, cazados al ejecutarlas: un fixture que terminaba con 0 antes de recibir la señal (sin nada que mantuviera vivo el bucle) y una limpieza no idempotente (el helper ahora la garantiza él mismo).

### Qué no pudo verificarse

- El **Ctrl-C de `e2e-db` y de `perf:vitals` de punta a punta** en una prueba automática: necesitan build, mapa e ingesta; comparten los helpers probados y la guarda textual, y se verificó **a mano**.
- El **hueco de ≈ 1 ms** del `await freePort()` durante el arranque: no hay forma determinista de apuntar a él; lo cubre la espera final.
- La prueba del `id` del `chown` **solo corre como `root`**; en un CI sin privilegios se omite (y lo dice).
- **Nada de esto se ha ejecutado en CI** (no hay remoto).
- Todo lo de antes: contenido real (la instantánea sigue **vacía**), `ci.yml` nunca ejecutado, lectores de pantalla reales, Chromium 141 local frente a 156 en CI.

### Decisiones que necesitan a una persona (no puedo tomarlas yo)

Las de la 4d, la de la 4f y las de la 5a. Ninguna nueva.

### Pendiente

T-19 (reobservar la cobertura antes del **2027-01-18**: aquí la decisión es si se automatiza un aviso), T-16 (IANA y `dir`; lo primero necesita red), F5-1…F5-4, y lo de antes: _pooler_ y disco de producción (F4-8), T-17, F4-18, T-15, F4-17b, F4-14, F4-16, F4-6, F4-2. Ver `docs/backlog.md`.

### Siguiente acción concreta

Con T-14 cerrado, lo independiente de las personas que merece la pena está **agotado**: T-16 es menor y necesita red para su parte útil. Queda una tarea con **fecha** (T-19, 2027-01-18) y todo lo demás espera contenido real, proveedores con credencial, un remoto o decisiones tuyas. Es la quinta entrega seguida en la que lo digo; la recomendación no cambia: una sesión corta para fijar los umbrales de verificación (F4-1) y verificar **un** resumen real con fuente primaria.

## Entrega 5c — F4-17b: las acciones de terceros del CI, fijadas por hash de commit

Alcance: R3-13 de la revisión independiente (F4-17). `actions/checkout@v4` y las otras cuatro acciones eran **etiquetas móviles**: quien controle o comprometa el repositorio de la acción cambia lo que corre en el CI sin tocar este repositorio. Estaba **DEFERRED** porque no había forma de consultar los hashes («uno supuesto sería peor que una etiqueta»). Con acceso de lectura git a los repositorios públicos ya se pueden **leer** en vez de suponerlos. Es una mejora de la cadena de suministro; **no añade ninguna función de producto**.

### Qué funciona

- **Las 16 referencias de `ci.yml` (5 acciones) van por hash de commit** con la versión exacta en el comentario (`# v4.4.0`). Los hashes se leyeron del repositorio de cada acción con `git ls-remote --tags` el 2026-10-24 (E-86). En una etiqueta **anotada** (`pnpm/action-setup`) se fija el commit pelado, no el objeto etiqueta.
- **`pnpm check:action-pins`** (sin red; también lo ejecuta `pnpm test`): hash de 40 hexadecimales en minúscula, versión `vX.Y.Z`, una sola referencia por acción, nombres válidos, y **falla cerrado** ante lo que parece un `uses:` y no sabe leer (estilo de flujo, referencia dinámica).
- **`pnpm check:action-pins --online`**: contrasta cada hash con la etiqueta de su comentario en el repositorio de la acción. Importa porque un hash puede ser de otro commit alcanzable desde el repositorio (también de un fork). Salida **0 / 1 / 2** y «no pude comprobarlo» (sin red, `git` que falla o se cuelga) **nunca** es un verde.
- **`.github/dependabot.yml`** para `github-actions` (semanal): actualiza el hash y la versión a la vez.

### Cómo ejecutarlo

```bash
pnpm check:action-pins             # forma, sin red
pnpm check:action-pins --online    # además, contra el repositorio de cada acción (necesita acceso git a GitHub)
python3 scripts/mutation/ci.py A1 A2 … B11 Y13 … Y17    # las 35 mutaciones nuevas (ver docs/testing.md, «Entrega 5c»)
```

### Pruebas ejecutadas (observadas el 2026-10-24)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **56 ficheros / 1214** (antes 54 / 1123: **91 pruebas nuevas**) · `pnpm test:integration`: **24 / 396** (sin cambios; repetida al final) · **mutación: 35 nuevas, 35 detectadas** en la pasada final (3 eran supervivientes de mis propias pruebas y se cerraron), y **Y1–Y12 y P1–P8 repetidas** tras tocar `ci.yml` y `package.json`: todas detectadas · `check:action-pins --online` contra el upstream real: **5 de 5 coinciden**, y **falsado** con un hash ajeno y con una etiqueta inexistente (los dos salen con 1).

### Lo que se encontró (honestamente)

- **Un defecto mío antes de mutar**: el CLI daba **0** si un repositorio no tenía etiquetas (salida vacía), porque la confundía con «no se pudo leer». Lo vi razonando qué mutaciones sobrevivirían; prueba roja → corrección.
- **Una prueba que medía el entorno, no el programa** (A18): comprobaba que `git` recibía `GIT_TERMINAL_PROMPT=0`, pero este entorno ya lo trae a `0`, así que pasaba con o sin el código. La mutación que quitaba esa línea sobrevivió; ahora las pruebas parten de `1`.
- Otros dos supervivientes (A16, B9) eran huecos de mis pruebas, no de la lógica.

### Qué no pudo verificarse

- **Que `ci.yml` se ejecute** con estas referencias: nunca corrió (no hay remoto). Una versión de acción más nueva que la que la etiqueta resolvía cuando se escribió el flujo es un cambio de comportamiento posible (los hashes son los que `@v4`/`@v5` resuelven **hoy**).
- **Dependabot**: solo se comprueba el texto de su configuración. **Sin remoto no hace nada, y fijar sin actualizar envejece en silencio**: las acciones quedarían congeladas, sin sus parches de seguridad, hasta que alguien las revise a mano.
- **Lo que hacen esas versiones por dentro**: el hash garantiza que no cambian, no que sean inocuas, y no cubre sus dependencias transitivas ni las acciones que una acción compuesta use por dentro. Nadie ha leído ese código.
- La comprobación `--online` contra el repositorio **real** se hizo **a mano** (E-86); ninguna prueba automática toca la red.

### Decisiones que necesitan a una persona

Ninguna nueva. Dependabot se activa al conectar un remoto (la decisión de conectarlo sigue siendo tuya: T-15).

### Pendiente

Sin cambios respecto a la entrega 5b salvo que **F4-17b queda hecha** (excepto Dependabot, que espera al remoto). Ver `docs/backlog.md`.

## Entrega 5d — T-20: licencias y avisos de las dependencias

Alcance: el documento rector (§18) pide «comprobar dependencias y licencias sin bloquear el proyecto por alertas no relacionadas o no aplicables», y `docs/security.md` lo daba por hecho («`pnpm audit` y revisión de licencias en CI») **sin que existiera ningún comando ni ningún paso del flujo**. Lo encontré releyendo el documento rector contra el repositorio en vez de mirar mi propio backlog (que no lo recogía). No añade ninguna función de producto.

### Qué funciona

- **`data/dependency-policy.json`**: licencias permitidas por ámbito, excepciones con motivo y plazo, umbrales de gravedad. Todo es una **propuesta técnica mía sin revisión legal**.
- **`pnpm check:licenses`** (sin red; va en el job `check` de `ci.yml`): expresiones SPDX; lo que no se sabe leer falla. Lo no permisivo solo pasa como **excepción provisional con plazo**: se dice en cada ejecución y, **vencido, bloquea** (2027-01-22) para forzar la decisión.
- **`pnpm check:audit`** (con red; en **`audit.yml`**, semanal y aparte de `ci.yml`): umbrales por ámbito (alta en producción, crítica en desarrollo). Aparte a propósito: la base de avisos cambia aunque el código no cambie y un aviso nuevo sin relación no debe bloquear un cambio.
- Salida **0 / 1 / 2**; «no pude comprobarlo» (sin red, `pnpm` que falla, lista vacía, política ilegible) **nunca** es 0.

### Cómo ejecutarlo

```bash
pnpm check:licenses      # sin red
pnpm check:audit         # con red
python3 scripts/mutation/ci.py D1 … D28 E1 … E12 F1 … F6 Y18 Y19 J1 J2   # las 50 mutaciones nuevas
```

### Pruebas ejecutadas (observadas el 2026-10-24)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **59 ficheros / 1332** (antes 56 / 1214: **118 pruebas nuevas**) · `pnpm test:integration`: **24 / 396** (sin cambios; repetida al final) · **mutación: 50 nuevas, 50 detectadas** a la primera, y **Y1–Y12 y P1–P8 repetidas** (20 de 20) · **medido contra el árbol y el registro reales**: 454 versiones de paquete, **0 avisos**, 449 licencias permitidas y **5 provisionales**; falsado con las 5 sin excepción (sale 1), con `lodash@4.17.15` (sale 1) y con el registro muerto (`check:audit` sale 2).

### Lo que se encontró (honestamente)

- **Un control declarado y no implementado** en `docs/security.md`, que mis propias entregas no habían señalado.
- **Trampa de `pnpm audit`**: el campo `dev` de sus acciones sale `false` incluso para una dependencia de desarrollo; el ámbito sale de ejecutar `--prod` y `--dev` por separado (E-87). Lo medí en vez de fiarme del nombre del campo.
- **5 licencias de producción que piden una decisión que no es mía**: las dos tipografías (OFL-1.1, se sirven al navegador), las dos bibliotecas de `sharp-libvips` (LGPL-3.0-or-later; opcionales de `next`, que el proyecto no usa) y `caniuse-lite` (CC-BY-4.0). Ver T-20.
- **Mis errores**: pruebas que creaban su directorio al recogerse y el `afterEach` borraba; tres errores de lint; y una **prueba «sin red» inválida** (`HTTPS_PROXY` a un puerto muerto no corta la red aquí) que dio «0 avisos» estando con red: la cazó que el resultado contradecía lo esperado.

### Qué no pudo verificarse

- Que **`audit.yml` y el paso de licencias se ejecuten en GitHub** (no hay remoto), y que el calendario siga activo (GitHub desactiva los flujos programados tras 60 días sin actividad).
- Que `pnpm audit` detecte lo que **aún no tiene aviso publicado**: no protege de una dependencia comprometida reciente.
- El plazo de 180 s con que se corta un `pnpm` colgado.
- **Revisión legal**: ninguna. Las licencias permitidas, las excepciones y los umbrales son propuestas mías.

### Decisiones que necesitan a una persona

**Nueva (T-20)**: aceptar con nombre, evitar o prorrogar las 5 licencias provisionales **antes del 2027-01-22**; desde ese día `pnpm check:licenses` (y el job `check`) fallan.

### Pendiente

Lo de la entrega 5c más T-20. Ver `docs/backlog.md`.

## Entrega 5e — relectura del documento rector (§4 a §19) contra el repositorio: accesibilidad que axe no ve

Alcance: continuar la técnica de la 5d (leer el documento rector contra el repositorio en vez de mi backlog) con las secciones 3 a 17, y mirar lo medible de §19 (WCAG 2.2 AA «en todos los idiomas»). **Qué se revisó y estaba bien** (comprobado, no supuesto): traducciones que pasan a `outdated` al cambiar el original (disparador `destinations_outdate_translations`), CSS sin propiedades físicas (`margin-left`…: 0 usos), `America/Panama` en fechas, mensajes del cliente solo del espacio de nombres del mapa, `prefers-reduced-motion` en el mapa, StrictMode, lectura segura de ficheros (SSRF, bombas de descompresión, XML/KML), HTTP Range de PMTiles, reflow a 320 px en cinco idiomas. **No se revisaron** las fases 6 a 10 (empresas, rutas, IA, offline): no existen.

### Qué funciona

- **Pruebas E2E de 1.4.12 (espaciado del texto) y 2.4.11 (foco no oculto)**, que axe no puede comprobar, con una prueba de control cada una; falsadas con defectos reales del CSS del build (E-88).
- **Defecto corregido**: mientras el mapa carga, el aviso tapaba sus controles y **seguían en el orden de tabulación** (un teclado aterrizaba en botones invisibles). El contenedor va `inert` hasta `ready`.
- **Declaración de accesibilidad corregida** en los cinco idiomas: decía que el mapa «todavía no está integrado» (falso desde la Fase 2).

### Cómo ejecutarlo

```bash
SITE_ENV=development pnpm build && pnpm exec playwright test e2e/a11y.a11y.spec.ts e2e/map.spec.ts   # o `pnpm test:e2e` entero
CI=true pnpm test:e2e && pnpm check:e2e-skips --max-skipped 57       # como en CI (sin el mapa base: 138 pasan, 57 omitidas)
```

### Pruebas ejecutadas (observadas el 2026-10-24)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **59 / 1332** (sin cambios) · `pnpm test:e2e`: **195** (145 + 50; antes 160) **todas verdes con el mapa**; **CI-like sin el mapa: 138 pasan, 57 omitidas, 0 fallan** · `pnpm check:bundle`: Explorar 205,5 KB de 210. Falsación: texto recortado → falla el espaciado en 5 idiomas; cabecera de 100 vh → falla el foco en 10 páginas; sin `inert` → la prueba del mapa cargando falla de forma determinista.

### Lo que se encontró (honestamente)

- **Un defecto real de accesibilidad** que ninguna prueba previa veía: el estado «cargando» del mapa. Lo destapó una prueba que **fallaba solo en la suite completa**: en vez de repetirla hasta que pasara, la diagnostiqué (qué elemento tapaba y en qué estado) y la hice determinista.
- **Un texto público falso** en la declaración de accesibilidad, en cinco idiomas, durante cuatro fases.
- **Mis errores**: una sonda con un criterio más estricto que el de WCAG daba falsos positivos; una mutación inicial (`max-block-size` en la marca) no mutaba nada y sobrevivió; y un limpiador de procesos por patrón mató mi propio intérprete (trampa de CLAUDE.md).
- **Hueco de §8 que no es un defecto de código**: el documento rector pide un _bottom sheet_ accesible en móvil y hoy el panel se apila bajo el mapa. Anotado como F2-9: hay que decidir si aporta algo antes de construirlo.

### Qué no pudo verificarse

Lectores de pantalla y personas usuarias; 2.4.11 solo en español y alemán y en cinco páginas; que el CI ejecute las pruebas nuevas (no hay remoto); Chromium 141 local frente al 156 del CI.

### Decisiones que necesitan a una persona

Ninguna nueva. (F2-9: si el panel móvil debe ser un _bottom sheet_.)

### Pendiente

Lo de la 5d más F2-9. Ver `docs/backlog.md`.

## Entrega 5f — aviso antes de que caduque la evidencia de cobertura (T-19)

Alcance: la evidencia de cobertura de los nueve destinos (observada el 2026-10-20) **caduca el 2027-01-18** y ese día el Experience Resolver degradaría a `MAP_2D`; hasta ahora solo lo vigilaba una prueba con los datos reales, que falla **después** de la fecha. Esta entrega automatiza el **aviso** (la mitad de T-19 que no necesita a nadie). **Reobservar la cobertura sigue siendo manual**: hay que volver a consultar las fuentes, y eso necesita red hacia ellas y criterio.

### Qué funciona

- **`pnpm check:coverage`** — **VERIFIED**: lógica pura (`scripts/lib/coverage-freshness.ts`, el día llega como parámetro) y CLI (`scripts/check-coverage.ts`). Sale **0** bien, **1** si la primera caducidad está a 30 días o menos (o ya pasó) y **2** si no se pudo evaluar (argumentos o datos inválidos): nunca un verde por no haber podido comprobar. El mensaje dice la fecha, los días, **qué evidencias hay que reobservar** y dónde se actualizan las constantes.
- **Job `coverage` de `audit.yml`** (el flujo pasa a llamarse «Vigilancia semanal») — **IMPLEMENTED, no VERIFIED**: no hay remoto y nunca se ha ejecutado fuera de local.

### Cómo ejecutarlo

```bash
pnpm check:coverage                      # hoy: 0 · 1 (caduca en ≤ 30 días o ya caducó) · 2 (no se pudo evaluar)
pnpm check:coverage --warn-days 60       # avisar antes
pnpm check:coverage --today 2026-12-19   # simular un día (solo para pruebas)
python3 scripts/mutation/ci.py H1 I1 Z7  # mutaciones de lo nuevo (sin argumentos corren todas; con el árbol limpio)
```

### Pruebas ejecutadas (observadas el 2026-10-24)

`pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores · `pnpm test`: **61 ficheros / 1400** (antes 59 / 1332: **68 pruebas nuevas**) · `pnpm check:action-pins`: 22 usos de 5 acciones en 2 flujos, todos fijados por hash · `pnpm check:coverage` sobre los datos reales: **63 observaciones de 9 destinos, la primera caduca el 2027-01-18, quedan 86 días** (sale 0); simulando el día: 2026-12-18 → 0, **2026-12-19 → 1**, 2027-01-11 → 1, 2027-01-18 → 1 («caducó»). **Mutaciones** (`ci.py`: H1–H18, I1–I16 y Z1–Z9): de 43, **31 a la primera y 12 supervivientes que se cerraron con pruebas** (mueren las 12); las 6 de `audit.yml` ya existentes (F1–F6), reancladas, también mueren. `ci.py` declara ahora **257** mutaciones (antes 214); todas las anclas siguen apareciendo una sola vez. La integración, los E2E y `pytest` **no se han re-ejecutado** en esta entrega (no se tocó nada de lo que usan); valen las cifras de la 5e.

### Lo que se encontró (honestamente)

- **Tres huecos reales en las guardas de `audit.yml`**: un job con `if: false`, un paso con `if: false` o un `permissions: contents: write` dentro del job **pasaban todas las pruebas**. Un job que nunca se ejecuta es un verde que no mide nada. Ahora se prohíben.
- **Leer no sustituye a medir**: anticipé nueve de los doce supervivientes al escribir el código y **tres no** (`--today=FECHA`, una bandera como valor de `--warn-days` y el paso con `if: false`). Los nueve anticipados se midieron igualmente antes de arreglarlos.
- **La zona horaria era invisible aquí**: el contenedor está en UTC, así que interpretar el día en hora local daba lo mismo. Forzando `Asia/Tokyo` y `Pacific/Kiritimati` (zonas al este de UTC) la mutación muere; con `America/Los_Angeles` no, como se midió aparte (E-89).
- **Una afirmación escrita antes quedó falsa**: ADR-0024 decía «hoy nada lo vigila fuera de esa prueba». Corregida con una nota de actualización.
- **Mis errores**: un reemplazo global de escapes en `ci.py` alteró una línea ajena (E3); lo vi por un `SyntaxError` y por `git diff`, la restauré y comprobé que no aparece en el diff. Dejé un `});` de más al reescribir un bloque de pruebas.
- **Un punto débil del diseño que conviene decir claro**: el aviso vale lo que vale **el canal**, no el código. Hoy no hay remoto, así que el job semanal **no avisa a nadie**; con un remoto fallarían cuatro ejecuciones antes de la fecha (2026-12-21, 12-28, 2027-01-04 y 01-11: quedan 28, 21, 14 y 7 días), pero si nadie lee los fallos de un flujo programado, o el flujo se desactiva por falta de actividad, no sirve de nada. Una persona con un recordatorio propio es más fiable que un job.

### Qué no pudo verificarse

Que el job `coverage` **se ejecute en GitHub**; que una ejecución en rojo **llegue a una persona**; que el flujo siga activo (según la documentación de GitHub, no verificada aquí, desactiva los flujos programados tras 60 días sin actividad en el repositorio, y el primer aviso llegaría a los 58 días de hoy); y la **reobservación** en sí.

### Decisiones que necesitan a una persona

- **Quién recibe el aviso y cómo**: hasta que exista un remoto el job no hace nada. Mi recomendación es un recordatorio tuyo para el **2026-12-19** (no he creado ninguno: es una acción sobre tu cuenta que no me has pedido) y decidir cuándo se reobserva la cobertura (T-19) **antes del 2027-01-18**.

### Pendiente

T-19: **reobservar** la cobertura (manual). Y lo de la 5e: F2-9 y lo demás de `docs/backlog.md`.

## Entrega 5g — preparación del despliegue en staging privado (T-21)

Alcance: la persona propietaria pidió «crea el repositorio y configura todo para que el proyecto esté en producción». **No se ha publicado nada.** Esta entrega dice qué se pudo hacer, qué no y por qué, y deja el camino preparado. Elegida por la persona entre tres opciones: **staging privado en Vercel** (no producción pública).

### Qué funciona

- **Paquete de recuperación** — **VERIFIED**: `git bundle` con los 53 commits (1,4 MB), verificado con `git bundle verify` y **restaurado en un directorio limpio** (mismo HEAD, árbol limpio). Es lo único que garantiza el trabajo si el contenedor se recupera: el proyecto vive **solo** en este contenedor, sin remoto.
- **Ensayo local de staging** — **VERIFIED** (E-90): checkout limpio y sin el mapa base, `SITE_ENV=staging`, compilación y servidor, 12 URLs con 200, `noindex`, `Disallow: /`, aviso honesto sin mapa.
- **`docs/deploy.md`** — **IMPLEMENTED**: decisiones, ensayo, pasos, variables, qué bloquea producción pública y qué no se ha probado.

### Qué no se hizo, y por qué

- **El repositorio** — **BLOCKED**: el token de `gh` de este entorno es inválido y mi única herramienta de GitHub (`add_repo`) solo adjunta repositorios que **ya existen**. Lo tiene que crear la persona propietaria (vacío y privado: _se creó público, E-99_) y reconectar GitHub en https://claude.ai/connect-github.
- **Vercel y Supabase** — nada creado. Hay un equipo de Vercel y una organización de Supabase («NCI AUTOMATION», que parece de negocio: no se crea ahí nada de pago sin petición expresa; staging no necesita base de datos).
- **Producción pública** — **BLOCKED por motivos que no son de configuración** (`docs/deploy.md` §5): derechos del mapa provisionales (el código los bloquea con `SITE_ENV=production`), cero contenido verificado, sin base de datos remota, cinco licencias sin decisión legal, CI nunca ejecutado.

### Cómo ejecutarlo

```bash
# Ensayo de staging en un checkout limpio (sin -H 127.0.0.1: trampa de CLAUDE.md)
git clone panama-immersive.bundle limpio && cd limpio && pnpm install --frozen-lockfile
SITE_ENV=staging NEXT_PUBLIC_SITE_URL=https://staging.example.invalid pnpm build
SITE_ENV=staging NEXT_PUBLIC_SITE_URL=https://staging.example.invalid pnpm exec next start -p 3123
curl -sI http://localhost:3123/es | grep -i x-robots-tag    # noindex, nofollow
```

### Pruebas ejecutadas (observadas el 2026-10-24)

Compilación desde el checkout limpio: **bien, 14 s, 75 páginas estáticas** · 12 URLs: **200 sin redirecciones** · `/api/health`: `siteEnv: staging` · `x-robots-tag: noindex, nofollow` en portada y ficha · `/es/explorar` sin mapa en Chromium: aviso, 9 destinos, 0 lienzos, **un único 404**. No se ha re-ejecutado `pnpm check`: solo cambió documentación (`pnpm format` en verde); valen las cifras de la 5f (61 / 1400).

### Lo que se encontró (honestamente)

- **El riesgo mayor no era técnico**: todo el proyecto existía solo en un contenedor efímero. Lo primero que hice fue empaquetarlo y comprobar que se restaura.
- **«Producción» no es una cuestión de configuración.** Lo dije antes de gastar nada y la persona eligió staging: publicar hoy daría nueve destinos sin mapa y sin contenido.
- **Mi error**: arranqué `next start` con `-H 127.0.0.1` y salió el bucle 307 que ya estaba en `CLAUDE.md` (no lo había releído). Repetido sin `-H`, bien.
- **Un detalle de usabilidad** (F2-10): sin mapa base siguen visibles los botones «Ver en el mapa». No he comprobado qué hacen al pulsarlos.
- **Sobreestimación evitable**: `pnpm install` tardó 1 s por el almacén caliente; **no** prueba una instalación en frío.

### Qué no pudo verificarse

Todo lo que ocurre en Vercel: el proyecto, las versiones de Node y pnpm que usará, la **protección de despliegues** (que una petición sin sesión no vea el sitio) y los límites del plan. También la primera ejecución real de `ci.yml` y `audit.yml`.

### Decisiones que necesitan a una persona

1. **Crear el repositorio vacío y privado y reconectar GitHub** (sin eso no avanza nada más; _se creó público, E-99_).
2. **El mapa en staging**: dejarlo sin mapa o alojar el PMTiles con Range y CORS detrás de la protección.
3. La organización de Supabase «NCI AUTOMATION»: ¿se usa para este proyecto o se crea otra? No se toca sin tu respuesta.

### Pendiente

T-21 (desplegar el staging cuando exista el repositorio) y F2-10. Lo demás, como en la 5f.

## Entrega 5h — repositorio y primer despliegue de staging (T-21)

Alcance: con el repositorio ya creado por la persona propietaria, subir el historial, enlazar Vercel y desplegar el **staging privado** elegido. Tres instrucciones recibidas: el repositorio existe; «haz lo que creas que funcione mejor» para el mapa; «usa la organización NCI» para la base de datos.

### Qué funciona

- **Repositorio** — **VERIFIED**: `carlos2190alfredo-spec/panamainmersive` con los 54 commits (**creado público**; esta entrada decía «privado», corregido el 2026-11-11); el HEAD del remoto coincide con el local. Antes de subir se barrió el historial en busca de secretos (con control positivo): solo credenciales falsas de pruebas.
- **Proyecto de Vercel enlazado** — **VERIFIED** por lectura de su configuración: Next.js, Node 22.x, `SITE_ENV=staging`, instalación con lockfile congelado. Cada `push` a `main` despliega.
- **Primer despliegue** — **VERIFIED** (E-91): `READY`; salud con `siteEnv: staging`, `noindex`, `robots.txt` con `Disallow: /`, ficha honesta.

### Qué no pudo verificarse

- **La protección de despliegues, en comportamiento** — **no verificada**: lo único medido es su configuración (`all`). Mi comprobación sin sesión era inútil: el proxy de este entorno bloquea `vercel.app`.
- **El primer CI** (`ci.yml`, `audit.yml`) — **sin leer**: no tengo acceso a los resultados de GitHub Actions.
- **Supabase** — **no creada**: el servidor pidió una confirmación de coste a la persona y no hubo respuesta.

### Decisiones tomadas por mí (pedidas: «lo que creas que funcione mejor»)

- **Staging sin mapa por ahora.** El PMTiles tiene derechos provisionales (L-01), no puede ir en el repositorio ni subirse con las herramientas de esta sesión, y alojarlo bien (Range y CORS) tiene más sentido cuando L-01 se resuelva. El mapa se ve en local con el paquete de visualización.
- **Proyecto de Vercel creado sin desplegar**, para fijar variables y protección antes del primer despliegue.
- **No toqué los 4 proyectos de Supabase de la organización NCI** (de negocio). Cualquier proyecto nuevo irá aparte.

### Lo que se encontró (honestamente)

- **Una medición que casi se da por buena**: 403 sin sesión «parecía protegido»; era el proxy. Lo detecté porque `curl` no escribió ningún cuerpo.
- **Otro barrido de secretos que no medía**: mezclé `grep -E` y `-P`, falló en silencio y dio «vacío». Repetido con un solo motor y un control positivo.
- Retiré por error el clon vacío que la herramienta `add_repo` consideraba su destino; solo afecta al registro opcional de la raíz del repositorio en la sesión.

### Decisiones que necesitan a una persona

1. **Abrir `https://panamainmersive.vercel.app` en una ventana privada**: debe pedir iniciar sesión en Vercel. Si muestra la página, hay que avisarme: el staging sería público.
2. **Mirar la pestaña Actions** del repositorio y pasarme lo que falle: es la primera ejecución real de `ci.yml`.
3. **La base de datos**: aceptar (o no) el coste que pide Supabase para crear un proyecto en la organización NCI. Staging funciona sin ella.

### Pendiente

T-21 (verificar protección y CI, mapa y base de datos), F2-10 y lo de la 5f.

## Entrega 5i — El mapa funciona en el staging (2026-10-24)

La persona propietaria informó de que «el mapa interactivo no funciona» en `https://panamainmersive.vercel.app/es/explorar`.

### Causa (observada, no supuesta)

El despliegue real pedía `/data/panama-basemap.pmtiles` y recibía **404**: el mapa base estaba en `.gitignore` (decisión de la entrega 5h, «staging sin mapa por ahora»), así que el despliegue por git nunca lo llevaba. Con los datos ausentes la página caía bien al aviso «Los datos del mapa base no están disponibles» (tras unos segundos mostraba «Cargando el mapa…»). No era un defecto del código del mapa.

### Qué se hizo

- `pnpm data:build` en esta máquina (Python 3.12 + tippecanoe 2.79.0 + Overture `2026-09-23.1`): `public/data/panama-basemap.pmtiles` de 36,1 MB, `sha256` `77f98546…`; la puerta de verificación del pipeline pasó (`problems: []`, 0 entidades perdidas por capa).
- El PMTiles y su manifiesto **se versionan** (se quitaron de `.gitignore`): es la única vía de que el staging de Vercel, que despliega por git detrás de la protección, sirva el fichero del mismo origen (con Range; la CSP no cambia). Decisión y salvedades de derechos (L-01 no se resuelve): `docs/deploy.md` §4.

### Pruebas que se corrieron

- Build `SITE_ENV=staging` en local: `/data/panama-basemap.pmtiles` → **206**; `/es/explorar` dibuja el mapa y «Ver en el mapa → Coiba» vuela a la isla y lista sus áreas protegidas (comprobado en un navegador real).
- `SITE_ENV=development pnpm build && pnpm check:bundle`: **OK** (mapa diferido 460,7 KB gzip, presupuesto 500 KB).
- `CI=true pnpm test:e2e` con el mapa presente (Chromium 156, macOS): **187 pasan, 0 omitidas, 8 fallan** — las 8 por **tiempo** (axe en `/explorar` × 5 idiomas con WebGL por software = 11–17 s frente a un límite de 30 s, y dos sondeos de 1,2 s y 5 s), con 6 trabajadores en paralelo. **Repetidas solas con `--workers=1`: 12/12 pasan.** No es una regresión del mapa, pero sí un riesgo para el CI de GitHub (§ abajo).

### Lo que NO está verificado

- **El CI de GitHub**: ahora encontrará el fichero y ejecutará las pruebas del mapa, cosa que nunca ha hecho (`ci.yml` sigue siendo IMPLEMENTED). Si en un runner lento las pruebas de axe de `/explorar` rozan los 30 s, fallarán por tiempo: habría que subir su límite, no tocar el mapa.
- **Los derechos del mapa** (L-01) siguen `provisional`; el fichero está en un repositorio **público** (cualquiera puede descargarlo de GitHub sin pasar por la protección de Vercel; corregido el 2026-11-11: decía «privado») y el sitio desplegado solo lo sirve tras la protección. Antes de una producción pública hay que decidirlos.

### Pendiente

Mirar la pestaña Actions tras abrir el PR; T-21 (protección: probar con una ventana privada).

## Entrega 5j — Interfaz inmersiva (2026-10-24 → 2026-10-25)

ADR-0025 («Identidad de marca e interfaz inmersiva»). La entrega se hizo por partes y **está completa**: **E1 · HUD de escritorio**, **E2 · Interacciones** (filtro por tipo, buscador y herramientas) y **E3 · Móvil** (hoja inferior) más una **revisión de cierre** (al final de E3). Cada parte conserva su subsección con lo que se corrió **en su momento**; **el estado vigente y las cifras de la ejecución final están en la primera subsección**, y donde una parte anterior quedó desactualizada lo dice. Fuera de alcance (ADR-0025 §9: no se hacen): ubicación, pantalla completa, valoraciones, clima, fotos, cuentas…. La identidad de marca, la cabecera y el pie y la portada (commits `b1fd69a` y `30ed83a`) **no tuvieron subsección propia en su momento** (esta frase prometía «otras subsecciones» que no existen): su evidencia está en el ADR-0025, en `docs/performance.md` y en la «Revisión independiente» de más abajo (X3 y X4). **Las cifras de abajo son las del cierre de E3 (2026-10-26); las vigentes tras la revisión independiente están en X4.**

### Estado FINAL de la entrega 5j (E1 + E2 + E3) — léelo primero

**Lo que hay hoy en `/explorar`** (ejecución de cierre, 2026-10-26; Chromium 156 con WebGL por software, macOS):

- **Escritorio (≥ 56rem)**: el mapa a sangre bajo la cabecera de 4rem y, encima, un HUD de vidrio con los componentes **reales** (cada función existe una sola vez en el DOM): **carril** izquierdo (título `<h1>`, filtro por tipo de destino abierto, «Capas» y «Leyenda» plegadas), **buscador** arriba al centro, **herramientas** bajo el zoom y la brújula (**«Relieve en 3D»** opt-in y «Capas y leyenda»), **dock** inferior (ficha del destino y carrusel de los nueve destinos reales, plegable) y el **panel «Información del mapa»** (único `<aside>`: área elegida, áreas en la vista, créditos, Fuentes y Accesibilidad), plegable. **Desde 80rem el carril baja hasta la franja inferior** y el dock empieza a su derecha, para que los ocho tipos y los dos grupos quepan a 1280×800 (backlog F2-11; ver «E3 · Cierre»).
- **Móvil (< 56rem)**: el mapa a pantalla completa bajo la cabecera y una **hoja inferior de dos detentes** (botón con `aria-expanded`, Escape, cuerpo `inert` plegado, arrastre como mejora, zona segura, movimiento reducido) con el buscador, el filtro, capas y leyenda, la ficha, el carrusel y el panel con los dos enlaces del pie. Las herramientas flotan sobre el mapa. **Gestos cooperativos desactivados**. Sin JavaScript, una pila bajo el mapa.
- **Honestidad (ADR-0025 §9)**: solo datos reales (nueve destinos, siete tipos, siete capas, 137 áreas protegidas); sin valoraciones, clima, fotos, descripciones, AR, audioguía, recorridos 3D, hospedajes, tours, empresas, «Iniciar sesión», «Planifica tu viaje», mini-globo, etiquetas de mar, ubicación ni pantalla completa, y **sin etiqueta «Destacado»** (no hay curaduría).
- **Presupuestos sin subir ninguno** (`pnpm check:bundle`, build de cierre): Explorar **205,0 KB de JS y 14,1 KB de CSS** (de 210 / 20; margen 5,0 / 5,9 KB), islas del HUD **3,9 KB** diferidos (presupuesto 12), mapa diferido **461,2 KB** (presupuesto 500); Inicio 192,7 / 14,7, Destinos 191,3 / 14,1, Ficha 191,3 / 14,5, Fuentes 191,3 / 6,1. No hizo falta recalibrar: lo que lo logró está en `docs/performance.md` (M-08 a M-10).

**Cómo ejecutarlo**

```bash
SITE_ENV=development pnpm build && pnpm check:bundle     # 205,0 / 14,1 KB; islas 3,9 KB; mapa 461,2 KB
pnpm exec next start -p 3100                              # /es/explorar: escritorio, o móvil / ventana < 896 px
CI=true pnpm test:e2e                                     # 336 pruebas (236 escritorio + 100 móvil): ver los plazos abajo
pnpm check:e2e-skips --max-skipped 81                     # sin el mapa base: 255 pasan y 81 se omiten
```

**Resultados de la ejecución de cierre (reales, esta máquina)**

- `pnpm typecheck && pnpm lint && pnpm format`: **verdes**.
- `pnpm exec vitest run --project unit`: **90 archivos, 2 135 pruebas: 2 133 pasan y 2 fallan**, las dos **conocidas y ajenas** (`e2e-run` —nietos— y `pg-sweep` leen `/proc`, que macOS no tiene; pasan en el CI de Linux). _Corrección posterior (r0:F-04): una ejecución completa dio además un **tercer** fallo intermitente, `check-deps.test.ts` «MPL-2.0…», por el plazo por defecto de 5 s de una prueba que lanza dos procesos `node --import tsx`; ya tiene plazo explícito (X4). «Las dos conocidas» no es una cifra fija._ No ejecutado: `pnpm check:licenses` (falla en macOS por `@img/sharp-libvips-darwin-x64`), `test:integration`, `test:e2e:db`, `test:e2e:content` (no tocan esta entrega).
- `SITE_ENV=development pnpm build && pnpm check:bundle`: **verde** (cifras arriba).
- **E2E** (`CI=true pnpm exec playwright test --workers=3`): **con el mapa base, 336 pasan, 0 fallan, 0 intermitentes, 0 omitidas (9,6 min)**; **sin él** (oculto y restaurado, comprobado el tamaño después: 36 088 591 bytes), **255 pasan y 81 se omiten** (5,2 min) → `pnpm check:e2e-skips --max-skipped 81` en verde; presupuesto de omitidas **80 → 81** en `ci.yml`, `CLAUDE.md` y `docs/testing.md`. Una **primera** ejecución completa de esta pasada (335 pruebas) dio **334 pasan y 1 falla (determinista, dos intentos)**: la prueba de «un marcador tapado por el HUD vuelve…», que dependía de que Coiba quedase bajo el carrusel y con el carril nuevo queda bajo el carril (ver «E3 · Cierre»); se partió en dos versiones y la ejecución final es la de arriba.
- **Plazos**: las tres pruebas de axe de Explorar de `a11y.a11y.spec.ts` tardaron **35,3 · 27,6 · 29,9 s con tres trabajadores** (y 34–37 s en la primera ejecución) frente a un límite de 30 s: **tienen ahora `test.setTimeout(90_000)` y solo ellas** (pasan por holgura, no por azar; con un trabajador 18–27 s). El CI de GitHub es más lento. Con 6 trabajadores (el valor por defecto) esta máquina se satura (carga 47 en 12 núcleos): las ejecuciones completas se hicieron con 3 (`--workers=2` en E3 y `--workers=3` aquí).
- **Falsación** (pruebas de que las pruebas ven lo que dicen ver): 5 mutaciones sobre `HudSheet`/`sheet-gesture` (sin `inert`, Escape sin devolver el foco, arrastre invertido, `aria-expanded` fijo, Escape que ignora a quien ya lo atendió): **mueren las 5**; sobre el **build real**, con la regla de ≥ 80rem anulada (`min-width: 200rem`): **fallan** «el carril cabe ENTERO» (desplaza 150 px) y la versión ≥ 80rem del marcador tapado, y pasa la de < 80rem; y `hud-css.test.ts` falla si se quita `grid-row: 2 / -1`. En E2 y E3 hubo además 11 + 2 y 9 + 6 mutaciones (ver más abajo).
- **Capturas** (Playwright, fuera del repo, en el directorio de trabajo de la sesión) y **leídas**: 320×640, 390×844 y 768×1024 en esquema claro y oscuro, hoja cerrada y abierta, con y sin destino; 851×393 apaisado, sin mapa, sin JavaScript, alemán a 320 px y escritorio a 1280×800. **Claro y oscuro se ven igual** (el ámbito inmersivo es siempre oscuro, ADR-0025 §3).

**Qué NO está verificado** (consolidado de E1–E3 y de esta pasada)

- **Dispositivos y navegadores reales**: solo Chromium 156 con WebGL por software; ni una GPU, ni Safari, ni Firefox, ni un teléfono o tableta, ni lectores de pantalla (los `aria-live` se comprueban por texto y rol), ni táctil real (el arrastre se probó con eventos táctiles del protocolo). **No se vio el teclado en pantalla** (se probó que el `viewport` lo pide y que con la pantalla útil encogida el buscador sigue a la vista) y `env(safe-area-inset-bottom)` vale 0 sin `viewport-fit=cover` (no activado).
- **Rendimiento en ejecución**: ni INP ni FPS; el coste de `backdrop-filter` sobre WebGL y el de animar `block-size` de la hoja no se midieron en hardware real. LCP de Explorar ≈ 2,6–3,5 s en la medición emulada (el «mayor texto» son los créditos del mapa; no comparables entre M-08, M-09 y M-10).
- **El estado «bloqueado por derechos»** en un build de producción (la página es estática y se decide al compilar): solo renderizado en servidor y la hoja con un mapa sin datos.
- **«Relieve en 3D»** con los derechos bloqueados y con teselas reales de AWS: jsdom y una captura a mano; los E2E interceptan una tesela plana.
- **Revisión humana de los textos**: toda la interfaz nueva de la entrega es traducción automática en en/pt/fr/de (y el español es borrador). _Esta línea citaba solo 2 claves (`Map.hud.mapUnavailable`, `Map.search.clear`) y estaba **incompleta**: la entrega añadió 38 claves (35 en `30ed83a`, 3 en `ca34997`); el registro completo, con las de la revisión posterior, está en X4._
- `scripting: none` y `:has()` solo en Chromium.

**Lo que queda abierto** (todo en `docs/backlog.md`): F2-11 por debajo de 80rem (el carril desplaza por dentro), F2-12 (relieve real en los E2E), F2-13 (hoja en dispositivos reales: el arrastre decide al soltar, dos detentes), **F2-14 (la vista inicial en móvil vertical enseña uno o dos destinos: `maxBounds`)**, y las decisiones de ADR-0025 §9 (ubicación, pantalla completa) y de derechos (L-01) que dejan la producción pública bloqueada (`docs/deploy.md` §5: **no cambió nada en el despliegue**: ni variables de entorno, ni CSP, ni cabeceras, ni dependencias).

**Qué quedó desactualizado en las subsecciones de E1 y E2 (corregido o marcado)**: «Carril: capas y leyenda abiertas» (desde E2 plegadas), «Móvil: el apilado de antes» (E3 lo sustituyó), «Contrato para las siguientes partes» (cumplido), «no se subieron límites de tiempo» (cambió: ver arriba) y «la página ya no se desplaza bajo el mapa» (el pie sigue debajo: la página mide 1 194 px a 390×844; lo que no pasa es que un gesto sobre el mapa la desplace).

### E1 · HUD de escritorio (≥ 56rem) — qué funciona

Explorar es ahora un **mapa a pantalla completa bajo la cabecera** (`calc(100dvh − var(--header-height))`, mínimo 30 rem) con los componentes **reales** de siempre flotando encima como vidrio. Ninguno se duplicó: cada función existe una sola vez en el DOM (los selectores estrictos de la suite siguen valiendo).

- **Carril izquierdo**: el `<h1>` «Explorar Panamá» pegado a la tarjeta de **Capas** y **Leyenda** (grupos plegables nativos `<details>`; **E1 los dejó abiertos y desde E2 «Capas» y «Leyenda» arrancan plegadas**; `max-block-size` + `overflow-y: auto`, nunca recortado).
- **Dock inferior**: **ficha del destino** (a la izquierda, solo con selección; mismos ids, textos y región `aria-live`; botón nuevo **«Volver a encuadrar el destino»**) y **carrusel de los nueve destinos** (componente de servidor, un solo enlace por tarjeta, pictograma por tipo, insignia de cobertura y el «Ver en el mapa» existente; plegable con `aria-expanded`; trae a la vista la tarjeta elegida). Lado a lado: la altura que el HUD le quita al mapa **no cambia al elegir un destino**.
- **Panel derecho** (el único `<aside>`): ficha del área, áreas en la vista, créditos, enlaces a Fuentes y Accesibilidad. Arranca plegado como una **píldora con rótulo** («Información del mapa») y se abre solo si hay `a` en la URL.
- **Encuadre consciente del HUD**: el CSS deja un hueco libre (`[data-hud-safe]`, la celda central de la rejilla), el navegador lo **mide** al volar y `framePadding` lo convierte en relleno. **Descubierto y corregido**: `maxBounds` (Panamá mide 2,9° de alto) clava el centro cuando la vista es más alta que la caja, y Coiba caía bajo el carrusel por mucho relleno que hubiera; `reachFrame` (puro) sube el zoom lo justo con las mismas restricciones de MapLibre, y `separationZoom` evita que «Ver en el mapa: Canal de Panamá» muestre un grupo «3». Medido en los **nueve** destinos y a 1280×800, 1440×900 y 1024×768: **todos quedan dentro del hueco libre con su propio marcador**.
- **Marcadores tapados**: uno que un panel (o la cabecera fija, al desplazar la página) tapa **entero** sale del orden de tabulación con `inert` y vuelve cuando se ve (WCAG 2.4.11). A 1280×800 y en la vista inicial son los del oeste y Coiba; la alternativa completa es el carrusel.
- **Sin mapa** (sin WebGL2, sin datos, bloqueado, con error): el HUD sigue por **encima** del aviso, el carrusel es la alternativa y **lo que depende del mapa se desactiva con su motivo** (capas, «Ver en el mapa», «Volver a encuadrar»: «No disponible: el mapa no está activo.»). Mientras el mapa CARGA siguen activos (cierra F2-10).
- **Piel**: controles nativos de MapLibre (zoom, brújula, escala, créditos) con tokens (selectores de dos clases; iconos invertidos solo en su `span`); marcadores y grupos con la marca (relleno de acento, aro de tinta, nunca rojo); vidrio por clase compartida (`glass.module.css`) con **tres** superficies de desenfoque como máximo y solo con soporte + puntero fino + ≥ 56rem; velo inferior y viñeta como «atmósfera» decorativa **bajo** los controles (si estuviera en el HUD atenuaría los créditos ODbL: ver más abajo).
- **Móvil (< 56rem)**: en E1 quedó el apilado de antes, re-vestido con los tokens; **lo sustituyó la hoja inferior de E3** (más abajo).
- **Presupuestos**: Explorar **203,4 KB de JS y 13,4 KB de CSS** (de 210 / 20; antes 205,6 / 19,7) **sin subir ningún presupuesto**: hoja de MapLibre recortada (−7,9 KB gzip) y lienzo como isla diferida. Detalle, costes y lo que no se midió: `docs/performance.md` M-08. Evidencia: E-94.

### Cómo ejecutarlo

```bash
SITE_ENV=development pnpm build && pnpm check:bundle     # 203,4 / 13,4 KB; mapa diferido 465,1 KB
pnpm exec next start -p 3100                              # /es/explorar (con el mapa base presente)
pnpm map:css [-- --check]                                 # regenera o comprueba vendor/maplibre-gl.trimmed.css
CI=true pnpm test:e2e                                     # ver «tiempos» abajo
```

### Qué pruebas se corrieron (resultados reales, esta máquina: macOS, Chromium 156, WebGL por software)

- `pnpm typecheck && pnpm lint && pnpm format`: **verdes**.
- `pnpm exec vitest run --project unit`: **84 archivos, 2 003 pruebas: 2 001 pasan y 2 fallan** (las dos **conocidas y ajenas**: `e2e-run` —nietos— y `pg-sweep` leen `/proc`, que macOS no tiene).
- Nuevas: `hud-frame.test.ts` (26), `clustering.test.ts` (+4), `hud-css.test.ts` (30), `map-blocked.test.tsx` (7), `maplibre-css.test.ts` (24); E2E `explore-hud.spec.ts` (20). **Falsadas**: sin la restricción del centro mueren 3 pruebas de `reachFrame`; una cuarta superficie con desenfoque, `overflow: hidden` en el carrusel y `--z-hud` bajado hacen caer su prueba; la de los créditos **falló con 2,4:1** contra la versión con el velo en el HUD y pasa (> 7) con el velo en el lienzo; la carrera de `inert` se **reprodujo** (3 de 8 ejecuciones en paralelo) antes de corregirla.
- `CI=true pnpm test:e2e` completo (6 trabajadores por defecto), **dos veces**: **250 pruebas (197 escritorio + 53 móvil), 0 omitidas; 242 pasan y 8 fallan** la primera, **241 pasan, 8 fallan y 1 intermitente** la segunda (la última, con el código final). Las 8 son **de tiempo** (plazo de 30 s con WebGL por software: axe de Explorar × 5 idiomas en claro, en oscuro y con el menú abierto —escritorio y móvil—, el CSP de Explorar × 5 idiomas, y `map-areas` «con la capa apagada»). **Repetidas con `CI=true … --workers=1`: 12 de 12 pasan** (esas 8 más las 4 de foco no oculto) y la intermitente de la segunda ejecución («cambiar de idioma conserva destino y capas», `map.spec.ts`) pasa 3 de 3. Con ocho ejecuciones simultáneas de una sola prueba (carga mucho mayor que la de CI) fallaron por plazo 3, 0 y 4 de 8 con el desenfoque y 0, 0 y 1 de 8 **sin** él (≈ 15 % menos de tiempo por prueba): el `backdrop-filter` sobre WebGL por software cuesta, pero no es lo único que pesa (el mapa y axe también). Se conserva el diseño (ADR-0025 §5); la palanca que no se aplicó —quitar el desenfoque mientras el mapa se mueve o carga— queda anotada en `docs/performance.md` M-08. Es el mismo riesgo que se anotó en la entrega 5i; no se subieron límites.
- Sin el mapa base (oculto un momento y restaurado): **184 pasan y 66 se omiten** → presupuesto de omitidas **57 → 66** en `ci.yml`, `CLAUDE.md` y `docs/testing.md`.
- `pnpm perf:vitals --runs 5`: Explorar FCP 656 ms, **LCP 2 604 ms** (los créditos del mapa pasan a ser el «mayor texto»; el título se pinta a los ≈ 0,66 s), CLS 0,000, TBT ≈ 562 ms, 1 376 KB, mapa listo 3 660 ms (`docs/research/perf-m08-2026-10-25.json`; no comparable 1 a 1 con M-06).

### Lo que se encontró (honestamente)

- **El velo inferior del HUD dejaba los créditos del mapa a 2,4:1.** El HUD pinta por encima de los controles de MapLibre y su degradado los atenuaba; axe no lo ve (texto bajo un degradado: «incompleto»), lo vi en una captura. Movido a la atmósfera del lienzo y con una prueba que mide los píxeles.
- **`maxBounds` ganaba al relleno** (Coiba bajo el carrusel) y **el destino se fundía en un grupo** («3») al encuadrarlo con menos zoom: ambos corregidos y con pruebas.
- **Una carrera de `inert`** (un Tab llegaba antes que el efecto pasivo; y la cabecera fija también tapa marcadores al desplazar): solo salió con 8 ejecuciones simultáneas.
- **Una prueba ajena** (`home.mobile.spec.ts`, «nueve tarjetas en una columna») fallaba por medir `x` con las tarjetas escaladas por la animación de entrada: ahora lee `offsetLeft` (misma intención).
- **Una prueba mía poco fiable** (movimiento reducido por `data-zoom` en 1,2 s) pasaba o fallaba según la carga: ahora comprueba la decisión (`data-flight-ms`) con un control.
- No toqué la **paleta del mapa** (tokens de otra parte): la riqueza del mapa viene de la atmósfera, la piel y los marcadores; **sin relieve, batimetría ni etiquetas de mar** (E-25: el degradado de profundidad sería un dato inventado).

### Lo que NO está verificado

- **GPU y navegadores reales**: ni el coste de `backdrop-filter` sobre WebGL, ni Safari ni Firefox, ni lectores de pantalla, ni táctil real. Solo Chromium 156 con WebGL por software.
- **El estado «bloqueado por derechos» en un build de producción**: la página es estática y se decide al compilar; lo cubre una prueba de renderizado en servidor (`map-blocked.test.tsx`), **no** un E2E con `SITE_ENV=production`.
- **LCP** (arriba) y el coste de CSS de Inicio y Ficha (+2,5 KB): declarados, no resueltos.
- **La vista inicial no cabe entera**: con `maxBounds` el zoom mínimo en 1280×736 es 7,48 y el país mide más de lo que cabe; Bocas del Toro, Boquete y Volcán Barú quedan bajo el carril y Coiba bajo el carrusel hasta mover el mapa o elegirlos en el carrusel (los tapados no se tabulan). No se tocó `maxBounds` (rellenar fuera de los datos mostraría «tierra» donde hay mar).

### Contrato para las siguientes partes (E2: filtro, buscador, herramientas) — histórico: lo cumplieron E2 y E3

- **Zonas reservadas** (vacías hoy y sin tamaño mientras lo están): `data-hud-zone="search"` (arriba al centro, fila 1 de la rejilla, `min(32rem, 100%)`) y `data-hud-zone="tools"` (columna derecha, bajo el zoom y la brújula nativos). El **filtro** va como un grupo más (`HudGroup`) del carril, encima de «Capas». Nada de lo ya colocado tiene que moverse.
- **Las tres superficies con desenfoque ya están usadas** (carril, carrusel, ficha): lo nuevo usa `composes: surface` **sin** `blur` (una prueba exige exactamente tres) y **sin degradados** en el HUD.
- **Lo que depende del mapa** lee `useHudStore().mapStatus` (`loading` | `ready` | `unavailable`) y se desactiva con `Map.hud.mapUnavailable` y `aria-describedby`; las órdenes al lienzo van por `hud-store.ts` (como `requestFrameDestination`) y las atiende un efecto de `MapStage`. Un filtro por tipo necesita exponer `recluster` (hoy es un cierre privado del efecto de creación) y no ocultar nunca el destino seleccionado.
- **Presupuesto**: margen de 6,6 KB de JS y de CSS. Lo que entra en el HTML cuenta; **toda isla nueva con `ssr: false`** (como `MapStageLazy`). Una prueba E2E nueva que necesite el mapa sube el presupuesto de omitidas (hoy 66).
- Un `role="search"` como máximo (la prueba de unicidad ya lo admite) y los selectores únicos de la suite siguen vigentes.

### Claves de interfaz nuevas (pendientes de revisión humana; traducción automática, nunca `reviewed`)

`Map.hud.mapUnavailable` («No disponible: el mapa no está activo.»; en en/pt/fr/de traducida). Sustituye a `Map.featured.reframeUnavailable`, que estaba sin commitear y se retiró por ser demasiado específica. _**Incompleto**: E1 añadió muchas más claves en `30ed83a` (`Map.hud.*`, `Map.carousel.*`, `Map.panel.toggle`…); el registro completo está en X4._

### Archivos

Nuevos: `src/components/map/{HudCarousel,HudPanel,MapBlocked,MapStageLazy}.tsx` (+ CSS), `hud-store.ts`, `src/components/HudGroup.tsx`, `src/domains/geography/{hud-frame,mercator}.ts`, `src/styles/glass.module.css`, `scripts/{lib/maplibre-css,trim-maplibre-css}.ts`, `vendor/maplibre-gl.trimmed.css`, `e2e/explore-hud.spec.ts`, `tests/unit/design/{hud-css.test,css-flat}.ts`, `tests/unit/components/map-blocked.test.tsx`. Modificados: `MapStage.tsx`/`.module.css`, `explore/page.tsx`/`.module.css`, `SelectedDestinationCard`, `DestinationList` (variante `cards`), `LayerControls`, `MapLegend`, `ShowOnMapButton`, `clustering.ts`, `e2e/{map,map-areas,map-helpers,home.mobile}`, mensajes ×5, `package.json` (`map:css`), `.prettierignore` (`vendor`), `ci.yml`, `CLAUDE.md`, `docs/{performance,testing,backlog}.md`, `docs/research/evidence-log.md` (E-94).

### E2 · Interacciones: filtro por tipo, buscador y herramientas — qué funciona

Sobre el HUD de E1, sin duplicar nada (cada función sigue existiendo UNA vez en el DOM) y **solo con datos reales** (nueve destinos, siete tipos; sin valoraciones, clima, fotos, «Destacado», cuentas, ubicación ni pantalla completa: ADR-0025 §9).

- **Filtro por tipo** (carril izquierdo, grupo «Tipo de destino», abierto): «Todos (9)» y un botón por cada tipo REAL con su recuento hablado en el nombre accesible («Localidad 3 destinos») y su pictograma. Estado **local** (`explore-filter-store.ts`, `useSyncExternalStore`; nunca en la URL: recargar o compartir vuelve a mostrar los nueve). Efectos: el **carrusel** oculta con `hidden` las tarjetas que no coinciden (siguen en el DOM: con «Todos» no hay ninguna oculta, y el DOM es el de siempre), el **mapa** retira los marcadores de los demás tipos y **reagrupa** (`reclusterRef`), y una región `aria-live` anuncia el recuento («Se muestran 3 destinos.»; también al quitar el filtro) con un eco visible mientras hay filtro. **El destino seleccionado nunca se oculta** ni cuenta como coincidencia. Volver a pulsar el tipo elegido lo quita. Se renderiza solo tras hidratar (sin JavaScript serían botones muertos) y el grupo entero se retira si no hay JavaScript.
- **Buscador** (arriba al centro; `<form role="search">` único con nombre propio, etiqueta visible «Buscar destinos» y un `<input type="search">`): coincide **por clave** con los nombres en los **cinco idiomas** sin acentos ni mayúsculas (`matchDestinations`: «Barú» = «baru»; «Panamakanal» desde la interfaz en español). **El resultado ES el carrusel filtrado** (no hay una segunda lista de botones) y se combina con el tipo por **intersección**. Enter con **un único** resultado lo selecciona (`?d=`, como «Ver en el mapa»); con varios o ninguno no hace nada. **Escape** vacía el campo (con el campo vacío la tecla sigue su camino) y hay un botón de borrar con nombre en los cinco idiomas (clave nueva `Map.search.clear`). Una consulta sin caracteres útiles («¡¡») es «sin búsqueda», no «ningún resultado» («Ningún destino coincide con la búsqueda.» se dice por escrito).
- **Herramientas** (columna derecha, bajo el zoom y la brújula nativos de MapLibre; un grupo de dos botones de 44 px):
  - **«Relieve en 3D»** (`aria-pressed`; visible «3D», nombre accesible «Relieve en 3D»: lo contiene, 2.5.3): **opt-in de verdad** — sin pulsarlo, **cero peticiones a AWS** (probado interceptando la red); al pulsar escribe `l` con `terrain3d` **y `hillshade`** (sin sombreado el relieve en 3D casi no se distingue: el terreno se dibuja sin luz; se comprobó en el navegador con teselas reales, con relieve y sombras claramente visibles a 55°), inclina la cámara a ≈ 55° (`easeTo`; con movimiento reducido, de golpe y sin animación) y muestra el aviso de terceros. Al apagar retira el sombreado **solo si lo añadió el botón** (si la persona ya lo tenía, lo conserva) y endereza la cámara. Se apaga con su motivo si el mapa carga o no está («No disponible: el mapa no está activo.») o si los derechos no permiten el relieve (`rightsPending`). Lee la URL **al pulsar** (dos pulsaciones seguidas no usan un estado viejo).
  - **«Capas y leyenda»** (`aria-expanded`): abre y cierra los grupos «Capas» y «Leyenda» del carril (ahora **plegados por defecto**: el filtro ocupa el carril), sigue a sus resúmenes si la persona los abre a mano y desplaza el carril hasta ellos.
  - El **aviso de terceros** ahora lo pinta `MapStage` (UNO solo, visible aunque «Capas» esté plegado; `LayerControls` ya no lo lleva).
- **Carrusel**: flechas anterior/siguiente (44 px; ya existían de E1, ahora con prueba) y plegado; la lista vuelve al principio al filtrar.
- **Orden de tabulación**: cabecera → mapa → buscador → carril → herramientas → ficha → carrusel → panel (los controles antes del contenido que gobiernan). En la pila móvil el orden visual es el del DOM (se quitaron los `order`), el buscador lleva la etiqueta encima del campo y el filtro es UNA fila que desplaza dentro de su caja; las herramientas flotan sobre el mapa.
- **Presupuesto**: Explorar **203,5 KB de JS y 13,2 KB de CSS** (de 210 / 20; E1: 203,4 / 13,4): las cuatro islas van en **un solo chunk diferido de 3,8 KB gzip** fuera del HTML. `check:bundle` no lo veía: ahora lo mide (marcador `data-hud-island`, presupuesto 12 KB, falla si no lo encuentra). `docs/performance.md` M-09.

### E2 · Cómo ejecutarlo

```bash
SITE_ENV=development pnpm build && pnpm check:bundle            # 203,5 / 13,2 KB; islas 3,8 KB; mapa 465,9 KB
pnpm exec next start -p 3100                                    # /es/explorar: filtro, buscador, «3D», «Capas y leyenda»
pnpm exec vitest run --project unit tests/unit/components/explore-hud-islands.test.tsx tests/unit/domains/tourism/explore-filter.test.ts
pnpm exec playwright test e2e/explore-interactions.spec.ts e2e/explore-hud.a11y.spec.ts e2e/explore-hud.spec.ts
```

### E2 · Qué pruebas se corrieron (resultados reales, esta máquina: macOS, Chromium 156, WebGL por software)

- `pnpm typecheck && pnpm lint && pnpm format`: **verdes**.
- `pnpm exec vitest run --project unit`: **87 archivos, 2 073 pruebas: 2 071 pasan y 2 fallan**, las dos **conocidas y ajenas** (`e2e-run` —nietos— y `pg-sweep`, que leen `/proc`, que macOS no tiene). Nuevas: `explore-filter.test.ts` (15), `explore-filter-store.test.ts` (7), `explore-hud-islands.test.tsx` (36, jsdom con los mensajes reales y la URL real), `check-bundle.test.ts` (+6: el chunk de las islas se mide, falla si se pasa y falla si no existe) y ampliación de `hud-css.test.ts`. **Falsadas**: 11 mutaciones sobre el código (el destino seleccionado se oculta, intersección → unión, consulta vacía = «ningún resultado», estado viejo en «Capas y leyenda», el 3D siempre retira el sombreado, el 3D ignora los derechos, Enter con varios resultados selecciona, el filtro sobrevive a la visita, las tarjetas no se ocultan, Escape no vacía, el tipo no se quita al repetir): **las 11 mueren**. Y 2 mutaciones sobre el build real (sin el reagrupado de marcadores; sin la orden de inclinar): **las pruebas E2E del mapa fallan** en las dos.
- `SITE_ENV=development pnpm build && pnpm check:bundle`: **verde**. Explorar **203,5 KB de JS y 13,2 KB de CSS** (de 210 / 20); islas del HUD **3,8 KB** diferidos (presupuesto 12); mapa diferido **465,9 KB** (presupuesto 500). `docs/performance.md` M-09.
- **E2E** (`CI=true pnpm test:e2e`, **300 pruebas**: 234 escritorio + 66 móvil; +50 con `explore-interactions` (24) y `explore-hud.a11y` (26: 13 en escritorio y 13 en móvil)):
  - **Con los 6 trabajadores por defecto no se pudo**: la máquina se saturó (carga 47 en 12 núcleos, los procesos de GPU por software ocupaban 3,5 núcleos) y las primeras 24 pruebas tardaron 12 minutos con 7 fallos por plazo de 30 s; **la interrumpí**. Hice las ejecuciones completas con **`--workers=3`**.
  - **Con el mapa base (0 omitidas)**, primera ejecución completa: **290 pasan, 5 fallan y 5 intermitentes** (13,8 min). Los 5 fallos: **3 de axe de Explorar** de `a11y.a11y.spec.ts` (explore claro, explore oscuro y menú de idioma abierto: **tiempo**, 33–35 s de 30) y **2 míos** (las flechas del carrusel y «Capas y leyenda»: medían mientras el desplazamiento suave seguía en curso con la máquina cargada; los hice deterministas —movimiento reducido para las flechas y espera activa para la geometría del carril—). Los 5 intermitentes: 3 de `i18n.spec` y 2 de `map-areas.spec`, **todos por tiempo** (bajo carga). **Repetidos los 10 con `CI=true … --workers=1`: 10 de 10 pasan** (las de axe en 22–27 s).
  - **Segunda ejecución completa con el código final** (`CI=true`, `--workers=3`, 13,1 min): **297 pasan, 3 fallan, 0 intermitentes, 0 omitidas**. Los 3 son **otra vez los de axe de Explorar por tiempo** (33 s de 30); repetidos con `--workers=1` **pasan** (26,6 · 24,6 · 21,9 s). Son los mismos que ya fallaban por tiempo en la parte de E1 y siguen rozando el límite con un solo trabajador; **no subí ningún límite**. Aislé lo que añaden las islas: **+1,3 s de 22 s (≈ 6 %)** en el bucle de cinco idiomas (M-09); el resto lo consumen el mapa y axe.
  - **Sin el mapa base** (oculto y restaurado): **225 pasan y 75 se omiten** (70 de escritorio y 5 de móvil) → presupuesto de omitidas **66 → 75** en `ci.yml`, `CLAUDE.md` y `docs/testing.md`. De las 9 nuevas, **7 son de `explore-interactions`**; las otras 2 (una de `map.spec` y la de `security.spec`) el recuento anterior no las contaba y no he rastreado de dónde vienen. La primera medición sin mapa dio un fallo mío (una aserción de «ninguna alerta» que, sin datos del mapa, ve el aviso real): corregido y comprobado (17 pasan y 7 se omiten).
- `pnpm perf:vitals --runs 3` (`docs/research/perf-m09-2026-10-26.json`): Explorar **CLS 0,000** con las islas llegando tras hidratar; el resto no es comparable con M-08 (ver M-09).
- **No ejecuté**: `pnpm check:licenses` (falla de antemano por `@img/sharp-libvips-darwin-x64`), `pnpm test:integration`, `pnpm test:e2e:db` ni `pnpm test:e2e:content`.

### E2 · Lo que se encontró (honestamente)

- **Una página de 1 299 px de ancho a 320 px** (E-95 a): el texto solo-lectores de cada botón del filtro es `position: absolute`; con el botón estático su caja de referencia era el mapa y los textos de los botones lejanos alargaban el desplazamiento de la PÁGINA aunque la lista los recortara. Ningún elemento visible sobresalía: lo destapó la prueba de reflow en cinco idiomas. Corregido con `position: relative`.
- **Contraste a mitad de transición** (E-95 b): axe midió el instante en que «Todos» ya tenía el texto nuevo y todavía el fondo de acento. Se quitó la transición.
- **Pulsaciones seguidas con estado viejo** (E-95 c): «Capas y leyenda» leía el render. Lo vigila una prueba (y una mutación que la mata).
- **Pruebas ajenas adaptadas conservando su intención** (todas en `e2e/`): `map.spec` y `map-areas.spec` (los 9 sitios que usan casillas de capas o la leyenda, ≈ 15 pruebas: abren «Capas» y «Leyenda» con `openLayers` porque arrancan plegadas); `explore-hud.spec` (espera a las cuatro islas; «un marcador tapado… al plegar»: ahora pliega el filtro y el carrusel —Boquete y el volcán, agrupados, quedan bajo el carril y Coiba bajo el carrusel— y vuelve a desplegarlos; orden de tabulación con buscador y herramientas; «sin mapa»: ahora abre «Capas» antes de contar las siete casillas y comprueba que «Relieve en 3D» se apaga con su motivo). `tests/unit/design/hud-css.test.ts`: la zona del buscador ya no se oculta vacía (reserva su alto) y comprueba `--filter-rows` contra el registro.
- **Casillas de capas de 22 px → 24 px** (`LayerControls.module.css`): la prueba de objetivos del HUD completo las midió por debajo de 24 px (WCAG 2.5.8, que axe da por buena por la excepción de espaciado); costaba una línea.
- **Escritorio a 1280×800: el carril no cabe entero.** Con ocho tipos de 44 px el carril (≈ 395 px útiles) deja fuera el último tipo y los dos grupos plegados, que se alcanzan desplazando el carril (barra fina siempre visible en navegadores con barras clásicas; la captura de Playwright las oculta). El corte cae a veces entre dos filas, lo que no avisa tanto como una fila cortada. Se consideraron y **no se aplicaron** (sin probarlas): quitar el título (el `<h1>`), bajar las filas por debajo de 44 px (objetivo del proyecto) y estrechar el dock (el carrusel perdería una tarjeta entera). No se resolvió (backlog F2-11).

### E2 · Lo que NO está verificado

- **GPU y navegadores reales**: solo Chromium 156 con WebGL por software; ni Safari ni Firefox, ni lectores de pantalla (los anuncios `aria-live` se comprueban por su texto y su rol, no por cómo los lee un lector), ni táctil real. `@media (scripting: none)` (retira el filtro y el buscador sin JavaScript) se comprobó con `javaScriptEnabled: false` en Chromium; navegadores sin esa característica dejarían una zona vacía reservada.
- **«Relieve en 3D» con los derechos bloqueados** (`!terrainAllowed`): cubierto con una prueba de jsdom (botón apagado, `title` y `aria-describedby`), **no** con un E2E: el build de las pruebas es de desarrollo y el relieve está permitido. Y la política de producción sigue bloqueando el mapa entero.
- **Teselas de AWS reales en las pruebas**: los E2E interceptan la red con una tesela plana de 0 m (sin relieve). El aspecto con relieve real solo se miró a mano (captura con teselas reales).
- **Rendimiento en ejecución** de las islas (INP, TBT): no medido (M-09).
- Las **claves de traducción nuevas** (`Map.search.clear` y, de E1, `Map.hud.mapUnavailable`) son automáticas en en/pt/fr/de y siguen pendientes de revisión humana.

### E2 · Claves de interfaz nuevas (pendientes de revisión humana; traducción automática, nunca `reviewed`)

`Map.search.clear` («Borrar la búsqueda» / Clear the search / Limpar a busca / Effacer la recherche / Suche zurücksetzen). _**Incompleto**: ver X4 para el registro completo (E2 añadió además `Map.filter.*`, `Map.search.*` y `Map.tools.*`)._

### E2 · Archivos

Nuevos: `src/components/map/{FilterChips,SearchBox,MapTools,CarouselFilterStatus,HudIslands,HudIslandsLazy}.tsx` (+ CSS de los cuatro primeros), `e2e/explore-interactions.spec.ts`, `e2e/explore-hud.a11y.spec.ts`, `tests/unit/components/{explore-hud-islands.test.tsx,search-params-mock.ts}`, `tests/unit/domains/tourism/explore-filter.test.ts`, `tests/unit/components/explore-filter-store.test.ts`. Modificados: `MapStage.tsx` (filtro, reagrupado, inclinación, aviso de terceros), `explore/page.tsx` y `.module.css`, `HudCarousel`, `HudGroup`, `LayerControls` (+ CSS), `DestinationList.module.css`, `map-data.ts` (`kind`), `hud-store.ts`, `explore-filter-store.ts`, `scripts/check-bundle.ts` (+ su prueba), `e2e/{map,map-areas,map-helpers,explore-hud}`, `tests/unit/design/hud-css.test.ts`, mensajes ×5, `ci.yml`, `CLAUDE.md`, `docs/{performance,testing,backlog}.md`, `docs/research/evidence-log.md` (E-95).

### E3 · Móvil: la hoja inferior — qué funciona

Por debajo de 56rem (Pixel 5 = 393×851, y de 320 a 895 px) el mapa ocupa **toda la pantalla bajo la cabecera** (`100dvh − 4rem`) y el HUD que no flota sobre él va en una **hoja inferior de dos detentes**. Es **el mismo DOM** que en escritorio: allí la hoja es `display: contents` y sus zonas son celdas de la rejilla; no se duplica ni se mueve nada (un solo `<aside>`, un solo `role="search"`, un solo «Ver en el mapa» por destino).

- **Cerrada**: el asa (un `<button>` de 44 px con `aria-expanded`/`aria-controls`, nombre `Map.sheet.open`/`close`), el título `<h1>` y, si hay un destino elegido, **su nombre y tipo** en una región `aria-live` (el título pasa a rótulo pequeño y manda el destino). Asoma ≈ 10 % de la pantalla (≈ 13 % con un destino elegido); el cuerpo mide 0, es `visibility: hidden` e **`inert`** (no se ve, no se tabula, no se lee).
- **Abierta** (≈ 60dvh con su cabecera; el cuerpo se limita además a `100dvh − 4rem − 14rem` para que un teléfono apaisado o bajo conserve un trozo de mapa: probado a 851×393 y 320×568, con ≥ 96 px de mapa a la vista bajo la cabecera): el cuerpo desplaza por dentro (`overflow-y: auto`, `overscroll-behavior: contain`) con, en orden, **buscador, filtro por tipo, capas y leyenda, ficha del destino, carrusel de los nueve destinos y el panel «Información del mapa»** con los créditos y los **dos enlaces del pie (Fuentes y Accesibilidad)**, que ya no se alcanzan desplazando la página bajo el mapa.
- **Manejo sin gesto obligatorio**: pulsar el asa (o cualquier punto de la cabecera) alterna; con el teclado Enter/Espacio; **Escape** la cierra y devuelve el foco al asa (si el buscador usó Escape para vaciarse, no la cierra). **El arrastre vertical** del asa con un dedo abre (arriba) y cierra (abajo) al soltar, con umbral de 24 px; es una mejora, no un requisito. Se anima solo el alto del cuerpo y solo con `prefers-reduced-motion: no-preference`.
- **Las herramientas (3D y «Capas y leyenda») flotan sobre el mapa y no se pliegan con la hoja**: en móvil son una **píldora horizontal arriba a la izquierda** (la columna vertical de E2 chocaba con los créditos al abrir la hoja). «Capas y leyenda» **abre la hoja** y despliega los dos grupos si estaba cerrada; elegir un **área** (`a`) la abre y lleva su panel a la vista. Ambos desplazan solo el cuerpo de la hoja, nunca la página.
- **Sin mapa** (sin WebGL2, sin datos, error, bloqueado) la hoja **se abre sola una vez** (la lista de destinos es la pantalla); si se cierra no vuelve a abrirse. Mientras el mapa carga no se abre.
- **Créditos y escala del mapa (ODbL)** siempre **sobre** la hoja, cerrada o abierta (`--sheet-h`, su alto real, lo publica un `ResizeObserver`); en móvil los créditos arrancan plegados a su botón «i» y el texto íntegro está en el panel de información.
- **Encuadre**: el hueco libre (`[data-hud-safe]`) es lo que la hoja deja sobre el mapa; «Ver en el mapa» con la hoja abierta deja el destino ahí y **encima de la hoja** (probado con Coiba). **La cámara no se mueve al abrir o cerrar la hoja**; un destino que la hoja abierta tapa por completo sale de la tabulación (`inert`) y vuelve al cerrarla; «Volver a encuadrar» lo trae de nuevo.
- **Gestos cooperativos desactivados** (`COOPERATIVE_GESTURES = false`): con el mapa a pantalla completa un gesto sobre él no desplaza la página (el pie sigue debajo: la página mide 1 194 px a 390×844 y se llega a él con el teclado o con un gesto fuera del mapa) y **un dedo mueve el mapa** (probado con eventos táctiles reales: el centro cambia y `scrollY` no). Motivo y alcance en el ADR-0025 (notas de implementación).
- **Sin JavaScript** no hay asa (sería un control muerto): `@media (scripting: none)` devuelve la pila bajo el mapa con los nueve enlaces; antes de hidratar la hoja se ve cerrada (`data-state="pending"`).
- **Teclado en pantalla**: `interactive-widget=resizes-content` en el `viewport` de Explorar y el buscador es lo primero del cuerpo; **zona segura**: `env(safe-area-inset-bottom)` en el relleno inferior (sin `viewport-fit=cover` vale 0: no se activó para no tocar la cabecera).
- **Orden de tabulación nuevo** (también en escritorio): mapa → **herramientas** → buscador → carril → ficha → carrusel → panel. Las herramientas pasaron de ir entre el carril y la ficha a ir justo tras el mapa porque no pueden estar dentro del cuerpo inerte de la hoja. Se actualizó la prueba de orden (`explore-hud.spec.ts`) conservando su intención (los controles van antes del contenido que gobiernan).
- **Sin saltos de maquetación**: Explorar en móvil emulado mide **CLS 0,000** (M-10); los créditos de MapLibre, que se abren solos al aparecer, se pliegan en la misma microtarea, antes del primer dibujo.
- **Presupuestos sin subir ninguno**: Explorar **205,0 KB de JS y 14,1 KB de CSS** (de 210 / 20; E2: 203,5 / 13,2), islas 3,9 KB, mapa diferido 461,2 KB. La hoja no puede ir en un chunk diferido (envuelve contenido que debe estar en el HTML); coste y lectura en `docs/performance.md` M-10. Inicio, Destinos y Ficha pagan +0,8–0,9 KB de CSS por la fusión de fragmentos de Turbopack.
- **Capturas** (Chromium, 2×; fuera del repo, en el directorio de trabajo de la sesión) a **320×640, 390×844 y 768×1024**, en esquema claro y oscuro, hoja cerrada y abierta, con y sin destino. **Claro y oscuro se ven igual** (el ámbito inmersivo es siempre oscuro, ADR-0025 §3), así que no hay un «móvil claro». A 768 la hoja es una tarjeta centrada de 40rem de ancho y el mapa se ve a los lados.

### E3 · Cómo ejecutarlo

```bash
SITE_ENV=development pnpm build && pnpm check:bundle        # 205,0 / 14,1 KB; islas 3,9 KB; mapa 461,2 KB
pnpm exec next start -p 3100                                 # /es/explorar en un móvil o con el navegador a < 896 px de ancho
pnpm exec vitest run --project unit tests/unit/components/{hud-sheet.test.tsx,sheet-store.test.ts,sheet-gesture.test.ts} tests/unit/design/hud-css.test.ts
pnpm exec playwright test e2e/explore-sheet.mobile.spec.ts e2e/map.mobile.spec.ts --project=mobile
```

### E3 · Qué pruebas se corrieron (resultados reales, esta máquina: macOS, Chromium 156, WebGL por software)

- `pnpm typecheck && pnpm lint && pnpm format`: **verdes**.
- `pnpm exec vitest run --project unit`: **90 archivos, 2 134 pruebas: 2 132 pasan y 2 fallan**, las dos **conocidas y ajenas** (`e2e-run` —nietos— y `pg-sweep` leen `/proc`, que macOS no tiene). Una vez, con la máquina cargada por una ejecución de Playwright que arrancaba, falló además «esperar al servidor PROPIO» de `e2e-run.test.ts`: repetido solo, pasa (**transitorio por carga, no investigado**). Nuevas: `sheet-gesture.test.ts` (4), `sheet-store.test.ts` (10), `hud-sheet.test.tsx` (32), y ampliadas `hud-css.test.ts` (47) y `explore-hud-islands.test.tsx` (40). **Falsadas**: 9 mutaciones sobre `HudSheet.tsx` en jsdom: **mueren las 9**.
- `SITE_ENV=development pnpm build && pnpm check:bundle`: **verde**. Explorar **205,0 KB de JS y 14,1 KB de CSS** (de 210 / 20); islas del HUD **3,9 KB** diferidos (presupuesto 12); mapa diferido **461,2 KB** (presupuesto 500). `docs/performance.md` M-10.
- **E2E** (`CI=true pnpm exec playwright test`, **334 pruebas**: 234 escritorio + 100 móvil; +34 de `explore-sheet.mobile`):
  - **Con el mapa base, ejecución final** (`--workers=2`, 12,1 min): **334 pasan, 0 fallan, 0 intermitentes, 0 omitidas**.
  - **Sin el mapa base** (oculto y restaurado; `--workers=3`, 5,6 min): **254 pasan y 80 se omiten** → `pnpm check:e2e-skips --max-skipped 80` en verde; presupuesto de omitidas **75 → 80** en `ci.yml`, `CLAUDE.md` y `docs/testing.md` (las 5 nuevas son «hoja inferior con el mapa»).
  - **Cómo se llegó ahí, sin esconder nada**: la primera ejecución completa con 4 trabajadores (333 pruebas, 10,4 min) dio **329 pasan, 3 fallan y 1 intermitente**: las **3 de axe de Explorar en escritorio por tiempo** (32–37 s de 30; las mismas que ya rozaban el límite en E2; **repetidas con `--workers=1` pasan en 18–20 s**) y una intermitente mía (la carrera de la apertura automática, corregida). Con `--workers=2`: 332 pasan y 1 intermitente mía (medía el marcador mientras volaba, corregido) y, tras añadir la prueba del CLS, **1 fallo real**: los créditos de MapLibre no arrancaban plegados (el primer arreglo del CLS no plegaba nada), que solo salió en la ejecución completa; corregido con el `MutationObserver`. En la ejecución sin mapa apareció además **una intermitente heredada** (`explore-hud.spec.ts` «el carrusel se pliega…»: el estado «sin mapa» llegaba tarde y obligaba al carrusel a quedarse abierto justo después de plegarlo): la prueba deja el mapa «cargando» y pasa **12 de 12** sin el fichero. **No subí ningún límite de tiempo.**
  - **No ejecuté**: `pnpm check:licenses` (falla de antemano por `@img/sharp-libvips-darwin-x64`), `pnpm test:integration`, `pnpm test:e2e:db` ni `pnpm test:e2e:content`.
- **Falsación sobre el build real** (6 mutaciones, cada una con su reconstrucción): sin `inert`; sin `visibility: hidden` (antes de hidratar); gestos cooperativos activos; créditos sin `--sheet-h`; sin hueco libre (`[data-hud-safe]`); créditos plegados al terminar de cargar: **las 6 hacen caer su prueba**.
- `pnpm perf:vitals --runs 3` (`docs/research/perf-m10-2026-10-26.json`): Explorar FCP 640 ms, LCP 2 940 ms, **CLS 0,000**, TBT≈ 573 ms, 1 279 KB, 49 peticiones, mapa listo 3 764 ms. **La primera medición dio CLS 0,040** (los créditos se plegaban al cargar): ver más abajo.

### E3 · Lo que se encontró (honestamente)

- **`visibility: hidden` se hereda aunque `display: contents` quite la caja**: el cuerpo plegado de la hoja lo llevaba y en escritorio hacía **desaparecer el HUD entero**. Lo vieron más de 30 pruebas E2E de escritorio al primer intento (no una captura); ahora hay una regla y una prueba de CSS (E-96 a).
- **Texto duplicado**: el resumen del destino, oculto por CSS en escritorio, rompía los selectores por texto (modo estricto): ya no se pinta fuera de móvil con la hoja cerrada.
- **Las herramientas verticales de E2 chocaban con los créditos** al abrir la hoja a 390×844 (el hueco sobre la hoja mide ≈ 270 px; zoom + brújula + herramientas, ≈ 290): píldora horizontal arriba a la izquierda. Lo vi en una captura, no lo detectó ninguna prueba.
- **`scrollIntoView` desplaza también la página**: «Capas y leyenda» y la ficha de un área usan `scrollTo` del cuerpo de la hoja.
- **Mis propias pruebas**: un arrastre corto es un toque (la prueba esperaba lo contrario); una carrera de la apertura automática sin mapa (1 de 333 en la primera ejecución completa); una medición del marcador **mientras volaba** (1 de 333 en la segunda). Los tres corregidos y repetidos (E-96).
- **Un salto de maquetación que solo midió `perf:vitals`**: plegar los créditos de MapLibre al terminar de cargar (para que no ocupasen dos líneas sobre la hoja) movía los controles de la esquina: **CLS 0,040** (E2: 0,000). Lo localicé con un `PerformanceObserver` de `layout-shift` (los controles de abajo a la derecha, de 393×62 a 50×38) y se pliegan ahora **en cuanto MapLibre los abre** (un `MutationObserver`, en la misma microtarea y antes del primer dibujo; solo la primera vez): CLS 0,000 y una prueba E2E lo exige (falla con 0,0402 contra la versión anterior). **Un primer arreglo, plegarlos al crear el mapa, daba CLS 0 pero no plegaba nada** (MapLibre los abre después, cuando llegan las atribuciones): lo cazó la prueba de que arrancan plegados en la ejecución completa, no la aislada.
- **Falsación**: 9 mutaciones sobre `HudSheet` en jsdom y 6 sobre el build real (sin `inert`, sin `visibility`, gestos cooperativos activos, créditos sin `--sheet-h`, sin hueco libre, créditos plegados al terminar de cargar): **mueren las 15**.
- **Pruebas ajenas adaptadas conservando su intención**: `map.mobile.spec.ts` («el mapa se apila sobre el panel» → «ocupa toda la pantalla bajo la cabecera y la hoja cerrada solo asoma»; «gestos cooperativos: un dedo desplaza la página» → «sin gestos cooperativos: un dedo mueve el mapa y la página no se desplaza»; «Ver en el mapa» y la lista de áreas abren la hoja primero), `map-areas.mobile.spec.ts` (abre la hoja), `map-helpers.ts` (`openLayers` abre la hoja en móvil; `openSheet`/`closeSheet`/`settled`), `explore-hud.spec.ts` (orden de tabulación; y «el carrusel se pliega» con el mapa «cargando» para que no dependa de cuándo llega el estado «sin mapa»), `hud-css.test.ts` (el mapa a sangre vale en los dos anchos, `.safe` existe en móvil, ya no hay `order`) y `explore-hud-islands.test.tsx` (`matchMedia` realista y las pruebas de móvil de «Capas y leyenda»).

### E3 · Lo que NO está verificado

- **Dispositivos reales**: ni un teléfono ni una tableta, ni Safari, ni Firefox, ni lectores de pantalla (los anuncios `aria-live` se comprueban por su texto y su rol), ni táctil real (el arrastre se probó con eventos táctiles del protocolo de Chromium). **No se vio el teclado en pantalla**: se probó que el `viewport` lo pide y que con la pantalla útil encogida 330 px el buscador queda entero a la vista, que es lo que haría el navegador, pero no es lo mismo.
- **`env(safe-area-inset-bottom)`** vale 0 sin `viewport-fit=cover` (no activado): el relleno de la zona segura **no se ha visto en un dispositivo con recorte**.
- **Rendimiento de la animación** de la hoja (`block-size` sobre un lienzo WebGL real): sin INP ni FPS (M-10). Alternativa sin coste de maquetación descartada por exigir un alto fijo.
- **Estado «bloqueado por derechos»** en móvil: solo cubierto por la prueba de la hoja con un mapa sin datos (`dataMissing`), no con `SITE_ENV=production`.
- **Vista inicial en móvil vertical** (F2-14): solo uno o dos de los nueve destinos a la vista al abrir; no se tocó `maxBounds`.
- **El arrastre no sigue al dedo** (decide al soltar) y solo hay dos detentes (F2-13).
- `scripting: none` y `:has()` (el título pasa a rótulo con un destino elegido) se comprobaron solo en Chromium; sin `:has()` el título no cambia de tamaño.

### E3 · Cierre de la entrega (revisión: validación, carril ≥ 80rem, plazos y correcciones)

Un intento anterior de E3 se interrumpió con el trabajo hecho pero **sin verificar**. En esta pasada **no lo rehice**: leí el `git diff` entero, ejecuté todo (unitarias, build, presupuestos, los 100 E2E móviles y después los 336 completos), tomé capturas propias y las leí, y ataqué lo que parecía firme con mutaciones. El trabajo estaba **completo y verde** (100 de 100 móviles a la primera, 2 133 unitarias, mismos presupuestos que los anotados); lo que sigue es lo que **sí** encontré y cambié:

- **F2-11 resuelto desde 80rem** (el carril del filtro no cabía a 1280×800: quedaban fuera el último tipo y los grupos «Capas» y «Leyenda»). Probé primero lo más simple —el carril cruza las filas 2 y 3 y el dock empieza a su derecha, sin umbral y con la ficha al 42 %— y **lo descarté con una captura**: el nombre del destino se partía en dos líneas y la ficha crecía de ≈ 210 a ≈ 290 px, comiéndose el hueco libre y dejando el carrusel en una tarjeta. Lo que quedó: **solo desde 80rem** (`@media (min-width: 80rem)`), con la ficha a 34rem de ancho (`flex-basis: min(34rem, 56%)`); el carrusel pasa de dos tarjetas y media a una y media con selección (con flechas, y a todo el ancho sin ella). A 1280×800 y 1440×900 caben **los ocho tipos y los dos grupos sin desplazar**, con y sin destino elegido; por debajo de 80rem (1024×768) se queda como estaba y desplaza por dentro. **Coste medido** (hueco libre `[data-hud-safe]`, que es la celda central de la rejilla): sin destino elegido no cambia (892×398 frente a 891×398 a 1279 px); **con destino elegido a 1280×800 el carrusel, más estrecho (410 px), parte su cabecera en dos líneas y el dock pasa de 198 a 234 px de alto: el hueco queda en 892×362 frente a 891×386 (−24 px)**; a 1440×900 no hay diferencia (el carril ya cabía y el carrusel mide 568 px). Los nueve destinos siguen cabiendo dentro del hueco (prueba existente, verde). Pruebas: `hud-css.test.ts` (+1; falla si se quita `grid-row: 2 / -1`) y `explore-hud.spec.ts` «desde 80rem el carril cabe ENTERO…» (que **falla con la regla anulada**: desplazaba 150 px).
- **Una prueba ajena dejó de ser cierta y la dividí conservando su intención**: «un marcador tapado por el HUD vuelve al orden de tabulación… (al plegar el carril y el carrusel)» fallaba (2 de 2): con el carril hasta abajo, Coiba queda bajo el **carril** y no bajo el carrusel, y plegar el filtro basta para descubrirla. Ahora hay dos pruebas con la misma intención («lo que un panel tapa entero sale de la tabulación y vuelve al plegarlo»): **≥ 80rem** (1280 px: Boquete y Coiba bajo el carril; plegar el carrusel no cambia nada) y **< 80rem** (1279 px, la geometría y la disposición de siempre: Boquete bajo el carril y Coiba bajo el carrusel). La segunda necesita el mapa → **presupuesto de omitidas 80 → 81**.
- **Plazos de axe**: las tres pruebas de axe de Explorar de `a11y.a11y.spec.ts` tardaron 34–37 s con tres trabajadores (límite 30 s). Subí **solo su plazo a 90 s** (`EXPLORE_AXE_TIMEOUT_MS`, con el motivo en el código; no es una espera: cada paso espera a su condición). El resto de la suite conserva los 30 s.
- **El título de la hoja sin JavaScript quedaba a caballo sobre el borde de la caja** (su margen negativo lo sube hasta el asa, que sin JavaScript no existe): lo vi en una **captura**, no lo detectó ninguna prueba. Corregido en `HudSheet.module.css` (`@media (max-width: 55.999rem) and (scripting: none)`), con una aserción en `hud-css.test.ts` y otra en `explore-sheet.mobile.spec.ts` («sin JavaScript»: el título no sobresale de la caja).
- **Una afirmación de los documentos era falsa**: «la página ya no se desplaza bajo el mapa». Medido: a 390×844 la página mide **1 194 px** (el pie, de 286 px, empieza justo bajo el mapa) y a 1280×800, 975 px. Lo que sí es cierto —y lo prueba la prueba táctil real— es que **un gesto sobre el mapa o sobre la hoja no desplaza la página**; al pie se llega con el teclado o con un gesto fuera del mapa. Corregido en el ADR-0025, `CLAUDE.md`, el comentario de `MapStage.tsx` y E3 (más arriba). Por la misma razón los dos enlaces dentro de la hoja siguen siendo útiles.
- **Otros textos desactualizados corregidos**: `docs/testing.md` decía que el mapa base «no se versiona» (lo está desde `6193226`), `CLAUDE.md` decía «hoy 75» omitidas y `docs/backlog.md` F3-10 decía que la hoja móvil «debe ir» en una isla diferida (no puede: M-10).
- **Falsación**: 5 mutaciones sobre `HudSheet.tsx` y `sheet-gesture.ts` **mueren las 5** (una sexta, «sin `aria-controls`», **no se aplicó** —el patrón de mi guion no coincidía con la sangría— y no cuenta). **Mi primer intento con `sed` de macOS no aplicó ninguna** y las pruebas «pasaron»: es exactamente el verde que no midió nada de F4-17; rehecho con un guion que comprueba que el patrón existe (E-97).
- **Qué miré en las capturas** (como diseñador, 320 / 390 / 768 y 851×393): la hoja cerrada asoma ≈ 10 % y con un destino elegido da su nombre y tipo; abierta (≈ 60dvh) deja un trozo de mapa a la vista y el cuerpo desplaza sin tapar los créditos; las herramientas en píldora arriba a la izquierda no chocan con el zoom; en alemán a 320 px los títulos largos caben. **Defectos que vi y NO resolví** (declarados): con la hoja abierta y un destino elegido, el marcador queda **bajo la hoja** (la cámara no se mueve al abrir; es una decisión, no un descuido: «la cámara solo la mueve la persona», y «Volver a encuadrar» está en la ficha); a 320 px el grupo «3» de la vista inicial queda **parcialmente** bajo la brújula nativa (≈ 5 px; no está entero tapado, que es lo que mide 2.4.11, pero no probé si ese borde se puede pulsar); y el cuerpo de la hoja apaisada (851×393) mide ≈ 105 px (cabe el buscador y el filtro, el resto desplaza).

**Archivos de esta pasada**: `src/app/[locale]/explore/page.module.css` (bloque `@media (min-width: 80rem)`), `src/components/map/HudSheet.module.css` (título sin JS), `src/components/map/MapStage.tsx` (solo un comentario), `e2e/a11y.a11y.spec.ts` (plazos), `e2e/explore-hud.spec.ts` (+2), `e2e/explore-sheet.mobile.spec.ts` (+1 aserción), `tests/unit/design/hud-css.test.ts` (+1 prueba, +1 aserción), `.github/workflows/ci.yml` (81), `CLAUDE.md`, `docs/{progress,testing,performance,backlog}.md`, `docs/decisions/0025-…md`, `docs/research/evidence-log.md` (E-97).

### E3 · Claves de interfaz nuevas

Ninguna nueva en E3 (`Map.sheet.open/close` y `Map.panel.toggle` son de `30ed83a`); `Map.sheet.open/close` se reescribieron después con `{title}` (X2). Registro completo en X4.

### E3 · Archivos

Nuevos: `src/components/map/{HudSheet.tsx,HudSheet.module.css,sheet-store.ts,sheet-gesture.ts}`, `e2e/explore-sheet.mobile.spec.ts`, `tests/unit/components/{hud-sheet.test.tsx,sheet-store.test.ts,sheet-gesture.test.ts}`. Modificados: `explore/page.tsx` y `.module.css` (la hoja envuelve título, buscador, carril, dock y panel; las herramientas y el hueco libre quedan antes; `viewport` con `interactiveWidget`), `MapStage.tsx` (gestos cooperativos fuera, créditos plegados en móvil) y `.module.css` (créditos y escala sobre la hoja, avisos), `MapTools.tsx` y `.module.css` (abre la hoja; píldora horizontal en móvil), `HudPanel.tsx` (un área abre la hoja), `MapBlocked.module.css`, `e2e/map.mobile.spec.ts`, `e2e/map-areas.mobile.spec.ts`, `e2e/explore-hud.spec.ts`, `e2e/map-helpers.ts`, `tests/unit/design/hud-css.test.ts`, `tests/unit/components/explore-hud-islands.test.tsx`, `ADR-0025` (notas de implementación), `CLAUDE.md`, `docs/{performance,testing,backlog}.md`, `docs/research/evidence-log.md` (E-96).

## Entrega 5j — Revisión independiente (2026-10-27)

Cuatro revisores independientes auditaron la entrega 5j (honestidad/idiomas/documentos, visual/diseño, accesibilidad, seguridad/privacidad/rendimiento) y un coordinador repartió los hallazgos verificados en pasos de corrección. Cada paso tiene su subsección «X<n>» con lo que halló, cómo lo reprodujo, qué cambió, qué pruebas dejó y **lo que no pudo verificar**. Los hallazgos se citan como «r0:F-01» (informe 0), «r1:V-05», «r2:F3», «r3:F-01».

### X1 · Explorar: disposición y accesibilidad del HUD (r1:V-05…V-21 y r2:F3…N5)

**Cómo se hizo (léelo primero).** Una ejecución anterior de X1 se interrumpió con ≈ 2 150 líneas añadidas y **sin anotar nada aquí**. En esta reanudación **no la rehice ni la descarté**: leí el `git diff` entero, comprobé hallazgo por hallazgo que estuviera arreglado **y** con una prueba que falla sin el arreglo, y ejecuté todo. **Salvedad de honestidad: los cuatro informes de los revisores (`report0-3.json`) no estaban en el scratchpad de esta reanudación** (el directorio estaba vacío; los busqué en todo `/private/tmp` y no existen), así que **no pude releer el repro y la evidencia originales de cada hallazgo**: trabajé con el texto de la tarea, el diff y las pruebas que ya llevaban el identificador del hallazgo, y lo verifiqué por mi cuenta con capturas y mutaciones (abajo).

**Capturas propias, ANTES (el commit `ca34997` compilado aparte) y DESPUÉS (este árbol), leídas una a una** (1920×1080, 1440×900, 1280×800, 1024×768, 1280×560, 1280×600 con destino y panel, 960×480, 1280×800 con `html{font-size:150%}`, con «Capas» abierto, con el aviso de relieve, con el lienzo enfocado y en móvil a 390×844, 320×640 y 320×256). Lo que vi:

| Hallazgo                                   | Defecto (reproducido en el build anterior)                                                                                                                                                                                                                                                                           | Arreglo                                                                                                                                                                                                                                                                                                                                           | Prueba que falla sin él                                                                                                                                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **r2:F3** foco del lienzo                  | enfocar el `<canvas>` cambiaba **16 de 1 024 000 px** (el anillo global quedaba fuera de la caja y lo recortaban el mapa y la ventana)                                                                                                                                                                               | anillo **interior** (`outline-offset: -3px`, color de foco) + halo en el `::after` del contenedor (un `box-shadow` sobre un `<canvas>` queda debajo de su contenido); `MapStage.module.css`                                                                                                                                                       | E2E de píxeles «el lienzo del mapa recibe el foco…» + su control; ahora cambian **22 473 px** del borde (anillo de 3 px + halo de 2 px, visibles en la captura)                                                                                                               |
| **r2:F5** píldora tapa herramientas        | con poca altura (≤ 600 px) o texto al 150 % la píldora «Información del mapa» cubría «Relieve en 3D» y «Capas y leyenda» (se ve en 960×480 y en 150 %)                                                                                                                                                               | el panel (plegado o abierto) va **siempre en la columna 3** (`--hud-panel-col`: 0 plegado, `--hud-panel-w` abierto), el dock **termina en la 3** y el buscador abarca 2/4: la columna de las herramientas es solo suya; `page.module.css`                                                                                                         | E2E de solape entre controles a **1280×560, 1280×600 con destino, 960×480 y 1280×800 con `html{font-size:150%}`** (+ control con el defecto original y axe `target-size`/2.4.11 a esos tamaños)                                                                               |
| **r2:F4** hoja a ≤ 288 px                  | a 320×256 la hoja «se abría» con un cuerpo de **0 px** (solo se veía la cabecera) y el foco caía en controles invisibles                                                                                                                                                                                             | suelo en `--sheet-body-h`: `max(…, min(100dvh − 4rem − 7rem, 8rem))`                                                                                                                                                                                                                                                                              | E2E a 320×256 (cuerpo ≥ 64 px, buscador dentro del cuerpo, `hiddenFocus` vacío) + control con la fórmula de antes                                                                                                                                                             |
| **r1:V-05** vista inicial                  | a 1920×1080 solo **5 de 9** destinos quedaban en el hueco libre (Bocas del Toro y Boquete bajo el carril) y el filtro por tipo no los alcanzaba                                                                                                                                                                      | `bestEffortFrame` (puro, `hud-frame.ts`): elige el encuadre que deja más destinos en el hueco libre y solo se aparta de la vista de siempre si gana **≥ 2** (1920×1080: **5 → 7**; a 1440, 1280 y 1024 no se mueve nada); se repite al cambiar la ventana **mientras nadie movió la cámara**; el filtro y la búsqueda **vuelan a los resultados** | unitarias (recuento contra un oráculo más fino, optimalidad, `minGain`) y E2E «la vista inicial deja al menos N…» (7 / 5 / 5 / 4), «Bocas del Toro y Boquete ya NO quedan bajo el carril», reencuadre al cambiar el tamaño y NO si la persona movió el mapa, vuelo del filtro |
| **r2:F9** marcador que asoma               | un marcador de 44 px que asomaba 7 px sobre la hoja seguía activo (y una pulsación ahí plegaba la hoja)                                                                                                                                                                                                              | un marcador sale de la tabulación (`inert`) si lo que se ve de él mide **< 24 px** por algún lado (9 × 9 sondas); `MapStage.tsx`                                                                                                                                                                                                                  | E2E móvil a 320×640 con la hoja abierta: los inactivos son inertes y ningún activo queda con < 24 px (medido con una rejilla de 1 px, independiente de la del código)                                                                                                         |
| **r2:F8** foco en el carrusel              | con Tab la tarjeta enfocada quedaba cortada y el anillo de «Ver en el mapa» recortado                                                                                                                                                                                                                                | `revealFocusedCard` trae la tarjeta ENTERA con 8 px de holgura (solo desplaza el carrusel, nunca `scrollIntoView`) + `scroll-padding-inline`                                                                                                                                                                                                      | E2E a 1280, 1440 y 1920 con Tab sobre cada tarjeta + control sin el desplazamiento                                                                                                                                                                                            |
| **r2:N5** anillos recortados               | el anillo (≈ 8 px) de los botones de área a todo el ancho, del primer/último chip del filtro y del cuerpo del panel lo recortaba la caja que desplaza                                                                                                                                                                | relleno + margen negativo en `AreasInView`, `FilterChips` y el cuerpo del panel                                                                                                                                                                                                                                                                   | E2E del panel, de la hoja y de los chips (con control con el defecto original)                                                                                                                                                                                                |
| **r1:V-06** eco del filtro                 | «2 destinos coinciden…» se apretaba en 3 líneas con guiones («coin-/ciden») y la cabecera crecía al escribir                                                                                                                                                                                                         | cabecera del carrusel estrecho en **rejilla de dos filas** con áreas explícitas (sin `order`) y `hyphens: manual` en todo el HUD                                                                                                                                                                                                                  | E2E «escribir no cambia la altura del carrusel; el eco cabe en 2 líneas SIN guiones» + unitaria de `hyphens`                                                                                                                                                                  |
| **r1:V-07/08/09/16** panel, carril y aviso | el buscador saltaba 144 px al abrir el panel; el título del panel se partía; el carril con «Capas» se cortaba a 6 px de la escala sin indicio de que desplazaba; el aviso del relieve era una placa plana de 3 líneas, centrada en el mapa, que tapaba marcadores; a 1024 px el panel tapaba la etiqueta del destino | el buscador abarca 2/4 (su suma no cambia); panel a 16rem (18rem desde 80rem); `--hud-strip` 2,75rem; **sombra `sticky` de color de superficie (sin degradados)** que solo se pinta si `@container scroll-state(scrollable: bottom)`; el aviso usa la columna y el ancho del buscador, en dos líneas, con el lenguaje del vidrio                  | E2E «el panel y la píldora comparten su borde derecho y el buscador no se mueve», «a 1024×768 abrir el panel NO tapa la etiqueta», «con Capas abierto el carril deja aire y avisa», «el aviso usa la columna del buscador»                                                    |
| **r1:V-18/19/21** nits                     | la pastilla «i» de créditos tapaba parte del grupo «3» a 320 px; la carga era texto sobre negro casi liso; los títulos de grupo (Playfair ≈ 22 px) eran **mayores** que el `<h1>` (≈ 21 px)                                                                                                                          | el hueco libre reserva 2,5rem para la escala y los créditos; estado de carga = texto + barra con un destello **finito** (3 vueltas, ≈ 4 s; nada infinito: 2.2.2; **X4 lo dejó con fondo plano, sin degradados y con 2 s de espera**: retrasaba el mapa, ver X4); rótulos de grupo pequeños en mayúsculas (Montserrat 700) y `<h1>` a 1,5rem       | E2E de créditos a 320 px; E2E del estado de carga (3 iteraciones, quieta con movimiento reducido); E2E de jerarquía tipográfica                                                                                                                                               |
| **r2:N1** etiquetas marinas                | las etiquetas de áreas protegidas sobre el agua miden 2,16:1 sin halo suficiente                                                                                                                                                                                                                                     | halo 1,6 → **2,2 px** (`PROTECTED_LABEL_HALO_WIDTH`)                                                                                                                                                                                                                                                                                              | `contrast.test.ts`: toda etiqueta que no llega a 3:1 con el agua exige halo ≥ 2 px (en los tres temas)                                                                                                                                                                        |

**Falsación por mutación (la mía, sobre el código real, con restauración comprobada por `sha256`)**: 10 mutaciones, **las 10 mueren**: A (dock a toda la fila) y B (panel a la columna 4) matan 2 + 1 unitarias y los 4 E2E de solape; C (foco fuera de la caja) 1 unitaria y el E2E de píxeles; D (sin suelo) 1 unitaria y los 2 E2E de 320×256; **E (sin vista de conjunto) y F (`MIN_TARGET_PX = 1`) y G (sin `revealFocusedCard`) solo las matan los E2E** (E: 3 pruebas de 1920×1080 y de reencuadre; F: el E2E móvil de inertes; G: las 3 de Tab del carrusel), lo que confirma que esas tres necesitaban prueba de navegador; H (halo 1,6) las 3 del contraste; I (lista sin holgura) 1 unitaria y el E2E del anillo; J (`hyphens: auto`) 1 unitaria y el E2E del eco. Las mutaciones E2E se aplicaron todas juntas sobre un build propio (comprobé que cada patrón era único antes de aplicarlo) y se restauró y recompiló después.

**El fallo de «Relieve en 3D» con el que se cortó la ejecución anterior** (`explore-interactions.spec.ts` «es OPT-IN…», «el `pitch` seguía en 0 tras 20 s»): **no lo reproduje** (pasa solo, en el archivo entero y en las tres suites completas) y **no es un efecto del HUD**: medí «pulsar → `data-pitch` > 45» con una máquina en reposo y **12 pulsaciones intercaladas** contra el build anterior y el actual: **9,7 s de media en los dos** (8,5–11,5 s). `data-pitch` se actualiza en `idle`, que con relieve y WebGL por software tarda ≈ 10 s, así que el plazo de 20 s tenía un margen de 2× que cualquier otra tarea agotaba. Subí **solo los plazos de `data-pitch` a 45 s** (`PITCH_SETTLE_MS`; y 90 s al plazo de la prueba con movimiento reducido, que tenía 30 s). **No puedo demostrar la causa de aquel fallo concreto** (no lo vi); la conclusión descansa en que la latencia es la misma con y sin X1 y en que no volvió a ocurrir.

**Dos carreras de las pruebas que vi y que ya existían antes de X1** (reproducidas sobre el build anterior):

- **«teclado en pantalla» (hoja móvil), solo sin el fichero del mapa y bajo carga**: `labelTop` = 44,8 px (bajo la cabecera). Causa **en el ayudante `settled()`**: tras `setViewportSize` la transición del alto de la hoja no ha empezado y dos lecturas seguidas devuelven la misma caja (la de antes), así que «quieta» no era «llegó». Ahora deja pasar **dos cuadros** antes de medir. Antes: **5 de 24** (actual) y **4 de 24** (build anterior) con 4 trabajadores; después: **24 de 24**.
- **Flechas del carrusel** («las flechas anterior y siguiente…»): el `scrollLeft` inicial vale 32 (40 en el build anterior) en ≈ 1 de cada 12 ejecuciones con 6 trabajadores (**3 de 24 antes, 2 de 24 ahora**). **No encontré la causa** (en 18 ejecuciones de diagnóstico con la misma carga no volvió a darse) y **no lo arreglé**: es preexistente y no depende de X1.

**Qué se corrió (resultados reales; macOS, Chromium con WebGL por software, 12 núcleos, con otras aplicaciones abiertas)**:

- `pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores.
- `pnpm exec vitest run --project unit`: **2 188 pasan y 2 fallan** (90 ficheros): los dos conocidos de macOS (`e2e-run.test.ts`, nietos, y `pg-sweep.test.ts`, que leen `/proc`).
- Build + `pnpm check:bundle` (presupuestos **sin subir ninguno**): Explorar **205,2 KB de JS y 14,7 KB de CSS** (de 210 / 20; antes 205,0 / 14,1), islas del HUD 3,9 KB (de 12), mapa diferido 462,3 KB (de 500; antes 461,2); Inicio 192,7 / 15,3, Destinos 191,3 / 14,7, Ficha 191,3 / 15,0, Fuentes 191,3 / 6,1. **El CSS crece ≈ 0,6 KB en las páginas que cargan `glass.module.css`** (`.eyebrow` y `.cue` van en el trozo compartido); medido después de las mutaciones y la restauración: idéntico.
- **E2E completo con `CI=true`** (retries 1, intermitente = fallo): con **6 trabajadores y la máquina a carga 47**: 362 pasan, **8 fallan y 5 intermitentes** (13,7 min); **las 13 son plazos** (30 s por defecto, 90 s de axe) y **las 13 pasan con `--workers=1`** (17 + 6 + 41 pruebas repetidas). Con **3 trabajadores: 375 pasan, 0 omitidas, 0 fallan, 0 intermitentes** (13,3 min) y `pnpm check:e2e-skips --max-skipped 101` lo confirma.
- **Sin el fichero del mapa** (movido y restaurado: `sha256` igual): 272 pasan, **101 omitidas (el presupuesto de 101 queda confirmado)**, 1 falla (la carrera de `settled()`, ya corregida y comprobada solo con la prueba aislada, **no con la suite entera sin mapa**) y 1 intermitente (las flechas).
- Además, con un trabajador: `explore-interactions` entero (28 de 28) y `explore-sheet.mobile` entero (41 de 41).

**Lo que NO está verificado / defectos que vi y NO resolví**:

- **Los informes originales** (arriba): cada fila de la tabla se apoya en el texto de la tarea y en mis capturas, no en el repro de los revisores; puede que un hallazgo tuviera un caso que no cubrí.
- **F2-15 sigue abierto** (backlog): con `maxBounds` ningún encuadre deja los nueve destinos a la vez en el hueco libre (Coiba queda siempre bajo el dock; hoy 7 de 9 a 1920×1080 y 5 a 1440/1280). La vista inicial muestra el país entero útil pero no los nueve; el filtro y «Ver en el mapa» sí los alcanzan. Relajar `maxBounds` es una decisión de una persona.
- **A 320×256 las herramientas flotantes («3D», «Capas») quedan en parte bajo la hoja abierta** (≈ 18 de 44 px visibles); no las medí con axe a ese tamaño ni las corregí (el hallazgo pedía un cuerpo utilizable y foco no tapado entero, que es lo que prueban).
- **Con un destino elegido y el carrusel estrecho** (1024×768, 1280×800) la cabecera en dos filas deja el dock en ≈ 250 px (antes ≈ 180): es el precio de que el eco no cambie el alto al escribir; no probé alternativas.
- **Con dos avisos a la vez** (relieve de terceros + error de carga, que provoqué cortando AWS) la pila tapa en parte un marcador a 1280×800; el marcador sale de la tabulación solo si lo visible mide < 24 px.
- La sombra de «hay más contenido» usa `@container scroll-state` (solo Chromium reciente): en otros navegadores no hay indicio salvo la barra de desplazamiento.
- No probé Safari ni Firefox, dispositivos reales ni lectores de pantalla; no corrí `test:integration`, `test:pipelines`, `test:e2e:content` ni `test:e2e:db` (X1 no toca ese código) ni `pnpm check:licenses` (falla en macOS por `@img/sharp-libvips-darwin-x64`).
- Sin claves de interfaz nuevas ni cambiadas (`messages/*.json` no se tocó).

**Archivos de X1** (código): `src/app/[locale]/explore/page.module.css`, `src/components/map/{MapStage.tsx,MapStage.module.css,HudCarousel.tsx,HudCarousel.module.css,HudPanel.module.css,AreasInView.module.css,FilterChips.module.css}`, `src/components/HudGroup.module.css`, `src/styles/glass.module.css`, `src/domains/geography/{hud-frame.ts,layers.ts}`. Pruebas: `e2e/{explore-hud,explore-interactions,explore-sheet.mobile}.spec.ts`, `e2e/{a11y-probes,map-helpers}.ts`, `tests/unit/design/{hud-css.test.ts,contrast.test.ts,css-flat.ts}`, `tests/unit/domains/hud-frame.test.ts`. Documentos: `CLAUDE.md`, `docs/{backlog,testing,progress}.md`, `docs/decisions/0025-…md`, `.github/workflows/ci.yml` (comentario y presupuesto 101).

### X2 · Explorar: semántica, honestidad y privacidad (r0:F-01, F-02, F-05, F-07 · r3:F-01, F-02, N-02, N-03 · r2:F6, N2, N3, N4 · r1:V-15, V-17)

**Cómo se hizo (léelo primero).** Una ejecución anterior de X2 se cortó por el límite de uso de la cuenta con buena parte ya escrita y **sin anotar nada aquí**. En esta reanudación **no la rehice ni la descarté**: leí el `git diff` (excluyendo lo de X1), comprobé hallazgo por hallazgo cuál estaba arreglado **y con una prueba que falla sin el arreglo**, y completé lo que faltaba. **Esta vez SÍ tenía los cuatro informes de los revisores** (`report0-3.json`, regenerados desde el diario del workflow) y leí cada hallazgo entero. Estaban hechos y con prueba unitaria: r0:F-01, F-02 (texto), F-05, F-07, r3:F-01, N-02, N-03, r2:N2, N3, N4, r1:V-15, V-17 y r2:F6 en el control de MapLibre. **Faltaban**: r3:F-02, el `lang` del párrafo de créditos del panel (r2:F6), TODAS las pruebas de navegador de lo anterior y la comprobación de que cada prueba falla sin su arreglo. Además aparecieron **tres defectos que no estaban en los informes** (abajo).

| Hallazgo                                     | Defecto (cómo se reprodujo)                                                                                                                                                                                                                                              | Arreglo                                                                                                                                                                                                                                                                                                                                                                                      | Pruebas (todas falsadas, ver «Falsación»)                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **r0:F-01** insignia sin rótulo              | en `/es/explorar` las tarjetas dicen «✓ Verificada» / «◐ Parcial» a secas: se lee como «destino verificado» y es el estado de la **geometría derivada de OSM** (Bocas del Toro sale «Verificada» y su nota dice que su alcance «está pendiente de definición editorial») | `StatusBadge` acepta `label` («Geometría», `Coverage.geometryLabel`, ×5 idiomas): rótulo VISIBLE, antes de la insignia, 11 px, dos líneas que caben en los 44 px del botón (la tarjeta no crece); lo pasan el carrusel y la ficha de Explorar. La tabla de la ficha (`/destinos/…`) **no** lo lleva: su fila ya dice «Geometría (Overture/OpenStreetMap)»; la portada no muestra la insignia | unitaria `status-badge.test.tsx` (5 idiomas, orden, texto visible); E2E ×5 idiomas (rótulo, tamaño, orden, estados reales), «no agranda la tarjeta», ficha destacada sí / tabla no                                     |
| **r0:F-07** insignias congeladas en el build | `.next/prerender-manifest.json`: `/es\|en\|…/explore` con `initialRevalidateSeconds=false` (la ficha, 3600); tras 2027-01-18 diría «Verificada» mientras la ficha dice «Desconocida»                                                                                     | `export const revalidate = 3600` en `explore/page.tsx`; `scripts/lib/isr-scan.ts` lo exige para esa ruta y `pnpm check:bundle` lo comprueba sobre el build real                                                                                                                                                                                                                              | `isr-scan.test.ts`, `check-bundle.test.ts`; **con el literal quitado `check:bundle` FALLA** (5 rutas «se esperaba 3600»). Efecto de la fecha **inferido, no simulado**                                                 |
| **r0:F-05** buscador                         | «Casco Viejo», «Valle Antón», «Canal Panamá», «Bocas Toro»… no encontraban nada (solo prefijo/subcadena del slug)                                                                                                                                                        | `search.ts` busca **por palabras**: todas, cualquier orden, sin artículos ni preposiciones de los cinco idiomas, con orden de relevancia (exacto → comienzo → palabras sueltas → subcadena); homonimias (Barú, Santa Catalina) por **clave**. **«Casco Viejo» NO se arregla con un alias** (decisión abajo) y `Search.scope` ×5 dice que solo reconoce los nombres registrados               | 13 bloques de unitarias nuevos (los nueve nombres × cinco idiomas sin sus artículos, homonimias, orden, 80 caracteres), isla `SearchBox`, E2E «Valle Antón», «Canal Panamá», «Bocas Toro», «Toro Bocas», «Casco Viejo» |
| **r0:F-02** «conserva… los filtros»          | `/es/explorar?d=coiba&l=…` + «Localidad» + «catalina» → English: se conservan `d` y `l`, **no** el filtro ni la búsqueda (estado local, a propósito: privacidad)                                                                                                         | texto corregido ×5 (`Language.help`: «el destino, la vista del mapa y las capas activas») y `Home.principles.languages.body` («el destino y las capas del mapa»); el comportamiento **no** cambia                                                                                                                                                                                            | `messages.test.ts` (ningún idioma nombra filtros); E2E del flujo completo: el menú dice lo nuevo y tras cambiar queda «Todos», sin texto y las nueve tarjetas                                                          |
| **r3:F-01** aviso previo del 3D              | el botón no avisaba antes de pulsar y la IP viajaba a AWS al hacerlo (23 peticiones)                                                                                                                                                                                     | `Map.tools.threeDNotice` ×5 como **descripción accesible** del botón (`aria-describedby`, siempre en el DOM) y texto visible al pasar el cursor o enfocar (1.4.13: Escape lo descarta, el cursor puede pasar sobre él). **Solo describe al botón si pulsarlo pide algo** (apagado y utilizable): desactivado, su descripción es solo su motivo                                               | unitarias ×5 idiomas + `aria-describedby`; E2E de escritorio (cursor, foco, Escape, cero peticiones a AWS hasta pulsar) y de móvil (Pixel 5, cabe en la pantalla); vi las capturas de 1440×900 y de móvil              |
| **r3:F-02** peticiones a AWS tras apagar     | ver «Cómo se reprodujo r3:F-02» abajo                                                                                                                                                                                                                                    | `applyStyle` en `MapStage` lee las capas **de la URL en ese instante** (`currentUrlLayers`) y se llama **antes** de mover la cámara al apagar                                                                                                                                                                                                                                                | unitaria `use-map-url-state.test.ts` + E2E con CPU ×6 (muere sin el arreglo, 3 de 3)                                                                                                                                   |
| **r3:N-03** geolocalización                  | `Permissions-Policy` conservaba `geolocation=(self)` sin código que la use                                                                                                                                                                                               | `geolocation=()`                                                                                                                                                                                                                                                                                                                                                                             | `security-headers.test.ts` (además: ningún `src/**` nombra `geolocation` salvo la cabecera) y `security.spec.ts`                                                                                                       |
| **r3:N-02** sin límite                       | el campo de Explorar aceptaba 2 000 000 de caracteres                                                                                                                                                                                                                    | `maxLength=80` y la consulta se recorta (`SEARCH_QUERY_MAX_LENGTH`)                                                                                                                                                                                                                                                                                                                          | unitarias + E2E (`insertText` de 5 000 → 80)                                                                                                                                                                           |
| **r2:F6** créditos sin `lang`                | dos créditos en inglés en el idioma de la interfaz                                                                                                                                                                                                                       | control de MapLibre: `<span lang="en">` en la atribución del **estilo** (MapLibre la sanea con una lista blanca que admite `span`/`lang`); panel: `<en>…</en>` + `t.rich` ×5                                                                                                                                                                                                                 | `map-style.test.ts`; E2E ×5 idiomas (panel) y del control (con mapa)                                                                                                                                                   |
| **r2:N2** nombre del asa (2.5.3)             | «Abrir la información del mapa» no contenía «Explorar Panamá»                                                                                                                                                                                                            | `Map.sheet.open/close` = `{title}: …` y `HudSheet` recibe `titleText`                                                                                                                                                                                                                                                                                                                        | `hud-sheet.test.tsx` ×5 idiomas (contiene y EMPIEZA por el título) y E2E móvil                                                                                                                                         |
| **r2:N3** anuncio por tecla                  | dos mensajes a 85 ms al escribir «bo»                                                                                                                                                                                                                                    | `SEARCH_ANNOUNCE_DELAY_MS = 500` tras la última tecla (el tipo se anuncia al momento; el eco visible sigue cada tecla y es `aria-hidden`)                                                                                                                                                                                                                                                    | unitarias con reloj falso; E2E (`canal` a 60 ms por letra → UN anuncio)                                                                                                                                                |
| **r2:N4** Escape (1.4.13)                    | la etiqueta emergente del marcador no se descartaba                                                                                                                                                                                                                      | `data-label-dismissed` (solo las emergentes; el CSS con `:not([data-label-dismissed])` en la regla de `:hover`/`:focus-visible`)                                                                                                                                                                                                                                                             | `hud-css.test.ts` y E2E (descarta, se rearma al volver a entrar, la que se ve por sitio no se toca)                                                                                                                    |
| **r1:V-15** destinos anónimos                | nueve puntos sin nombre hasta pasar el ratón: en táctil no se sabe cuál es cuál                                                                                                                                                                                          | `label-layout.ts` (puro) + `layoutMarkerLabels`: cada marcador suelto muestra su nombre **si cabe** (no toca otro botón ni otra etiqueta, entera en el hueco libre)                                                                                                                                                                                                                          | 14 unitarias + E2E de escritorio (≥ 2 etiquetas, dentro del hueco, sin solapes) y de móvil (dentro de la pantalla, bajo la cabecera, sobre la hoja); vi 1440×900, 390×844 y `?d=panama-city`                           |
| **r1:V-17** CTA roja                         | «Abrir el mapa» enlazaba a la propia pantalla y era lo más saturado del mapa                                                                                                                                                                                             | `body:has([data-explore]) .header .cta { display: none }` (`data-explore`, **no** `data-immersive`: la portada lo lleva y allí la llamada SÍ entra al mapa)                                                                                                                                                                                                                                  | `shell-css.test.ts` + E2E a 1280 y 1440 (oculta; en la portada visible; menú y marca intactos)                                                                                                                         |

**Tres defectos que no estaban en los informes y arreglé** (los vi al escribir las pruebas):

1. **Buscar «Panamá» (o «el», o el filtro «Localidad») dejaba el mapa en el océano.** Medido a 1440×900: tras «Panamá» (Ciudad y Canal, a 6 km) la cámara quedaba a zoom 13,40 **en el centro de la caja de trabajo**, con los dos marcadores a ≈ 9 000 px; «el» dejaba 1 de 2 y «Localidad» 2 de 3. **Causa**: `bestEffortFrame` (X1, r1:V-05) muestrea una rejilla de 41 × 41 centros sobre TODA la caja de trabajo; a zoom alto salta cientos de píxeles entre muestras y ninguna caía cerca de los puntos (0 dentro) → devolvía «la vista de siempre». **Arreglo**: modo `aim` (resultados concretos): además prueba centros que ponen los propios puntos (cada uno, su centroide, el centro de su caja) en el centro del hueco, prefiere el zoom MÁS ALTO que deja ver más y busca hasta 1,5 niveles por debajo del ajuste (`FIT_ZOOM_SLACK`, porque los 44 px del marcador no caben en el ajuste exacto). La vista de conjunto no cambia (las 45 pruebas previas de `hud-frame.test.ts` pasan intactas). **Después**: «Panamá» → los dos dentro del hueco (zoom 13,2); «Localidad» → los tres; «el» → los dos; «bo» → los dos. Pruebas: 6 unitarias nuevas con **control** (sin `aim`, con los números reales del navegador, el defecto original: 0 dentro y centro a > 0,5° de los resultados) y un E2E «buscar Panamá».
2. **Una regla CSS mía rompía `hud-css.test.ts`** (`.marker[data-label-dismissed]… { overflow: hidden }`: «nunca recortar», 1.4.12). Lo detectó la suite unitaria completa; ahora es la misma regla `:not(…)` sin segundo `overflow`.
3. **El aviso previo del 3D contaminaba la descripción del botón desactivado**: «sin datos del mapa base» y «sin WebGL2» (E2E de X1) esperaban «No disponible: el mapa no está activo.» y recibían el aviso de AWS delante. Un botón desactivado no envía nada a nadie: ya no lo lleva ni se muestra al pasar el cursor sobre él.

**Cómo se reprodujo r3:F-02 (con honestidad).** El informe da 3 de 10 ciclos con peticiones 1–3,5 s tras apagar. **No lo reproduje con la máquina en reposo**: 0 de 28 ciclos (7 s encendido, 1,5 s y 0,4 s). Mi primera medición («7 de 8 ciclos, a +0,3–0,7 s») **era un artefacto**: el reloj arrancaba al _enviar_ el clic y con la máquina cargada Playwright tarda 0,5–3 s en que la página lo atienda; las peticiones eran anteriores al apagado. Medido bien (un `click` en captura que anota la hora a la que la PÁGINA atiende la pulsación y la hora de cada petición interceptada) y con la CPU del navegador a ×6 (`Emulation.setCPUThrottlingRate`, la «máquina cargada» del informe): **4 de 8 ciclos con 8 peticiones cada uno, a +138–300 ms**, en el código de antes. **Causa**: `useSearchParams` llega a React con retraso (≈ 0,5–1 s con la máquina lenta); al apagar, la URL cambia al instante pero el estilo del mapa se reaplicaba con el render viejo y la cámara empezaba a bajar con el relieve aún encendido: el mapa seguía pidiendo teselas que ya nadie quería. **Arreglo**: `applyStyle` lee las capas de `window.location` en el momento de aplicar y `toggleThreeD` lo dispara **antes** de `easeTo`. **Después**: **0 de 23 ciclos** (×6 y ×4; 0 s, 0,15 s y 7 s encendido). **Lo que no se puede garantizar**: las peticiones ya en vuelo al pulsar no se recuperan, por eso el aviso dice qué pasa al ACTIVAR y no promete «deja de enviar» de forma absoluta.

**Decisión sobre «Casco Viejo» (r0:F-05).** El registro **sí** tiene `slugs[l].aliases`, pero son slugs ANTERIORES que redirigen URLs (no apodos de búsqueda), y el propio registro dice (E-41, `homonymCascoViejo`) que existe OTRO «Casco Viejo» en Veraguas y que no es este. Añadir `casco-viejo` como alias sería relacionar por nombre justo lo que el proyecto se niega a hacer, y «no inventes nombres». **No lo forcé**: se ajustó `Search.scope` ×5 («no reconoce otros nombres de uso corriente») y quedó en el backlog (F2-16) como decisión de una persona con fuente. Una prueba fija que «Casco Viejo» no encuentra «Casco Antiguo» y cambiará a propósito si se acepta un alias.

**Un hallazgo sobre las pruebas, no sobre el producto (ISR y `networkidle`).** Con Explorar en ISR, la respuesta (y la de su prefetch desde la portada) lleva `Cache-Control: s-maxage=3600, stale-while-revalidate=31532400`; en una SEGUNDA visita dentro del mismo contexto Chromium la revalida en segundo plano y esa petición **no llega a terminar para Playwright** (2 pendientes durante 25 s mientras `curl` recibe 49 KB en 24 ms; sin `revalidate` en Explorar no ocurre: idle a los 0,5 s). Rompía «la inclinación del marco de la marca…» (`home.spec.ts`, que visita la portada dos veces y espera `networkidle`): su `hydrated` en esa prueba pasa a esperar `load` (solo mide un `transform` CSS). **No verificado en Vercel** (allí el navegador recibe otro `Cache-Control`); en `next start` la ficha de destino, que ya era ISR, tiene las mismas cabeceras.

**Falsación (mutaciones mías sobre el código real, con restauración comprobada por `sha256`).**

- **15 mutaciones unitarias (U1–U15), las 15 mueren**: búsqueda sin tokenizar, `geolocation=(self)`, asa sin título, `Language.help` que vuelve a prometer filtros, créditos del estilo sin `lang`, ISR sin Explorar, insignia sin rótulo, etiquetas sin el límite del hueco, anuncio sin espera, sin `maxLength`, aviso del 3D sin descripción, CTA visible, `aim` sin candidatos dirigidos, `currentUrlLayers` leyendo el render, `revalidate = 60`.
- **Lote E2E sobre el build real (10 mutaciones a la vez)**: mueren las 12 pruebas de navegador que les tocan (insignia ×3, CTA ×2, créditos del panel, anuncio, `maxLength`, aviso del 3D, etiquetas, Escape, vuelo de «Panamá»).
- **r3:F-02: la primera versión de su prueba SOBREVIVIÓ** a la mutación (medía «se aplicó un estilo con relieve tras apagar», que no era el mecanismo). La reescribí con la medida de arriba y, con SOLO esa mutación, **muere 3 de 3** (entre 3 y 20 peticiones tardías por ejecución, la última a +1 941 ms); sin ella pasa (2 de 2).
- `pnpm check:bundle` con `revalidate` quitado de Explorar: **falla**.

**Qué se corrió (resultados reales; macOS, Chromium con WebGL por software, 12 núcleos, la máquina con carga 19–26 por otras aplicaciones).**

- `pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores.
- `pnpm exec vitest run --project unit`: **2 275 pasan y 3 fallan**: los dos conocidos de macOS (`e2e-run.test.ts` nietos, `pg-sweep.test.ts`) y `check-deps.test.ts` «MPL-2.0…» (intermitente bajo carga: **pasa aislado**, no lo investigué más).
- Build + `pnpm check:bundle`: Explorar **205,3 KB de JS y 14,9 KB de CSS** (de 210 / 20; antes 205,2 / 14,7), islas del HUD **4,6 KB** (de 12; antes 3,9: aviso del 3D, espera del anuncio y el buscador por palabras), mapa diferido 462,9 KB (de 500). Inicio 193,0 / 15,5, Destinos 191,3 / 14,9, Ficha 191,3 / 15,3 (el CSS de la insignia con rótulo viaja en el trozo compartido).
- **E2E completo con `CI=true --workers=2`**: **402 pasan, 0 fallan, 0 omitidas y 1 intermitente** (24,9 min): `explore-interactions` «el eco del filtro… no cambia la altura del carrusel» (el dock medía 580 px en vez de 602 en el primer intento; **pasa 12 de 12 aislado** y en el reintento; no hallé la causa; con `CI=true` un intermitente cuenta como fallo y `pnpm check:e2e-skips --max-skipped 109` sale con 1 por eso). Una ejecución anterior (24 min, 398 pasan) **se descarta**: la rompí yo al lanzar otro `playwright test` a la vez (ver abajo). Antes de ese resultado limpio hubo fallos reales ya corregidos (descripción del 3D desactivado y ISR + `networkidle`, abajo)
- Los **28** E2E nuevos (`e2e/explore-review-x2.spec.ts`, 26, y `explore-review-x2.mobile.spec.ts`, 2): 20 sin mapa y 8 con él (**el presupuesto de omitidas sube de 101 a 109**: medido ocultando el fichero solo sobre esos dos archivos, 8 omitidas; **no** con la suite entera sin mapa, que no volví a correr).

**Lo que NO está verificado / no resolví.**

- **El efecto de la fecha de r0:F-07** (tras 2027-01-18) se infiere del manifiesto y de `check:bundle`; no simulé el cambio de día ni vi una regeneración real. ISR es _stale-while-revalidate_: la primera visita tras el plazo recibe la versión anterior.
- **Capturas**: leí 1440×900 (inicio, 3D con el cursor, Coiba, `?d=panama-city`) y móvil (390×844 y Pixel 5 con el aviso del 3D enfocado). **No** miré a 1024×768, 1280×800 ni en los otros idiomas el aviso del 3D, las etiquetas de los marcadores ni la insignia con rótulo en alemán/francés (más largos).
- **La corrección de `aim` se midió a 1440×900** con cuatro búsquedas y un filtro; no a otros tamaños ni en móvil. Los 1,5 niveles de margen (`FIT_ZOOM_SLACK`) son una decisión mía sin otra medida.
- **«Casco Viejo»** sigue sin encontrarse (decisión de una persona: F2-16). Una consulta de **un solo carácter** como «Ø» o «Ł» sigue coincidiendo con casi todos los nombres (se normaliza a «o»/«l» y es subcadena: es lo que quien está tecleando espera); el informe lo anotó como curiosidad y no lo cambié.
- **El cambio de idioma sigue perdiendo el filtro y la búsqueda** (a propósito): solo se corrigió el texto. Hacerlo cierto exigiría ponerlos en la URL (privacidad).
- **Cuando se enfoca un marcador con teclado y Escape** solo lo probé con cursor (`:hover`); el mismo código atiende `:focus-visible`, pero no hay una prueba de navegador con foco por teclado (el foco programático tras un cursor no cuenta como «visible»).
- **Hallazgos de otros pasos que vi y NO toqué**: nada nuevo aparte de lo anterior. Los fallos E2E de las ejecuciones intermedias fueron (a) la descripción del 3D desactivado (arreglada), (b) ISR + `networkidle` (arreglada en el test) y (c) mi propia ejecución simultánea de otro `playwright test`, que **borra `test-results/` y rompe la primera** (ENOENT en `.playwright-artifacts`): **no se lanzan dos Playwright a la vez en el mismo árbol**.
- No probé Safari ni Firefox, dispositivos reales ni lectores de pantalla; no corrí `test:integration`, `test:pipelines`, `test:e2e:content` ni `test:e2e:db` (X2 no toca ese código) ni `pnpm check:licenses` (falla en macOS por `@img/sharp-libvips-darwin-x64`).

**Claves de interfaz nuevas o cambiadas (pendientes de revisión humana; traducción automática en en/pt/fr/de, nunca `reviewed`)**: `Map.tools.threeDNotice` (nueva), `Coverage.geometryLabel` (nueva), `Map.sheet.open` y `Map.sheet.close` (ahora con `{title}`), `Language.help`, `Home.principles.languages.body`, `Search.scope` (cambiadas) y `Map.attribution` (mismo texto, ahora con `<en>…</en>`). `ui-status.ts` no se tocó.

**Archivos de X2** (código): `src/app/[locale]/explore/page.tsx`, `src/components/{StatusBadge.tsx,StatusBadge.module.css,SiteHeader.module.css}`, `src/components/map/{MapStage.tsx,MapStage.module.css,MapTools.tsx,MapTools.module.css,SearchBox.tsx,CarouselFilterStatus.tsx,HudSheet.tsx,use-map-url-state.ts}`, `src/config/security-headers.ts`, `src/domains/geography/{label-layout.ts,hud-frame.ts,map-core.ts,map-style.ts}`, `src/domains/tourism/search.ts`, `scripts/{check-bundle.ts,lib/isr-scan.ts}`, `messages/*.json`. Pruebas: `e2e/{explore-review-x2.spec.ts,explore-review-x2.mobile.spec.ts,security.spec.ts,home.spec.ts}`, `tests/unit/{components/{status-badge,use-map-url-state,hud-sheet,explore-hud-islands}…,design/{shell-css,hud-css}.test.ts,domains/{label-layout,hud-frame,map-style}.test.ts,domains/tourism/search.test.ts,config/security-headers.test.ts,i18n/messages.test.ts,scripts/{check-bundle,isr-scan}.test.ts}`. Documentos: `CLAUDE.md`, `docs/{backlog,security,testing,progress}.md`, `.github/workflows/ci.yml` (comentario y techo de omitidas 101 → 109).

### X3 · Cáscara y páginas: texto agrandado, foco, móvil y copy (r2:F7, F2, F1 · r1:V-01…V-04, V-10…V-12, V-14 · r0:F-06, F-09, F-10, F-12, F-14)

**Cómo se hizo (léelo primero).** Esta vez los cuatro informes (`report0-3.json`) **sí** estaban en el scratchpad: leí cada hallazgo entero (repro, evidencia, arreglo sugerido) antes de tocar código. Reproduje con Playwright sobre el build previo (ca34997 + X1 + X2, puerto 3400) y **leí** las capturas antes y después (`/private/tmp/…/scratchpad/fixshots/x3/`: portada a 390×844, 320×640, 768, 1024 y 1440; 404; ficha en alemán a 390; `/fr/sources` a 320; pie). Tres decisiones de método: (1) el texto agrandado se simula como lo hizo la revisión (`html { font-size: N % }` con una hoja construida) porque es el caso **más duro** —sus `rem` valen N % pero las `@media` siguen midiendo en `rem` del navegador—; (2) cada comprobación de las pruebas nuevas tiene un **control** (el detector ve lo que debe ver); (3) la falsación se hizo sobre el build real (abajo).

| Hallazgo                                 | Defecto (cómo se reprodujo)                                                                                                                                                                                                                                                                     | Causa y arreglo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **r2:F7** rótulo con texto agrandado     | 390×844 al 200 %: marca de 134×402 px (`PA-NA-MA / IM-MER-SIVE` apilado en 42 px), cabecera de 128, desbordamiento de 83 px (es) / 121 px (de). **Medí más que el informe**: a 768 px y 175–200 %, y a 1280 px y 150–200 %, la cabecera también se rompía (marca de 390 px de alto a 768/175 %) | Las `@media` de la cabecera usan `rem` que **no escalan** con `html { font-size }`. Ahora la cabecera es un **contenedor** (`container-type: inline-size`) y las decisiones estructurales (rótulo, nombre del idioma, «Abrir el mapa», menú) son consultas de contenedor, cuyas `rem` sí escalan. Rótulo `white-space: nowrap`; con < 16rem de cabecera **se oculta** y queda la marca P (44 px, nombre accesible por el `aria-label` del enlace)                                                                                                        |
| **r2:F7** (resto)                        | Portada al 200 %: la etiqueta «ENTWICKLUNGSVERSION» (446 px en una caja de 262) y el campo de búsqueda (408 px) desbordaban la página                                                                                                                                                           | `overflow-wrap: anywhere` en la etiqueta; la columna del formulario es `minmax(0, 1fr)` (el ancho intrínseco del `<input>` la ensanchaba). Barrido de 8 anchos × 5 tamaños de letra: sin desbordes                                                                                                                                                                                                                                                                                                                                                       |
| **r2:F2** foco bajo menú/idioma abiertos | 390×844, ficha: menú abierto + Tab → «Volver a destinos» **entero** bajo el popover (`elementFromPoint` = el menú)                                                                                                                                                                              | `MenuFocusGuard` (isla de cliente que no pinta nada) cierra el popover cuando el foco sale por teclado; el selector de idioma cierra su `<details>` con `focusout`. La lógica es una función pura (`src/lib/focus-out.ts`). Escape y la devolución del foco siguen como estaban; el selector es el **primer** `<summary>` (1 en el DOM)                                                                                                                                                                                                                  |
| **r1:V-04** portada móvil                | 390×844: «Busca entre los 9 des…» recortado; «Abrir el mapa» a y = 817–861 (sobre 844). A 320×640 muy por debajo                                                                                                                                                                                | Tarjeta de marca oculta < 40rem (la marca ya está en la cabecera); botones **antes** del buscador (orden del DOM = visual = de tabulación); campo y botón en dos filas a todo el ancho < 30rem; texto de ayuda corto (`Search.placeholder` ×5, sin recuento); título y texto de apoyo algo menores y menos relleno en teléfono. **Medido** (5 idiomas, emulación móvil): botón principal entre y = 404–471 con 844 de alto y 444–572 con 640; antes 817–861. En la E2E de escritorio con ventana de 320 px sale hasta 592 (portugués), a 48 px del borde |
| **r1:V-10** 768–1024                     | La tarjeta decorativa era una 2.ª columna que apretaba el formulario a 768                                                                                                                                                                                                                      | Dos columnas solo desde 64rem; de 40 a 64rem la tarjeta va arriba, compacta                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **r1:V-11** caja dentro de caja          | El rótulo llevaba una «chapa» sólida sobre un marco de vidrio translúcido                                                                                                                                                                                                                       | El marco es **sólido** (como la columna de texto) y el rótulo no lleva fondo. La portada ya no usa `backdrop-filter` (axe no mide texto sobre vidrio; era la razón de la chapa)                                                                                                                                                                                                                                                                                                                                                                          |
| **r1:V-12** marca secundaria en el pie   | Sobre Azul Profundo la silueta perdía las zonas azules (azul de marca sobre el azul del pie: < 3:1)                                                                                                                                                                                             | Placa de Arena redondeada tras la silueta (token `--color-brand-sand`), como en el tablero                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **r1:V-14** tablas en teléfono           | `/de/…/casco-antiguo` a 390: la columna «Beobachtung» fuera de pantalla sin pista; `/fr/sources` a 320: «oc-cupa-tion»                                                                                                                                                                          | `ScrollRegion` (ahora de cliente) pinta una **sombra** en el borde que tiene más contenido, la quita al llegar al extremo y, sin JavaScript, avisa por el final en pantallas estrechas; anchos mínimos por columna; sin guionado en celdas                                                                                                                                                                                                                                                                                                               |
| **r2:F1** `landmark-unique`              | axe (best-practice): región «Fuentes en uso» dentro de región «Fuentes en uso», en las 24 combinaciones                                                                                                                                                                                         | La `<section>` ya no lleva `aria-labelledby` (sin nombre no es un hito); solo queda la región desplazable con el nombre del encabezado                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **r1:V-03** guionado                     | `hyphens: auto` en el cuerpo: «OpenS-treetMap», «con-tributors», «explo-rada»                                                                                                                                                                                                                   | Cuerpo y titulares `manual`; tablas `manual`; `auto` solo en `.page` y en las secciones de la portada (`.hyphenate`) y solo en palabras de ≥ 10 letras (`hyphenate-limit-chars: 10 4 4`: no parte «estado» ni «revisión»)                                                                                                                                                                                                                                                                                                                                |
| **r1:V-01** pie flotando                 | 404 a 1440×900: el pie acaba en y = 534; 366 px de Arena debajo                                                                                                                                                                                                                                 | `body` es una columna flex y `main` absorbe el sobrante                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **r1:V-02** botones sin aire             | 404: 4 px entre botones (el espacio de una palabra); ficha: «Ver en el mapa» a 0 px de la tabla                                                                                                                                                                                                 | `.actions` (flex con `gap: var(--space-3)`) y `margin-block-start: var(--space-6)` en la acción de la ficha                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **r0:F-06** promesas sin producto        | «descubrir, comprender y **organizar viajes**» (es/pt/fr), «plan trips» (en), «zu planen» (de) en el texto de apoyo y en la descripción                                                                                                                                                         | Reescritos ×5 a «descubrir y comprender Panamá a partir de fuentes abiertas y verificables» (+ «Cada dato muestra de dónde sale»). **El lema «Un país, infinitas historias.» no se toca** ni se le añade nada                                                                                                                                                                                                                                                                                                                                            |
| **r0:F-09** buscador sin JavaScript      | Sin JS: «Buscar» → `/es/explorar?q=mi+casa+en+Boquete`; Explorar ignora `q`; el comentario decía que la consulta «no sale de la página»                                                                                                                                                         | El formulario se **oculta** con `@media (scripting: none)` (un campo que no puede buscar engaña) y el campo **no lleva `name`**: aunque un navegador sin esa consulta lo envíe, no viaja nada. Comentario corregido                                                                                                                                                                                                                                                                                                                                      |
| **r0:F-14** `lang="en"` con español      | «ODbL (datos derivados de OpenStreetMap)» en una celda en inglés. **Además** (no estaba en el informe): «Noto Sans (glifos SDF de …)»                                                                                                                                                           | Las dos cadenas de `sources.ts` pasan a inglés (nombres propios intactos) y una prueba lo vigila                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **r0:F-10** 404 sin título               | `<title>Panamá Immersive</title>` y `Meta.notFound.title` sin usar                                                                                                                                                                                                                              | Ver «Hallazgo propio 2» (no bastaba con `generateMetadata` en `not-found.tsx`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **r0:F-12** traducciones                 | `die neun ersten` (calco), «Reframe the destination», «Enquadrar o destino de novo», «Ansicht erneut auf das Reiseziel ausrichten» (2 líneas), dos etiquetas para las herramientas                                                                                                              | Ver «Claves» abajo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Hallazgos propios de X3 (no estaban en los informes o iban más allá):**

1. **El defecto de F7 era más ancho que el informe** (tabla arriba): la causa común es que las `@media` miden con `rem` sin escalar. Pasar solo el rótulo a `nowrap` + ocultar con `@media` habría dejado rota la cabecera a 768/1280 px con texto agrandado. Por eso las decisiones estructurales de la cabecera y del selector de idioma son consultas de **contenedor** (los umbrales, **medidos**: marca + rótulo + menú + globo ≈ 15,4rem; con idioma y «Abrir el mapa» 31,5–32,8rem; con los tres enlaces en línea 47,2–49,8rem; los umbrales son 16 / 34 / 46 / 61rem de cabecera). `top-layer` + `contain: layout`: el popover del menú **sigue** pegado al borde de la ventana (medí `top: 64` con la página desplazada 300 px).
2. **El título de la 404 no bastaba con `generateMetadata` en `not-found.tsx`.** El HTML del servidor traía el título bueno, pero **tras hidratar** el enrutador del cliente volvía a calcular la cabecera desde la ruta y ponía otra vez «Panamá Immersive» (la pestaña decía «Página no encontrada» ≈ 1 s y luego solo el nombre del sitio; en la prueba, 2 de 5 idiomas fallaban por tiempos). Arreglo: `generateMetadata` también en `[...rest]/page.tsx`. La prueba espera a la hidratación (`__reactFiber`) y exige que el título **se mantenga** 1,5 s; con ese archivo sin la función, los cinco idiomas fallan.
3. **La 404 llega SIN cabecera ni pie en el HTML del servidor** (`<body><div hidden>…` + scripts; se pintan en el cliente). **No es de X3**: lo comprobé reconstruyendo con el `[...rest]/page.tsx` original (mismo HTML, 14 582 bytes, `<header` = 0) y pasa igual con `/destinos/<slug inexistente>`. Con JavaScript no se nota; **sin JavaScript la 404 sale en blanco**. **No lo arreglé** (no sé la causa: la señal es un `NEXT_HTTP_ERROR_FALLBACK;404` fuera de límite en el flujo RSC). Lo dejo en el backlog de abajo.
4. **`Map.hud.toolsLabel`** era una clave **sin ningún uso** con otro texto que `Map.tools.label` (las «dos etiquetas»): la **eliminé** de los cinco idiomas (única clave eliminada; ninguna renombrada).
5. Un detalle de la **prueba** del primer pliegue: con las tipografías de reserva el botón queda 20 px más abajo que con las definitivas (la prueba espera a `document.fonts.ready`).

**Falsación (mutaciones mías sobre el código real, restauración comprobada).**

- **Lote E2E sobre el build real, 16 mutaciones a la vez** (M1–M16: rótulo con `@media`, selector de idioma con `@media`, sin `MenuFocusGuard`, sin cierre del selector, sombra de `ScrollRegion` sin «final», `hyphens: auto` en el cuerpo, `body` sin columna, tarjeta de marca siempre visible, `name="q"`, `aria-labelledby` de vuelta, sin placa del pie, sin metadatos del catch-all, sin `minmax(0, 1fr)`, sin `overflow-wrap` de la etiqueta, sin margen de la acción, sin hueco de `.actions`): **40 de las 65 pruebas** (X3 + `home.mobile`) **mueren** y las otras 25 pasan (los controles y lo no tocado). Reparto: M1 rótulo ×7 (seis tamaños de letra + barrido); M2 contenedor ×1; M3 menú ×2; M4 idioma ×2; M5 sombra ×2; M6 guionado ×1; M7 pie ×2; M8 tarjeta ×7; M9 `name` ×5; M10 landmark ×2; M11 placa ×1; M12 título ×5; M13+M14 desbordes al 200 % ×2; M15 aire de la ficha ×1. **M16 no queda aislada en E2E** (la prueba de la 404 también falla por M7): la mata la prueba unitaria de `.actions` en `layout-contract.test.ts`.
- **3 mutaciones unitarias** sobre mensajes y datos (lead con «organizar viajes», licencia en español, «die neun ersten»): **mueren 9 pruebas** en 3 archivos.
- Mi primera prueba del título de la 404 **dependía de los tiempos** (pasaba en es/fr/de y fallaba en en/pt); la reescribí con el control de hidratación y la comprobación de permanencia.

**Qué se corrió (resultados reales; macOS, Chromium con WebGL por software, 12 núcleos, la máquina con carga 10–15 por otras aplicaciones).**

- `pnpm typecheck` · `pnpm lint` · `pnpm format`: sin errores.
- `pnpm exec vitest run --project unit`: **2 379 pasan y 2 fallan**, los dos conocidos de macOS (`e2e-run.test.ts` nietos y `pg-sweep.test.ts`).
- Build + `pnpm check:bundle`: Explorar **205,5 KB de JS y 15,2 KB de CSS** (de 210 / 20; al cerrar X2: 205,3 / 14,9 → **+0,2 KB de JS** por `MenuFocusGuard` y el cierre del selector y **+0,3 KB de CSS** por la cabecera en contenedor y las reglas globales), islas del HUD 4,6 KB (de 12; sin cambios), mapa diferido 462,9 KB (de 500). Inicio 193,3 KB / 15,8 KB, ficha 192,2 KB / 15,9 KB, fuentes 192,2 KB / 6,7 KB. Ningún presupuesto subido.
- `e2e/shell-review-x3.spec.ts` (**62 pruebas**, ninguna necesita el mapa base: **no sube el presupuesto de omitidas**): 62 pasan sobre el build final.
- **E2E completo con `CI=true --workers=3` sobre el build final (460 pruebas, 18,6 min; la máquina con carga 15–33 por otras aplicaciones durante buena parte): 458 pasan, 0 fallan, 0 omitidas y 2 intermitentes** (con `failOnFlakyTests` esa ejecución salió con 1):
  - `explore-interactions` «el eco del filtro… no cambia la altura del carrusel»: **el mismo intermitente que anotó X2** (no es de X3); pasa 4 de 4 aislado; no lo investigué.
  - `home.spec` «con prefers-reduced-motion: reduce no hay ninguna animación en la portada»: **efecto de X3 sobre una prueba**. Falló con 77 animaciones (3 de 4 veces no). Son **transiciones de 0,01 ms**: la regla de reduce de `base.css` deja toda transición en 0,01 ms y, como la cabecera ahora es un contenedor, el navegador recalcula los estilos de sus hijos tras la primera maquetación y cada cambio nace como una transición que `getAnimations()` ve unos milisegundos. No es movimiento (sin reduce no hay ninguna: la duración por defecto es 0). La prueba cuenta ahora lo **perceptible** (ninguna animación de `@keyframes` y ninguna transición de más de 1 ms) y lleva su control (una animación de 1 s inyectada se cuenta); 4 de 4 pasan aisladas. **No repetí la suite completa tras ese cambio de prueba**: no existe una ejecución completa con salida 0.
  - Ningún otro E2E cambió salvo `home.spec` (el de «sin JavaScript» pasa a `shell-review-x3`) y `home.mobile.spec` (la tarjeta de marca ya no ocupa lugar en móvil).

**Lo que NO está verificado / no resolví.**

- **La 404 sin JavaScript** (hallazgo 3): no la arreglé ni encontré la causa.
- **Lo que no puedo ver con esta herramienta**: Safari, Firefox, dispositivos reales, lectores de pantalla y un «tamaño de letra» real del sistema (solo la emulación de `html { font-size }`, que es más dura para las `@media` pero no es igual que el ajuste del sistema: allí las `@media` en `rem` sí escalan). `@container` es de Chromium 105+, Safari 16 y Firefox 110 (de memoria, no lo comprobé); **un navegador sin consultas de contenedor (anterior a 2022) pierde la disposición adaptable de la cabecera**: las reglas de contenedor se descartan y quedan los estilos base (los tres enlaces en línea, sin botón de menú) y la fila puede desbordar en pantallas estrechas. Cualquier navegador con la API `popover` (la del menú) ya tiene consultas de contenedor, así que el menú desplegable nunca queda sin su regla; no añadí un respaldo con `@media` para los anteriores. La sombra de `ScrollRegion` no depende de `scroll-state` (la calcula JS).
- **Texto al 200 % con la ventana de 320 px**: **no lo medí** (el barrido empieza en 360 px). Por cuenta (8,5rem de cabecera frente a ≈ 8,9rem que necesitan marca + menú + globo) **no cabría** por ≈ 11 px. No lo exige 1.4.4 (200 % de texto) en una ventana tan estrecha ni 1.4.10 (320 px con zoom de navegador, que escala todo), y no lo traté.
- **Guionado**: el `10 4 4` es una elección mía; en navegadores que no conozcan `hyphenate-limit-chars` (no lo comprobé en cuáles) valen los límites por defecto del navegador.
- **La hoja sin JavaScript de `ScrollRegion`** (`@media (scripting: none)`) y la ocultación del buscador solo se probaron en Chromium con JavaScript desactivado por Playwright; no probé que un navegador **sin** la consulta `scripting` (Firefox < 113, Safari < 17) muestre el formulario y lo envíe sin nada en la URL (lo cubre la prueba unitaria: el campo no tiene `name`).
- **r0:F-12, «recuento contradictorio con el filtro activo»**: **no lo cambié**. `Explore.listDescription` dice «contiene los mismos destinos» **que el mapa** y el filtro quita los mismos destinos de la lista y del mapa, así que sigue siendo cierto; el encabezado «Destinos (9 destinos)» es el **total** y lo que se ve lo dice el estado del filtro. Si se prefiere que el encabezado siga al filtro, es un cambio de la maquetación del carrusel (HUD, no mío).
- **Llamada «Abrir el mapa» a 320×640 en portugués**: queda a 40–68 px del borde inferior; con el texto agrandado el primer pliegue ya no la contiene (no se exige).
- No corrí `test:integration`, `test:pipelines`, `test:e2e:content`, `test:e2e:db` (X3 no toca ese código) ni `pnpm check:licenses` (falla en macOS por `@img/sharp-libvips-darwin-x64`).

**Claves de interfaz nuevas o cambiadas (pendientes de revisión humana; traducción automática en en/pt/fr/de, nunca `reviewed`)**: `Home.lead` y `Meta.home.description` (reescritas ×5), `Search.placeholder` (×5; ya no lleva `{count}`), `Search.scope`, `Meta.explore.description` y `Meta.destinations.description` (solo de: «die ersten neun»), `Map.featured.reframe` (en «Recenter on the destination», pt «Recentrar no destino», de «Auf das Reiseziel zentrieren»). **Eliminada**: `Map.hud.toolsLabel` (sin uso). Ninguna clave renombrada ni añadida.

**Archivos de X3** (código): `src/styles/base.css`, `src/components/{SiteHeader.tsx,SiteHeader.module.css,LocaleSwitcher.tsx,LocaleSwitcher.module.css,MenuFocusGuard.tsx,ScrollRegion.tsx,ScrollRegion.module.css,SiteFooter.tsx,SiteFooter.module.css,DestinationSearch.tsx,DestinationSearch.module.css}`, `src/lib/focus-out.ts`, `src/app/[locale]/{page.tsx,page.module.css,not-found.tsx}`, `src/app/[locale]/[...rest]/page.tsx`, `src/app/[locale]/sources/{page.tsx,page.module.css}`, `src/app/[locale]/destinations/[slug]/{page.tsx,page.module.css}`, `src/domains/geography/sources.ts`, `messages/*.json`. Pruebas: `e2e/shell-review-x3.spec.ts` (nueva), `e2e/home.spec.ts`, `e2e/home.mobile.spec.ts`, `tests/unit/design/{shell-css,home-css,layout-contract,scroll-region-css}.test.ts`, `tests/unit/app/{home-page,sources-and-not-found}.test.tsx`, `tests/unit/components/{destination-search,scroll-region,menu-focus-guard,locale-switcher}.test.tsx`, `tests/unit/lib/focus-out.test.ts`, `tests/unit/i18n/messages.test.ts`.

**Para quien documente (X4)**: (1) `CLAUDE.md` dice «la cabecera mide EXACTAMENTE `--header-height`…»: sigue siendo cierto, y ahora sus umbrales son de **contenedor**; (2) trampa nueva: `html { font-size: 150 % }` **no** escala las `@media` pero **sí** las consultas de contenedor y los `rem` de la maquetación; (3) la 404 se pinta en el cliente (sin JavaScript sale en blanco); (4) `hyphens` es `manual` por defecto y `.page`/`.hyphenate` activan el automático; (5) el buscador de la portada se oculta sin JavaScript y el campo no tiene `name`; (6) `ScrollRegion` es de cliente.

### X4 · Cierre: verdad de la documentación y verificación completa (r0:F-08, F-03, F-11, F-04 · r3:F-03, N-01)

**Cómo se hizo (léelo primero).** Esta vez los cuatro informes estaban en el scratchpad: leí enteros r0:F-03, F-04, F-08, F-11 y F-13 y r3:F-03 y N-01 (repro, evidencia y arreglo sugerido) y **recalculé todo contra el árbol de ahora**, sin copiar las cifras de X1–X3 (sus subsecciones se contradicen en varios números porque cada una midió en su momento). Tres cosas que no estaban en los informes:

1. **r0:F-11 se quedaba corto.** Decía que «no hay remoto» era falso; con `gh` (el token ya es válido) leí GitHub y **el CI sí corrió y salió verde** (E-98): push a `main` (`a0f9fd5`) y PR #6 (`6193226`) el 2026-10-24, Chromium 156.0.8078.4 en Linux, 195 E2E con 0 omitidas, el semanal dos veces, cinco PR de Dependabot con CI verde y sin fusionar. Así que no bastaba quitar «no hay remoto»: «`ci.yml` nunca corrió», «Chromium 141 frente a 156», «IMPLEMENTED, no VERIFIED» y «dependabot no actúa» eran falsas en una docena de sitios (CLAUDE.md, `docs/testing.md`, `docs/deploy.md`, `docs/security.md` R3-11/R3-12, backlog T-15/T-19/T-20/T-21/F4-17b, cabeceras de `ci.yml` y `audit.yml`, la tabla de estado de este archivo). Las entregas antiguas de este archivo conservan esas frases **como historia** (ver la nota de veracidad del principio).
2. **Nada de 5j ha pasado por ese CI**: los tres commits de la entrega y la revisión posterior no están en `origin` (la rama local va 3 commits por delante y la revisión ni está commiteada). El CI verde y el staging desplegado son anteriores a la interfaz inmersiva.
3. **Cuatro hallazgos no los tomó ningún paso** (r0:F-13, r1:V-13, r1:V-20, r2:N6): no estaban en la lista de X1, X2 ni X3. Quedan **declarados, no resueltos**, en el backlog (F2-18 a F2-21) con el motivo de cada uno.

| Hallazgo                                 | Defecto                                                                                                                                                 | Qué cambió                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **r0:F-08** registro de claves           | El registro de «claves pendientes de revisión humana» citaba 2 de las 38 claves nuevas y apuntaba a subsecciones inexistentes (la portada y la cáscara) | Registro consolidado abajo (39 nuevas, 5 cambiadas ×5 idiomas y 2 solo en alemán; calculado con los JSON de `6193226`, de cada commit y del árbol); referencias colgantes de E1, E2, E3 y de la cabecera de 5j corregidas; `tests/unit/i18n/pending-review-keys.test.ts` falla si una clave del registro desaparece, se repite o falta el marcador                                                                                                                                                                                                                      |
| **r0:F-03** Chromium 141, cifras y fecha | `CLAUDE.md` y `docs/testing.md` decían «local usa Chromium 141» y arrastraban la fecha y las cifras de 2026-10-23                                       | Local (macOS) y CI (Linux) usan el mismo **Chromium 156.0.8078.4**; cabecera de `testing.md` con fecha, entorno y qué no se re-ejecutó (Node local 25.9 frente a 22.22 del CI, anotado); tabla con **100 archivos / 2 395 unitarias** (cifra final de la revisión) y **460 E2E** (351 + 109) medidas hoy, fila de bundle con las cifras vigentes (Explorar 205,5 / 15,2 KB, mapa 462,9 KB, islas 4,6 KB); en `testing.md`: la sección de X2, la revisión X1 en «El mapa real en CI» y la fila de plazos de X4 en las trampas (las pruebas de X3 solo se describen aquí) |
| **r0:F-11** «no hay remoto»              | Falso desde 2026-10-24 (ver arriba)                                                                                                                     | Reescrito donde era una afirmación de estado; E-98 con los comandos y los números; T-15 pasa a «VERIFIED sobre `6193226`, 5j PENDING (sin subir)»                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **r0:F-04** «dos conocidos»              | `check-deps.test.ts` «MPL-2.0…» venció por el plazo de 5 s en una ejecución completa (pasa aislada)                                                     | **Causa medida**: cada llamada a `run` arranca un `node --import tsx` (≈ 0,9 s en reposo) y tres pruebas lanzan **dos** seguidos (≈ 1,7 s: `--policy`, «MPL-2.0…», «un aviso solo de desarrollo…»): un margen de ×2,9 que la suite entera, con ≈ 100 trabajadores, se come. `vi.setConfig({ testTimeout: 120_000 })` en ese archivo (cada proceso hijo ya tiene su corte de 60 s). **Control**: con `--testTimeout=1500` fallan exactamente esas tres antes del arreglo y ninguna después. «Dos conocidos» deja de ser una cifra fija                                   |
| **r3:F-03** derechos de las marcas       | Ninguna lista de bloqueos de producción pública los incluía; `SOURCE.json` y el ADR los citaban como tales                                              | Nueva fila **L-06** en el backlog, fila en `docs/deploy.md` §5, ADR-0025 §12 y `docs/security.md`. **No hay puerta en el código** (`SITE_ENV=production` bloquea el mapa y no las marcas): lo dejo dicho; añadirla (una política en `data/rights/policies.json`) es una decisión de una persona                                                                                                                                                                                                                                                                         |
| **r3:N-01** `SOURCE.json` público        | Se sirve con `200` y cuenta que los derechos están pendientes                                                                                           | **Decisión documentada, no ejecutada**: se mueve fuera de `public/` antes de abrir el sitio (`docs/deploy.md` §5, L-06). No lo moví: una prueba de `sha256` y `docs/provider-rights.md` lo citan por su ruta y en staging (SSO) no se expone a nadie (pero el repositorio es público: ya es visible en GitHub)                                                                                                                                                                                                                                                          |

**Registro consolidado de claves de interfaz pendientes de revisión humana (entregas 5j y 5k, con sus revisiones)** — traducción **automática** en en/pt/fr/de (nunca `reviewed`: `ui-status.ts` no se tocó) y **español en borrador**; ningún idioma tiene revisión humana (L-02). Total: **297 textos** (54 × 5 + 5 × 5 + 2). Es el único registro vigente: las listas parciales de E1, E2, E3, X2 y X3 más arriba lo resumen y no lo sustituyen.

<!-- pending-review-keys:start -->

**Nuevas (54 claves × 5 idiomas = 270 textos).** Respecto de `6193226` (el último commit anterior a la interfaz inmersiva), con el commit o paso de origen:

- Marca, cabecera y vista previa (`30ed83a`): `Brand.tagline`, `Nav.cta`, `Nav.menu`, `Meta.og.alt` (4).
- Buscador de la portada (`30ed83a`; `Search.placeholder` y `Search.scope` reescritas en la revisión): `Search.label`, `Search.placeholder`, `Search.results`, `Search.resultsLabel`, `Search.scope`, `Search.submit`, `Search.viewOnMap`, `Search.viewOnMapLabel` (8).
- Filtro por tipo de Explorar (`30ed83a`): `Map.filter.all`, `Map.filter.announce`, `Map.filter.count`, `Map.filter.heading` (4).
- Buscador de Explorar (`30ed83a`; `Map.search.clear`, `ca34997`): `Map.search.label`, `Map.search.placeholder`, `Map.search.count`, `Map.search.empty`, `Map.search.clear` (5).
- Carrusel de destinos (`30ed83a`): `Map.carousel.hide`, `Map.carousel.show`, `Map.carousel.next`, `Map.carousel.previous` (4).
- Ficha destacada (`30ed83a`; reescrita en en/pt/de en la revisión): `Map.featured.reframe` (1).
- Regiones y estado del HUD (`30ed83a`; `Map.hud.mapUnavailable`, `ca34997`): `Map.hud.carouselLabel`, `Map.hud.railLabel`, `Map.hud.searchRegionLabel`, `Map.hud.mapUnavailable` (4).
- Herramientas del mapa (`30ed83a`; `Map.tools.threeDShort`, `ca34997`; `Map.tools.threeDNotice`, revisión): `Map.tools.label`, `Map.tools.layersOpen`, `Map.tools.threeD`, `Map.tools.threeDShort`, `Map.tools.threeDNotice` (5).
- Hoja móvil y panel de información (`30ed83a`; `Map.sheet.open` y `Map.sheet.close` reescritas con `{title}` en la revisión): `Map.sheet.open`, `Map.sheet.close`, `Map.panel.toggle` (3).
- Insignia de cobertura (revisión): `Coverage.geometryLabel` (1).
- Portada «Travesía» (entrega 5k, `e4f7f17`; `lead`, `credit` y `reference` reescritas tras la revisión independiente, que retiró «posición real» y «Ubicación»): `Home.travesia.heading`, `Home.travesia.lead`, `Home.travesia.caribbean`, `Home.travesia.pacific`, `Home.travesia.west`, `Home.travesia.east`, `Home.travesia.navLabel`, `Home.travesia.stop`, `Home.travesia.reference`, `Home.travesia.coordinates`, `Home.travesia.credit`, `Home.travesia.hemisphere.north`, `Home.travesia.hemisphere.south`, `Home.travesia.hemisphere.east`, `Home.travesia.hemisphere.west` (15).

**Cambiadas en los cinco idiomas (5 claves × 5 = 25 textos):** `Home.lead`, `Home.principles.languages.body`, `Language.help`, `Map.attribution`, `Meta.home.description`. `Map.attribution` conserva el texto y añade la marca `<en>…</en>` (X2); `Language.help` y `Home.principles.languages.body` dejan de prometer que el cambio de idioma conserva el filtro y la búsqueda (X2); `Home.lead` y `Meta.home.description` dejan de prometer «organizar viajes» (X3).

**Cambiadas solo en alemán (2 textos):** `Meta.destinations.description`, `Meta.explore.description` («die ersten neun» en lugar del calco «die neun ersten», X3).

**Eliminada:** `Map.hud.toolsLabel` (añadida en `30ed83a`, sin ningún uso y con otro texto que `Map.tools.label`; eliminada de los cinco idiomas en X3): no figura arriba porque no existe respecto de `6193226`.

<!-- pending-review-keys:end -->

#### Reanudación de X4 (2026-11-03): el fallo de `map.spec`, la verificación completa y lo que apareció por el camino

**Cómo se hizo.** La ejecución anterior de X4 se cortó con la documentación hecha y una pasada E2E completa (459 pasan, 1 falla tras reintento: `[desktop] e2e/map.spec.ts:599` «cambiar de idioma conserva destino y capas y vuelve a abrir el mapa», `Test timeout of 30000ms exceeded` **en los dos intentos**; la segunda captura del fallo mostraba «Cargando el mapa…» sin que el mapa se hubiera creado). No rehice la documentación: la revisé contra lo que medí ahora. Para saber si el fallo era de tiempos o un efecto de X1–X3 compilé `ca34997` (el último commit, anterior a la revisión) en un árbol aparte y medí las dos versiones **alternando**, con un guion propio de Playwright (no versionado: Chromium 156.0.8078.4 con SwiftShader, un navegador nuevo por carga, `performance.now()` desde la navegación, mediana de 4–6 cargas). Detalle y cifras en `docs/performance.md` **M-11**.

| #   | Lo que apareció                                                                                                                                                                                                              | Causa                                                                                                                                                                                                                                                                                                                                                                   | Qué cambió                                                                                                                                                                                                                                                                                                                                         | Prueba                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `map.spec` «cambiar de idioma…» sola dura ≈ 12 s (10,9 s en `ca34997`) y con tres copias ≈ 21 s (19,3 s); el mapa tardaba **+1,1 s** en estar listo (frío 4,69 frente a 3,62 s)                                              | **Real, de X1 (r1:V-19)**: la pantalla de carga pintaba un resplandor radial a pantalla completa y una barra animada con `background-position` sobre un degradado. Con WebGL por software el proceso de GPU gastó **21,4 s de CPU frente a 14,8 s** hasta `ready` (la página, 1,47 s en los dos): rasterizar eso le quitaba el turno a los shaders y al dibujo del mapa | `MapStage.module.css`: fondo del aviso plano, pista y relleno de color liso, relleno con `transform` que **espera 2 s** y hace tres vueltas (finito). Frío 3,78 s, caliente 2,11 s (referencia 3,62 y 1,89)                                                                                                                                        | `hud-css.test.ts` (sin degradados, retraso ≥ 1,5 s, keyframes solo de `transform`; **4 mutaciones muertas**) y `explore-hud.spec.ts` (computado: `background-image: none` en aviso, pista y relleno; retraso ≥ 1,5 s). Capturas leídas a 1280 y 390 px |
| 2   | Aun así la prueba seguía ≈ 14–20 s en la suite (los dos arreglos parciales no la movían)                                                                                                                                     | La traza de Playwright graba **siempre** y descarta si pasa; su cinta de capturas (_screencast_) se disputa la CPU con el mapa: **18,3–20,1 s con ella frente a 9,8–13,7 s sin ella** (una trabajadora, alternando). Sobre `ca34997` cuesta ≈ 2 s; sobre el árbol final 6–8 s y **no sé por qué**                                                                       | `playwright.config.ts`: traza sin capturas (`E2E_TRACE_SCREENSHOTS=1` las devuelve)                                                                                                                                                                                                                                                                | `playwright-configs.test.ts` (2 mutaciones muertas)                                                                                                                                                                                                    |
| 3   | La prueba tiene `toBeVisible({ timeout: 60_000 })` dentro de un plazo de prueba de **30 s**: el de dentro era inalcanzable                                                                                                   | Dos cargas completas del mapa en un navegador recién abierto por prueba no caben con holgura en 30 s con la suite entera                                                                                                                                                                                                                                                | `map.spec.ts`: `test.setTimeout(90_000)` solo a esa prueba (como las de axe de Explorar)                                                                                                                                                                                                                                                           | Es un plazo, no un arreglo: lo digo                                                                                                                                                                                                                    |
| 4   | Con la traza ya sin capturas, **`explore-interactions` «con un destino elegido, escribir en el buscador no cambia la altura del carrusel…» fallaba el primer intento** en dos pasadas completas (3 de 4 islas; 602 → 580 px) | **Prueba con una carrera.** Sin mapa base el carrusel añade una línea («El mapa no está disponible…») ≈ 3 s después de cargar; la prueba medía `before` antes y, con la máquina ocupada, el aviso llegaba entre `before` y el `fill`. Y las cuatro islas llegan por turnos de hidratación: la cuarta pasó de 5 s                                                        | `explore-interactions.spec.ts`: espera al aviso antes de medir y 30 s para las cuatro islas (`openHud`)                                                                                                                                                                                                                                            | **Falsada**: la versión antigua con 5 s artificiales entre `before` y el `fill` falla con `602 / 580`; la nueva pasa con el mismo retraso. La altura que sube 22 px en ese estado **sigue siendo un defecto de maquetación (backlog F2-23)**           |
| 5   | Otra pasada completa: `explore-review-x2` «el botón se describe con “Amazon Web Services recibirá tu IP”…» venció dos veces (`aria-pressed` sin ponerse; después, 30 s)                                                      | Secuencia larga con el mapa dibujado (27,6 s en la primera pasada, 33–37 s en la otra) con 30 s de plazo y 5 s para que el estado de la URL llegue a React                                                                                                                                                                                                              | `explore-review-x2.spec.ts`: `test.setTimeout(90_000)` y 20 s para `aria-pressed`                                                                                                                                                                                                                                                                  | Plazos, no arreglos: lo digo                                                                                                                                                                                                                           |
| 6   | `tests/unit/i18n/pending-review-keys.test.ts` (la dejó la ejecución cortada) **fallaba por sí sola con 6 pruebas**: nunca se corrió en verde                                                                                 | Contaba como «repetidas» las claves citadas en las anotaciones y en las explicaciones, y exigía que existiera la clave «Eliminada»                                                                                                                                                                                                                                      | Reescrita: las anotaciones entre paréntesis y la «Eliminada» no cuentan; además comprueba que **las cuentas del registro coinciden con las claves que lista** («39 claves», cada «(4)», «5 claves» cambiadas). Recalculé el registro contra los JSON de `6193226`: 39 nuevas, 5 cambiadas en los cinco idiomas y 2 en alemán; **no falta ninguna** | 10 pruebas con controles; **4 mutaciones del registro, todas muertas**                                                                                                                                                                                 |
| 7   | `pnpm format` fallaba en 6 archivos (5 documentos y esa prueba)                                                                                                                                                              | Sin pasar Prettier tras la edición                                                                                                                                                                                                                                                                                                                                      | `prettier --write`                                                                                                                                                                                                                                                                                                                                 | `pnpm format` en verde                                                                                                                                                                                                                                 |

**Lo que no pude explicar** (declarado en `docs/backlog.md` F2-22): el `ready` con WebGL por software sigue **+0,15 s frío y +0,2 s caliente** sobre `ca34997`, y la cinta de capturas cuesta más sobre el árbol de ahora que sobre `ca34997`. **Nada se midió con una GPU real.** El tiempo de esa prueba no depende solo de esto: también del reparto de trabajadores (la suite entera tardó 13,7, 15,7, 16,0 y 18,7 min en cuatro pasadas del mismo árbol).

#### Revisión de código del diff final y verificación del árbol (2026-11-09)

**Cómo se hizo.** El agente de cierre (X4) se cortó dos veces por el límite de uso con la documentación hecha y este apartado sin rellenar; lo cerré yo. Lancé una revisión de código de **solo lectura** del diff sin confirmar (seis dimensiones: lógica, CSS y accesibilidad, i18n y honestidad, pruebas y CI, seguridad y privacidad, coherencia de la documentación), con dos escépticos por hallazgo (uno que reproduce leyendo el código, otro que busca si ya es una decisión declarada). El límite de uso cortó la revisión varias veces y hubo que reanudarla cuatro: **`css-a11y` no llegó a completarse** y los escépticos de `docs-consistency` murieron, así que sus seis hallazgos los comprobé yo contra el código y los documentos (los seis eran ciertos).

| Hallazgo (dimensión, gravedad)                                                                                                                                                                                                               | Veredicto                                                      | Qué cambió                                                                                                                                                                                                                                                                                                                                 | Prueba                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El aviso previo del «Relieve en 3D» **no se ve antes de tocar** en pantalla táctil: el toque dispara hover, foco y clic en la misma tarea y la IP ya iría a AWS (seguridad, media; latente en producción por los derechos, real en staging)  | Confirmado por los dos escépticos                              | `MapTools.module.css`: `@media (hover: none), (any-pointer: coarse)` muestra el aviso mientras pulsar pida algo (`pointer-events: none`: los toques lo atraviesan). Una segunda pasada añadió el portátil con pantalla táctil y trackpad (puntero principal con `hover`), que no cubría `hover: none` (baja; sin escépticos, lo juzgué yo) | `hud-css.test.ts` (2 pruebas; **mutación: quitar la regla las mata**) y `explore-review-x2.mobile.spec.ts` (Pixel 5 con `tap()` real: visible de entrada, sin peticiones a AWS hasta tocar, oculto tras tocar). **Sin probar con un portátil táctil real**: la rama `any-pointer` solo tiene la prueba CSS |
| Las dos aserciones **negativas** de la cámara («NO si la persona ya movió el mapa»; «una búsqueda SIN resultados no mueve la cámara») leen `data-zoom`, que solo se escribe en `idle`: con una guarda rota podían pasar (pruebas, media)     | Confirmado (un escéptico; el otro murió por el límite)         | `watchFraming` (`map-helpers.ts`): cuenta los encuadres por `data-flight-ms`, que `frameBox`/`frameOverview` escriben de forma **síncrona**; cada prueba lleva su **control positivo** (una acción que sí encuadra sube la cuenta). La primera lleva `test.setTimeout(90_000)` (con 30 s vencía 3 de 5 veces: un plazo, no un arreglo)     | **Dos mutaciones, las dos muertas con el mensaje nuevo**: M1 quita la guarda de `movestart` (`overviewRef.current = overviewRef.current`), M2 quita `if (shown.length === 0) return`. Sin mutar: 4 de 4 y 1 de 1                                                                                           |
| «axe target-size y 2.4.11 no ven nada tapado» solo ejecutaba `target-size`, que **aprueba un control ENTERO tapado** (pruebas, baja)                                                                                                         | Confirmado por los dos escépticos                              | `explore-hud.spec.ts`: la prueba recorre además 60 tabulaciones con `hiddenFocus` (y exige > 10 controles comprobados para no ser vacía)                                                                                                                                                                                                   | 2 de 2 en 1280×600 y 960×480; `hiddenFocus` ya llevaba su control de E-88                                                                                                                                                                                                                                  |
| El rótulo «Relieve:» del crédito del relieve sale en español en los cinco idiomas (i18n, baja)                                                                                                                                               | Disputado (un escéptico lo refutó); **anterior** a la revisión | Nada en código: existe desde `6193226`, es deliberado según el comentario y solo se ve con el relieve de terceros activo. **Backlog F2-24**                                                                                                                                                                                                | —                                                                                                                                                                                                                                                                                                          |
| Seis frases de la documentación falsas o contradictorias (`testing.md` «CI no verificado», `security.md` R3-12 y R3-13, `deploy.md` recuentos y «provider-rights cita SOURCE.json», `progress.md` secciones inexistentes y estos marcadores) | Comprobados por mí, ciertos                                    | Corregidos; cifras unificadas (**100 archivos / 2 395 unitarias**, 460 E2E)                                                                                                                                                                                                                                                                | —                                                                                                                                                                                                                                                                                                          |
| Tres hallazgos de pruebas/CI (plazo de las islas, presupuesto de omitidas 109, una aserción constante)                                                                                                                                       | **Refutados por los dos escépticos**                           | Sin cambios                                                                                                                                                                                                                                                                                                                                | —                                                                                                                                                                                                                                                                                                          |

**Verificación del árbol final.**

| Comprobación                                                     | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`, `pnpm lint`, `pnpm format`                     | Verde                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `vitest run --project unit`                                      | **2 395 pruebas en 100 archivos; 2 393 pasan.** Fallan las 2 conocidas de macOS (`e2e-run`, `pg-sweep`). En la pasada completa fallaron además 2 de `check-action-pins --online` por el plazo de 5 s (carga de la máquina ≈ 160–250); aisladas pasan (21 de 21). Una última pasada completa, tras los cambios de documentación y con la carga de la máquina por encima de 200, dio 14 fallos por plazo; al repetir esos siete archivos solos quedan **solo las 2 de macOS** |
| `SITE_ENV=development pnpm build` + `pnpm check:bundle`          | Verde. Explorar **205,5 KB JS / 15,1 KB CSS** (de 210/20), mapa diferido 462,9 KB (de 500), islas del HUD 4,6 KB (de 12); Inicio 193,3/15,8, Destinos 191,6/15,1, Ficha 192,2/15,9, Fuentes 192,2/6,7; ISR (3 600 s) de ficha, Explorar y sitemap                                                                                                                                                                                                                           |
| `pnpm map:css -- --check`, `make_og.py --check`                  | Coinciden con lo versionado                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `CI=true playwright test --workers=3` (460 pruebas, con el mapa) | **441 pasan, 15 fallan, 4 intermitentes, 0 omitidas** (34,8 min). Todos los fallos son pruebas que cargan el mapa y vencen su plazo de 30 s con la máquina cargada por **otras aplicaciones** (un `next start` ajeno en el puerto 3000, `ffmpeg`, una actualización de macOS: carga 45–70)                                                                                                                                                                                  |
| Las 15 + 4 pruebas, con **un** trabajador                        | **30 de 30 pasan** (5,0 min). Antes, la pasada con la revisión de código en marcha dio 27 fallos y la repetición 4 + 2: el mismo patrón, con la carga como causa probable (**no la medí**: lo supongo porque pasan solas y fallan agrupadas por tiempo, no por una aserción)                                                                                                                                                                                                |
| Sin procesos ni directorios huérfanos                            | `/tmp/pi-pg-*`, `/tmp/pi-e2e-server-*`, `.e2e-content-app` y los puertos 3100/3300: nada. El `next-server` del puerto 3000 es de otro proyecto                                                                                                                                                                                                                                                                                                                              |

**Primer CI sobre 5j (`bfdbea2`).** `Tipos, lint, formato y pruebas unitarias`, `Integración` y `Pipelines de datos` salieron verdes. **`E2E de la ficha con contenido verificado` falló**: el build de la copia de la aplicación no encontraba `vendor/maplibre-gl.trimmed.css` (`MapStage.tsx` lo importa desde `ca34997`; `prepareApp` no copiaba `vendor/`). Esa suite necesita PostgreSQL con PostGIS y yo no la había re-ejecutado: es justo lo que decía «no verificado». Arreglo: `scripts/e2e-content.ts` copia `vendor/`, y `tests/unit/scripts/e2e-content-copy.test.ts` comprueba que la copia lleve todo directorio que `src/` importa de fuera (**mutación: quitar la copia de `vendor` la mata**). El mismo CI mostró **un segundo fallo** (`explore-sheet.mobile` «el arrastre vertical del asa…», 2 de 2 intentos en Linux; en macOS pasa). **Mi primera hipótesis fue falsa o insuficiente**: supuse que Chromium en Linux no genera `click` si el dedo se movió más que su holgura (el temblor de 8 px de la prueba) y cambié `HudSheet` para resolver esos toques en el `pointerup` (solo dedo y lápiz; el `click` posterior se descarta por `timeStamp`; **3 mutaciones muertas**). **El CI de `ebfa2b6` falló igual**, así que esa no era la causa; el cambio se queda como endurecimiento defensivo. Lo que sí enseña la traza de Linux: el tercer gesto empezaba **17 ms** después de que `aria-expanded` pasara a `false`, con el asa aún volviendo a su sitio, y la prueba tocaba donde estaba el asa al principio. **Medido después en macOS** (sonda sobre la prueba antigua, 3 de 3): en ese instante el asa está a y = 388 y el dedo cae en y = 671, sobre `.sheet` y FUERA del asa. Con el `pointerdown` fuera del asa, `drag.current` es nulo y el `pointerup` no decide nada: **solo un `click` generado por el navegador podría alternar la hoja**, con las dos versiones de `HudSheet`. La prueba ahora espera a que el asa se asiente y toca donde está (`settled` y caja nueva) y, si vuelve a fallar, adjunta los eventos que recibió el documento y qué había bajo el dedo. **El CI de `cc64922` salió verde (8 de 8)**: el fallo era de la prueba, no del componente. **Sigue sin explicarse por qué la prueba antigua pasaba en macOS**: una sonda a 1/10 de velocidad (asa en y = 370 y dedo en 671 al levantar) también pasaba, lo que **contradice** la explicación que escribí antes («el navegador hace el `hit test` al levantar el dedo y genera el `click` allí»), y dos análisis independientes de solo lectura tampoco la cuadraron. Hipótesis de un revisor, leída del código de Chromium 156 y **sin reproducir**: en Linux (Aura) el navegador suprime el toque —sin `click`— que empieza < 400 ms después de detenerse un `fling`, y en macOS no; el tercer gesto empezaba 40 ms después del segundo. Para comprobarlo hace falta una sonda en Linux (un botón con contador de `click`; un arrastre de 160 px y un toque inmediato, con y sin espera). Sobre el endurecimiento de `HudSheet`: **medí en macOS** (Chromium, toque emulado por CDP, 10 distancias) que el navegador genera `click` hasta 14 px de movimiento y no desde 16 px, así que con el umbral de arrastre en 24 px había una franja muerta de 16–23 px; una prueba nueva (`explore-sheet.mobile` «un temblor de 18 px…») la cubre y **la mutación que quita la resolución en el `pointerup` la mata** (`Expected: true, Received: false`, el mismo síntoma que el CI). Las 2 intermitentes del job (`Test timeout … while setting up "context"`) son del ejecutor, no de las pruebas. Comprobé a mano que una copia equivalente ya construye; las 28 pruebas de la ficha solo las puede ejecutar el CI.

**No verificado.** Safari, Firefox, un dispositivo táctil real, lectores de pantalla y una GPU real; la rama `any-pointer: coarse` en un portátil o una tableta reales (solo emulada con el Pixel 5 ensanchado a 1024 px); integración, pipelines Python, `test:e2e:db` y `test:e2e:content` (no se re-ejecutaron en esta pasada); y `ci.yml` sobre la entrega 5j (su primera ejecución es el primer `push`).

### X5 · Revisión de CSS y accesibilidad, diagnóstico del asa y sus arreglos (2026-11-11)

**Cómo se hizo.** Un flujo de **solo lectura** (`wf_c8d5e6fa-c21`, 14 agentes, ≈ 78 min; sin navegador ni compilaciones, para no falsear las pruebas que corrían) cubrió la dimensión que la revisión de 5j no había completado, **CSS y accesibilidad** (el HUD y la cáscara; cada hallazgo con dos escépticos que intentan refutarlo), y dio **dos diagnósticos independientes** del fallo del asa de la hoja en Linux (el estado de la aplicación y el canal de entrada). Salieron 5 hallazgos: 4 que ninguno de los dos escépticos refutó y 1 **disputado** (uno de los dos lo refutó). Los comprobé contra el código y, donde se podía, con el navegador.

1. **El menú de la cabecera seguía abierto tras pulsar uno de sus enlaces** (media; anterior a 5j: el popover existe desde `ca34997`). La cabecera es del diseño `[locale]`, que no se remonta al navegar dentro de un idioma, y la API Popover solo cierra con Escape, un clic fuera, otro popover o `hidePopover()`: el `<nav>` quedaba abierto sobre la página nueva (en Explorar, tapando el carril y las herramientas) hasta tocar fuera. **Reproducido antes de arreglar** (prueba en rojo: la cabecera se conserva y el menú sigue abierto 5 s). Arreglo en `MenuFocusGuard`: cierra con un clic corriente en un enlace (no con Ctrl/Cmd/Mayús/Alt ni otro botón) y al cambiar `usePathname` (Atrás/Adelante). Pruebas: 2 E2E (marcan la cabecera y exigen que la marca sobreviva: una carga completa también deja el menú cerrado y la prueba sería vacía) y 8 unitarias nuevas.
2. **El aviso previo del 3D, siempre visible sin cursor, tapaba otras cosas** (media; lo introduje yo en la revisión final): (a) con solo «Sombreado» activo (usa la misma fuente de AWS) lo tapaba el aviso de estado del mapa y, además, decía «al activarlo…» cuando el relieve ya se pedía; (b) a 320 px (17rem) cubría 30 de los 46 px del zoom y la brújula nativos; (c) en una tableta táctil (≥ 56rem) caía sobre la columna del panel de información abierto. Arreglos en `MapTools`: `data-relief-in-use` (3D encendido **o** `usesTerrain`) retira el aviso y deja de describir al botón; el ancho descuenta tres separaciones y un botón; y en ≥ 56rem con puntero táctil espera mientras el panel está abierto (ver F2-26: con el panel abierto quien toca el 3D no ha visto el aviso). **Cada E2E táctil lleva su control**: inyecta la hoja del estado anterior (`applyCss`) y exige el solape que el arreglo evita; el tercero se emula con el Pixel 5 ensanchado a 1024 px (no hay dispositivo real).
3. **Los avisos del mapa (z-index por encima del HUD) tapaban la cabecera del panel abierto** (baja; 1024×640). `--hud-panel-col` pasa de `.hud` a `.shell` para que los avisos (hermanos del HUD) lo vean, y `.notices` termina una separación antes del panel. **La primera versión no bastaba** (la prueba E2E lo vio): `inline-size: min(32rem, 100%)` mide el 100 % del **mapa entero**, no el hueco entre los márgenes, y con el panel abierto el aviso desbordaba y lo volvía a tapar; ahora `inline-size: auto` con `max-inline-size: 32rem`. A 1024 px con el panel abierto el aviso mide ≈ 380 px.
4. **Las etiquetas de los marcadores y el número de los grupos salían en Helvetica** (baja): los marcadores viven dentro del contenedor que MapLibre da `font: 12px/20px Helvetica Neue, Arial` y `font: inherit` recogía esa. `font-family: var(--font-text)` explícito en `.marker` y `.cluster`. La prueba E2E exige que haya etiquetas **y** grupos que medir (900×600) y lleva su control.
5. **Disputado, sin cambio: el orden de Tab del carrusel estrecho** (flechas → «Ocultar los destinos»; visualmente, «Ocultar» arriba y las flechas debajo). Un escéptico lo dio por real y otro lo refutó (WCAG 2.4.3 pide un orden con sentido, no el visual; los controles van antes de lo que gobiernan, como en el diseño ancho; arreglarlo es mover el DOM o usar `reading-flow`, y `order` lo prohíbe una prueba). **No es un fallo comprobado: es una decisión que no estaba anotada** (backlog F2-25).

**Diagnóstico del asa (el segundo fallo del primer CI).** Los dos análisis coinciden con lo medido en `cc64922`: en la prueba antigua el dedo del tercer gesto caía **fuera del asa** (que aún volvía a su sitio), así que ningún manejador de `pointer*` de `HudSheet` podía actuar; solo un `click` generado por el navegador habría alternado la hoja. **Dos cosas que estaban mal en lo que escribí antes**: (a) «en macOS la prueba lo salvaba porque el navegador hace el `hit test` al levantar el dedo y genera el `click` allí» **está desmentido** por una sonda a 1/10 de velocidad (asa en y = 370 y dedo en 671 al levantar, y pasaba igual): por qué pasaba en macOS **no se ha explicado**; (b) el comentario de `HudSheet.tsx`, el mensaje de `ebfa2b6` y el de la prueba del temblor decían «holgura ≈ 5 px en Linux» y «lo vio el CI de Linux con un temblor de 8 px»: **sin fuente** (el CI de Linux no vio ningún temblor; falló por el dedo fuera del asa). Un revisor leyó en el código de Chromium 156 que la holgura de toque es de 15 px también en Linux de escritorio (6 solo en ChromeOS) y que Linux (Aura) suprime el toque —sin `click`— que empieza < 400 ms después de detenerse un `fling` (macOS no): **hipótesis sin reproducir**; se comprobaría con una sonda en Linux (un botón con contador de `click`; un arrastre de 160 px y un toque inmediato, con y sin espera). Los comentarios y el texto de `CLAUDE.md` se corrigieron.

**Falsación (la mía, con restauración comprobada byte a byte).** Unitarias sobre `MenuFocusGuard`: 5 mutaciones (sin oyente de clic, clic con cualquier modificador, cierre con cualquier clic, sin cierre por ruta, cierre en la primera lectura), **las 5 mueren**; **la quinta sobrevivía** porque el espía se instalaba después de montar el componente (ahora va en el prototipo y antes de montar). E2E, sobre un build propio con seis mutaciones a la vez (sin cierre por ruta, avisos sin ceder el sitio al panel, sin `font-family`, ancho antiguo del aviso del 3D, relieve en uso sin contar el sombreado, aviso táctil que no cede ante el panel): **cada una mata exactamente su prueba** y las demás pasan; la del ancho `min(32rem, 100%)` ya había fallado en la primera ejecución. Se restauró y se recompiló.

**Verificación local (macOS, Chromium 156, WebGL por software).** `pnpm typecheck`, `pnpm lint` y `pnpm format`: limpios. `pnpm test`: **2414 de 2416** (las 2 que fallan son las de siempre en macOS, `e2e-run` y `pg-sweep`, que leen `/proc`). `pnpm check:bundle`: Inicio 193,4 / 15,9 KB, Explorar **205,6 / 15,2 KB**, Destinos 191,7 / 15,2, ficha 192,3 / 16,0, Fuentes 192,3 / 6,7 (presupuestos 210 / 20; +0,1 KB de JS por página: la isla del menú), mapa 463,0 KB y **islas del HUD 4,6 KB** (sin cambio: `usesTerrain` no engordó el trozo).

**Suite E2E completa** (`CI=true`, 3 trabajadores, build limpio tras restaurar las mutaciones): **468 pasan, 0 fallan, 0 intermitentes, 0 omitidas** (19,3 min; 355 de escritorio + 113 de móvil: +8 respecto de 460, las 7 de este paso y la del temblor de 18 px). **Techo de omitidas 109 → 114**: las 5 pruebas nuevas que necesitan el mapa se **omiten las 5** con el fichero oculto (medido solo sobre ellas, no con la suite entera sin mapa; el archivo se restauró y su `sha256` coincide); los dos E2E del menú no lo necesitan. Cambiado en `ci.yml`, `CLAUDE.md` y `docs/testing.md`.

**No verificado (X5).** (1) El mecanismo que haría fallar en Linux a la prueba antigua del asa y no en macOS (la hipótesis del `fling` es de lectura de código, sin reproducir: haría falta una sonda en Linux). (2) El aviso del 3D en una tableta o un portátil táctil **reales** (solo emulado con el Pixel 5 a 1024 px) y la decisión de que ceda ante el panel abierto (F2-26). (3) El coste de `:has()` ahora en `.shell` (que contiene el DOM del mapa) frente a `.hud`: no medí Web Vitals en este paso; Chromium solo invalida un `:has()` por los atributos que nombra (`data-hud-zone`, `data-state`) y los marcadores cambian `style`, pero **es una explicación, no una medida**. (4) Que el cierre del menú al navegar funcione en Safari y Firefox (la API Popover y `hidePopover()` son estándar, pero solo se probó en Chromium). (5) Los hallazgos que la revisión de solo lectura **no** haya visto: ninguna revisión es exhaustiva.

**El repositorio es público (hallazgo del 2026-11-11, E-99).** Al preparar la fusión del PR #6, `gh repo view` dio `visibility: PUBLIC`; los eventos de GitHub muestran un único `PublicEvent`, a la hora de la creación (2026-10-24T19:57:00Z): el repositorio **se creó público**, y las frases que decían «privado» (`CLAUDE.md`, `docs/deploy.md`, el backlog T-21, `docs/progress.md`, E-91 y E-98) eran falsas desde el primer `push`: yo las había dado por ciertas sin comprobarlas con `gh`. Consecuencia: el árbol y la historia de todas las ramas (el PMTiles de 36 MB, las marcas, `SOURCE.json`, los documentos) son visibles para cualquiera (el PMTiles, los glifos y las anclas desde el 2026-10-24; las marcas, los iconos y la hoja de MapLibre desde el 2026-11-09 en la rama del PR y desde el 2026-11-12 también en `main`), y la protección SSO de Vercel no los cubre. **La persona propietaria decidió mantenerlo público** (respuesta «No, déjalo público» a «¿Paso el repositorio a privado ahora?»): no se cambió la visibilidad, se corrigieron las frases falsas y la regla quedó en `CLAUDE.md`. Con el repositorio público, L-01 (derechos del mapa) y L-06 (marcas) dejan de ser solo bloqueos de una producción pública futura: el PMTiles y las marcas ya se redistribuyen desde GitHub (decisión pendiente de la persona propietaria; no la tomo yo).

**El primer CI sobre X5 (`28af09e`) falló por 3 intermitentes** (`failOnFlakyTests`: una prueba que falla y pasa al reintentar es un fallo del job; 465 esperadas, 0 inesperadas, 3 intermitentes, 20,4 min frente a ≈ 16). Los otros cuatro jobs salieron verdes. (1) **Una era mía**: `explore-hud` «el aviso del relieve (AWS) no se pinta sobre el panel…» venció los 30 s en el clic de plegar el panel (`waiting for element to be visible, enabled and stable`); **la traza de Linux** (artefacto `e2e-test-results`) muestra que el resto de sus acciones sumaban 7 s y que ese clic esperó 23 s. La hipótesis inicial (el panel, anclado abajo, cambia de alto mientras la cámara se inclina) **no se reprodujo**: con la CPU ×6 el botón mantuvo la misma caja durante 6 s. **Lo que sí se midió**: con el 3D la página deja de pintar cuadros (huecos de hasta **3,9 s**, 3 de más de 1 s, frente a 0,47 s y ninguno con «Sombreado»), y Playwright espera dos cuadros iguales para dar un elemento por «estable»; en el runner de 2 vCPU el hueco es mayor. La prueba ahora usa «Sombreado» (la misma fuente de AWS, sin inclinar la cámara), espera a que el panel se asiente antes de medir y lleva `test.setTimeout(60_000)`: 4 de 4 en local. (2) Las otras dos son del ejecutor: `Test timeout of 30000ms exceeded while setting up "context"` en `explore-interactions` «con movimiento reducido el cabeceo…» (otro trabajador corría a la vez una prueba de 3D de 24,7 s) y `browser.newContext: … Failed to find browser context` en `home` «la marca P…» (solo corrían pruebas ligeras: el navegador se cayó). **No tienen arreglo en el código**; si reaparecen se repite el job fallido.

## Fusión del PR #6 y auditoría del repositorio público (2026-11-12)

**Fusión.** El PR #6 se fusionó en `main` con un **commit de fusión** (`9b823f8`, 2026-11-12 01:45 UTC; con squash o rebase habrían cambiado los hashes que citan estos documentos) tras el CI **verde sobre `88ea35a`** (8 de 8; 468 E2E, 0 intermitentes) y por indicación expresa de la persona propietaria («Sí, al estar verde»). Antes de fusionar se leyó la vista previa de ese mismo commit y se vio que `engines.node` (`>=22.12.0`) hace que Vercel compile con **Node 26.x** (producción pasaba de 24 a 26): `/api/health`, `robots.txt` y `sitemap.xml` respondían bien. No se usó la fusión automática de GitHub: `main` no tiene protección ni checks obligatorios y se habría fusionado al instante, sin esperar al CI.

**Producción.** Despliegue `dpl_EMLJJZDnJc7GRuu7K5ePg5FYwSvX` `READY` en 49 s; el alias estable apunta a él. **Protección observada por primera vez**: sin credenciales, `https://panamainmersive.vercel.app/es` y `/api/health` responden `302` a `https://vercel.com/sso-api`. Con credenciales (enlace temporal de Vercel, 23 h): `/api/health` → `siteEnv: staging`; `/es/fuentes` → 200, `X-Robots-Tag: noindex, nofollow`, `<meta name="robots" content="noindex, nofollow">`, cabecera nueva con el menú; `robots.txt` → `Disallow: /`. **Aviso**: el `X-Robots-Tag: noindex` que traían las vistas previas lo pone Vercel; en producción solo lo pone el `proxy.ts` y solo en documentos HTML (no en `/api/health` ni en estáticos). **Vuelta atrás**: Rollback instantáneo a `dpl_a93nxyDVfLEYDGrVvR84Wbq7mj14` (`a0f9fd5`) o `git revert -m 1 9b823f8`.

**Auditoría de solo lectura del repositorio público** (`wf_afa69ff9-03b`: 29 agentes, cuatro auditores —secretos, datos personales, derechos y despliegue— y un escéptico por cada hallazgo alto o medio; tardó 4,8 h porque la máquina estuvo suspendida). **Sin secretos reales** en el árbol ni en la historia (76 commits, 2 016 objetos, 1 232 blobs; 34 patrones de token en tres implementaciones independientes, con control positivo; solo credenciales de ejemplo), **sin bloqueos de despliegue** y la fusión no añadía exposición de credenciales. Todos los hallazgos «medios» bajaron a **bajos** tras la verificación. Lo que queda, **registrado y sin hacer** (decisiones de la persona propietaria): GitHub tiene **desactivados** secret scanning, push protection y las alertas de Dependabot (T-23); 26 commits públicos llevan el **correo personal** y dos variantes del nombre (T-24); `engines.node` y Node 26 (T-22); las rutas locales en los metadatos del PMTiles (F2-27); el PMTiles y las marcas ya redistribuidos sin derechos verificados (L-01, L-06); los docs nombran la organización de Supabase y sus proyectos de negocio y citan decisiones de la persona propietaria; los 55 commits de `main` llevan un trailer `Claude-Session` con un identificador de sesión.

**Documentación corregida en esta rama** (las frases que la auditoría encontró falsas por ser público el repositorio): `README.md` (estado y regla 3), ADR-0014 (los artefactos ya no están «fuera de git»), el índice de ADR («producción = main (privado)»), `.gitignore` (comentario y patrones: `.env.*` con `!.env.example`, `.vercel/`, `.mcp.json`, `*.pem`, `*.key`), `CLAUDE.md` («los commits de 5j no están en `origin`» y los intermitentes del ejecutor), `docs/deploy.md` (protección verificada, Node, L-06, CI), `public/brand/SOURCE.json` (decía «staging privado») y las anotaciones «se creó público» de las instrucciones históricas.

**No verificado.** Que las URL únicas de despliegue y la de rama respondan al SSO igual que el alias estable; el runtime con Node 26 más allá de `/api/health` y las páginas leídas (la ficha, el mapa y los cinco idiomas, sin sesión de Vercel, no); el mapa dibujado en producción (lo cubre el CI sobre el mismo código, no un navegador contra `vercel.app`); si la sesión de claude.ai de los trailers está compartida; si hay copias externas del PMTiles (56 clonaciones, 25 únicas en 14 días, sin distinguir CI y propietaria).

**Node fijado a 22.x (T-22, PR #8) y seguridad del repositorio (T-23).** El registro de compilación de producción (E-101) confirmó lo que la auditoría había inferido: con `engines.node: >=22.12.0` Vercel ignoraba el ajuste del proyecto (22.x) y compilaba con **Node 26.x** (producción pasó de 24 a 26 al fusionar el PR #6; `Skipping build cache since Node.js version changed from "24.x" to "26.x"`), una versión que el CI nunca probó. La persona propietaria aprobó el arreglo: `engines.node: "22.x"`. Con Node 25 (la máquina local), `pnpm install` da `WARN Unsupported engine` y continúa (medido). **Sin verificar hasta fusionar**: que producción con Node 22 responda igual que con 26. Además, con el OK de la persona propietaria, se **activaron secret scanning y push protection** en GitHub (0 alertas en el primer análisis; las alertas de Dependabot y la protección de rama siguen sin decidir).

## Entrega 5k — Portada «Travesía» y UI espacial (2026-11-12, rama `feat/travesia`)

**Qué es.** Rediseño de la portada pedido por la persona propietaria («profesional, moderno, inmersivo e interactivo… diseño de ultragama»), que eligió la dirección **B · Travesía** entre tres y añadió «diseño UI espacial» (ADR-0026). Panamá se recorre de **oeste a este** entre el Caribe y el Pacífico, con cada destino en su **punto de referencia** (el ancla de `data/anchors`), sobre el **contorno de referencia** del país sacado de Overture (no es un límite oficial; derechos provisionales, L-01). **Sin fotos ni textos turísticos**: no hay ninguno con derechos o verificado (pendiente de la persona propietaria; el hueco natural es el panel de cada escena).

**Qué funciona (IMPLEMENTED, VERIFIED en local).**

- `pipelines/brand/make_isthmus.py` genera `src/domains/tourism/isthmus.generated.json` (contorno poligonizado, islas ≥ 25 km², proyección equirectangular; regenerarlo no cambia nada: continente ≈ 74 357 km², 99,7 % sobre la capa de tierra). `travesia.ts` (puro): orden por longitud, `panelSide`, `low`, coordenadas por idioma.
- Héroe con el istmo a la derecha desde 64rem (debajo en pantallas menores) y su crédito visible con la versión de Overture y «no es un límite oficial»; capas a distinta profundidad que se mueven con el ratón (`DepthStage`: solo puntero fino, sin táctil, sin `reduce`).
- Barra de paradas pegada bajo la cabecera (`TravesiaProgress`: marca la parada a la vista, llena la pista, desplaza solo su lista, publica su alto para el `scroll-padding`) y nueve escenas (localizador detrás, panel delante y elevado al lado contrario del punto, separación de planos atada al scroll).
- **Puerta de derechos**: `isthmusRights` (Overture: mostrar, transformar, redistribuir); en producción no se pinta ningún istmo (la travesía sigue en texto). Hoy se despliega como staging, donde sí se ve.

**Revisión independiente** (`wf_8cfc05ad-617`, 20 agentes, solo lectura, un escéptico por hallazgo alto o medio): 38 hallazgos, 16 altos o medios confirmados (ninguno refutado; varios rebajados). Corregidos en esta rama: **2.4.11** (con Mayús+Tab un enlace de escena quedaba ENTERO bajo cabecera y barra: el `scroll-padding` no contaba con la barra; la portada no estaba en la prueba de 2.4.11 y la sonda solo pulsaba Tab hacia delante), la barra que se comía la mitad de la pantalla apaisada (ya no se pega con `max-height: 30rem`; en el teléfono mide 77 px), el anillo de foco recortado por la lista que desplaza, la barra que no cabía a 1280 px (ahora nueve columnas desde 66rem de contenedor), la parada «pegada» al invertir el sentido, el panel que tapaba el punto de Boquete y Coiba, el istmo invisible en el teléfono (costa de 0,35 px), la jerarquía tipográfica invertida (h2 mayor que el h1), el rojo en un marcador del mapa, los colores forzados que no llegaban al localizador, el istmo **sin puerta de derechos** en producción, «posición real»/«Ubicación» (son puntos de referencia), la línea entre paradas (se leía como itinerario), el crédito sin versión ni aviso de «no oficial», la ruta del contorno repetida diez veces (HTML de la portada 298 → 137 KB; RSC 155 → 75 KB), `DepthStage` (cuadro pendiente tras salir, dedo en portátiles táctiles), comentarios y ADR desfasados, una clave de mensajes sin uso y pruebas débiles (cuál parada se marca, suelo de la prueba de teclado, ratón antes de hidratar). **Segunda revisión de los arreglos** (`wf_61532de1-e09`, 5 agentes): ningún hallazgo alto o medio confirmado (los dos medios se rebajaron o refutaron: el pie del sitio ya lleva la atribución ODbL en producción; el PMTiles con el mismo contorno ya está público en `main`), pero señaló un riesgo **sin probar** que resultó **real**: con el alto de la barra en el `scroll-padding` del DOCUMENTO, enfocar un enlace de la propia barra pegada subía la página ≈ 360 px (medido en el navegador). Arreglo: el margen va en las escenas y sus enlaces (`scroll-margin`), no en el documento, y una E2E con control lo fija. También: rótulos y puntos del héroe decididos por el ancho del DIBUJO (consulta de contenedor: a 1024 px, en dos columnas, era pequeño), píldoras de la barra de igual alto, la regla del punto bajo solo en el teléfono (y Santa Catalina también es «bajo»: con movimiento quedaba a 4 px del panel), un h2 de la travesía entre el h1 y los h3, el texto de introducción sin «real» ni «tomado de OSM» (los puntos se derivan de OSM vía Overture), el alto publicado en la sección y no en `<html>`, el observador rehecho solo si cambia algo (agrupado en un cuadro), comentarios, las 15 claves nuevas en el registro de pendientes de revisión, y pruebas: los dos enlaces de cada escena en la de teclado, una parada no central en la de progreso, `DepthStage` (variables en el SVG, el dedo no mueve nada, con control), la barra no pegada a 800 × 400 (con control a 800 × 900) y que la ruta llena el `viewBox`.

**Pruebas corridas.** Unitarias: 2 434 de 2 436 (las dos de macOS conocidas: `e2e-run`, `pg-sweep`), con pruebas nuevas de la puerta de derechos (producción y su control en staging), la ruta compartida, el lado del panel, el orden «Parada N de 9» tras el h3 y la proyección de lo dibujado. `eslint .`, `tsc`, `prettier --check .` limpios. `pnpm check:bundle`: portada 194,5 KB JS / 17,0 KB CSS (de 210 / 20); HTML de la portada 137 KB. E2E (`CI=true`, puerto 3260, 2 trabajadores, con la máquina cargada por otras sesiones: carga 44–61): `home`, `home.mobile`, `a11y.a11y` y `shell-review-x3`: 193 de 200 a la primera; los 7 fallos eran 6 plazos vencidos de axe (Explorar a 90 s y la portada a 30 s, sin ninguna infracción) y el control nuevo de 2.4.11 en móvil (en el teléfono Chromium centra el destino y el defecto antiguo no aparece en 30 pulsaciones: el control se mide ahora a 1280 × 800). Repetidas con un trabajador: pasan; axe de la portada lleva ahora un plazo propio de 60 s (≈ 4–7 s por idioma con esa carga; medido). Nuevas E2E: Mayús+Tab por las nueve escenas con su control, la parada exacta marcada y la pista, el ancla justo bajo la barra, la inversión del sentido (1280 × 1100: franja mayor que el hueco), el punto no tapado a 1280, 820 y 390 px (`elementFromPoint`), el anillo de foco dentro de la lista, las nueve paradas sin desplazar a 1280 px en es y de.

**Otros cambios.** ESLint, Prettier y `tsc` excluyen `.claude/` (los árboles de trabajo de otras sesiones rompían `pnpm lint`). Producción tras el PR #8: el registro de compilación dice «Node.js version changed from 26.x to 22.x» y `/api/health` y `/es` responden (leídos con el enlace temporal de Vercel).

**Qué queda.** La suite E2E completa no se ha corrido en local (la máquina está cargada: la corre el CI del PR); el `test:e2e:content` solo corre en CI. Fotos con derechos, revisión humana de los textos nuevos en en/pt/fr/de y L-01 siguen en manos de la persona propietaria. Sin verificar: Safari y Firefox (el `<use>` con `vector-effect` y `r` como propiedad CSS se han visto solo en Chromium), lectores de pantalla reales.
