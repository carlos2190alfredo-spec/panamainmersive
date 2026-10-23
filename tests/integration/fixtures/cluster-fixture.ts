/**
 * Proceso hijo de `cluster-signals.test.ts`: levanta un clúster temporal y espera una señal. Dos modos:
 *  · (sin argumento) con la misma limpieza que usan los orquestadores E2E: `handleSignals: false` + `onTerminate` +
 *    `stopAsync`;
 *  · `default`: sin opciones, con los manejadores de señal POR DEFECTO del propio clúster (lo que usa el
 *    `globalSetup` de Vitest).
 */
import { onTerminate } from '../../../scripts/lib/e2e-run';
import { startTestCluster } from '../pg-cluster';

async function main(): Promise<void> {
  if (process.argv[2] === 'default') {
    const cluster = await startTestCluster();
    console.log(`listo ${cluster.host}`);
  } else {
    const cluster = await startTestCluster({ handleSignals: false });
    onTerminate(() => cluster.stopAsync());
    console.log(`listo ${cluster.host}`);
  }
  setInterval(() => undefined, 1000);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
