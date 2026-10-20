import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { inject } from 'vitest';

export type Role = 'anon' | 'authenticated';

export interface TestDb {
  /** Conexión del propietario (superusuario): para preparar datos, saltando RLS. */
  readonly owner: Client;
  /** Ejecuta `fn` como un rol de Supabase con claims JWT, dentro de una transacción que siempre se revierte. */
  as<T>(role: Role, userId: string | null, fn: (c: Client) => Promise<T>): Promise<T>;
  /** Como `as`, pero confirma los cambios (para encadenar pasos que dependen de los anteriores). */
  asCommit<T>(role: Role, userId: string | null, fn: (c: Client) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Una base nueva clonada de la plantilla migrada: cada fichero de pruebas parte de un estado limpio. */
export async function createTestDb(): Promise<TestDb> {
  const cfg = inject('pg');
  const name = `pi_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const admin = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    database: 'postgres',
  });
  await admin.connect();
  await admin.query(`create database ${name} template ${cfg.template}`);
  await admin.end();

  const owner = new Client({ host: cfg.host, port: cfg.port, user: cfg.user, database: name });
  await owner.connect();
  // Igual que Supabase: las extensiones (PostGIS) viven en `extensions`.
  await owner.query('set search_path = public, extensions');

  async function run<T>(
    commit: boolean,
    role: Role,
    userId: string | null,
    fn: (c: Client) => Promise<T>,
  ): Promise<T> {
    await owner.query('begin');
    try {
      await owner.query(`set local role ${role}`);
      // PostgREST/Supabase usan este search_path para los roles de la API (PostGIS vive en `extensions`).
      await owner.query('set local search_path = public, extensions');
      const claims = userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' };
      await owner.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(claims),
      ]);
      const result = await fn(owner);
      await owner.query(commit ? 'commit' : 'rollback');
      return result;
    } catch (error) {
      await owner.query('rollback');
      throw error;
    }
  }

  return {
    owner,
    as: (role, userId, fn) => run(false, role, userId, fn),
    asCommit: (role, userId, fn) => run(true, role, userId, fn),
    async close() {
      await owner.end();
      const a = new Client({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        database: 'postgres',
      });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

/** SQLSTATE 42501: violación de RLS o de privilegios. */
export async function expectDenied(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '42501') return;
    throw new Error(`Se esperaba acceso denegado (42501) pero llegó: ${String(error)}`, {
      cause: error,
    });
  }
  throw new Error('Se esperaba acceso denegado, pero la operación se permitió');
}

/** Espera un error con ese SQLSTATE (p. ej. 23514 = violación de CHECK, 23505 = único). */
export async function expectSqlState(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const got = (error as { code?: string }).code;
    if (got === code) return;
    throw new Error(`Se esperaba SQLSTATE ${code} pero llegó ${String(got)}: ${String(error)}`, {
      cause: error,
    });
  }
  throw new Error(`Se esperaba SQLSTATE ${code}, pero la operación se permitió`);
}

export const ids = {
  admin: '00000000-0000-4000-8000-0000000000a1',
  editor: '00000000-0000-4000-8000-0000000000e1',
  reviewer: '00000000-0000-4000-8000-0000000000b1',
  reviewer2: '00000000-0000-4000-8000-0000000000b2',
  user: '00000000-0000-4000-8000-0000000000c1',
  other: '00000000-0000-4000-8000-0000000000c2',
} as const;

/** Personas y roles base (como propietario, saltando RLS). */
export async function seedPeople(db: TestDb): Promise<void> {
  const { owner } = db;
  for (const [key, id] of Object.entries(ids)) {
    await owner.query('insert into public.profiles (id, display_name) values ($1, $2)', [id, key]);
  }
  const grants: [string, string][] = [
    [ids.admin, 'admin'],
    [ids.editor, 'editor'],
    [ids.reviewer, 'reviewer'],
    [ids.reviewer2, 'reviewer'],
  ];
  for (const [id, role] of grants) {
    await owner.query(
      'insert into public.user_roles (user_id, role) values ($1, $2::public.app_role)',
      [id, role],
    );
  }
}
