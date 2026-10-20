# Progreso

Última actualización: **2026-10-20**. Proyecto nuevo en `/home/user/panama-immersive` (`/home/user` estaba vacío: no se ha tocado nada fuera de esta carpeta).

Vocabulario: **IMPLEMENTED** (existe) · **VERIFIED** (existe y se observó una prueba pasando) · **BLOCKED** (falta credencial/acceso/decisión externa) · **DEFERRED** (pospuesto a propósito).

## Estado por fase

| Fase                      | Estado                                                                     | Notas                                                                 |
| ------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 0 — Discovery             | **VERIFIED** (documentación completa, evidencias con fiabilidad declarada) | Fuentes oficiales no accesibles: `docs/research/evidence-log.md` E-00 |
| 1 — Foundation            | **VERIFIED** salvo CI (IMPLEMENTED, no ejecutable aquí)                    | Detalle abajo                                                         |
| 2 — Exploración de Panamá | **VERIFIED** (mapa real en local); producción **bloqueada por derechos**   | Entrega 2: mapa con PMTiles propio, anclas por ID, derechos           |
| 3 — GIS                   | PENDIENTE                                                                  | Los sondeos de Fase 0 ya extraen datos reales de Overture             |
| 4–10                      | PENDIENTE                                                                  | Ver `docs/backlog.md`                                                 |

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
