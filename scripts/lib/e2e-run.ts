/**
 * Piezas comunes de los orquestadores E2E (`scripts/e2e-content.ts`, `scripts/e2e-db.ts`).
 *
 * Cada una existe porque una revisión independiente del CI reprodujo un fallo real:
 *  · `omission`: «no puedo ejecutar la suite» salía con código 0 también en CI, así que un job podía quedar en verde
 *    sin haber probado nada. En CI se OMITE solo en local; en CI es un fallo.
 *  · `pickPort` / `waitForServer`: el puerto era fijo y el servidor se lanzaba con la salida descartada; si el puerto
 *    estaba ocupado, el `next start` propio moría en silencio y las pruebas hablaban con lo que hubiera allí.
 *  · `onTerminate` / `stopGroup`: ante SIGINT/SIGTERM no se paraba el servidor, ni Playwright, ni se borraba la copia de
 *    la app (y una segunda señal mataba la limpieza a medias).
 *  · `runCommand`: el build era síncrono (`spawnSync`): mientras duraba, ni siquiera se podía atender una señal.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Env = Readonly<Record<string, string | undefined>>;

/** `CI` como lo fijan GitHub Actions y casi todos los CI. `false`, `0` y vacío no cuentan. */
export function isCi(env: Env = process.env): boolean {
  const value = env.CI?.toLowerCase();
  return value !== undefined && value !== '' && value !== '0' && value !== 'false';
}

export interface Omission {
  readonly exitCode: 0 | 1;
  readonly message: string;
}

/**
 * Qué hace un orquestador cuando no puede ejecutar su suite. En local se OMITE diciéndolo (código 0: nadie debe
 * necesitar PostgreSQL para trabajar). En CI NO se puede omitir: un verde que no ejecutó nada es peor que un rojo.
 */
export function omission(reason: string, env: Env = process.env): Omission {
  return isCi(env)
    ? { exitCode: 1, message: `\nFALLA (en CI una suite no se puede omitir): ${reason}\n` }
    : { exitCode: 0, message: `\nOMITIDA (no ejecutada, NO es un «pasó»): ${reason}\n` };
}

export function skip(reason: string): never {
  const { exitCode, message } = omission(reason);
  (exitCode === 0 ? console.log : console.error)(message);
  process.exit(exitCode);
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.listen(port, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

/**
 * Puerto del servidor de una suite. Si se pide uno (`E2E_*_PORT`) DEBE estar libre: si no, otro proceso (p. ej. el
 * servidor huérfano de una ejecución interrumpida) respondería en lugar del servidor de la prueba. Sin petición, lo
 * elige el sistema operativo.
 */
export async function pickPort(requested: string | undefined): Promise<number> {
  if (requested !== undefined && requested !== '') {
    const port = Number(requested);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error(`Puerto inválido: «${requested}».`);
    }
    if (!(await isPortFree(port))) {
      throw new Error(
        `El puerto ${String(port)} está ocupado: otro proceso (¿el servidor de una ejecución anterior interrumpida?) ` +
          'respondería en lugar del servidor de la prueba. Libéralo o elige otro puerto.',
      );
    }
    return port;
  }
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

export interface ServerHandle {
  readonly child: ChildProcess;
  /** Últimas líneas de la salida del servidor (para explicar un fallo). */
  tail(lines?: number): string;
  /** Para el grupo de procesos (`next start` lanza `next-server`) y borra el registro. Idempotente. */
  stop(): void;
}

/** Lanza un servidor en su propio grupo de procesos, con su salida en un archivo (no descartada). */
export function startServer(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): ServerHandle {
  const dir = mkdtempSync(join(tmpdir(), 'pi-e2e-server-'));
  const logPath = join(dir, 'server.log');
  const fd = openSync(logPath, 'a');
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  let stopped = false;
  return {
    child,
    tail(lines = 40) {
      try {
        return readFileSync(logPath, 'utf8').split('\n').slice(-lines).join('\n').trim();
      } catch {
        return '(sin salida)';
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      stopGroup(child);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function stopGroup(
  child: ChildProcess | undefined,
  signal: NodeJS.Signals = 'SIGTERM',
): void {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // ya terminó
  }
}

/**
 * Espera a que responda el servidor PROPIO. Si éste termina antes (p. ej. `EADDRINUSE`), falla enseguida con su código
 * y su salida en lugar de seguir esperando o de dar por bueno lo que responda otro proceso.
 */
export async function waitForServer(
  url: string,
  ms: number,
  server: Pick<ServerHandle, 'child' | 'tail'>,
): Promise<void> {
  let exited: string | undefined;
  server.child.once('exit', (code, signal) => {
    exited = code === null ? `señal ${String(signal)}` : `código ${String(code)}`;
  });
  const fail = (): never => {
    throw new Error(
      `El servidor de la prueba terminó antes de responder (${exited ?? '?'}). Su salida:\n${server.tail()}`,
    );
  };
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    let ok = false;
    try {
      ok = (await fetch(url)).ok;
    } catch {
      // aún no responde
    }
    // FUERA del `try` (un `catch` que lo traga todo se llevaría el error). El servidor propio pudo morir mientras se
    // esperaba (p. ej. EADDRINUSE) y estar respondiendo OTRO proceso: eso no se da por bueno.
    if (exited !== undefined) fail();
    if (ok) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `El servidor no respondió en ${String(ms / 1000)} s: ${url}\nSu salida:\n${server.tail()}`,
  );
}

export interface CommandRun {
  readonly child: ChildProcess;
  readonly result: Promise<{ status: number | null; output: string }>;
}

/** Ejecuta un comando de forma ASÍNCRONA (se puede cancelar y no bloquea las señales), con plazo máximo. */
export function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): CommandRun {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const collect = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-20_000);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const result = new Promise<{ status: number | null; output: string }>((resolve) => {
    const timer = setTimeout(() => {
      output += `\n[plazo de ${String(options.timeoutMs / 1000)} s agotado: se detiene]`;
      stopGroup(child);
    }, options.timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ status: null, output: `${output}\n${error.message}` });
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ status: code, output });
    });
  });
  return { child, result };
}

