# 0025 — Identidad de marca «Panamá Immersive» e interfaz inmersiva (vidrio sobre mapa)

- Estado: Aceptada (la persona propietaria entregó los diseños y pidió implementarlos, 2026-10-24)
- Fecha: 2026-10-24
- Reemplaza parcialmente a: [0011](0011-estilos-y-tipografia.md) (solo **paleta y tipografía**; CSS Modules, tokens, propiedades lógicas y autoalojamiento siguen vigentes)

## Contexto

La persona propietaria entregó cuatro diseños: la maqueta de la pantalla **Explorar** (mapa a pantalla completa con paneles de vidrio, carril de categorías, tarjeta destacada, carrusel de destinos, controles 3D/capas/ubicación, brújula, mini-globo, clima y valoraciones), el **logotipo principal** (letra P con paisaje y brújula), el **logotipo secundario** (silueta del país) y un **tablero de marca** (paleta, Montserrat + Playfair Display, aplicaciones web, PWA y merchandising).

La maqueta contiene cosas que **no existen en el producto** y que el repositorio prohíbe inventar (valoraciones, clima, fotos generadas, AR, audioguía, recorridos 3D, hospedajes, tours, empresas, cuentas). Además la identidad vigente («Istmo», turquesa, Fraunces/Figtree) era provisional y el icono era una marca provisional.

## Decisión

**1. Marca.** Se usan las marcas entregadas, extraídas con transparencia (`public/brand/mark-p-{160,320,640}.webp`, `mark-map-*`) y los iconos de app (`src/app/icon.png`, `apple-icon.png`). Se sirven con un `<img>` nativo en un único componente de servidor (`BrandMark`), **no** con `next/image` (emite `style="color:transparent"`, que la CSP `style-src 'self'` bloquea). El nombre «PANAMÁ IMMERSIVE» es **texto vivo** (`SITE.wordmark`), nunca una imagen de texto. Procedencia y derechos en `public/brand/SOURCE.json`: las marcas son ilustraciones de aspecto generado entregadas por la persona propietaria; **su titularidad y licencia las decide ella**.

**2. Paleta** (valores exactos del tablero): Rojo Panamá `#D21034`, Azul Panamá `#0033A0`, Azul Claro `#00A3E0`, Verde Natural `#1B7F5A`, Arena `#F4E7D3`, Azul Profundo `#002072`, Blanco. Los derivados (tinta, superficies, líneas, foco, estados, vidrio) son **propuestas del equipo**, no vienen del tablero, y se verifican por cálculo WCAG en `tests/unit/design/contrast.test.ts`. Reglas que salen de los números: el **rojo solo vale como relleno con texto blanco** (5,43:1; como texto sobre Arena da 4,46:1 y sobre oscuro ≈3:1); el **azul claro no es texto sobre claro** (2,87:1; sí sobre Azul Profundo, 5,05:1); sobre Azul Profundo no se usan rojo, verde ni Azul Panamá como texto ni icono informativo.

**3. Temas.** Claro y oscuro por `prefers-color-scheme` (el tablero no define oscuro) y un **ámbito inmersivo siempre oscuro**: el atributo global `data-immersive` en un contenedor de la página activa `:root:has([data-immersive])` con los tokens oscuros de marca (cubre cabecera y pie, y `readPalette()` del mapa lee el mismo `:root`). Lo usan **la portada y Explorar**. `contrast.test.ts` y `map-style.test.ts` se adaptan para leer **tres** ámbitos (claro, oscuro, inmersivo) en lugar de partir el CSS por el primer `@media`.

**4. Tipografía.** Playfair Display (titulares) y Montserrat (texto), autoalojadas desde `@fontsource-variable/*` (OFL-1.1, como las anteriores), con fallbacks de métricas ajustadas (`size-adjust`). Reemplazan a Fraunces y Figtree. Montserrat es ≈12 % más ancha que Figtree: se vigilan reflow a 320 px y espaciado de texto (1.4.12) en los cinco idiomas. Las etiquetas del mapa (glifos Noto Sans en PBF) no cambian.

**5. Vidrio («UI espacial»).** Superficies translúcidas con base **opaca** en token (`--color-glass-*`) y opacidad en `--glass-alpha ≥ 0,85` (peor caso verificado ≥ 4,5:1 sobre blanco y sobre negro). `backdrop-filter` solo como mejora progresiva: `@supports (backdrop-filter)` + `(min-width: 56rem) and (hover: hover) and (pointer: fine)`, radio ≤ 12 px, **máximo tres superficies** a la vez sobre el mapa (repintan en cada fotograma de WebGL); relleno sólido en móvil y con `prefers-contrast: more`, `prefers-reduced-transparency: reduce` y `forced-colors: active`.

**6. Movimiento.** Solo CSS (transiciones y `@keyframes`, `animation-timeline: view()` con `@supports`) y la API Web Animations; **sin GSAP ni Lenis** (peso y licencia no permisiva). Todo dentro de `prefers-reduced-motion: no-preference`; nada infinito ni > 5 s (WCAG 2.2.2); **no se anima `opacity` sobre texto** (axe mediría contraste a mitad de animación). El vuelo del mapa ya respeta `reduced-motion`.

