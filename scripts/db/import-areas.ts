/**
 * `pnpm db:import-areas --manifest <ruta>/manifest.json [--publish] [--target-env development|staging|production]`
 * Carga una versión producida por `pipelines/ingest/import_areas.py`. Una base que NO sea local exige confirmar el host
 * con IMPORT_CONFIRM_REMOTE=<host> (nunca se importa a producción por accidente). `--publish` hace visibles las áreas
 * (decisión editorial explícita; no es el comportamiento por defecto).
 */
import { Client } from 'pg';
import { RIGHTS_POLICIES } from '../../src/lib/rights-policies';
import { ImportError, importAreas } from './import-areas-lib';
import { isLocalHost } from './lib';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const manifestPath = value('--manifest');
const targetEnv = (value('--target-env') ?? 'development') as
  'development' | 'staging' | 'production';
if (!manifestPath || !['development', 'staging', 'production'].includes(targetEnv)) {
  console.error(
    'Uso: pnpm db:import-areas --manifest <ruta>/manifest.json [--publish] [--target-env development|staging|production]',
  );
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL (ver .env.example).');
  process.exit(2);
}
const host = new URL(url).hostname;
if (!isLocalHost(host) && process.env.IMPORT_CONFIRM_REMOTE !== host) {
  console.error(
    `Rechazado: «${host}» no es una base local. Si es intencionado y está autorizado, repite con IMPORT_CONFIRM_REMOTE=${host}.`,
  );
  process.exit(3);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query('set search_path = public, extensions');
  const result = await importAreas(client, {
    manifestPath,
    targetEnv,
    policies: RIGHTS_POLICIES,
    publish: flag('--publish'),
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof ImportError ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
