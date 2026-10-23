/**
 * Proceso hijo de `cluster-signals.test.ts`: levanta un clúster temporal con la misma limpieza que usan los
 * orquestadores E2E (`onTerminate` + `stopAsync`) y espera una señal.
 */
import { onTerminate } from '../../../scripts/lib/e2e-run';
import { startTestCluster } from '../pg-cluster';

async function main(): Promise<void> {
  const cluster = await startTestCluster({ handleSignals: false });
  onTerminate(() => cluster.stopAsync());
  console.log(`listo ${cluster.host}`);
  setInterval(() => undefined, 1000);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
