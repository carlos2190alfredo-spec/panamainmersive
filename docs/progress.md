# Progreso

Última actualización: **2026-10-21**. Proyecto nuevo en `/home/user/panama-immersive` (`/home/user` estaba vacío: no se ha tocado nada fuera de esta carpeta).

Vocabulario: **IMPLEMENTED** (existe) · **VERIFIED** (existe y se observó una prueba pasando) · **BLOCKED** (falta credencial/acceso/decisión externa) · **DEFERRED** (pospuesto a propósito).

## Estado por fase

| Fase                      | Estado                                                                                                                         | Notas                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 0 — Discovery             | **VERIFIED** (documentación completa, evidencias con fiabilidad declarada)                                                     | Fuentes oficiales no accesibles: `docs/research/evidence-log.md` E-00          |
| 1 — Foundation            | **VERIFIED** salvo CI (IMPLEMENTED, no ejecutable aquí)                                                                        | Detalle abajo                                                                  |
| 2 — Exploración de Panamá | **VERIFIED** (mapa real en local); producción **bloqueada por derechos**                                                       | Entrega 2: mapa con PMTiles propio, anclas por ID, derechos                    |
| 3 — GIS                   | **VERIFIED en local** (F3.a–e); producción **bloqueada** por derechos (L-01) y sin límites oficiales (L-03)                    | Entregas 3, 3b, 3c y 3d; cierre abajo                                          |
| 4 — Destinos              | **EN CURSO**: modelo de contenido y ficha **VERIFIED en local** (F4.a–e, ADR-0019); **sin ninguna afirmación verificada real** | Entrega 4a; contenido real bloqueado por L-01…L-03 y decisiones F4-1/F4-3/F4-5 |
| 5–10                      | PENDIENTE                                                                                                                      | Ver `docs/backlog.md`                                                          |

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
