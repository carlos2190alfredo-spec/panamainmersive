# Pruebas

Las pruebas buscan riesgos reales (derechos, publicación, RLS, accesibilidad, CSP), no repetir la implementación. Resultados observados el **2026-10-20** en el entorno de desarrollo (Node 22.22, PostgreSQL 16.15 + PostGIS 3.4.2, Chromium 141).

| Nivel       | Comando                 | Ficheros / pruebas                  | Qué cubre                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ----------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias   | `pnpm test`             | 23 / **326**                        | Mensajes (paridad de claves, ICU, marcadores, sin traducir), **sin texto literal en JSX** (AST), rutas localizadas, política de publicación, hreflang/canonical, sitemap, slugs y redirecciones, registro de destinos, caducidad de cobertura, formatos `Intl` y `America/Panama`, **contraste WCAG de los tokens reales (incluye los del mapa)**, entorno validado (incl. URLs del mapa), cabeceras/CSP, escaneo de secretos; **cámara 2D↔altitud (valores analíticos + propiedad), estado de la URL, estilo del mapa validado con el validador oficial, anclas, agrupamiento de marcadores, evaluador de derechos** |
| Integración | `pnpm test:integration` | 7 / **92**                          | Migraciones (checksum, deriva, idempotencia), PostGIS en `extensions`, **RLS en todas las tablas**, matriz por rol (visitante, usuario, editor, revisor, admin), escalada de privilegios, traducciones (estado editorial, desactualización), slugs con alias, geometrías (validez sin reparar, `geography`, orden de ejes, `ST_Covers`), cobertura derivada, derechos, auditoría inmutable, siembra desde el registro de la app                                                                                                                                                                                       |
| E2E / a11y  | `pnpm test:e2e`         | **135** (103 escritorio + 32 móvil) | Rutas y 404 localizados, negociación de idioma, slugs 308, contexto al cambiar de idioma, SEO `noindex`, cabeceras, **CSP sin violaciones con hidratación real**, axe WCAG 2.2 AA (7 páginas × 5 idiomas × claro/oscuro), teclado y foco, objetivos táctiles, reflow 320 px, `prefers-reduced-motion`; **mapa con WebGL real** (ver más abajo)                                                                                                                                                                                                                                                                        |
| Bundle      | `pnpm check:bundle`     | script                              | Ningún nombre de variable secreta en el bundle de cliente; presupuesto de JS/CSS por página (línea base 190,5 KB; Explorar 199,5 KB) y del **mapa diferido (455 KB gzip, presupuesto 500 KB)**                                                                                                                                                                                                                                                                                                                                                                                                                        |

## El mapa en los E2E (`e2e/map.spec.ts`, `e2e/map.mobile.spec.ts`)

Chromium con WebGL por software (SwiftShader) contra el **build de producción**. Cubre: carga sin violaciones de CSP ni errores de consola; que se **dibuje** tierra y mar (muestreo de píxeles frente a los tokens); `206` Range y caché del PMTiles; **cero peticiones a terceros** sin activar relieve; selección por botón, marcador y teclado con Atrás/Adelante; agrupamiento de marcadores y ausencia de solapes; enlaces profundos de destino y cámara (la altitud del enlace se convierte en el zoom esperado y la URL se reescribe al mover); parámetros hostiles (`<img onerror>` no se inyecta); capas y leyenda; relieve **con fixture** (tesela Terrarium plana generada en la prueba), relieve que falla y reintento; faltan datos, sin WebGL2, sin JavaScript; controles del mapa traducidos en 5 idiomas; cambio de idioma conservando `d`/`l`; teclado; `prefers-reduced-motion`; axe con el mapa dibujado (es claro, de oscuro, fr claro); en móvil, apilado, gestos cooperativos y objetivos ≥ 44 px.

## Cómo ejecutarlas

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm format && pnpm test
pnpm test:integration            # levanta y destruye su propio clúster temporal (sin tocar el del sistema)
SITE_ENV=development pnpm build && pnpm check:bundle
pnpm test:e2e                    # arranca `next start` sobre el build (requiere build previo)
```

- **Integración**: si eres `root`, PostgreSQL no arranca; el helper delega en el usuario `postgres` con `runuser`. Usa socket Unix (sin TCP), `fsync=off` y una base plantilla clonada por fichero.
- **E2E**: Chromium vía `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, el preinstalado del entorno cloud, o el que instale `playwright install chromium`.

## Trampas encontradas (y su causa real)

