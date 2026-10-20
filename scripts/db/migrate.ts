/**
 * `pnpm db:migrate` — aplica las migraciones de db/migrations a DATABASE_URL.
 * Salvaguarda: una base que NO sea local exige confirmar el host con MIGRATE_CONFIRM_REMOTE=<host>
 * (nunca se migra producción por accidente; ver docs/security.md).
 */
import { join } from 'node:path';
import { Client } from 'pg';
import { MigrationError, isLocalHost, migrate } from './lib';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL (ver .env.example).');
  process.exit(2);
}

const host = new URL(url).hostname;
if (!isLocalHost(host) && process.env.MIGRATE_CONFIRM_REMOTE !== host) {
  console.error(
    `Rechazado: «${host}» no es una base local. Si es intencionado y está autorizado, repite con MIGRATE_CONFIRM_REMOTE=${host}.`,
  );
  process.exit(3);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  const { applied, skipped } = await migrate(client, join(process.cwd(), 'db/migrations'));
  console.log(
    `Migraciones aplicadas: ${applied.length ? applied.join(', ') : '(ninguna)'} · ya aplicadas: ${skipped.length}`,
  );
} catch (error) {
  console.error(error instanceof MigrationError ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
