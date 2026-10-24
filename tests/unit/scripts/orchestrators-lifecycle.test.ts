import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Los tres guiones que lanzan un servidor o un clúster (`e2e-content`, `e2e-db`, `perf:vitals`) comparten el MISMO ciclo
 * de vida: `withTermination` (limpieza única, esperada antes de soltar los manejadores) y `exitWith` (130/143 sin
 * imprimir lo derivado de la interrupción). Esas dos funciones se prueban con un guion mínimo (`e2e-run.test.ts`) y
 * `e2e-content` de punta a punta (`tests/integration/e2e-scripts.test.ts`); `e2e-db` y `vitals` necesitan build, mapa e
 * ingesta y no se pueden interrumpir en una prueba automática. Esta guarda textual fija lo que SÍ se puede comprobar:
 * que ninguno vuelve a su propio ciclo de vida (con `process.exit` o `onTerminate` sueltos se perdió dos veces).
 */
const SCRIPTS = ['scripts/e2e-content.ts', 'scripts/e2e-db.ts', 'scripts/perf/vitals.ts'];

describe.each(SCRIPTS)('%s', (path) => {
  const source = readFileSync(join(process.cwd(), path), 'utf8');

  it('usa `withTermination` y `exitWith` de e2e-run', () => {
    expect(source).toMatch(/return withTermination\(cleanup, async \(\) => \{/);
    expect(source).toMatch(/^exitWith\(main\);$/m);
    expect(source).toMatch(/from '\.\.?\/(?:\.\.\/)?lib\/e2e-run'|from '\.\/lib\/e2e-run'/);
  });

  it('no gestiona señales ni la salida por su cuenta', () => {
    expect(source).not.toMatch(/\bonTerminate\(/);
    expect(source).not.toMatch(/\bprocess\.exit\(/);
    expect(source).not.toMatch(/\buntrack\b/);
    expect(source).not.toMatch(/process\.on\(\s*'SIG/);
  });
});
