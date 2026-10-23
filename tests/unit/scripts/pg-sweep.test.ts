import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sweepStaleClusters } from '../../integration/pg-cluster';

/**
 * Un proceso puede morir de verdad (SIGKILL, falta de memoria, corte) y dejar un clúster temporal: una incidencia real
 * dejó 32 PostgreSQL huérfanos y 2,3 GB en /tmp. Cada arranque barre los restos ANTIGUOS, sin tocar nunca un clúster
 * reciente (otra ejecución en curso) ni matar un proceso ajeno por reutilización de pid.
 */
const MINUTE = 60_000;
const NOW = Date.now();

describe('barrida de clústeres temporales huérfanos', () => {
  const roots: string[] = [];
  const children: ChildProcess[] = [];
  afterEach(() => {
    for (const c of children.splice(0)) c.kill('SIGKILL');
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });

  function root() {
    const r = mkdtempSync(join(tmpdir(), 'pi-sweep-root-'));
    roots.push(r);
    return r;
  }
  /** Un directorio `pi-pg-*` con antigüedad y, opcionalmente, un `postmaster.pid`. */
  function cluster(r: string, name: string, ageMs: number, pid?: number) {
    const dir = join(r, name);
    mkdirSync(join(dir, 'data'), { recursive: true });
    if (pid !== undefined)
      writeFileSync(join(dir, 'data', 'postmaster.pid'), `${String(pid)}\n/x\n`);
    const when = new Date(NOW - ageMs);
    utimesSync(dir, when, when);
    return dir;
  }
  /** Un proceso vivo cuya línea de órdenes contiene la ruta del clúster (como `postgres -D <dir>/data`). */
  function fakePostgres(dir: string): ChildProcess {
    const child = spawn(
      process.execPath,
      ['-e', 'setInterval(()=>{},1000)', '--', join(dir, 'data')],
      {
        stdio: 'ignore',
      },
    );
    children.push(child);
    return child;
  }
  const exited = (child: ChildProcess) =>
    new Promise<boolean>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve(true);
      const timer = setTimeout(() => {
        resolve(false);
      }, 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

  it('NO toca un clúster reciente (otra ejecución puede estar usándolo)', () => {
    const r = root();
    const dir = cluster(r, 'pi-pg-young', 2 * MINUTE);
    expect(sweepStaleClusters({ root: r, now: NOW })).toEqual([]);
    expect(existsSync(dir)).toBe(true);
  });

  it('borra uno antiguo sin postmaster.pid, o con el de un proceso que ya no existe', () => {
    const r = root();
    const a = cluster(r, 'pi-pg-nopid', 30 * MINUTE);
    const b = cluster(r, 'pi-pg-deadpid', 30 * MINUTE, 2_147_483_000);
    expect(sweepStaleClusters({ root: r, now: NOW }).sort()).toEqual([
      'pi-pg-deadpid',
      'pi-pg-nopid',
    ]);
    expect(existsSync(a) || existsSync(b)).toBe(false);
  });

  it('un pid vivo que NO es de ese clúster (pid reutilizado) no se mata: solo se borra el directorio', () => {
    const r = root();
    const dir = cluster(r, 'pi-pg-reused', 30 * MINUTE, process.pid); // el pid de esta prueba: vivo y ajeno
    expect(sweepStaleClusters({ root: r, now: NOW, staleRunningMs: 10 * MINUTE })).toEqual([
      'pi-pg-reused',
    ]);
    expect(existsSync(dir)).toBe(false);
    expect(() => process.kill(process.pid, 0)).not.toThrow(); // seguimos vivos
  });

  it('uno antiguo cuyo PostgreSQL SIGUE vivo y es suyo: se detiene y se borra solo pasado el plazo largo', async () => {
    const r = root();
    const dir = join(r, 'pi-pg-running');
    cluster(r, 'pi-pg-running', 30 * MINUTE);
    const child = fakePostgres(dir);
    writeFileSync(join(dir, 'data', 'postmaster.pid'), `${String(child.pid)}\n/x\n`);
    // antiguo pero por debajo del plazo largo: podría ser una ejecución lenta → se respeta
    expect(sweepStaleClusters({ root: r, now: NOW, staleRunningMs: 60 * MINUTE })).toEqual([]);
    expect(existsSync(dir)).toBe(true);
    expect(await exited(child)).toBe(false);
    // pasado el plazo largo: huérfano
    expect(sweepStaleClusters({ root: r, now: NOW, staleRunningMs: 20 * MINUTE })).toEqual([
      'pi-pg-running',
    ]);
    expect(await exited(child)).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it('ignora lo que no es suyo y barre también los registros de servidor antiguos', () => {
    const r = root();
    const other = cluster(r, 'otra-cosa', 90 * MINUTE);
    const oldLog = join(r, 'pi-e2e-server-old');
    const youngLog = join(r, 'pi-e2e-server-young');
    for (const [dir, age] of [
      [oldLog, 90 * MINUTE],
      [youngLog, MINUTE],
    ] as const) {
      mkdirSync(dir);
      const when = new Date(NOW - age);
      utimesSync(dir, when, when);
    }
    expect(sweepStaleClusters({ root: r, now: NOW })).toEqual(['pi-e2e-server-old']);
    expect(existsSync(other)).toBe(true);
    expect(existsSync(youngLog)).toBe(true);
  });
});
