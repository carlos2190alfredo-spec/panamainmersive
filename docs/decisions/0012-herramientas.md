# 0012 — pnpm, ESLint 9, Vitest 5, Playwright

- Estado: Aceptada (la parte «ESLint 9» fue reemplazada por [0013](0013-eslint-10.md))
- Fecha: 2026-10-20

## Contexto

`pnpm 10.28` está instalado; `pnpm` bloquea por defecto los _scripts_ de instalación de dependencias, lo que es deseable. `eslint-plugin-jsx-a11y@6.10.2` declara compatibilidad hasta ESLint `^9` (E-05); `eslint@10.13.0` existe. `vitest@5.0.5` requiere `vite ^6.4 || ^7 || ^8`.

## Decisión

- **pnpm** con `packageManager` fijado y `onlyBuiltDependencies` en lista blanca mínima.
- **ESLint 9.39.5** (flat config) + `typescript-eslint 8.72` + `eslint-plugin-jsx-a11y` + `eslint-plugin-react-hooks` + `@next/eslint-plugin-next`. Se pasa a ESLint 10 cuando `jsx-a11y` lo declare.
- **Vitest 5** (+ `jsdom`, Testing Library) para unitarias/integración; **Playwright** (Chromium preinstalado, `executablePath` explícito si hace falta) + **axe-core** para E2E y accesibilidad.
- **Prettier 3.9** para formato.
- Versiones **exactas** en `package.json` (sin `^`) para reproducibilidad; las actualizaciones son deliberadas.

## Alternativas descartadas

ESLint 10 ahora (peer de `jsx-a11y` no declarado); Jest/Cypress (más pesados, sin ventaja aquí).

## Revisar cuando

`jsx-a11y` publique soporte ESLint 10; cambie la política de scripts de pnpm.
