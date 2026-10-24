/**
 * `pnpm test:e2e:db` — suite E2E CON base de datos (docs/testing.md).
 *
 *  1. Comprueba lo que necesita y, si falta algo, dice QUÉ: en LOCAL sale con 0 sin ejecutar nada (OMITIDA, no
 *     «pasó»); en CI es un FALLO (un verde que no ejecutó nada es peor que un rojo).
 *  2. Levanta un PostgreSQL TEMPORAL (socket Unix, sin tocar ninguno del sistema), migra, importa y PUBLICA las
 *     áreas protegidas reales (artefactos de `pnpm data:ingest`) y despublica una a propósito.
 *  3. Arranca `next start` sobre el build apuntando a esa BD (en un puerto LIBRE o el de `E2E_DB_PORT`, que debe
 *     estarlo, y comprobando que el servidor que responde es el SUYO) y ejecuta Playwright con
 *     `playwright.db.config.ts`.
 *  4. Limpia todo (servidor, Playwright y clúster; también ante SIGINT/SIGTERM) y devuelve el código de Playwright.
 *
 * Nada de esto toca bases remotas: el clúster vive en un directorio temporal y se destruye al terminar.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { RIGHTS_POLICIES } from '../src/lib/rights-policies';
import {
  PostgresUnavailableError,
  startTestCluster,
  type TestCluster,
} from '../tests/integration/pg-cluster';
import { importAreas } from './db/import-areas-lib';
import { migrate } from './db/lib';
import {
  exitWith,
  pickPort,
  skip,
  startServer,
  stopGroup,
  waitForServer,
  withTermination,
  type ServerHandle,
} from './lib/e2e-run';

const ROOT = process.cwd();
const INGEST_DIR = join(ROOT, 'data/build/ingest/overture-protected-areas');

function ingestManifest(): string | null {
  if (!existsSync(INGEST_DIR)) return null;
  const releases = readdirSync(INGEST_DIR).sort();
  const latest = releases.at(-1);
  const path = latest ? join(INGEST_DIR, latest, 'manifest.json') : null;
  return path && existsSync(path) ? path : null;
}

async function main(): Promise<number> {
  // El puerto primero: si lo piden y está ocupado, se dice ya (antes de levantar nada).
  const port = await pickPort(process.env.E2E_DB_PORT);
  if (!existsSync(join(ROOT, '.next/BUILD_ID')))
    skip('falta el build: ejecuta `SITE_ENV=development pnpm build`.');
  if (!existsSync(join(ROOT, 'public/data/panama-basemap.pmtiles'))) {
    skip('falta el mapa base (public/data): ejecuta `pnpm data:build` (docs/setup.md §6).');
  }
  const manifest = ingestManifest();
  if (!manifest)
    skip('faltan los artefactos de ingesta: ejecuta `pnpm data:ingest` (docs/setup.md §7).');

  let cluster: TestCluster;
  try {
    cluster = await startTestCluster({ handleSignals: false });
  } catch (error) {
    // Solo «no hay PostgreSQL» se puede omitir (en local); un initdb o pg_ctl que falla es un fallo de verdad.
    if (error instanceof PostgresUnavailableError)
      skip(`no hay PostgreSQL+PostGIS utilizable (${error.message}).`);
    throw error;
  }

  let server: ServerHandle | undefined;
  let playwright: ChildProcess | undefined;
  // Una sola limpieza aunque la pidan a la vez una señal y el `finally`; sin bloquear el bucle de eventos (si no,
  // `tsx` mataba el proceso a mitad de limpiar al reenviar una segunda señal).
  let cleaning: Promise<void> | undefined;
  const cleanup = (): Promise<void> =>
    (cleaning ??= (async () => {
      stopGroup(playwright);
      server?.stop();
      await cluster.stopAsync();
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
      await admin.query('create database pi_e2e');
      await admin.end();

      const owner = new Client({
        host: cluster.host,
        port: cluster.port,
        user: 'postgres',
        database: 'pi_e2e',
      });
      await owner.connect();
      await migrate(owner, join(ROOT, 'db/migrations'));
      // `migrate` restaura el search_path; PostGIS vive en `extensions` (igual que Supabase y que `db:import-areas`).
      await owner.query('set search_path = public, extensions');
      const result = await importAreas(owner, {
        manifestPath: manifest,
        targetEnv: 'development',
        policies: RIGHTS_POLICIES,
        publish: true,
      });
      console.log(
        `Importadas ${result.areas.created} áreas (publicadas) desde ${manifest.replace(`${ROOT}/`, '')}`,
      );

      // Una publicada con nombre (para el enlace profundo) y una DESPUBLICADA con nombre (debe verse como «sin ficha»).
      const named = await owner.query<{ ovid: string; name: string }>(
        `select a.external_ref ->> 'overture_id' as ovid, n.name
         from public.geographic_areas a
         join public.geographic_area_names n on n.area_id = a.id and n.provenance = 'source_local'
        order by a.external_ref ->> 'overture_id'`,
      );
      const unpublished = named.rows[0];
      const published = named.rows.at(-1);
      if (!unpublished || !published || unpublished.ovid === published.ovid) {
        throw new Error('No hay suficientes áreas con nombre para preparar la prueba.');
      }
      await owner.query(
        "update public.geographic_areas set is_public = false where external_ref ->> 'overture_id' = $1",
        [unpublished.ovid],
      );
      await owner.end();

      const databaseUrl = `postgresql://postgres@/pi_e2e?host=${encodeURIComponent(cluster.host)}&port=${cluster.port}`;
      server = startServer(
        process.execPath,
        [join(ROOT, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port)],
        { cwd: ROOT, env: { ...process.env, SITE_ENV: 'development', DATABASE_URL: databaseUrl } },
      );
      await waitForServer(`http://localhost:${String(port)}/api/health`, 60_000, server);

      const child = spawn(
        'pnpm',
        [
          'exec',
          'playwright',
          'test',
          '--config',
          'playwright.db.config.ts',
          ...process.argv.slice(2),
        ],
        {
          cwd: ROOT,
          stdio: 'inherit',
          detached: true, // su propio grupo: la limpieza lo para entero (workers incluidos) ante una señal
          env: {
            ...process.env,
            E2E_DB_PORT: String(port),
            E2E_PUBLISHED_OVID: published.ovid,
            E2E_PUBLISHED_NAME: published.name,
            E2E_UNPUBLISHED_OVID: unpublished.ovid,
            E2E_PUBLISHED_COUNT: String(result.areas.created - 1),
          },
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
