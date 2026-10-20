# 0003 — next-intl con `proxy.ts`; slugs en registro propio; `alternateLinks: false`

- Estado: Aceptada
- Fecha: 2026-10-20

## Contexto

Cinco idiomas (`es` por defecto, `en`, `pt`, `fr`, `de`) con prefijo en la ruta, destinos relacionados por **ID estable**, slugs localizables con redirecciones, y SEO que solo indexe variantes realmente publicadas.

Evidencia primaria (E-10, E-11, E-12): en Next 16 `middleware` se llama `proxy`; `next/root-params` está activo por defecto desde Next 16.3 (no funciona en Route Handlers ni Server Actions); `pathnames` de next-intl es **estático**; la cabecera `Link` hreflang automática asume todas las variantes y debe desactivarse si hay páginas solo en algunos idiomas o rutas gestionadas por CMS; la cookie de idioma es de sesión por defecto.

## Decisión

1. **next-intl 4.14.9** con `src/proxy.ts`, `localePrefix: 'always'`, `defaultLocale: 'es'`.
2. **`pathnames`** únicamente para rutas **estructurales** (`/explorar`, `/destinos`, fuentes, accesibilidad…), con las traducciones de la ruta definidas en un solo lugar (`src/i18n/routing.ts`).
3. Los **slugs de destino** viven en un **registro** (`destination_slugs(destination_id, locale, slug, is_current)`; en código, un registro tipado hasta que exista BD). Una página resuelve el slug a `destination_id`; un slug antiguo o de otro idioma responde **308** al canónico del idioma de la URL.
4. **`alternateLinks: false`**. `canonical`, `hreflang` (recíproco, autorreferencia, `x-default`) y sitemaps se generan desde las variantes **publicadas** (política en `docs/i18n.md`).
5. **Detección**: la URL explícita manda. En `/` se usa cookie de preferencia, luego `Accept-Language`, luego `es`. **Sin geolocalización.**
6. Cookie `NEXT_LOCALE` de **sesión** (por defecto de la librería); persistente solo si la revisión legal lo aprueba.
7. `next/root-params` para leer la locale en Server Components; en Route Handlers se pasa explícitamente.

## Alternativas descartadas

Implementar `[locale]` y detección a mano (se reinventa lo que next-intl ya resuelve y prueba); localizar slugs con `pathnames` (no es dinámico); generar `Link` hreflang automáticos (indexaría traducciones pendientes).

## Consecuencias

Hay que **probar** hreflang/canonical/sitemap y las redirecciones de slug (pruebas i18n del plan). Cambiar de idioma debe conservar destino/cámara/capas: la URL es la fuente de verdad.

## Revisar cuando

next-intl soporte pathnames dinámicos de forma nativa, o aparezca un dominio por idioma (cambiaría el routing a `domains`).
