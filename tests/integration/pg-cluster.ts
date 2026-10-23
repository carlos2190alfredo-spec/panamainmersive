import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  chownSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Clúster PostgreSQL TEMPORAL y aislado para las pruebas de integración (sin Docker, sin tocar el
 * clúster del sistema). Usa socket Unix (sin TCP) en un directorio propio. Como root, PostgreSQL no
 * arranca: se delega en el usuario `postgres` con `runuser`.
 */
export interface TestCluster {
  /** Directorio del socket Unix (valor de `host` para `pg`). */
  readonly host: string;
  readonly port: number;
  /** Para el clúster y borra su directorio, SIN bloquear el bucle de eventos (puede seguir atendiendo señales). */
  stopAsync(): Promise<void>;
  /** Igual, de forma síncrona (teardown de Vitest y red de seguridad al salir). */
  stop(): void;
}

const execFileAsync = promisify(execFile);

export interface SweepOptions {
  readonly root?: string;
  readonly now?: number;
  /** Un directorio más joven que esto no se toca: puede ser el clúster de otra ejecución en curso. */
  readonly maxAgeMs?: number;
  /** Un clúster con PostgreSQL VIVO solo se considera huérfano pasado este plazo (una ejecución normal dura segundos). */
  readonly staleRunningMs?: number;
}

/** Línea de órdenes de un proceso (Linux); `null` si no existe o no se puede leer. */
function commandLine(pid: number): string | null {
  try {
    return readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8').replaceAll('\0', ' ');
  } catch {
    return null;
  }
}

/**
 * Barre los restos de ejecuciones que murieron sin limpiar (SIGKILL, falta de memoria, corte): `pi-pg-*` (clústeres
 * temporales) y `pi-e2e-server-*` (registros de servidores) ANTIGUOS. Una incidencia real dejó 32 PostgreSQL huérfanos
 * y 2,3 GB en /tmp. Salvaguardas: nunca toca algo reciente; con el PostgreSQL vivo solo actúa pasado el plazo largo; y
 * solo detiene un proceso si su línea de órdenes contiene la ruta de ESE clúster (un pid reutilizado por otro proceso
 * no se mata: solo se borra el directorio). Devuelve los nombres borrados.
 */
export function sweepStaleClusters(options: SweepOptions = {}): string[] {
  const root = options.root ?? tmpdir();
  const now = options.now ?? Date.now();
  const maxAge = options.maxAgeMs ?? 10 * 60_000;
  const staleRunning = options.staleRunningMs ?? 2 * 60 * 60_000;
  const removed: string[] = [];
  for (const name of readdirSync(root)) {
    const isCluster = name.startsWith('pi-pg-');
    if (!isCluster && !name.startsWith('pi-e2e-server-')) continue;
    const dir = join(root, name);
    try {
      const age = now - statSync(dir).mtimeMs;
      if (age < maxAge) continue;
      if (isCluster) {
        let pid = NaN;
        try {
          pid = Number(readFileSync(join(dir, 'data', 'postmaster.pid'), 'utf8').split('\n')[0]);
        } catch {
          // sin postmaster.pid: no hay PostgreSQL de este directorio
        }
        const line = Number.isInteger(pid) && pid > 1 ? commandLine(pid) : null;
        const isOurs = line !== null && line.includes(dir);
        if (isOurs) {
          if (age < staleRunning) continue; // vivo y no tan viejo: podría ser una ejecución lenta
          process.kill(pid, 'SIGQUIT'); // parada inmediata del postmaster
        }
      }
      rmSync(dir, { recursive: true, force: true });
      removed.push(name);
    } catch {
      // mejor esfuerzo: otra ejecución pudo borrarlo a la vez
    }
  }
  return removed;
}

/**
 * «No hay un PostgreSQL utilizable». Es un error TIPADO a propósito: un orquestador puede omitir su suite en local
 * (nadie debe necesitar PostgreSQL para trabajar) pero en CI es un fallo, y cualquier OTRO error (initdb o pg_ctl que
 * fallan) no debe confundirse con éste ni quedar escondido bajo un «omitida».
 */
