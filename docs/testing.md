# Pruebas

Las pruebas buscan riesgos reales (derechos, publicación, RLS, accesibilidad, CSP), no repetir la implementación. Resultados observados el **2026-10-20** en el entorno de desarrollo (Node 22.22, PostgreSQL 16.15 + PostGIS 3.4.2, Chromium 141).

| Nivel       | Comando                 | Ficheros / pruebas                | Qué cubre                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ----------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias   | `pnpm test`             | 16 / **188**                      | Mensajes (paridad de claves, ICU, marcadores, sin traducir), **sin texto literal en JSX** (AST), rutas localizadas, política de publicación, hreflang/canonical, sitemap, slugs y redirecciones, registro de destinos, caducidad de cobertura, formatos `Intl` y `America/Panama`, **contraste WCAG de los tokens reales**, entorno validado, cabeceras/CSP, escaneo de secretos                                                |
| Integración | `pnpm test:integration` | 7 / **92**                        | Migraciones (checksum, deriva, idempotencia), PostGIS en `extensions`, **RLS en todas las tablas**, matriz por rol (visitante, usuario, editor, revisor, admin), escalada de privilegios, traducciones (estado editorial, desactualización), slugs con alias, geometrías (validez sin reparar, `geography`, orden de ejes, `ST_Covers`), cobertura derivada, derechos, auditoría inmutable, siembra desde el registro de la app |
| E2E / a11y  | `pnpm test:e2e`         | **97** (69 escritorio + 28 móvil) | Rutas y 404 localizados, negociación de idioma, slugs 308, contexto al cambiar de idioma, SEO `noindex`, cabeceras, **CSP sin violaciones con hidratación real**, axe WCAG 2.2 AA (7 páginas × 5 idiomas × claro/oscuro), teclado y foco, objetivos táctiles, reflow 320 px, `prefers-reduced-motion`                                                                                                                           |
| Bundle      | `pnpm check:bundle`     | script                            | Ningún nombre de variable secreta en el bundle de cliente; presupuesto de JS/CSS por página (línea base 190,5 KB JS gzip)                                                                                                                                                                                                                                                                                                       |

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

| Síntoma                                                     | Causa                                                                                                                                                                                  | Solución                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Rutas localizadas devuelven **307 → ellas mismas**          | `next start -H 127.0.0.1`: Next normaliza el host a `localhost` y trata la reescritura del `proxy` como externa. **No** es un defecto de la aplicación (verificado con varios `Host`). | No usar `-H 127.0.0.1`; los E2E usan `localhost`    |
| La app no hidrata; menú de idioma sin respuesta; 404 vacíos | `script-src 'self'` bloquea los 3 scripts en línea de Next                                                                                                                             | ADR-0010                                            |
| `getTranslations` falla en el `not-found`                   | El `not-found` se renderiza fuera del layout; la solución real fue la hidratación del cliente (ver arriba), no el código del 404                                                       | —                                                   |
| Cookie de idioma «gana» en una segunda petición del test    | El `request` de Playwright conserva cookies (comportamiento correcto de la app)                                                                                                        | Contexto nuevo por petición en esa prueba           |
| `spatial_ref_sys` sin RLS                                   | PostGIS en `public`                                                                                                                                                                    | PostGIS en el esquema `extensions` (migración 0001) |

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
- **Lectores de pantalla reales** y evaluación con personas usuarias (axe no sustituye a ninguna de las dos).
- **Dispositivos reales** y red de referencia (solo Chromium emulado); **rendimiento** (LCP/INP/FPS): no medido.
- **Supabase real**: las migraciones son portables pero solo se han probado en PostgreSQL local.
- Pruebas visuales de regresión por captura (planificadas).
- Pruebas de seguridad ofensivas (SSRF, importaciones maliciosas): llegan con el pipeline (Fase 3).
