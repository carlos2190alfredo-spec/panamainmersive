import { spawn, type ChildProcess } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
} from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

/**
 * Los guiones completos `scripts/e2e-content.ts` y `scripts/e2e-db.ts`, de punta a punta (T-14). Cada pieza de
 * `e2e-run.ts` y `pg-cluster.ts` tiene sus pruebas; lo que no tenía era el GUION: qué código de salida da y qué deja
 * detrás cuando falta PostgreSQL, cuando el puerto está ocupado o cuando llega Ctrl-C. Se comprobó a mano («8/8»); aquí
 * se automatiza. Cada ejecución usa un `TMPDIR` propio, así que sus clústeres no se confunden con los de otras pruebas.
 */
const ROOT = process.cwd();
const APP_COPY = join(ROOT, '.e2e-content-app');
const SCRIPTS = [
  ['e2e-content', 'scripts/e2e-content.ts', 'E2E_CONTENT_PORT'],
  ['e2e-db', 'scripts/e2e-db.ts', 'E2E_DB_PORT'],
] as const;

interface Outcome {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly output: string;
}

interface Running {
  readonly child: ChildProcess;
  readonly output: () => string;
  readonly exited: Promise<Outcome>;
}

describe('guiones de orquestación E2E (T-14)', () => {
  const sandboxes: string[] = [];
  const servers: Server[] = [];
  const running: ChildProcess[] = [];
  afterEach(async () => {
    for (const child of running.splice(0)) {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        // ya terminó
      }
    }
    await Promise.all(
      servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
    );
  });
  afterAll(() => {
    for (const d of sandboxes.splice(0)) rmSync(d, { recursive: true, force: true });
    rmSync(APP_COPY, { recursive: true, force: true });
  });

  function sandbox(): string {
    const dir = mkdtempSync(join(tmpdir(), 'pi-e2e-scripts-'));
    chmodSync(dir, 0o755); // como root, el usuario `postgres` debe poder atravesarlo
    sandboxes.push(dir);
    return dir;
  }

  /** Entorno LIMPIO: sin `CI` ni las variables de los guiones salvo que se pidan (esta prueba puede correr en CI). */
  function envFor(tmp: string, over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: tmp };
    for (const key of ['CI', 'E2E_CONTENT_PORT', 'E2E_DB_PORT', 'PI_PG_BIN_DIR']) delete env[key];
    for (const [key, value] of Object.entries(over)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
    return env;
  }

  /** `--import tsx`, nunca el CLI `tsx` (CLAUDE.md, E-66); en su propio grupo, como el primer plano de una terminal. */
  function launch(script: string, env: NodeJS.ProcessEnv): Running {
    const child = spawn(process.execPath, ['--import', 'tsx', script], {
      cwd: ROOT,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    running.push(child);
    let text = '';
    child.stdout?.on('data', (chunk: Buffer) => (text += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (text += chunk.toString()));
    const exited = new Promise<Outcome>((resolve) => {
      child.once('exit', (code, signal) => resolve({ code, signal, output: text }));
    });
    return { child, output: () => text, exited };
  }

  const finish = (r: Running, ms = 90_000): Promise<Outcome> =>
    Promise.race([
      r.exited,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`el guion no terminó en ${String(ms / 1000)} s:\n${r.output()}`)),
          ms,
        ),
      ),
    ]);

  const until = async (condition: () => boolean, ms: number, what: string, r: Running) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`no ocurrió «${what}» en ${String(ms / 1000)} s:\n${r.output()}`);
  };

  const clusterDirs = (tmp: string): string[] =>
    readdirSync(tmp).filter((n) => n.startsWith('pi-pg-') || n.startsWith('pi-e2e-server-'));

  /** Procesos VIVOS (no zombis: PID 1 no los recoge) que viven en el sandbox o en la copia de la app. */
  function liveProcesses(tmp: string): string[] {
    const found: string[] = [];
    for (const name of readdirSync('/proc')) {
      if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
      try {
        const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
        if (stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) === 'Z') continue;
        const cmd = readFileSync(`/proc/${name}/cmdline`, 'utf8').replaceAll('\0', ' ');
        let cwd = '';
        try {
          cwd = readlinkSync(`/proc/${name}/cwd`);
        } catch {
          // sin permiso o ya terminó
        }
        if (cmd.includes(tmp) || cwd.includes('.e2e-content-app'))
          found.push(`${name}: ${cmd.slice(0, 120)}`);
      } catch {
        // el proceso terminó mientras se leía
      }
    }
    return found;
  }

  function occupyPort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      servers.push(server);
      server.once('error', reject);
      server.listen(0, () => {
        const address = server.address();
        resolve(typeof address === 'object' && address ? address.port : 0);
      });
    });
  }

  describe.each(SCRIPTS)('%s', (_name, script, portVar) => {
    it('un puerto pedido y ocupado se dice ENSEGUIDA, nombrándolo, y no se levanta nada', async () => {
      const tmp = sandbox();
      const port = await occupyPort();
      const r = await finish(launch(script, envFor(tmp, { [portVar]: String(port) })), 60_000);
      expect(r.code).toBe(1);
      expect(r.output).toContain(`El puerto ${String(port)} está ocupado`);
      expect(clusterDirs(tmp)).toEqual([]);
      expect(existsSync(APP_COPY)).toBe(false);
    }, 90_000);

    it('un puerto inválido se rechaza con su motivo', async () => {
      const r = await finish(launch(script, envFor(sandbox(), { [portVar]: '99999' })), 60_000);
      expect(r.code).toBe(1);
      expect(r.output).toContain('Puerto inválido');
    }, 90_000);

    it('sin PostgreSQL utilizable: en LOCAL se OMITE diciéndolo (0, nunca «pasó»); en CI es un FALLO (1)', async () => {
      const empty = join(sandbox(), 'sin-postgres');
      mkdirSync(empty);
      const local = await finish(
        launch(script, envFor(sandbox(), { PI_PG_BIN_DIR: empty })),
        90_000,
      );
      expect(local.code).toBe(0);
      expect(local.output).toContain('OMITIDA');
      expect(local.output).toContain('NO es un «pasó»');
      // El motivo se dice (en e2e-db puede ser otro requisito antes que PostgreSQL: el contrato es el mismo)
      expect(local.output).toMatch(/PostgreSQL|falta/);

      const ci = await finish(
        launch(script, envFor(sandbox(), { PI_PG_BIN_DIR: empty, CI: 'true' })),
        90_000,
      );
      expect(ci.code).toBe(1);
      expect(ci.output).toContain('FALLA (en CI una suite no se puede omitir)');
      expect(ci.output).not.toContain('OMITIDA');
    }, 200_000);
  });

  it('e2e-content sin PostgreSQL dice precisamente que falta PostgreSQL (y no deja copia de la app)', async () => {
    const empty = join(sandbox(), 'sin-postgres');
    mkdirSync(empty);
    const r = await finish(
      launch('scripts/e2e-content.ts', envFor(sandbox(), { PI_PG_BIN_DIR: empty })),
    );
    expect(r.output).toContain('no hay PostgreSQL+PostGIS utilizable');
    expect(r.output).toContain('PI_PG_BIN_DIR');
    expect(existsSync(APP_COPY)).toBe(false);
  }, 100_000);

  describe('Ctrl-C a e2e-content: no queda NADA detrás', () => {
    const noLeftovers = async (tmp: string, outcome: Outcome) => {
      // PostgreSQL termina un instante después de que `pg_ctl stop` vuelva
      for (let i = 0; i < 40 && liveProcesses(tmp).length > 0; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(clusterDirs(tmp), `salida: ${outcome.output}`).toEqual([]);
      expect(existsSync(APP_COPY)).toBe(false);
      expect(liveProcesses(tmp)).toEqual([]);
    };
    const interrupt = (r: Running, signals: NodeJS.Signals[], gapMs: number) =>
      (async () => {
        for (const signal of signals) {
          process.kill(-(r.child.pid as number), signal); // al grupo entero, como una terminal
          await new Promise((resolve) => setTimeout(resolve, gapMs));
        }
      })();

    it('durante el ARRANQUE del clúster (el directorio acaba de aparecer; aún no hay manejadores)', async () => {
      const tmp = sandbox();
      const r = launch('scripts/e2e-content.ts', envFor(tmp));
      await until(
        () => readdirSync(tmp).some((n) => n.startsWith('pi-pg-')),
        60_000,
        'aparece el clúster',
        r,
      );
      await interrupt(r, ['SIGINT'], 0);
      const outcome = await finish(r, 60_000);
      expect(outcome.code === 130 || outcome.signal === 'SIGINT').toBe(true);
      await noLeftovers(tmp, outcome);
    }, 120_000);

    it('durante el BUILD de la copia: sale con 130 y se borra todo (copia, clúster, procesos)', async () => {
      const tmp = sandbox();
      const r = launch('scripts/e2e-content.ts', envFor(tmp));
      await until(
        () => r.output().includes('Construyendo la copia'),
        90_000,
        'empieza el build',
        r,
      );
      expect(existsSync(APP_COPY)).toBe(true); // hay algo que borrar: la prueba mide algo
      await interrupt(r, ['SIGINT'], 0);
      const outcome = await finish(r, 60_000);
      expect(outcome.code).toBe(130);
      await noLeftovers(tmp, outcome);
    }, 180_000);

    it('con una señal DOBLE (la terminal y su envoltorio) durante el build: tampoco queda nada', async () => {
      const tmp = sandbox();
      const r = launch('scripts/e2e-content.ts', envFor(tmp));
      await until(
        () => r.output().includes('Construyendo la copia'),
        90_000,
        'empieza el build',
        r,
      );
      await interrupt(r, ['SIGINT', 'SIGINT', 'SIGTERM'], 15);
      const outcome = await finish(r, 60_000);
      expect(outcome.code).toBe(130);
      await noLeftovers(tmp, outcome);
    }, 180_000);
  });
});
