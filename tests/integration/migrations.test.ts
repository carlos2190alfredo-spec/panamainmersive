import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MigrationError, loadMigrations, migrate, sha256 } from '../../scripts/db/lib';
import { createTestDb, type TestDb } from './helpers';

const DIR = join(process.cwd(), 'db/migrations');
let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe('migraciones sobre PostgreSQL real', () => {
  it('PostGIS 3.4+ está instalado y pgvector NO (sin necesidad probada, ADR-0006)', async () => {
    const { rows } = await db.owner.query<{ extname: string; extversion: string }>(
      'select extname, extversion from pg_extension',
    );
    const postgis = rows.find((r) => r.extname === 'postgis');
    expect(postgis, 'postgis').toBeDefined();
    const [major, minor] = (postgis?.extversion ?? '0.0').split('.').map(Number) as [
      number,
      number,
    ];
    expect(major * 100 + minor).toBeGreaterThanOrEqual(304);
    expect(rows.map((r) => r.extname)).not.toContain('vector');
  });

  it('todas las migraciones del repositorio están registradas con su checksum', async () => {
    const files = loadMigrations(DIR);
    expect(files.length).toBeGreaterThanOrEqual(5);
    const { rows } = await db.owner.query<{ version: string; checksum: string }>(
      'select version, checksum from app.schema_migrations order by version',
    );
    expect(rows.map((r) => r.version)).toEqual(files.map((f) => f.version));
    for (const f of files)
      expect(rows.find((r) => r.version === f.version)?.checksum).toBe(sha256(f.sql));
  });

  it('es seguro repetir: nada se vuelve a aplicar', async () => {
    const again = await migrate(db.owner, DIR);
    expect(again.applied).toEqual([]);
    expect(again.skipped.length).toBe(loadMigrations(DIR).length);
  });

  it('una migración editada después de aplicarse se rechaza (checksum)', async () => {
    await db.owner.query(
      "update app.schema_migrations set checksum = repeat('0', 64) where version = '0001'",
    );
    await expect(migrate(db.owner, DIR)).rejects.toBeInstanceOf(MigrationError);
    await expect(migrate(db.owner, DIR)).rejects.toThrow(/cambió después de aplicarse/);
    await db.owner.query('update app.schema_migrations set checksum = $1 where version = $2', [
      sha256(loadMigrations(DIR)[0]?.sql ?? ''),
      '0001',
    ]);
  });

  it('una migración aplicada cuyo fichero desapareció se rechaza (deriva)', async () => {
    await db.owner.query(
      "insert into app.schema_migrations (version, name, checksum) values ('9999', 'fantasma', repeat('a', 64))",
    );
    await expect(migrate(db.owner, DIR)).rejects.toThrow(/ya no existe/);
    await db.owner.query("delete from app.schema_migrations where version = '9999'");
  });

  it('RLS está activada en TODAS las tablas de public (ninguna queda sin protección)', async () => {
    const { rows } = await db.owner.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
        order by c.relname`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(14);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it('PostGIS vive en `extensions`: spatial_ref_sys NO está en public (expuesta sin RLS por la API)', async () => {
    const { rows } = await db.owner.query<{ schema: string }>(
      `select n.nspname as schema from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relname = 'spatial_ref_sys'`,
    );
    expect(rows.map((r) => r.schema)).toEqual(['extensions']);
    const ext = await db.owner.query<{ extname: string; schema: string }>(
      `select e.extname, n.nspname as schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace
        where e.extname in ('postgis', 'pg_trgm', 'unaccent') order by 1`,
    );
    expect(ext.rows).toEqual([
      { extname: 'pg_trgm', schema: 'extensions' },
      { extname: 'postgis', schema: 'extensions' },
      { extname: 'unaccent', schema: 'extensions' },
    ]);
  });

  it('anon y authenticated no tienen privilegios sobre las tablas internas ni sobre el esquema de migraciones', async () => {
    const { rows } = await db.owner.query<{ allowed: boolean }>(
      "select has_table_privilege('anon', 'public.audit_events', 'select') as allowed",
    );
    expect(rows[0]?.allowed).toBe(false);
    const sch = await db.owner.query<{ allowed: boolean }>(
      "select has_table_privilege('authenticated', 'app.schema_migrations', 'select') as allowed",
    );
    expect(sch.rows[0]?.allowed).toBe(false);
    const rights = await db.owner.query<{ allowed: boolean }>(
      "select has_table_privilege('anon', 'public.rights_policies', 'select') as allowed",
    );
    expect(rights.rows[0]?.allowed).toBe(false);
  });

  it('una base remota no se migra sin confirmación: isLocalHost distingue local y remoto', async () => {
    const { isLocalHost } = await import('../../scripts/db/lib');
    expect(isLocalHost(undefined)).toBe(true);
    expect(isLocalHost('/tmp/pg-socket')).toBe(true);
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('127.0.0.1')).toBe(true);
    expect(isLocalHost('db.production.example.org')).toBe(false);
  });

  it('un cliente nuevo ve el mismo estado: las migraciones se confirmaron (no quedan en transacción)', async () => {
    const cfg = db.owner as unknown as {
      database: string;
      host: string;
      port: number;
      user: string;
    };
    const c = new Client({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      database: cfg.database,
    });
    await c.connect();
    try {
      const { rows } = await c.query<{ n: string }>(
        'select count(*) as n from app.schema_migrations',
      );
      expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(5);
    } finally {
      await c.end();
    }
  });
});