let requestedExit: number | undefined;

/** ¿Llegó una señal de terminación a un guion que registró `onTerminate`? */
export function wasInterrupted(): boolean {
  return requestedExit !== undefined;
}

/**
 * Código de salida de un guion: si lo interrumpió una señal, el convencional (130/143) y NO el 1 de un fallo que es solo
 * consecuencia de la interrupción (el build o Playwright mueren con el grupo y el guion lo contaba como «falló»).
 */
export function exitCodeFor(code: number): number {
  return requestedExit ?? code;
}

/**
 * Registra la limpieza para SIGINT/SIGTERM. Se ejecuta UNA vez aunque lleguen más señales mientras limpia (con
 * `process.once` la segunda señal restauraba la acción por defecto y mataba la limpieza a medias) y después sale con
 * 130/143. Devuelve una función que quita los manejadores.
 */
export function onTerminate(cleanup: () => void | Promise<void>): () => void {
  requestedExit = undefined; // una ejecución nueva
  let running = false;
  const listeners = (
    [
      ['SIGINT', 130],
      ['SIGTERM', 143],
    ] as const
  ).map(([signal, code]) => {
    const listener = () => {
      if (running) return;
      running = true;
      requestedExit = code;
      Promise.resolve()
        .then(cleanup)
        .catch((error: unknown) => {
          console.error(error);
        })
        .finally(() => {
          process.exit(code);
        });
    };
    process.on(signal, listener);
    return [signal, listener] as const;
  });
  return () => {
    for (const [signal, listener] of listeners) process.off(signal, listener);
  };
}

/**
 * Ejecuta `body` con su limpieza registrada para SIGINT/SIGTERM y la garantiza al terminar (bien, mal o interrumpido).
 * El ORDEN importa y por eso vive aquí, una sola vez: primero se ESPERA la limpieza y solo después se sueltan los
 * manejadores. Al revés, una segunda señal (la que reenvía `tsx`, o un segundo Ctrl-C) caía con la acción por defecto
 * y mataba el proceso a mitad de limpiar, dejando clúster, servidor y copia de la app.
 */
export async function withTermination<T>(
  cleanup: () => void | Promise<void>,
  body: () => Promise<T>,
): Promise<T> {
  // La limpieza se ejecuta UNA vez aunque la pidan a la vez una señal y el `finally` (el llamante no tiene que ser idempotente).
  let cleaning: Promise<void> | undefined;
  const once = (): Promise<void> => (cleaning ??= Promise.resolve().then(cleanup));
  const untrack = onTerminate(once);
  try {
    return await body();
  } finally {
    await once();
    untrack();
  }
}

/**
 * Punto de entrada de un guion: sale con el código de `main` o, si lo interrumpió una señal, con el convencional
 * (130/143) y SIN imprimir como error lo que es solo consecuencia de la interrupción (el build o Playwright mueren con
 * el grupo y el guion lo contaba como «falló» con salida 1).
 */
export function exitWith(main: () => Promise<number>): void {
  main().then(
    (code) => {
      process.exit(exitCodeFor(code));
    },
    (error: unknown) => {
      if (!wasInterrupted()) console.error(error);
      process.exit(exitCodeFor(1));
    },
  );
}
