import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `scripts/check-coverage.ts` de punta a punta (`pnpm check:coverage`): la lógica pura se prueba en
 * `coverage-freshness.test.ts`; esto vigila el PEGAMENTO (0 bien · 1 caduca o caducó · 2 no se pudo evaluar) con los
 * datos REALES del proyecto. El día se fija con `--today` para no depender del reloj.
 */
const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts/check-coverage.ts');
const TSX = pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href;

function run(args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      ['--import', TSX, SCRIPT, ...args],
      { cwd: ROOT, timeout: 60_000 },
      (error, stdout, stderr) => {
        resolve({
          code: error === null ? 0 : typeof error.code === 'number' ? error.code : -1,
          stdout,
          stderr,
        });
      },
    );
  });
}

describe('check-coverage (con la evidencia real)', () => {
  it('lejos de la caducidad: sale con 0 y dice la fecha y los días que quedan', async () => {
    const r = await run(['--today', '2026-10-24']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('2027-01-18');
    expect(r.stdout).toContain('86 días');
    expect(r.stdout).toContain('9 destinos');
  });

  it('dentro del umbral (30 días por defecto): sale con 1, dice cuántos días y qué evidencias reobservar', async () => {
    const r = await run(['--today', '2026-12-19']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('quedan 30 días');
    expect(r.stderr).toContain('docs/coverage.md');
    expect(r.stderr).toContain('coverage-evidence.ts');
    expect(r.stderr).toContain('E-25');
  });

  it('el día de la caducidad: sale con 1 y dice que YA caducó', async () => {
    const r = await run(['--today', '2027-01-18']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('caducó');
  });

  it('pasada la caducidad dice hace cuántos días', async () => {
    const r = await run(['--today', '2027-02-01']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('hace 14 días');
  });

  it('`--warn-days` (con espacio o con `=`) cambia el umbral', async () => {
    expect((await run(['--today', '2026-12-19', '--warn-days', '10'])).code).toBe(0);
    expect((await run(['--today', '2026-12-19', '--warn-days=10'])).code).toBe(0);
    expect((await run(['--today', '2027-01-10', '--warn-days', '10'])).code).toBe(1);
  });

  it('sin `--today` usa el día de hoy: sale con 0 o con 1, nunca con 2, y nombra la fecha de caducidad', async () => {
    const r = await run([]);
    expect([0, 1]).toContain(r.code);
    expect(r.stdout + r.stderr).toContain('2027-01-18');
  });

  it.each([
    ['un argumento desconocido', ['--lo-que-sea']],
    ['una ruta suelta', ['hoy']],
    ['`--today` sin valor', ['--today']],
    ['`--today` con una fecha inexistente', ['--today', '2026-02-31']],
    ['`--today` con otro formato', ['--today', '24/10/2026']],
    ['`--warn-days` sin valor', ['--warn-days']],
    ['`--warn-days` negativo', ['--warn-days', '-1']],
    ['`--warn-days` no numérico', ['--warn-days', 'mucho']],
    ['`--warn-days` con decimales', ['--warn-days', '1.5']],
  ])('%s: sale con 2 (no se pudo evaluar), nunca con 0', async (_label, args) => {
    const r = await run(args);
    expect(r.code).toBe(2);
  });
});
