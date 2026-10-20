# 0011 — CSS Modules + tokens + propiedades lógicas; tipografías autoalojadas

- Estado: Aceptada
- Fecha: 2026-10-20

## Contexto

Identidad propia, textos largos en alemán/francés/portugués, preparación para RTL sin afirmar soporte, accesibilidad AA y cero dependencia de CDNs de fuentes (los hosts de Google Fonts no son alcanzables aquí, E-00, y además implican una petición de terceros por visitante).

## Decisión

- **CSS Modules** + **tokens CSS** (custom properties) en `src/styles/tokens.css` con tema claro/oscuro; **propiedades lógicas** (`margin-inline`, `inset-block`, …) y `min-width/max-width` con contenido flexible. Sin Tailwind ni CSS-in-JS.
- **Tokens semánticos** de color (superficie, tinta, acento, estados, categorías) y una **prueba unitaria de contraste WCAG** sobre los pares declarados.
- **Tipografía autoalojada** desde `@fontsource-variable/*` (OFL-1.1): *Fraunces* (titulares, serif de carácter editorial) y *Figtree* (texto). Subconjunto **latin + latin-ext** (cubre `ñ á é í ó ú ü ç ã õ â ê ô à è ù œ ß ä ö`).
- **RTL**: se prepara con propiedades lógicas; **no** se declara soporte hasta probarlo.

## Alternativas descartadas

Tailwind (utilidades acopladas al marcado, menos control de tokens semánticos); Google Fonts (privacidad, red).

## Consecuencias

Más CSS escrito a mano; a cambio, tamaño predecible, contraste verificable y tema coherente.

## Revisar cuando

Se añada un idioma RTL, o el coste de mantenimiento del CSS sea medible.
