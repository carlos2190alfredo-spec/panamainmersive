import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isCi,
  isPortFree,
  omission,
  pickPort,
  runCommand,
  startServer,
  stopGroup,
  waitForServer,
} from '../../../scripts/lib/e2e-run';

/**
 * Lo que los orquestadores E2E (`scripts/e2e-content.ts`, `scripts/e2e-db.ts`) deben garantizar y no garantizaban:
 * que un «no se puede ejecutar» sea un FALLO en CI (antes salía con 0 y el job quedaba en verde sin probar nada), que
 * el servidor probado sea el SUYO (antes se probaba lo que hubiera en el puerto) y que se limpie ante una señal.
 */
describe('¿estamos en CI?', () => {
  it.each([
    ['true', true],
    ['1', true],
    ['yes', true],
    ['false', false],
    ['0', false],
    ['', false],
    [undefined, false],
  ])('CI=%s → %s', (value, expected) => {
    expect(isCi(value === undefined ? {} : { CI: value })).toBe(expected);
  });
});

describe('omitir una suite que no se puede ejecutar', () => {
  it('en local se OMITE diciéndolo (código 0)', () => {
    const o = omission('no hay PostgreSQL', {});
    expect(o.exitCode).toBe(0);
    expect(o.message).toContain('OMITIDA');
    expect(o.message).toContain('no hay PostgreSQL');
  });

  it('en CI NO se puede omitir: es un fallo (código 1) que dice por qué', () => {
    const o = omission('no hay PostgreSQL', { CI: 'true' });
    expect(o.exitCode).toBe(1);
    expect(o.message).toContain('FALLA');
    expect(o.message).toContain('no hay PostgreSQL');
    expect(o.message).not.toContain('OMITIDA');
  });
});

describe('puerto del servidor de la prueba', () => {
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  });
  const occupy = (): Promise<number> =>
    new Promise((resolve) => {
      const s = createServer();
      servers.push(s);
      s.listen(0, () => {
        const a = s.address();
        resolve(typeof a === 'object' && a ? a.port : 0);
      });
    });

  it('sin puerto pedido, elige uno LIBRE', async () => {
    const port = await pickPort(undefined);
    expect(port).toBeGreaterThan(1023);
    expect(await isPortFree(port)).toBe(true);
  });

  it('un puerto pedido y ocupado se rechaza (otro proceso respondería en lugar del servidor de la prueba)', async () => {
    const busy = await occupy();
    expect(await isPortFree(busy)).toBe(false);
    await expect(pickPort(String(busy))).rejects.toThrow(/ocupado/);
  });

  it('un puerto pedido y libre se acepta; uno inválido se rechaza', async () => {
    const free = await pickPort(undefined);
    expect(await pickPort(String(free))).toBe(free);
    for (const bad of ['abc', '0', '70000', '-1', '3.5']) {
      await expect(pickPort(bad), bad).rejects.toThrow(/inválido/);
    }
  });
});

describe('esperar al servidor PROPIO', () => {
  it('si el servidor termina antes de responder, falla enseguida con su código y su salida (no espera el plazo)', async () => {
    const server = startServer(
      process.execPath,
      ['-e', "console.error('boom EADDRINUSE'); process.exit(3)"],
      {
        cwd: process.cwd(),
        env: process.env,
      },
    );
    try {
      const started = Date.now();
      await expect(waitForServer('http://localhost:9/', 3000, server)).rejects.toThrow(
        /terminó antes de responder \(código 3\)[\s\S]*boom EADDRINUSE/,
      );
      expect(Date.now() - started).toBeLessThan(2000); // no espera el plazo (3 s)
    } finally {
      server.stop();
    }
  });

  it('si un servidor AJENO responde mientras el propio ya murió (EADDRINUSE), falla: no da por bueno lo que responda otro', async () => {
    const foreign = createHttpServer((_req, res) => {
      setTimeout(() => res.end('ok'), 800); // responde DESPUÉS de que el propio muera
    });
    await new Promise<void>((resolve) => foreign.listen(0, resolve));
    const port = (foreign.address() as AddressInfo).port;
    const own = startServer(process.execPath, ['-e', 'setTimeout(() => process.exit(3), 250)'], {
      cwd: process.cwd(),
      env: process.env,
    });
    try {
      await expect(waitForServer(`http://localhost:${String(port)}/`, 10_000, own)).rejects.toThrow(
        /terminó antes de responder \(código 3\)/,
      );
    } finally {
      own.stop();
      foreign.closeAllConnections();
      await new Promise((resolve) => foreign.close(resolve));
    }
  });

  it('si responde, termina; y si no responde en el plazo, falla con su salida', async () => {
    const port = await pickPort(undefined);
    const listening = startServer(
      process.execPath,
      [
        '-e',
        `require('http').createServer((q,r)=>r.end('ok')).listen(${String(port)}); console.log('arriba')`,
      ],
      { cwd: process.cwd(), env: process.env },
    );
    try {
      await waitForServer(`http://localhost:${String(port)}/`, 10_000, listening);
    } finally {
      listening.stop();
    }
    const silent = startServer(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      cwd: process.cwd(),
      env: process.env,
    });
    try {
      await expect(waitForServer('http://localhost:9/', 1200, silent)).rejects.toThrow(
        /no respondió en/,
      );
    } finally {
      silent.stop();
    }
  });
});

