/**
 * `pnpm test:e2e:db` — suite E2E CON base de datos (docs/testing.md).
 *
 *  1. Comprueba lo que necesita y, si falta algo, dice QUÉ y sale con 0 sin ejecutar nada (OMITIDA, no «pasó»).
 *  2. Levanta un PostgreSQL TEMPORAL (socket Unix, sin tocar ninguno del sistema), migra, importa y PUBLICA las
 *     áreas protegidas reales (artefactos de `pnpm data:ingest`) y despublica una a propósito.
 *  3. Arranca `next start` sobre el build apuntando a esa BD y ejecuta Playwright con `playwright.db.config.ts`.
 *  4. Limpia todo (servidor y clúster) y devuelve el código de salida de Playwright.
 *
 * Nada de esto toca bases remotas: el clúster vive en un directorio temporal y se destruye al terminar.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { RIGHTS_POLICIES } from '../src/lib/rights-policies';
import { startTestCluster } from '../tests/integration/pg-cluster';
import { importAreas } from './db/import-areas-lib';
import { migrate } from './db/lib';

const ROOT = process.cwd();
const PORT = Number(process.env.E2E_DB_PORT ?? 3200);
const INGEST_DIR = join(ROOT, 'data/build/ingest/overture-protected-areas');

function skip(reason: string): never {
  console.log(`\nOMITIDA (no ejecutada, NO es un «pasó»): ${reason}\n`);
  process.exit(0);
}

function ingestManifest(): string | null {
  if (!existsSync(INGEST_DIR)) return null;
  const releases = readdirSync(INGEST_DIR).sort();
  const latest = releases.at(-1);
  const path = latest ? join(INGEST_DIR, latest, 'manifest.json') : null;
  return path && existsSync(path) ? path : null;
}

async function waitFor(url: string, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
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

async function main(): Promise<number> {
  if (!existsSync(join(ROOT, '.next/BUILD_ID')))
    skip('falta el build: ejecuta `SITE_ENV=development pnpm build`.');
  if (!existsSync(join(ROOT, 'public/data/panama-basemap.pmtiles'))) {
    skip('falta el mapa base (public/data): ejecuta `pnpm data:build` (docs/setup.md §6).');
  }
  const manifest = ingestManifest();
  if (!manifest)
    skip('faltan los artefactos de ingesta: ejecuta `pnpm data:ingest` (docs/setup.md §7).');

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
    server = spawn(
      process.execPath,
      [join(ROOT, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORT)],
      {
        cwd: ROOT,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, SITE_ENV: 'development', DATABASE_URL: databaseUrl },
      },
    );
    await waitFor(`http://localhost:${PORT}/api/health`, 60_000);

    const playwright = spawn(
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
        env: {
          ...process.env,
          E2E_DB_PORT: String(PORT),
          E2E_PUBLISHED_OVID: published.ovid,
          E2E_PUBLISHED_NAME: published.name,
          E2E_UNPUBLISHED_OVID: unpublished.ovid,
          E2E_PUBLISHED_COUNT: String(result.areas.created - 1),
        },
      },
    );
    return await new Promise<number>((resolve) => {
      playwright.on('exit', (code) => {
        resolve(code ?? 1);
      });
    });
  } finally {
    stopServer(server);
    cluster.stop();
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