**7. Cabecera y pie.** Cabecera fija de **exactamente `--header-height: 4rem`** en todos los anchos (el mapa calcula `100dvh − var(--header-height)`): marca P + rótulo, navegación real (Explorar, Destinos, Fuentes), selector de idioma (sigue siendo el **primer** `<summary>` del DOM: lo asumen 7 pruebas E2E) y CTA rojo **«Abrir el mapa» → /explore**. En móvil el menú es un `<button popovertarget>` + `<nav popover>` (sin JS ni `<details>`). El pie lleva los cuatro enlaces reales y la atribución de datos.

**8. Explorar inmersivo.** El mapa ocupa toda la pantalla bajo la cabecera y los componentes **reales existentes** se re-visten y recolocan como capa HUD de paneles de vidrio (nunca se duplican: la suite E2E usa selectores únicos): carril izquierdo (título, **filtro por tipo de destino**, capas, leyenda), **buscador** de los nueve destinos, herramientas a la derecha (zoom y brújula nativos, **«Relieve en 3D»** que activa el relieve opt-in ya existente con su aviso de terceros), **ficha destacada** (la tarjeta de destino actual) y **carrusel** inferior de los nueve destinos reales (tarjetas tipográficas con pictograma propio por tipo, sin fotos), panel derecho plegable con selección de áreas. El encuadre del vuelo descuenta el espacio ocupado por el HUD (`data-hud-safe`). **Móvil**: hoja inferior con dos detentes controlada por un botón (`aria-expanded`), contenido plegado `inert`; con el mapa a pantalla completa los gestos cooperativos dejan de tener sentido y Fuentes/Accesibilidad se duplican dentro de la hoja.

**9. Lo que NO se implementa** (no existe producto ni datos; no se muestra ni desactivado): valoraciones, reseñas, clima y hora, fotos y descripciones de destinos, recorrido 3D, realidad aumentada, audioguía, rutas y tours, hospedajes, empresas, categorías de atractivos, «Experiencias», «Planifica tu viaje», «Iniciar sesión» y cuentas, mini-globo (no hay geometría de continentes), etiquetas «Mar Caribe / Océano Pacífico» (la fuente no trae nombres de mar y los topónimos no se traducen), botón «Mi ubicación» y pantalla completa (la geolocalización escribiría la posición exacta en una URL compartible: se pospone hasta decidir su privacidad). Las fotos de la maqueta son generadas y **no** se usan como contenido. Los pictogramas por tipo son iconografía genérica, no «foto del lugar».

**10. Textos.** Todo texto visible sale de `messages/*.json` en los cinco idiomas; el español es borrador y en/pt/fr/de son traducción automática (**nunca `reviewed`**: el estado es por idioma en `ui-status.ts`, no se toca). Se registran en `docs/progress.md` las claves nuevas como «pendientes de revisión humana».

**11. Presupuestos.** JS 210 KB y CSS 20 KB gzip por página (Explorar partía con ≈ 4,6 KB de margen de JS). El HUD que no necesita estado va en componentes de servidor; las islas de cliente (filtro, buscador, herramientas, hoja) en un único chunk diferido. Si aun así no cabe, se **recalibra con medición** y se documenta en `docs/performance.md`; no se relaja a ciegas.

**12. Producción.** «Dejar en producción» se entiende como **fusionar a `main`** (despliegue «Production» de Vercel, que sigue siendo `SITE_ENV=staging`, protegido por SSO y `noindex`). La producción **pública** (quitar SSO y poner `SITE_ENV=production`) **no** forma parte de esta decisión: con `SITE_ENV=production` el código bloquea el mapa y la API espacial por derechos provisionales (L-01) y los activos estáticos (`/data/*.pmtiles`, glifos) seguirían descargables; requiere resolver L-01, L-02, F4-1/F4-6 y la decisión de dominio (ver `docs/deploy.md` §5).

## Alternativas descartadas

`next/image` (CSP); GSAP/Lenis (peso y licencia); tarjetas con fotos de la maqueta (generadas, engañosas); un segundo `<aside>` o duplicar controles para el HUD (rompe selectores únicos de la suite); tema oscuro por clase en el contenedor (no cubre la cabecera ni `readPalette()`); mantener Fraunces/Figtree (el tablero pide Playfair/Montserrat); `next/og` para la imagen social (fuentes woff2 no admitidas; se genera una imagen estática con Pillow).

## Consecuencias

Más superficie de CSS y de pruebas; dos dependencias OFL nuevas con excepción provisional (T-20, hasta 2027-01-22) y salida de las de Figtree/Fraunces; el staging gana el aspecto de la maqueta con **solo datos reales**; varias pruebas E2E del mapa cambian de geometría (encuadre con relleno de HUD) y se actualizan conservando su intención.

## Evidencia

Informes de exploración y mediciones en `docs/progress.md` (entrega 5j). Cálculo WCAG de los pares propuestos en `tests/unit/design/contrast.test.ts`.

## Revisar cuando

Exista contenido verificado o fotografía con licencia (tarjetas con foto), se decida la privacidad de la geolocalización, se resuelvan los derechos de las marcas y del mapa (L-01), o se pase a producción pública.
