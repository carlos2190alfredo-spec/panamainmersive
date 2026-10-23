import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Ctrl-C sobre un orquestador con un clúster levantado. Una terminal manda SIGINT a TODO el grupo de procesos y
 * envoltorios como `tsx` reenvían una segunda señal; una limpieza que bloquea el bucle de eventos (o un `process.once`)
 * dejaba el directorio y a veces el PostgreSQL vivos. Con una revisión independiente se reprodujo 3 de 3 veces.
 * La prueba usa un TMPDIR propio, así que no se confunde con los clústeres de otras pruebas en paralelo.
 */
describe('limpieza del clúster ante señales', () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  async function interrupt(signals: NodeJS.Signals[], gapMs: number) {
    const sandbox = mkdtempSync(join(tmpdir(), 'pi-signals-'));
    temps.push(sandbox);
    chmodSync(sandbox, 0o755); // como root, el usuario `postgres` debe poder atravesar el directorio
    const child = spawn(
      'setsid', // su propio grupo de procesos, como el primer plano de una terminal
      [process.execPath, '--import', 'tsx', 'tests/integration/fixtures/cluster-fixture.ts'],
      {
        cwd: process.cwd(),
        env: { ...process.env, TMPDIR: sandbox },
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    );
    const clusterDir = await new Promise<string>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        const match = /listo (\S+)/.exec(chunk.toString());
        if (match?.[1]) resolve(match[1]);
      });
      child.once('error', reject);
      child.once('exit', () => reject(new Error('el hijo terminó antes de estar listo')));
    });
    const pid = Number(
      readFileSync(join(clusterDir, 'data', 'postmaster.pid'), 'utf8').split('\n')[0],
    );
    const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
    for (const signal of signals) {
      process.kill(-(child.pid as number), signal); // al grupo entero
      await new Promise((r) => setTimeout(r, gapMs));
    }
    await exited;
    // el PostgreSQL termina un instante después de que `pg_ctl stop` vuelva
    for (let i = 0; i < 30; i++) {
      try {
        process.kill(pid, 0);
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const alive = (() => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    })();
    return {
      clusterDir,
      alive,
      leftovers: readdirSync(sandbox).filter((n) => n.startsWith('pi-pg-')),
    };
  }

  it('una señal (Ctrl-C): se para PostgreSQL y se borra el directorio', async () => {
    const { clusterDir, alive, leftovers } = await interrupt(['SIGINT'], 0);
    expect(existsSync(clusterDir)).toBe(false);
    expect(leftovers).toEqual([]);
    expect(alive).toBe(false);
  }, 60_000);

  it('una señal DOBLE (la terminal y su envoltorio): tampoco queda nada', async () => {
    const { clusterDir, alive, leftovers } = await interrupt(['SIGINT', 'SIGINT', 'SIGTERM'], 15);
    expect(existsSync(clusterDir)).toBe(false);
    expect(leftovers).toEqual([]);
    expect(alive).toBe(false);
  }, 60_000);
});
