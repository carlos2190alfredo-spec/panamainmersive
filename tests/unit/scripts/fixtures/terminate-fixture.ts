/**
 * Proceso hijo de `e2e-run.test.ts`: registra una limpieza con `onTerminate`, avisa de que está listo y espera una
 * señal. La limpieza escribe una marca (y tarda un poco, como parar un servidor o un clúster).
 */
import { appendFileSync } from 'node:fs';
import { onTerminate } from '../../../../scripts/lib/e2e-run';

const marks = process.argv[2] as string;
onTerminate(async () => {
  await new Promise((r) => setTimeout(r, 300));
  appendFileSync(marks, 'limpieza\n');
});
console.log('listo');
setInterval(() => undefined, 1000);
