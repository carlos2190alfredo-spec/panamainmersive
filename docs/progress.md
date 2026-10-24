# Progreso

Última actualización: **2026-10-24**. Proyecto nuevo en `/home/user/panama-immersive` (`/home/user` estaba vacío: no se ha tocado nada fuera de esta carpeta).

Vocabulario: **IMPLEMENTED** (existe) · **VERIFIED** (existe y se observó una prueba pasando) · **BLOCKED** (falta credencial/acceso/decisión externa) · **DEFERRED** (pospuesto a propósito).

## Estado por fase

| Fase                              | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Notas                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 0 — Discovery                     | **VERIFIED** (documentación completa, evidencias con fiabilidad declarada)                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Fuentes oficiales no accesibles: `docs/research/evidence-log.md` E-00                                |
| 1 — Foundation                    | **VERIFIED** salvo CI (IMPLEMENTED, no ejecutable aquí)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Detalle abajo                                                                                        |
| 2 — Exploración de Panamá         | **VERIFIED** (mapa real en local); producción **bloqueada por derechos**                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Entrega 2: mapa con PMTiles propio, anclas por ID, derechos                                          |
| 3 — GIS                           | **VERIFIED en local** (F3.a–e); producción **bloqueada** por derechos (L-01) y sin límites oficiales (L-03)                                                                                                                                                                                                                                                                                                                                                                                                                  | Entregas 3, 3b, 3c y 3d; cierre abajo                                                                |
| 4 — Destinos                      | **EN CURSO**: modelo de contenido y ficha **VERIFIED en local** (F4.a–e, ADR-0019) y **endurecidos tras dos revisiones independientes** (ADR-0020) más una **tercera de orquestación y CI** (entrega 4c; el CI **sigue sin ejecutarse**: no hay remoto) el **idioma de las fuentes** (4d, WCAG 3.1.2) la **concurrencia** del modelo (4e) y su **coste con volumen** (4f: una lectura de personal que escalaba con las filas y un montaje cuadrático del exportador, corregidos); **sin ninguna afirmación verificada real** | Entregas 4a, 4b, 4c, 4d, 4e y 4f; contenido real bloqueado por L-01…L-03 y decisiones F4-1/F4-3/F4-5 |
| 5 — Imágenes de calle e historias | **EN CURSO, solo componentes independientes**: **Experience Resolver** como dominio puro (entrega 5a, ADR-0024); lo demás **BLOQUEADO** por lo externo (sin credencial, acceso, derechos ni historias con contenido permitido: F5-4)                                                                                                                                                                                                                                                                                         |
| 6–10                              | PENDIENTE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ver `docs/backlog.md`                                                                                |

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
