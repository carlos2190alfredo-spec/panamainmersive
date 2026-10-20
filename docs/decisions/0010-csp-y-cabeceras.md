# 0010 — Estrategia de CSP y cabeceras de seguridad

- Estado: **Propuesta — validar en Fase 1** (se actualizará con el resultado)
- Fecha: 2026-10-20

## Contexto

La guía oficial de Next (E-12) indica: un CSP con **nonce obliga a render dinámico**; sin nonce se necesita `'unsafe-inline'`; el **SRI** (`experimental.sri`) permite un CSP estricto manteniendo generación estática. El producto necesita SEO multilingüe y rendimiento ⇒ preferiría render estático. MapLibre usa **Web Workers desde `blob:`** y carga imágenes/tiles de orígenes concretos.

## Decisión provisional

1. Cabeceras fijas en `next.config`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (geolocalización solo `self`, el resto denegado), `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `Cross-Origin-Opener-Policy: same-origin`, HSTS solo en producción.
2. CSP con **orígenes explícitos** para `connect-src`, `img-src`, `worker-src blob:`, `font-src 'self'`, `object-src 'none'`, `base-uri 'self'`.
3. Para `script-src`, **probar SRI**: si con `script-src 'self'` la aplicación hidrata sin violaciones en Chromium (prueba E2E que falla ante cualquier `securitypolicyviolation`), se adopta. Si no, plan B documentado: nonce con páginas públicas dinámicas **medidas**, y plan C `'unsafe-inline'` solo con justificación escrita.

## Alternativas descartadas

`'unsafe-inline'` como punto de partida (debilita la mitigación XSS).

## Consecuencias

Cualquier nuevo origen (tiles, proveedores) exige una **entrada explícita** en la lista de orígenes y su derecho en `provider-rights`.

## Revisar cuando

Resultado de la prueba SRI (Fase 1) y cada vez que se añada un proveedor.
