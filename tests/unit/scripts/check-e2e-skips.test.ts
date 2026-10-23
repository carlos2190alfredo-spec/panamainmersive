import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `scripts/check-e2e-skips.ts` de punta a punta: la lógica pura ya se prueba en `e2e-report.test.ts`; esto vigila el
 * PEGAMENTO que la convierte en un código de salida (0 bien · 1 incumple · 2 no se pudo evaluar), que es lo que lee el CI.
 */
const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts/check-e2e-skips.ts');
const TSX = pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href;
const REASON = 'Falta el mapa base';

type Status = 'expected' | 'skipped' | 'unexpected' | 'flaky';

function report(statuses: Status[]): string {
  const count = (s: Status) => statuses.filter((x) => x === s).length;
  return JSON.stringify({
    config: {},
    suites: [
      {
        title: 'x.spec.ts',
        specs: statuses.map((status) => ({
          title: 't',
          ok: status !== 'unexpected',
          tests: [
            {
              projectName: 'desktop',
              status,
              annotations: status === 'skipped' ? [{ type: 'skip', description: REASON }] : [],
              results: [],
            },
          ],
        })),
      },
    ],
    errors: [],
    stats: {
      expected: count('expected'),
      skipped: count('skipped'),
      unexpected: count('unexpected'),
      flaky: count('flaky'),
    },
  });
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workdir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pi-check-skips-'));
  dirs.push(dir);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  return dir;
}

function run(dir: string, args: string[], env: Record<string, string> = {}) {
  // Sin heredar `E2E_MAX_SKIPPED` del entorno de quien ejecuta las pruebas: cada caso fija el suyo.
  const environment: NodeJS.ProcessEnv = { ...process.env, ...env };
  if (!('E2E_MAX_SKIPPED' in env)) delete environment.E2E_MAX_SKIPPED;
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      ['--import', TSX, SCRIPT, ...args],
      { cwd: dir, env: environment, timeout: 60_000 },
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

const OK_REPORT = report(['expected', 'expected', 'skipped', 'skipped']);

describe('check-e2e-skips (script completo)', () => {
  it('dentro del presupuesto: sale con 0 y cuenta lo que pasó y lo omitido, por motivo', async () => {
    const dir = workdir({ 'r.json': OK_REPORT });
    const result = await run(dir, ['r.json', '--max-skipped', '2']);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('2 pasan · 2 omitidas (presupuesto 2)');
    expect(result.stdout).toContain(`2 × ${REASON}`);
  });

  it('más omitidas que el presupuesto: sale con 1 y nombra el motivo', async () => {
    const dir = workdir({ 'r.json': OK_REPORT });
    const result = await run(dir, ['r.json', '--max-skipped', '1']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(REASON);
  });

  it('acepta `--max-skipped=N` y `E2E_MAX_SKIPPED`', async () => {
    const dir = workdir({ 'r.json': OK_REPORT });
    expect((await run(dir, ['r.json', '--max-skipped=2'])).code).toBe(0);
    expect((await run(dir, ['r.json'], { E2E_MAX_SKIPPED: '2' })).code).toBe(0);
    expect((await run(dir, ['r.json'], { E2E_MAX_SKIPPED: '1' })).code).toBe(1);
  });

  it('el argumento tiene prioridad sobre la variable de entorno', async () => {
    const dir = workdir({ 'r.json': OK_REPORT });
    expect((await run(dir, ['r.json', '--max-skipped', '5'], { E2E_MAX_SKIPPED: '0' })).code).toBe(
      0,
    );
  });

  it('sin ruta lee `test-results/e2e-report.json` (donde la deja la configuración en CI)', async () => {
    const dir = workdir({ 'test-results/e2e-report.json': OK_REPORT });
    const result = await run(dir, ['--max-skipped', '2']);
    expect(result.code, result.stderr).toBe(0);
  });

  it.each([
    ['sin presupuesto', []],
    ['con un presupuesto no numérico', ['--max-skipped', 'abc']],
    ['con un presupuesto negativo', ['--max-skipped', '-1']],
    ['con un argumento desconocido', ['--max-skipped', '2', '--lo-que-sea']],
  ])('%s: sale con 2 (no se pudo evaluar), nunca con 0', async (_label, args) => {
    const dir = workdir({ 'r.json': OK_REPORT });
    const result = await run(dir, ['r.json', ...args]);
    expect(result.code).toBe(2);
  });

  it('informe inexistente o ilegible: sale con 2', async () => {
    const dir = workdir({ 'roto.json': '{"truncado": [', 'otra-forma.json': '{"a": 1}' });
    expect((await run(dir, ['no-existe.json', '--max-skipped', '9'])).code).toBe(2);
    expect((await run(dir, ['roto.json', '--max-skipped', '9'])).code).toBe(2);
    expect((await run(dir, ['otra-forma.json', '--max-skipped', '9'])).code).toBe(2);
  });

  it('fallos o intermitentes salen con 1 aunque las omitidas quepan', async () => {
    const dir = workdir({
      'falla.json': report(['expected', 'unexpected']),
      'flaky.json': report(['expected', 'flaky']),
      'nada.json': report(['skipped']),
    });
    expect((await run(dir, ['falla.json', '--max-skipped', '9'])).code).toBe(1);
    expect((await run(dir, ['flaky.json', '--max-skipped', '9'])).code).toBe(1);
    expect((await run(dir, ['nada.json', '--max-skipped', '9'])).code).toBe(1);
  });
});
