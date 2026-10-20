# 0010 — Estrategia de CSP y cabeceras de seguridad

- Estado: **Aceptada** (resuelta con evidencia el 2026-10-20; propuesta inicial: «probar SRI»)
- Fecha: 2026-10-20

## Contexto

La guía oficial de Next (E-12) indica: CSP con **nonce obliga a render dinámico**; sin nonce se necesita `'unsafe-inline'`; el **SRI** (`experimental.sri`) se presenta como alternativa que mantiene generación estática. El producto necesita SEO multilingüe y rendimiento ⇒ se prefiere render estático. MapLibre usa Web Workers desde `blob:`.

## Evidencia (build de producción, Next 16.4.2, Turbopack)

Prueba con `script-src 'self'` + `experimental.sri` en Chromium (`e2e/security.spec.ts`):

1. Cada página prerrenderizada contiene **3 scripts en línea**: el arranque de Turbopack (243 B), `(self.__next_f=…).push([0])` (43 B) y un **payload RSC de 13–17 KB distinto en cada página** (`es.html` 12 972 B, ficha 17 086 B, `sources` 14 784 B).
2. Chromium los bloquea (`script-src-elem inline`) ⇒ **la aplicación no hidrata**: el menú de idioma no responde a Escape, el selector no conserva la query y los 404 no pintan.
3. `experimental.sri` añadió `integrity` a **6 de 9** scripts externos; los 3 restantes (chunks diferidos) quedaron sin él, y no cubre los inline.
4. Un CSP por hashes exigiría un hash por script en línea de **cada página** (≈ 220 hashes ≈ 13 KB de cabecera para 74 páginas): inviable.

## Decisión

1. `script-src 'self' 'unsafe-inline'` en producción (y `'unsafe-eval'` solo en desarrollo, por HMR). **Se acepta explícitamente la debilidad** de no mitigar scripts en línea inyectados.
2. **Controles compensatorios** (todos presentes y probados):
   - Resto de directivas estrictas: `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `connect-src`/`img-src`/`worker-src` con lista de orígenes explícita.
   - **Lint prohíbe `dangerouslySetInnerHTML`**; React escapa por defecto; mensajes ICU con interpolación segura.
   - Sin contenido generado por usuarios en la Foundation.
   - Cabeceras: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, HSTS en producción.
3. `experimental.sri` **no se activa** (cobertura parcial = falsa sensación de seguridad; superficie experimental sin beneficio demostrado).
4. Una prueba E2E **fija** la directiva exacta: si alguien la amplía (p. ej. `'unsafe-eval'` en producción) o la endurece sin comprobar la hidratación, la prueba falla.

## Alternativas descartadas

- **Nonce por petición** (plan B): fuerza render dinámico en todas las páginas públicas (sin caché de CDN, más invocaciones de función, peor TTFB). **No descartado para el futuro**: se reevaluará con _Cache Components_/PPR o cuando el riesgo lo justifique.
- **Hashes por página**: inviable (ver evidencia 4).
- **CSP por `<meta>`**: no admite `frame-ancestors` y no resuelve los hashes.

## Consecuencias

La mitigación de XSS depende **de no introducir** HTML sin escapar (lint + revisión). Si el producto empieza a renderizar contenido de usuarios (Fase 6, reclamaciones de empresas; Fase 9, IA), hay que (a) validar esquemas de URL (solo `http`/`https`) en enlaces aportados y (b) **reabrir este ADR** para pasar al plan B.

## Revisar cuando

- Se renderice contenido de usuarios o de IA (Fase 6/9).
- `experimental.sri` o Next cubran todos los scripts (incluidos los inline) con hashes por build.
- Se adopte _Cache Components_/PPR y el coste del render dinámico con nonce sea aceptable.
- Cada vez que se añada un origen externo (entrada explícita en la lista y su derecho en `provider-rights.md`).
