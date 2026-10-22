/**
 * `pnpm db:migrate` — aplica las migraciones de db/migrations a DATABASE_URL.
 * Salvaguarda: una base que NO sea local exige confirmar el host con MIGRATE_CONFIRM_REMOTE=<host>
 * (nunca se migra producción por accidente; ver docs/security.md).
 */
import { join } from 'node:path';
import { Client } from 'pg';
import { MigrationError, migrate } from './lib';
import { checkDatabaseTarget, refusalMessage } from './target';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL (ver .env.example).');
  process.exit(2);
}

const target = checkDatabaseTarget(url, process.env.MIGRATE_CONFIRM_REMOTE);
if (!target.ok) {
  console.error(refusalMessage(target, 'MIGRATE_CONFIRM_REMOTE'));
  process.exit(target.reason === 'invalid_url' ? 2 : 3);
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
