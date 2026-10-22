/**
 * `pnpm db:import-areas --manifest <ruta>/manifest.json [--publish] [--target-env development|staging|production]`
 * Carga una versión producida por `pipelines/ingest/import_areas.py`. Una base que NO sea local exige confirmar el host
 * con IMPORT_CONFIRM_REMOTE=<host> (nunca se importa a producción por accidente). `--publish` hace visibles las áreas
 * (decisión editorial explícita; no es el comportamiento por defecto).
 */
import { parseArgs } from 'node:util';
import { Client } from 'pg';
import { RIGHTS_POLICIES } from '../../src/lib/rights-policies';
import { ImportError, importAreas } from './import-areas-lib';
import { checkDatabaseTarget, refusalMessage } from './target';

const USAGE =
  'Uso: pnpm db:import-areas --manifest <ruta>/manifest.json [--publish] [--target-env development|staging|production]';
const TARGET_ENVS = ['development', 'staging', 'production'] as const;

// Estricto: un argumento desconocido o con otra forma se rechaza (con `includes`/`indexOf`, `--target-env=production`
// se ignoraba y se validaba como `development`, el entorno más permisivo).
let parsed: ReturnType<typeof parseCli> | undefined;
try {
  parsed = parseCli(process.argv.slice(2));
} catch (error) {
  console.error(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
  process.exit(2);
}
function parseCli(argv: string[]) {
  return parseArgs({
    args: argv,
    options: {
      manifest: { type: 'string' },
      publish: { type: 'boolean' },
      'target-env': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  }).values;
}

const manifestPath = parsed.manifest;
const targetEnv = parsed['target-env'] ?? 'development';
if (!manifestPath || !TARGET_ENVS.some((e) => e === targetEnv)) {
  console.error(USAGE);
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL (ver .env.example).');
  process.exit(2);
}
const target = checkDatabaseTarget(url, process.env.IMPORT_CONFIRM_REMOTE);
if (!target.ok) {
  console.error(refusalMessage(target, 'IMPORT_CONFIRM_REMOTE'));
  process.exit(target.reason === 'invalid_url' ? 2 : 3);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query('set search_path = public, extensions');
  const result = await importAreas(client, {
    manifestPath,
    targetEnv: targetEnv as (typeof TARGET_ENVS)[number],
    policies: RIGHTS_POLICIES,
    publish: parsed.publish === true,
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof ImportError ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
