import { spawn, type ChildProcess } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

/**
 * Ctrl-C MIENTRAS ARRANCA el clúster temporal (T-14). Mientras `startTestCluster` arranca no hay manejador de señales
 * de nadie y `execFileSync` bloquea el bucle de eventos: un Ctrl-C en ese intervalo mataba el proceso con la acción por
 * defecto y dejaba el directorio `pi-pg-*` (y a veces el PostgreSQL). Se reprodujo a mano; aquí es DETERMINISTA: un
 * `initdb` falso (y, como root, un `id` falso) se queda esperando y avisa, de modo que la señal llega siempre en el
 * punto exacto, no por casualidad de tiempos.
 */
describe('Ctrl-C durante el arranque del clúster temporal', () => {
  const sandboxes: string[] = [];
  const running: ChildProcess[] = [];
  afterEach(() => {
    for (const child of running.splice(0)) {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        // ya terminó
      }
    }
  });
  afterAll(() => {
    for (const d of sandboxes.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function sandbox(): string {
    const dir = mkdtempSync(join(tmpdir(), 'pi-startup-signals-'));
    chmodSync(dir, 0o755); // como root, el usuario `postgres` debe poder atravesarlo
    sandboxes.push(dir);
    return dir;
  }

  /** Directorio del aviso: lo escribe el programa falso como el usuario `postgres` (vía `runuser`), así que debe ser escribible. */
  function markerDir(): string {
    const dir = sandbox();
    chmodSync(dir, 0o777);
    return dir;
  }

  /** Un ejecutable falso que avisa (escribe su pid) y se queda esperando, o falla al instante. */
  function fake(dir: string, name: string, body: string): string {
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o755);
    const path = join(dir, name);
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
    return dir;
  }

  const waits = (marker: string) => `echo "$$" > "${marker}"\nexec sleep 60`;

  function launch(tmp: string, env: Record<string, string>, arg?: 'default') {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'tests/integration/fixtures/cluster-fixture.ts', ...(arg ? [arg] : [])],
      {
        cwd: process.cwd(),
        env: { ...process.env, TMPDIR: tmp, ...env },
        detached: true, // su propio grupo, como el primer plano de una terminal
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    running.push(child);
    let output = '';
    child.stdout?.on('data', (c: Buffer) => (output += c.toString()));
    child.stderr?.on('data', (c: Buffer) => (output += c.toString()));
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
      child.once('exit', (code, signal) => resolve({ code, signal })),
    );
    return { child, output: () => output, exited };
  }

  async function until(condition: () => boolean, what: string, output: () => string, ms = 30_000) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`no ocurrió «${what}» en ${String(ms / 1000)} s:\n${output()}`);
  }

  const clusterDirs = (tmp: string) => readdirSync(tmp).filter((n) => n.startsWith('pi-pg-'));

  async function interruptAt(
    marker: string,
    env: (tmp: string) => Record<string, string>,
    arg?: 'default',
  ) {
    const tmp = sandbox();
    const run = launch(tmp, env(tmp), arg);
    await until(() => existsSync(marker), 'el programa falso avisa', run.output);
    expect(clusterDirs(tmp).length).toBe(1); // el directorio ya existe: hay algo que perder
    process.kill(-(run.child.pid as number), 'SIGINT'); // al grupo entero, como una terminal
    const result = await Promise.race([
      run.exited,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`no terminó:\n${run.output()}`)), 30_000),
      ),
    ]);
    return { tmp, result, output: run.output() };
  }

  it('durante `initdb`: sale con 130 y NO deja el directorio (opciones de los orquestadores)', async () => {
    const marker = join(markerDir(), 'initdb.pid');
    const { tmp, result, output } = await interruptAt(marker, (t) => ({
      PI_PG_BIN_DIR: fake(join(t, 'bin'), 'initdb', waits(marker)),
    }));
    expect(result.code, output).toBe(130);
    expect(clusterDirs(tmp)).toEqual([]);
  }, 60_000);

  it('durante `initdb`, con las opciones POR DEFECTO (el globalSetup de Vitest): igual', async () => {
    const marker = join(markerDir(), 'initdb.pid');
    const { tmp, result, output } = await interruptAt(
      marker,
      (t) => ({ PI_PG_BIN_DIR: fake(join(t, 'bin'), 'initdb', waits(marker)) }),
      'default',
    );
    expect(result.code, output).toBe(130);
    expect(clusterDirs(tmp)).toEqual([]);
  }, 60_000);

  it.runIf(process.getuid?.() === 0)(
    'como root, durante el `id` del `chown` (antes del `initdb`): tampoco deja el directorio',
    async () => {
      const marker = join(markerDir(), 'id.pid');
      const { tmp, result, output } = await interruptAt(marker, (t) => ({
        PI_PG_BIN_DIR: fake(join(t, 'bin'), 'initdb', 'exit 0'),
        PATH: `${fake(join(t, 'fakepath'), 'id', waits(marker))}:${process.env.PATH ?? ''}`,
      }));
      expect(result.code, output).toBe(130);
      expect(clusterDirs(tmp)).toEqual([]);
    },
    60_000,
  );

  it('un `initdb` que FALLA por su cuenta limpia el directorio y propaga el error (no se confunde con una interrupción)', async () => {
    const tmp = sandbox();
    const run = launch(tmp, {
      PI_PG_BIN_DIR: fake(join(tmp, 'bin'), 'initdb', 'echo "initdb roto" >&2\nexit 3'),
    });
    const result = await run.exited;
    expect(result.code).toBe(1);
    expect(run.output()).toContain('initdb');
    expect(clusterDirs(tmp)).toEqual([]);
  }, 60_000);

  it('la prueba mide algo: el programa falso dejó su aviso con un pid real', async () => {
    const marker = join(markerDir(), 'initdb.pid');
    await interruptAt(marker, (t) => ({
      PI_PG_BIN_DIR: fake(join(t, 'bin'), 'initdb', waits(marker)),
    }));
    expect(Number(readFileSync(marker, 'utf8').trim())).toBeGreaterThan(1);
  }, 60_000);
});