| Síntoma                                                     | Causa                                                                                                                                                                                  | Solución                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Rutas localizadas devuelven **307 → ellas mismas**          | `next start -H 127.0.0.1`: Next normaliza el host a `localhost` y trata la reescritura del `proxy` como externa. **No** es un defecto de la aplicación (verificado con varios `Host`). | No usar `-H 127.0.0.1`; los E2E usan `localhost`             |
| La app no hidrata; menú de idioma sin respuesta; 404 vacíos | `script-src 'self'` bloquea los 3 scripts en línea de Next                                                                                                                             | ADR-0010                                                     |
| `getTranslations` falla en el `not-found`                   | El `not-found` se renderiza fuera del layout; la solución real fue la hidratación del cliente (ver arriba), no el código del 404                                                       | —                                                            |
| Cookie de idioma «gana» en una segunda petición del test    | El `request` de Playwright conserva cookies (comportamiento correcto de la app)                                                                                                        | Contexto nuevo por petición en esa prueba                    |
| `spatial_ref_sys` sin RLS                                   | PostGIS en `public`                                                                                                                                                                    | PostGIS en el esquema `extensions` (migración 0001)          |
| «Worker failed to load» (MapLibre)                          | MapLibre 6 deduce la URL del worker de `import.meta.url`; empaquetado, apunta a un chunk (E-46)                                                                                        | `setWorkerUrl` a un activo emitido por el bundler            |
| El mapa «carga» pero se ve vacío                            | `.maplibregl-map { position: relative }` pisa un `position: absolute` de una sola clase y el lienzo colapsa a altura 0                                                                 | Selector de dos clases en `MapStage.module.css`              |
| Las casillas de capas «no cambian» tras el clic             | Controladas por la URL: React las revierte hasta que Next actualiza `useSearchParams` (transición)                                                                                     | Estado optimista local en `LayerControls`                    |
| `useSearchParams` no se entera de un cambio de URL          | `history.pushState(window.history.state, …)` con la marca `__NA` de Next se salta su integración (E-47)                                                                                | Pasar `null` como estado                                     |
| Faltan 25–75 % de las entidades en el PMTiles               | `tippecanoe:minzoom` por entidad y `--drop-*-as-needed` (E-44)                                                                                                                         | Rango de zoom por capa; la puerta de verificación lo detecta |
| `getByRole('alert')` resuelve a 2 elementos                 | El anunciador de rutas de Next también tiene `role=alert`                                                                                                                              | Acotar el localizador a la región del mapa                   |

## Verificación de que las pruebas detectan fallos (mutación)

Se rompieron a propósito cuatro garantías en las migraciones y se comprobó que fallan las pruebas pertinentes:

| Mutación                                                     | Pruebas que fallaron                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| El editor puede insertar traducciones `reviewed`             | «crea traducciones en borrador o automáticas, NUNCA revisadas» |
| La geometría inválida se repara en silencio (`ST_MakeValid`) | «se REGISTRA como inválida y NO se repara en silencio»         |
| Caducada → `UNAVAILABLE` en lugar de `UNKNOWN`               | 3 pruebas de cobertura derivada                                |
| Cualquiera puede insertar roles                              | 4 pruebas de escalada de privilegios                           |

## Lo que NO está probado

- **CI en GitHub Actions**: el flujo `.github/workflows/ci.yml` está **IMPLEMENTED, no VERIFIED** (no se puede ejecutar fuera de este entorno).
- **Lectores de pantalla reales** y evaluación con personas usuarias (axe no sustituye a ninguna de las dos). El mapa tiene nombres, roles y teclado verificados por axe y Playwright, **no** probados con NVDA/VoiceOver/TalkBack.
- **Dispositivos reales** y red de referencia (solo Chromium emulado); **rendimiento** (LCP/INP/FPS): no medido.
- **Supabase real**: las migraciones son portables pero solo se han probado en PostgreSQL local.
- Pruebas visuales de regresión por captura (planificadas).
- Pruebas de seguridad ofensivas (SSRF, importaciones maliciosas): llegan con el pipeline (Fase 3).
- **Relieve real de AWS en CI**: los E2E usan un fixture; el camino real se comprobó **a mano** el 2026-10-20 (sombreado visible, sin violaciones de CSP) pero no está automatizado (dependería de un tercero).
- **Compuerta de derechos en producción**: unitaria (evaluador) y **comprobada a mano** con `SITE_ENV=production NEXT_PUBLIC_SITE_URL=https://example.org pnpm build` + `next start`: estado `blocked`, sin lienzo, casilla de relieve deshabilitada aunque el enlace pida `hillshade`, 0 peticiones a AWS/PMTiles. No hay E2E automático porque `SITE_ENV` se fija en el build.
- **Pipeline de Python**: no hay pruebas unitarias de las funciones del ETL; la garantía es la **puerta de verificación** del propio `build_basemap.py` (conservación, cobertura, anclas) y los contratos TS↔Python.
- **PMTiles desde otro origen** (CDN/bucket): Range y CORS cruzados no se han probado.
- **Dispositivos reales, red de referencia y rendimiento (LCP/INP/FPS, tiempo de mapa utilizable)**: no medidos; SwiftShader no es representativo.
- **Pruebas visuales de regresión del mapa** (capturas): no hay; las capturas de esta fase se revisaron a mano.
