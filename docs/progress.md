# Progreso

Última actualización: **2026-10-20**. Proyecto nuevo en `/home/user/panama-immersive` (`/home/user` estaba vacío: no se ha tocado nada fuera de esta carpeta).

Vocabulario: **IMPLEMENTED** (existe) · **VERIFIED** (existe y se observó una prueba pasando) · **BLOCKED** (falta credencial/acceso/decisión externa) · **DEFERRED** (pospuesto a propósito).

## Estado por fase

| Fase                      | Estado                                                                     | Notas                                                                 |
| ------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 0 — Discovery             | **VERIFIED** (documentación completa, evidencias con fiabilidad declarada) | Fuentes oficiales no accesibles: `docs/research/evidence-log.md` E-00 |
| 1 — Foundation            | **VERIFIED** salvo CI (IMPLEMENTED, no ejecutable aquí)                    | Detalle abajo                                                         |
| 2 — Exploración de Panamá | EN CURSO                                                                   | Mapa MapLibre con datos permitidos                                    |
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

### Bloqueos de lanzamiento (no impiden probar en local)

`docs/backlog.md` L-01…L-05: ninguna política de derechos `verified`; ningún idioma con revisión humana; geometrías oficiales sin acceso; revisión legal pendiente; cobertura Google/Mapillary `UNKNOWN`.

### Siguiente acción concreta

**Fase 2**: integrar MapLibre con datos permitidos reales (Natural Earth + Overture + terreno AWS construidos por un pipeline reproducible), cámara con conversión 2D↔altitud, deep links, selección de destino, alternativa textual y _fallback_.
