import { afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { startTestCluster, type TestCluster } from './pg-cluster';

/**
 * El clúster de pruebas es rápido a costa de la durabilidad; `pnpm perf:db` necesita medir también SIN esa renuncia
 * (el bloqueo de la 0011 se mantiene hasta el `COMMIT`, y éste solo cuesta de verdad con `fsync`). Una opción que no
 * cambiara nada daría números «durables» que no lo son: se comprueba el valor REAL que ve una conexión nueva.
 */
describe('ajustes del clúster temporal', () => {
  const started: TestCluster[] = [];
  afterAll(() => {
    for (const c of started) c.stop();
  });

  async function settings(cluster: TestCluster): Promise<Record<string, string>> {
    const client = new Client({
      host: cluster.host,
      port: cluster.port,
      user: 'postgres',
      database: 'postgres',
    });
    await client.connect();
    try {
      const { rows } = await client.query<{ name: string; setting: string }>(
        "select name, setting from pg_settings where name in ('fsync', 'synchronous_commit', 'full_page_writes')",
      );
      return Object.fromEntries(rows.map((r) => [r.name, r.setting]));
    } finally {
      await client.end();
    }
  }

  it('por defecto es de pruebas: sin fsync, sin commit síncrono y sin páginas completas', async () => {
    const cluster = await startTestCluster({ handleSignals: false });
    started.push(cluster);
    expect(await settings(cluster)).toEqual({
      fsync: 'off',
      synchronous_commit: 'off',
      full_page_writes: 'off',
    });
  }, 60_000);

  it('con `durable: true` deja los valores de producción de PostgreSQL', async () => {
    const cluster = await startTestCluster({ handleSignals: false, durable: true });
    started.push(cluster);
    expect(await settings(cluster)).toEqual({
      fsync: 'on',
      synchronous_commit: 'on',
      full_page_writes: 'on',
    });
  }, 60_000);
});
