import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { findBinDir } from './pg-cluster';

const run = promisify(execFile);

interface Failure {
  code: number;
  stderr: string;
}

/**
 * `pnpm perf:db` siembra por SQL con los disparadores desactivados: si cambia el esquema (una columna nueva obligatoria,
 * una restricción), deja de poder sembrar y nadie se entera hasta la próxima medición. Esta prueba lo ejecuta de punta a
 * punta con la escala mínima. NO comprueba tiempos (dependen de la máquina): comprueba que el banco mide lo que dice
 * medir (sus propias autocomprobaciones: recuentos, disparadores realmente desactivados, filas realmente escritas).
 */
describe('banco de medición de la base de datos (perf:db)', () => {
  const temps: string[] = [];
  afterAll(() => {
    for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tempDir = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'pi-dbcost-test-'));
    temps.push(d);
    return d;
  };
  const bench = (args: string[], env: NodeJS.ProcessEnv = process.env) =>
    run(process.execPath, ['--import', 'tsx', 'scripts/perf/db-cost.ts', ...args], {
      cwd: process.cwd(),
      env,
      timeout: 170_000,
    });
  const failure = async (promise: Promise<unknown>): Promise<Failure> => {
    try {
      await promise;
    } catch (error) {
      const e = error as { code?: number; stderr?: string };
      return { code: e.code ?? -1, stderr: e.stderr ?? '' };
    }
    throw new Error('Se esperaba que el banco fallara y terminó bien');
  };

  it('se ejecuta de punta a punta con la escala mínima y mide lo que dice medir', async () => {
    const out = join(tempDir(), 'informe.json');
    await bench(['--smoke', '--json', out]);
    expect(existsSync(out)).toBe(true);
    const report = JSON.parse(readFileSync(out, 'utf8')) as {
      environment: {
        relaxedCluster: { fsync: string };
        durableCluster: { fsync: string; synchronous_commit: string };
      };
      results: {
        scale: number;
        info: { visible: number; published: number };
        export: { queries: { query: string; rows: number }[] };
        reads: { name: string; rows: number; rlsPlan: { scans: string[] } }[];
        writes: { variant: string; operation: string }[];
        contention: { scenario: string; transactions: number }[];
      }[];
      durable: { contention: { transactions: number }[] }[];
    };

    // Dos clústeres, y de verdad distintos (un modo «durable» que no lo fuera daría números durables falsos).
    expect(report.environment.relaxedCluster.fsync).toBe('off');
    expect(report.environment.durableCluster).toMatchObject({
      fsync: 'on',
      synchronous_commit: 'on',
    });

    const [result] = report.results;
    expect(report.results).toHaveLength(1);
    expect(result?.scale).toBe(30);
    // 30 destinos, 27 publicados; el registro de campos de una localidad (7 hoy) multiplica lo que ve el público.
    expect(result?.info.published).toBe(27);
    expect(result?.info.visible).toBeGreaterThan(0);
    // El exportador REAL lanzó sus cuatro consultas y la primera leyó todo lo público.
    expect(result?.export.queries.map((q) => q.query)).toEqual([
      'assertions',
      'evidence',
      'translations',
      'notices',
    ]);
    expect(result?.export.queries[0]?.rows).toBe(result?.info.visible);
    // Las seis lecturas, cada una con su plan.
    expect(result?.reads).toHaveLength(6);
    for (const read of result?.reads ?? []) expect(read.rlsPlan.scans.length).toBeGreaterThan(0);
    // Escritura: las tres variantes de disparadores (la verificación solo en las dos primeras).
    expect(new Set(result?.writes.map((w) => w.variant))).toEqual(
      new Set(['completo', 'sin serialización', 'sin serialización ni auditoría']),
    );
    // Contención: los cuatro escenarios procesaron transacciones, en los dos modos.
    expect(result?.contention).toHaveLength(4);
    for (const c of result?.contention ?? []) expect(c.transactions).toBeGreaterThan(0);
    expect(report.durable).toHaveLength(1);
    for (const c of report.durable[0]?.contention ?? []) expect(c.transactions).toBeGreaterThan(0);
  }, 180_000);

  it('rechaza lo que no entiende (código 1) antes de arrancar nada', async () => {
    for (const args of [['--rapido'], ['--scales', '5'], ['--scales', '30,x'], ['--runs', '0']]) {
      const f = await failure(bench(args));
      expect(f.code, args.join(' ')).toBe(1);
      expect(f.stderr).toContain('Medición inválida');
    }
  });

  it('sin pgbench no se puede medir: código 2 (no un «éxito» vacío)', async () => {
    const dir = tempDir();
    // Solo `initdb` (para que haya un PostgreSQL «utilizable») y nada más.
    symlinkSync(join(findBinDir(), 'initdb'), join(dir, 'initdb'));
    const f = await failure(bench(['--smoke'], { ...process.env, PI_PG_BIN_DIR: dir }));
    expect(f.code).toBe(2);
    expect(f.stderr).toContain('pgbench');
  });
});
