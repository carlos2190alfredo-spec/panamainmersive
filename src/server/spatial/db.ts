import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { SPATIAL_LIMITS } from '@/domains/geography/spatial-query';

/**
 * Acceso a la base de datos de la API espacial (ADR-0016). SOLO servidor.
 *
 * Cada petición corre en una transacción de SOLO LECTURA con `set local role anon`: la RLS decide qué filas
 * se ven (no el código de la aplicación) y el rol no puede escribir. Tiempos máximos de sentencia, de espera
 * de bloqueos y de transacción inactiva acotan el coste de una consulta mal intencionada.
 *
 * La URL de conexión puede pertenecer a un usuario sin privilegios que sea miembro de `anon`; si es el
 * propietario, `set local role anon` igualmente aplica la RLS (probado en `spatial-repository.test.ts`).
 */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>;
}

/** Sin `DATABASE_URL`, o sin poder conectar: el servicio responde 503 (nunca inventa datos). */
export class DatabaseUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DatabaseUnavailableError';
  }
}

const pools = new Map<string, Pool>();

function poolFor(connectionString: string): Pool {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 2_000,
      application_name: 'panama-immersive-spatial',
    });
    // Un error de un cliente inactivo no debe tumbar el proceso.
    pool.on('error', (error) => {
      console.error('spatial pool error', error.name);
    });
    pools.set(connectionString, pool);
  }
  return pool;
}

/** Cierra los pools (apagado ordenado y pruebas). */
export async function closeSpatialPools(): Promise<void> {
  const open = [...pools.values()];
  pools.clear();
  await Promise.all(open.map((pool) => pool.end()));
}

export type RunAnon = <T>(fn: (q: Queryable) => Promise<T>) => Promise<T>;

export function createRunAnon(connectionString: string | undefined): RunAnon {
  return async function runAnon<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    if (!connectionString) throw new DatabaseUnavailableError('DATABASE_URL no configurada');
    let client: PoolClient;
    try {
      client = await poolFor(connectionString).connect();
    } catch (error) {
      throw new DatabaseUnavailableError('No se pudo conectar a la base de datos', {
        cause: error,
      });
    }
    let failed = false;
    try {
      await client.query('begin read only');
      await client.query('set local role anon');
      // PostGIS vive en `extensions` (igual que Supabase).
      await client.query('set local search_path = public, extensions');
      await client.query(
        `select set_config('statement_timeout', $1, true),
                set_config('lock_timeout', '1000', true),
                set_config('idle_in_transaction_session_timeout', '10000', true)`,
        [String(SPATIAL_LIMITS.statementTimeoutMs)],
      );
      return await fn(client);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      try {
        await client.query('rollback');
      } catch {
        failed = true;
      }
      // Una conexión en estado dudoso se destruye en lugar de volver al pool.
      client.release(failed);
    }
  };
}
