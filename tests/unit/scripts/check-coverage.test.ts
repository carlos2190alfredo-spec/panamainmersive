import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { daysBetween } from '../../../scripts/lib/coverage-freshness';
import { COVERAGE_EXPIRES_AT } from '../../../src/domains/tourism/coverage-evidence';

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

  it('`--today=FECHA` (con `=`) equivale a `--today FECHA`', async () => {
    const r = await run(['--today=2026-10-24']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('86 días');
  });

  it('sin `--today` usa el día de HOY (UTC): los días que cuenta salen del reloj, no de una fecha fija', async () => {
    const utcDay = () => new Date().toISOString().slice(0, 10);
    const before = utcDay();
    const r = await run([]);
    const after = utcDay();
    // El día puede cambiar mientras corre el proceso: vale el de antes o el de después.
    const expected = [before, after].map((day) => {
      const left = daysBetween(day, COVERAGE_EXPIRES_AT);
      return left <= 0 ? `hace ${String(-left)} días` : `quedan ${String(left)} días`;
    });
    const output = r.stdout + r.stderr;
    expect(r.code).not.toBe(2);
    expect(
      expected.some((fragment) => output.includes(fragment)),
      `«${output.trim()}» no contiene ninguno de: ${expected.join(' | ')}`,
    ).toBe(true);
  });

  it.each([
    ['un argumento desconocido', ['--lo-que-sea'], /Argumento no reconocido/],
    ['una ruta suelta', ['hoy'], /Argumento no reconocido/],
    ['`--today` sin valor', ['--today'], /necesita un valor/],
    ['`--today` seguido de otra bandera', ['--today', '--warn-days', '5'], /necesita un valor/],
    ['`--today` con una fecha inexistente', ['--today', '2026-02-31'], /fecha/],
    ['`--today` con otro formato', ['--today', '24/10/2026'], /fecha/],
    ['`--today=` con una fecha inexistente', ['--today=2026-02-31'], /fecha/],
    ['`--warn-days` sin valor', ['--warn-days'], /necesita un valor/],
    [
      '`--warn-days` seguido de otra bandera',
      ['--warn-days', '--today', '2026-10-24'],
      /necesita un valor/,
    ],
    ['`--warn-days` negativo', ['--warn-days', '-1'], /necesita un entero/],
    ['`--warn-days` no numérico', ['--warn-days', 'mucho'], /necesita un entero/],
    ['`--warn-days` con decimales', ['--warn-days', '1.5'], /necesita un entero/],
    ['`--warn-days=` negativo', ['--warn-days=-1'], /necesita un entero/],
    ['`--warn-days=` no numérico', ['--warn-days=mucho'], /necesita un entero/],
    ['`--warn-days=` con decimales', ['--warn-days=1.5'], /necesita un entero/],
    ['`--warn-days=` vacío', ['--warn-days='], /necesita un entero/],
  ] as [string, string[], RegExp][])(
    '%s: sale con 2 (no se pudo evaluar) y dice por qué, nunca con 0',
    async (_label, args, why) => {
      const r = await run(args);
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(why);
    },
  );
});
