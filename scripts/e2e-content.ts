/**
 * `pnpm test:e2e:content` — la ficha con CONTENIDO VERIFICADO de punta a punta (docs/testing.md, ADR-0019).
 *
 *  1. Levanta un PostgreSQL TEMPORAL, migra y siembra contenido sintético por el flujo editorial real.
 *  2. Exporta con `exportPublished` (rol `anon`, puertas del dominio) a una instantánea.
 *  3. Construye una COPIA TEMPORAL de la aplicación (`.e2e-content-app/`, ignorada por git) con esa instantánea:
 *     el código de producción no tiene ningún camino alternativo para publicar contenido y no se toca ningún archivo
 *     versionado. `pnpm build` y `.next` del proyecto quedan intactos.
 *  4. Sirve la copia con `next start`, ejecuta Playwright (`playwright.content.config.ts`) y limpia todo.
 * Si falta PostgreSQL+PostGIS, dice QUÉ falta y sale con 0 sin ejecutar nada (OMITIDA, no «pasó»).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { serializeSnapshot } from '../src/domains/content/snapshot';
import { startTestCluster } from '../tests/integration/pg-cluster';
import { migrate } from './db/lib';
import { exportPublished } from './content/export-lib';
import { seedContent } from './e2e-content-seed';

const ROOT = process.cwd();
const APP = join(ROOT, '.e2e-content-app');
const PORT = Number(process.env.E2E_CONTENT_PORT ?? 3300);
const NEXT_BIN = join(ROOT, 'node_modules/next/dist/bin/next');

function skip(reason: string): never {
  console.log(`\nOMITIDA (no ejecutada, NO es un «pasó»): ${reason}\n`);
  process.exit(0);
}

async function waitFor(url: string, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // aún no responde
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`El servidor no respondió en ${ms / 1000} s: ${url}`);
}

function stopServer(child: ChildProcess | undefined): void {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM'); // grupo de procesos: `next start` lanza `next-server`
  } catch {
    // ya terminó
  }
}

/** Copia solo lo que `next build` necesita (sin node_modules: Node lo resuelve subiendo hasta el del proyecto). */
function prepareApp(snapshotJson: string): void {
  rmSync(APP, { recursive: true, force: true });
  mkdirSync(join(APP, 'data/content'), { recursive: true });
  for (const file of ['package.json', 'tsconfig.json', 'next.config.ts']) {
    cpSync(join(ROOT, file), join(APP, file));
  }
  cpSync(join(ROOT, 'src'), join(APP, 'src'), { recursive: true });
  cpSync(join(ROOT, 'messages'), join(APP, 'messages'), { recursive: true });
  for (const dir of ['anchors', 'rights']) {
    cpSync(join(ROOT, 'data', dir), join(APP, 'data', dir), { recursive: true });
  }
  mkdirSync(join(APP, 'public'));
  for (const entry of readdirSync(join(ROOT, 'public'))) {
    if (entry !== 'data')
      cpSync(join(ROOT, 'public', entry), join(APP, 'public', entry), { recursive: true });
  }
  writeFileSync(join(APP, 'data/content/published.json'), snapshotJson);
}

async function main(): Promise<number> {
  let cluster;
  try {
    cluster = await startTestCluster();
  } catch (error) {
    skip(
      `no hay PostgreSQL+PostGIS utilizable (${error instanceof Error ? error.message : String(error)}).`,
    );
  }

  let server: ChildProcess | undefined;
  try {
    const admin = new Client({
      host: cluster.host,
      port: cluster.port,
      user: 'postgres',
      database: 'postgres',
    });
    await admin.connect();
    await admin.query('create database pi_e2e_content');
    await admin.end();

    const owner = new Client({
      host: cluster.host,
      port: cluster.port,
      user: 'postgres',
      database: 'pi_e2e_content',
    });
    await owner.connect();
    await migrate(owner, join(ROOT, 'db/migrations'));
    await owner.query('set search_path = public, extensions');
    await seedContent(owner);
    const snapshot = await exportPublished(owner, new Date());
    await owner.end();
    console.log(
      `Contenido exportado: ${snapshot.assertions.length} afirmaciones, ${snapshot.notices.length} avisos.`,
    );

    prepareApp(serializeSnapshot(snapshot));
    console.log('Construyendo la copia de la aplicación con ese contenido…');
    const build = spawnSync(process.execPath, [NEXT_BIN, 'build'], {
      cwd: APP,
      env: { ...process.env, SITE_ENV: 'development' },
      encoding: 'utf8',
    });
    if (build.status !== 0) {
      console.error(`${build.stdout.slice(-3000)}\n${build.stderr.slice(-3000)}`);
      throw new Error('Falló el build de la copia.');
    }

    server = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(PORT)], {
      cwd: APP,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, SITE_ENV: 'development' },
    });
    await waitFor(`http://localhost:${PORT}/api/health`, 60_000);

    const playwright = spawn(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config',
        'playwright.content.config.ts',
        ...process.argv.slice(2),
      ],
      { cwd: ROOT, stdio: 'inherit', env: { ...process.env, E2E_CONTENT_PORT: String(PORT) } },
    );
    return await new Promise<number>((resolve) => {
      playwright.on('exit', (code) => {
        resolve(code ?? 1);
      });
    });
  } finally {
    stopServer(server);
    cluster.stop();
    if (existsSync(APP)) rmSync(APP, { recursive: true, force: true });
  }
}

main().then(
  (code) => {
    process.exit(code);
  },
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