export class PostgresUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostgresUnavailableError';
  }
}

export interface FindBinOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Raíz de los binarios por versión (`<raíz>/<versión>/bin/initdb`). */
  readonly libRoot?: string;
  /** Raíz de las extensiones por versión (`<raíz>/<versión>/extension/postgis.control`). */
  readonly shareRoot?: string;
}

/**
 * Directorio de binarios de PostgreSQL. Orden: `PI_PG_BIN_DIR` (si se define manda, y si no tiene `initdb` es «no
 * disponible»: así se simula su ausencia en las pruebas); la versión MÁS ALTA que tenga PostGIS (la más alta a secas
 * podía ser una sin la extensión); y, como último recurso, el `initdb` del PATH.
 */
export function findBinDir(options: FindBinOptions = {}): string {
  const env = options.env ?? process.env;
  const override = env.PI_PG_BIN_DIR;
  if (override !== undefined && override !== '') {
    if (existsSync(join(override, 'initdb'))) return override;
    throw new PostgresUnavailableError(
      `PI_PG_BIN_DIR=${override} no contiene \`initdb\`: no hay un PostgreSQL utilizable.`,
    );
  }
  const libRoot = options.libRoot ?? '/usr/lib/postgresql';
  const shareRoot = options.shareRoot ?? '/usr/share/postgresql';
  let installedWithoutPostgis = false;
  if (existsSync(libRoot)) {
    const installed = readdirSync(libRoot)
      .filter((v) => existsSync(join(libRoot, v, 'bin', 'initdb')))
      .sort((a, b) => Number(b) - Number(a));
    const withPostgis = installed.find((v) =>
      existsSync(join(shareRoot, v, 'extension', 'postgis.control')),
    );
    if (withPostgis) return join(libRoot, withPostgis, 'bin');
    installedWithoutPostgis = installed.length > 0;
  }
  if (installedWithoutPostgis) {
    throw new PostgresUnavailableError(
      'Hay PostgreSQL pero ninguna versión instalada tiene PostGIS (postgresql-NN-postgis-3): instálalo.',
    );
  }
  try {
    const which = execFileSync('which', ['initdb'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: env.PATH ?? '' },
    }).trim();
    return which.replace(/\/initdb$/, '');
  } catch {
    throw new PostgresUnavailableError(
      'No hay PostgreSQL disponible: instala PostgreSQL + PostGIS (o apunta PI_PG_BIN_DIR al directorio de sus binarios; docs/testing.md).',
    );
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

export interface StartOptions {
  /**
   * Instala manejadores de SIGINT/SIGTERM que paran el clúster y salen (por defecto sí: lo que necesita el
   * `globalSetup` de Vitest). Un orquestador que ya limpia más cosas (servidor, copia de la app, Playwright) debe
   * pasar `false` y llamar a `stop()` desde SU limpieza: si no, el `process.exit` de este manejador se adelanta y la
   * suya no llega a ejecutarse.
   */
  readonly handleSignals?: boolean;
  /**
   * Por defecto el clúster es de PRUEBAS: sin `fsync`, `synchronous_commit` ni `full_page_writes` (rápido, no durable).
   * `durable: true` deja los valores por defecto de PostgreSQL, que son los de producción: lo necesitan las mediciones
   * de coste de escritura, donde el `COMMIT` espera al disco (`pnpm perf:db`). Las pruebas no lo usan.
   */
  readonly durable?: boolean;
}

export async function startTestCluster(options: StartOptions = {}): Promise<TestCluster> {
  const bin = findBinDir();
  try {
    sweepStaleClusters();
  } catch {
    // la barrida es una cortesía: nunca debe impedir arrancar
  }
  const isRoot = process.getuid?.() === 0;
  const dir = mkdtempSync(join(tmpdir(), 'pi-pg-'));
  const data = join(dir, 'data');

  const run = (cmd: string, args: string[]) => {
    const [file, argv] = isRoot
      ? (['runuser', ['-u', 'postgres', '--', join(bin, cmd), ...args]] as const)
      : ([join(bin, cmd), args] as const);
    return execFileSync(file, [...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  };

  const runAsync = async (cmd: string, args: string[]): Promise<void> => {
    const [file, argv] = isRoot
      ? (['runuser', ['-u', 'postgres', '--', join(bin, cmd), ...args]] as const)
      : ([join(bin, cmd), args] as const);
    await execFileAsync(file, [...argv]);
  };

  if (isRoot) {
    const uid = Number(execFileSync('id', ['-u', 'postgres'], { encoding: 'utf8' }));
    const gid = Number(execFileSync('id', ['-g', 'postgres'], { encoding: 'utf8' }));
    chownSync(dir, uid, gid);
  }

  const port = await freePort();
  try {
    run('initdb', [
      '-D',
      data,
      '-A',
      'trust',
      '-U',
      'postgres',
      '-E',
      'UTF8',
      '--locale=C.UTF-8',
      '--no-sync',
    ]);
    run('pg_ctl', [
      '-D',
      data,
      '-o',
      `-c listen_addresses='' -c unix_socket_directories='${dir}' -c port=${port}${
        options.durable ? '' : ' -c fsync=off -c synchronous_commit=off -c full_page_writes=off'
      }`,
      '-l',
      join(dir, 'postgres.log'),
      '-w',
      'start',
    ]);
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }

  // Idempotente: lo llama el teardown y, como red de seguridad, la salida del proceso (un Ctrl-C o un `timeout`
  // a mitad de una ejecución dejaban clústeres huérfanos de ≈ 70-90 MB cada uno).
  // `finished` solo se marca cuando el directorio ya no existe: si una parada ASÍNCRONA queda a medias porque el
  // proceso muere, la salida la completa de forma síncrona.
  let finished = false;
  // Con un Ctrl-C la terminal manda la señal a TODO el grupo y el PostgreSQL (que está en él) se apaga solo: cuando
  // llega nuestra limpieza ya no hay servidor y `pg_ctl stop` falla. Eso es éxito, no un error; solo se propaga un
  // fallo si el servidor SIGUE vivo.
  const postmasterAlive = (): boolean => {
    try {
      const pid = Number(readFileSync(join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const stop = () => {
    if (finished) return;
    try {
      if (postmasterAlive()) run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
    } catch (error) {
      if (postmasterAlive()) throw error;
    } finally {
      rmSync(dir, { recursive: true, force: true });
      finished = true;
    }
  };
  // Sin bloquear: un orquestador bajo `tsx` recibe SIGKILL si no confirma una segunda señal en 30 ms, y una limpieza
  // síncrona de cientos de milisegundos lo hacía morir a mitad (clústeres y copias de la app huérfanos).
  const stopAsync = async () => {
    if (finished) return;
    try {
      if (postmasterAlive()) await runAsync('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
    } catch (error) {
      if (postmasterAlive()) throw error;
    } finally {
      await rm(dir, { recursive: true, force: true });
      finished = true;
    }
  };
  process.once('exit', () => {
    try {
      stop();
    } catch {
      // mejor esfuerzo: ya se está saliendo
    }
  });
  if (options.handleSignals ?? true) {
    // `on`, no `once`: con `once`, tras la primera señal Node restaura la acción por defecto y una SEGUNDA (la que
    // reenvía `tsx`, o un segundo Ctrl-C) mataba el proceso entre `pg_ctl stop` y el borrado del directorio.
    for (const [signal, code] of [
      ['SIGINT', 130],
      ['SIGTERM', 143],
    ] as const) {
      process.on(signal, () => process.exit(code));
    }
  }

  return { host: dir, port, stop, stopAsync };
}
