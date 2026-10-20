import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from 'pg';

export interface MigrationFile {
  readonly version: string;
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Lee `db/migrations`: nombres `NNNN_nombre.sql`, versiones únicas, orden ascendente. */
export function loadMigrations(dir: string): MigrationFile[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const seen = new Set<string>();
  return files.map((file) => {
    const m = FILE_PATTERN.exec(file);
    if (!m)
      throw new MigrationError(`Nombre de migración inválido: ${file} (esperado NNNN_nombre.sql)`);
    const [, version, name] = m as unknown as [string, string, string];
    if (seen.has(version)) throw new MigrationError(`Versión de migración duplicada: ${version}`);
    seen.add(version);
    const sql = readFileSync(join(dir, file), 'utf8');
    return { version, name, sql, checksum: sha256(sql) };
  });
}

export interface MigrateResult {
  readonly applied: string[];
  readonly skipped: string[];
}

const LOCK_KEY = 727_274; // «PI» · bloqueo consultivo: una sola migración a la vez

/**
 * Aplica las migraciones pendientes, cada una en su transacción. Es seguro repetirla:
 *  - las ya aplicadas se omiten y su CHECKSUM se verifica (una migración editada a posteriori se rechaza);
 *  - una migración aplicada cuyo fichero desapareció también se rechaza (deriva).
 */
export async function migrate(client: Client, dir: string): Promise<MigrateResult> {
  const migrations = loadMigrations(dir);
  await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
  // Igual que el `search_path` por defecto de Supabase: las extensiones (PostGIS) viven en `extensions`.
  await client.query('set search_path = "$user", public, extensions');
  try {
    await client.query('create schema if not exists app');
    await client.query(`
      create table if not exists app.schema_migrations (
        version    text primary key,
        name       text not null,
        checksum   text not null check (checksum ~ '^[0-9a-f]{64}$'),
        applied_at timestamptz not null default now()
      )`);

    const { rows } = await client.query<{ version: string; checksum: string }>(
      'select version, checksum from app.schema_migrations order by version',
    );
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));

    const known = new Set(migrations.map((m) => m.version));
    for (const v of applied.keys()) {
      if (!known.has(v))
        throw new MigrationError(
          `La migración aplicada ${v} ya no existe en el repositorio (deriva)`,
        );
    }

    const result: MigrateResult = { applied: [], skipped: [] };
    for (const m of migrations) {
      const prior = applied.get(m.version);
      if (prior !== undefined) {
        if (prior !== m.checksum) {
          throw new MigrationError(
            `La migración ${m.version}_${m.name} cambió después de aplicarse (checksum distinto). Crea una nueva migración.`,
          );
        }
        result.skipped.push(m.version);
        continue;
      }
      await client.query('begin');
      try {
        await client.query(m.sql);
        await client.query(
          'insert into app.schema_migrations (version, name, checksum) values ($1, $2, $3)',
          [m.version, m.name, m.checksum],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new MigrationError(
          `Falló la migración ${m.version}_${m.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      result.applied.push(m.version);
    }
    return result;
  } finally {
    await client.query('reset search_path');
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
  }
}

/** Una base es «local» si es socket Unix, localhost o loopback. Cualquier otra exige confirmación. */
export function isLocalHost(host: string | undefined): boolean {
  if (!host) return true; // socket por defecto
  return host.startsWith('/') || ['localhost', '127.0.0.1', '::1'].includes(host);
}
