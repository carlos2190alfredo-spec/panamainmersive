import { join } from 'node:path';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';
import { migrate } from '../../scripts/db/lib';
import { startTestCluster, type TestCluster } from './pg-cluster';

declare module 'vitest' {
  export interface ProvidedContext {
    pg: { host: string; port: number; user: string; template: string };
  }
}

let cluster: TestCluster | undefined;

/**
 * Levanta un PostgreSQL temporal, aplica TODAS las migraciones UNA vez en una base plantilla y la
 * publica a los ficheros de prueba (cada uno clona la plantilla: aislamiento sin repetir migraciones).
 */
export default async function setup(project: TestProject) {
  cluster = await startTestCluster();
  const admin = new Client({
    host: cluster.host,
    port: cluster.port,
    user: 'postgres',
    database: 'postgres',
  });
  await admin.connect();
  await admin.query('create database pi_template');
  await admin.end();

  const tpl = new Client({
    host: cluster.host,
    port: cluster.port,
    user: 'postgres',
    database: 'pi_template',
  });
  await tpl.connect();
  await migrate(tpl, join(process.cwd(), 'db/migrations'));
  await tpl.end();

  project.provide('pg', {
    host: cluster.host,
    port: cluster.port,
    user: 'postgres',
    template: 'pi_template',
  });
}

export function teardown() {
  cluster?.stop();
  cluster = undefined;
}
