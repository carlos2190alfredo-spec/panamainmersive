/**
 * Proceso hijo de `e2e-run.test.ts`: registra una limpieza con `onTerminate`, avisa de que está listo y espera una
 * señal. La limpieza escribe una marca al empezar y otra al acabar (y tarda un poco, como parar un servidor).
 */
import { appendFileSync } from 'node:fs';
import { onTerminate } from '../../../../scripts/lib/e2e-run';

const marks = process.argv[2] as string;
onTerminate(async () => {
  // Se cuentan los INICIOS: la primera limpieza termina con `process.exit`, que se lleva por delante a las repetidas
  // antes de que escriban su marca final (por eso, solo con la marca final, repetirla era indetectable).
  appendFileSync(marks, 'inicio\n');
  await new Promise((r) => setTimeout(r, 300));
  appendFileSync(marks, 'limpieza\n');
});
console.log('listo');
setInterval(() => undefined, 1000);
