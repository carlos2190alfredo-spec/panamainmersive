import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isCi,
  isPortFree,
  omission,
  pickPort,
  startServer,
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
      await expect(waitForServer('http://localhost:9/', 20_000, server)).rejects.toThrow(
        /terminó antes de responder \(código 3\)[\s\S]*boom EADDRINUSE/,
      );
      expect(Date.now() - started).toBeLessThan(5000);
    } finally {
      server.stop();
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
    expect(marks).toBe('limpieza\n');
    expect(code).toBe(143);
  });

  it('SIGINT: la ejecuta y sale con 130', async () => {
    const { code, marks } = await run(['SIGINT']);
    expect(marks).toBe('limpieza\n');
    expect(code).toBe(130);
  });

  it('una segunda señal mientras limpia NO la interrumpe ni la repite (antes mataba el proceso a medias)', async () => {
    const { code, marks } = await run(['SIGINT', 'SIGINT', 'SIGTERM']);
    expect(marks).toBe('limpieza\n');
    expect(code).toBe(130);
  });
});