describe('detener procesos', () => {
  /** Un proceso muerto cuyo padre no lo recoge queda como zombi (`Z`) y `kill(pid, 0)` aún da éxito. */
  const alive = (pid: number): boolean => {
    try {
      return readFileSync(`/proc/${String(pid)}/stat`, 'utf8').split(') ')[1]?.[0] !== 'Z';
    } catch {
      return false;
    }
  };

  it('stop() detiene también a los NIETOS (next start lanza next-server): al grupo, no solo al líder', async () => {
    const script =
      "const { spawn } = require('node:child_process');" +
      "const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });" +
      "console.log('nieto ' + c.pid); setInterval(() => {}, 1000);";
    const server = startServer(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      env: process.env,
    });
    let grandchild = 0;
    try {
      for (let i = 0; i < 50 && grandchild === 0; i++) {
        const match = /nieto (\d+)/.exec(server.tail());
        if (match?.[1]) grandchild = Number(match[1]);
        else await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(grandchild, 'el servidor lanzó un nieto').toBeGreaterThan(0);
      expect(alive(grandchild)).toBe(true);
      server.stop();
      for (let i = 0; i < 30 && alive(grandchild); i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(alive(grandchild), 'el nieto sigue vivo tras stop()').toBe(false);
    } finally {
      server.stop();
      if (grandchild > 0) {
        try {
          process.kill(grandchild, 'SIGKILL');
        } catch {
          // ya terminó
        }
      }
    }
  });

  it('runCommand devuelve el código y la salida de un comando que termina', async () => {
    const run = runCommand(
      process.execPath,
      ['-e', "console.log('hola'); console.error('adiós'); process.exit(4)"],
      { cwd: process.cwd(), env: process.env, timeoutMs: 10_000 },
    );
    const result = await run.result;
    expect(result.status).toBe(4);
    expect(result.output).toContain('hola');
    expect(result.output).toContain('adiós');
  });

  it('runCommand detiene el comando al agotar el plazo y lo dice (el build no se queda colgado)', async () => {
    const run = runCommand(
      process.execPath,
      ['-e', "console.log('empieza'); setInterval(() => {}, 1000)"],
      { cwd: process.cwd(), env: process.env, timeoutMs: 400 },
    );
    try {
      const outcome = await Promise.race([
        run.result,
        new Promise<'colgado'>((resolve) => setTimeout(() => resolve('colgado'), 4000)),
      ]);
      if (outcome === 'colgado') throw new Error('el comando no se detuvo al agotarse el plazo');
      expect(outcome.status).toBeNull(); // terminado por una señal
      expect(outcome.output).toContain('empieza');
      expect(outcome.output).toMatch(/plazo de 0\.4 s agotado/);
    } finally {
      stopGroup(run.child, 'SIGKILL');
    }
  });
});

describe('limpieza ante una señal', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  async function run(signals: string[]) {
    const dir = mkdtempSync(join(tmpdir(), 'pi-terminate-'));
    dirs.push(dir);
    const marks = join(dir, 'marks.txt');
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'tests/unit/scripts/fixtures/terminate-fixture.ts', marks],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'inherit'] },
    );
    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('listo')) resolve();
      });
      child.once('error', reject);
      child.once('exit', () => reject(new Error('el hijo terminó antes de estar listo')));
    });
    const exited = new Promise<number | null>((resolve) =>
      child.once('exit', (code) => resolve(code)),
    );
    for (const signal of signals) {
      child.kill(signal as NodeJS.Signals);
      await new Promise((r) => setTimeout(r, 40));
    }
    const code = await exited;
    return { code, marks: existsSync(marks) ? readFileSync(marks, 'utf8') : '' };
  }

  it('SIGTERM: ejecuta la limpieza (también la asíncrona) y sale con 143', async () => {
    const { code, marks } = await run(['SIGTERM']);
    expect(marks).toBe('inicio\nlimpieza\n');
    expect(code).toBe(143);
  });

  it('SIGINT: la ejecuta y sale con 130', async () => {
    const { code, marks } = await run(['SIGINT']);
    expect(marks).toBe('inicio\nlimpieza\n');
    expect(code).toBe(130);
  });

  it('una segunda señal mientras limpia NO la interrumpe ni la repite (antes mataba el proceso a medias)', async () => {
    const { code, marks } = await run(['SIGINT', 'SIGINT', 'SIGTERM']);
    // Un solo `inicio`: con la guardia quitada cada señal arrancaba otra limpieza (3 inicios).
    expect(marks).toBe('inicio\nlimpieza\n');
    expect(code).toBe(130);
  });
});
