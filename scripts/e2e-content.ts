/**
 * `pnpm test:e2e:content` — la ficha con CONTENIDO VERIFICADO de punta a punta (docs/testing.md, ADR-0019).
 *
 *  1. Levanta un PostgreSQL TEMPORAL, migra y siembra contenido sintético por el flujo editorial real.
 *  2. Exporta con `exportPublished` (rol `anon`, puertas del dominio) a una instantánea.
 *  3. Construye una COPIA TEMPORAL de la aplicación (`.e2e-content-app/`, ignorada por git) con esa instantánea:
 *     el código de producción no tiene ningún camino alternativo para publicar contenido y no se toca ningún archivo
 *     versionado. `pnpm build` y `.next` del proyecto quedan intactos.
 *  4. Sirve la copia con `next start`, ejecuta Playwright (`playwright.content.config.ts`) y limpia todo.
 *
 * Si falta PostgreSQL+PostGIS: en LOCAL dice QUÉ falta y sale con 0 (OMITIDA, no «pasó»); en CI es un FALLO (código 1):
 * un job verde que no ejecutó nada es peor que uno rojo. Cualquier otro fallo (initdb, build, servidor) siempre falla.
 * El servidor usa un puerto LIBRE (o el de `E2E_CONTENT_PORT`, que debe estarlo) y el orquestador comprueba que el
 * servidor que responde es el SUYO; ante SIGINT/SIGTERM para todo y borra la copia.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';
import { serializeSnapshot } from '../src/domains/content/snapshot';
import {
  PostgresUnavailableError,
  startTestCluster,
  type TestCluster,
} from '../tests/integration/pg-cluster';
import { migrate } from './db/lib';
import { exportPublished } from './content/export-lib';
import { seedContent } from './e2e-content-seed';
import {
  exitWith,
  pickPort,
  runCommand,
  skip,
  startServer,
  stopGroup,
  waitForServer,
  withTermination,
  type CommandRun,
  type ServerHandle,
} from './lib/e2e-run';

const ROOT = process.cwd();
const APP = join(ROOT, '.e2e-content-app');
const NEXT_BIN = join(ROOT, 'node_modules/next/dist/bin/next');
const BUILD_TIMEOUT_MS = 10 * 60_000;

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
  // El puerto primero: si lo piden y está ocupado, se dice ya (antes de levantar nada).
  const port = await pickPort(process.env.E2E_CONTENT_PORT);

  let cluster: TestCluster;
  try {
    cluster = await startTestCluster({ handleSignals: false });
  } catch (error) {
    // Solo «no hay PostgreSQL» se puede omitir (en local); un initdb o pg_ctl que falla es un fallo de verdad.
    if (error instanceof PostgresUnavailableError)
      skip(`no hay PostgreSQL+PostGIS utilizable (${error.message}).`);
    throw error;
  }

  let build: CommandRun | undefined;
  let server: ServerHandle | undefined;
  let playwright: ChildProcess | undefined;
  // Una sola limpieza aunque la pidan a la vez una señal y el `finally`; sin bloquear el bucle de eventos (ver
  // `TestCluster.stopAsync`): si no, `tsx` mata el proceso a mitad de limpiar al reenviar una segunda señal.
  let cleaning: Promise<void> | undefined;
  const cleanup = (): Promise<void> =>
    (cleaning ??= (async () => {
      stopGroup(playwright);
      stopGroup(build?.child);
      server?.stop();
      await Promise.all([cluster.stopAsync(), rm(APP, { recursive: true, force: true })]);
    })());
  return withTermination(cleanup, async () => {
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
      const { snapshot, excluded } = await exportPublished(owner, new Date());
      if (excluded.length > 0)
        throw new Error(
          `La siembra sintética no debería excluir nada: ${JSON.stringify(excluded)}`,
        );
      await owner.end();
      console.log(
        `Contenido exportado: ${String(snapshot.assertions.length)} afirmaciones, ${String(snapshot.notices.length)} avisos.`,
      );

      prepareApp(serializeSnapshot(snapshot));
      console.log('Construyendo la copia de la aplicación con ese contenido…');
      // Asíncrono: con `spawnSync` el bucle de eventos quedaba bloqueado y no se podía atender ninguna señal.
      build = runCommand(process.execPath, [NEXT_BIN, 'build'], {
        cwd: APP,
        env: { ...process.env, SITE_ENV: 'development' },
        timeoutMs: BUILD_TIMEOUT_MS,
      });
      const built = await build.result;
      if (built.status !== 0) {
        console.error(built.output.slice(-6000));
        throw new Error('Falló el build de la copia.');
      }

      server = startServer(process.execPath, [NEXT_BIN, 'start', '-p', String(port)], {
        cwd: APP,
        env: { ...process.env, SITE_ENV: 'development' },
      });
      await waitForServer(`http://localhost:${String(port)}/api/health`, 60_000, server);

      const child = spawn(
        'pnpm',
        [
          'exec',
          'playwright',
          'test',
          '--config',
          'playwright.content.config.ts',
          ...process.argv.slice(2),
        ],
        {
          cwd: ROOT,
          stdio: 'inherit',
          detached: true, // su propio grupo: la limpieza lo para entero (workers incluidos) ante una señal
          env: { ...process.env, E2E_CONTENT_PORT: String(port) },
        },
      );
      playwright = child;
      return await new Promise<number>((resolve, reject) => {
        child.once('error', reject); // p. ej. `pnpm` fuera del PATH: antes quedaba todo huérfano
        child.once('exit', (code) => {
          resolve(code ?? 1);
        });
      });
    } catch (error) {
      if (server) console.error(`\nSalida del servidor de la prueba:\n${server.tail()}\n`);
      throw error;
    }
  });
}

exitWith(main);
