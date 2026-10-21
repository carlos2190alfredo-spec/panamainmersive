import { execFileSync } from 'node:child_process';
import { chownSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
  stop(): void;
}

function findBinDir(): string {
  const root = '/usr/lib/postgresql';
  if (existsSync(root)) {
    const versions = readdirSync(root)
      .filter((v) => existsSync(join(root, v, 'bin', 'initdb')))
      .sort((a, b) => Number(b) - Number(a));
    if (versions[0]) return join(root, versions[0], 'bin');
  }
  try {
    const which = execFileSync('which', ['initdb'], { encoding: 'utf8' }).trim();
    return which.replace(/\/initdb$/, '');
  } catch {
    throw new Error(
      'No hay PostgreSQL disponible: instala PostgreSQL + PostGIS o define DATABASE_URL_TEST (ver docs/testing.md).',
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

export async function startTestCluster(): Promise<TestCluster> {
  const bin = findBinDir();
  const isRoot = process.getuid?.() === 0;
  const dir = mkdtempSync(join(tmpdir(), 'pi-pg-'));
  const data = join(dir, 'data');

  const run = (cmd: string, args: string[]) => {
    const [file, argv] = isRoot
      ? (['runuser', ['-u', 'postgres', '--', join(bin, cmd), ...args]] as const)
      : ([join(bin, cmd), args] as const);
    return execFileSync(file, [...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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
      `-c listen_addresses='' -c unix_socket_directories='${dir}' -c port=${port} -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
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
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  process.once('exit', () => {
    try {
      stop();
    } catch {
      // mejor esfuerzo: ya se está saliendo
    }
  });
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const) {
    process.once(signal, () => process.exit(code));
  }

  return { host: dir, port, stop };
}
