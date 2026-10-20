# 0002 — TypeScript 6.0.3 fijado (no 7.x)

- Estado: Aceptada
- Fecha: 2026-10-20

## Contexto

`npm view typescript` devuelve `7.0.2` como `latest` (compilador nativo). Un spike mostró que `next build` 16.4.2 **sí compila** con 7.0.2 (E-04), pero el paquete ya **no expone la API JS clásica** (`require('typescript').createProgram` es `undefined`). `typescript-eslint@8.72.0` declara el peer `typescript >=4.8.4 <6.1.0` (E-05): el lint tipado no es compatible con 7.x.

## Decisión

Fijar **`typescript@6.0.3`** (última 6.0.x) con versión exacta. Modo `strict` más `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`.

## Alternativas descartadas

- **TS 7.0.2 sin lint tipado**: se perderían reglas que detectan errores reales (promesas sin esperar, etc.).
- **Dos TypeScript (7 para compilar, 6 para lint)**: complejidad de instalación y de resolución de `typescript` por nombre, sin beneficio medido.

## Consecuencias

Se pierde la velocidad del compilador nativo; el tiempo de typecheck actual del proyecto es pequeño. Se comprueba periódicamente en CI un job informativo con TS 7 (pendiente, ver backlog).

## Revisar cuando

`typescript-eslint` declare soporte para 7.x, o el tiempo de typecheck pase a ser un cuello de botella medido.
