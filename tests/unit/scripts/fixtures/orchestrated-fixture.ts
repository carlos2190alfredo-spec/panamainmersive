/**
 * Proceso hijo de `e2e-run.test.ts`: un «guion» mínimo con la misma forma que `e2e-content.ts` (`withTermination` +
 * `exitWith`). Su limpieza escribe una marca al empezar y otra al acabar y tarda un poco, como parar un clúster.
 * Modos: `ok` (termina bien), `code` (devuelve un código distinto de 0), `fail` (falla por su cuenta) y `derived` (espera una señal y entonces su trabajo FALLA,
 * como un build que muere con el grupo de procesos: un fallo que es consecuencia de la interrupción, no su causa).
 */
import { appendFileSync } from 'node:fs';
import { exitWith, withTermination } from '../../../../scripts/lib/e2e-run';

const marks = process.argv[2] as string;
const mode = process.argv[3] as 'ok' | 'fail' | 'code' | 'derived';

async function cleanup(): Promise<void> {
  appendFileSync(marks, 'inicio\n');
  await new Promise((r) => setTimeout(r, 300));
  appendFileSync(marks, 'limpieza\n');
}

exitWith(() =>
  withTermination(cleanup, async () => {
    console.log('listo');
    if (mode === 'ok') return 0;
    if (mode === 'code') return 3; // p. ej. el código de Playwright
    if (mode === 'fail') throw new Error('fallo propio del guion');
    // Sin algo que lo mantenga vivo, Node termina con 0 antes de que llegue la señal.
    setInterval(() => undefined, 1000);
    return new Promise<number>((_resolve, reject) => {
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(signal, () => {
          setTimeout(() => {
            reject(new Error('fallo derivado de la señal'));
          }, 20);
        });
      }
    });
  }),
);
