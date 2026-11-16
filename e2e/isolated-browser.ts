import { test as base, type BrowserContext } from '@playwright/test';

/**
 * Pruebas que dejan al navegador con mucho trabajo de pintado por software, cada una en un NAVEGADOR PROPIO que se cierra al
 * terminar (E-108).
 *
 * Por qué. Playwright lanza UN navegador por trabajador y crea un contexto nuevo por prueba. En las seis ejecuciones del CI
 * tras la fusión del PR #9 (Linux, `chrome-headless-shell`, WebGL por software) fallaron entre 2 y 6 pruebas por ejecución:
 * 24 con «Test timeout of 30000ms exceeded while setting up "context"» o «browser.newContext: … Failed to find browser
 * context». En las 25 pruebas fallidas, la anterior del MISMO trabajador era una de las «desencadenantes»: relieve con
 * cabeceo o vuelos del «Recorrido 3D», o el barrido de 40 tamaños de la portada, que no usa WebGL. Tras cualquier otra
 * prueba hubo 0 fallos en 2 838 transiciones. El otro trabajador siguió a su ritmo mientras tanto, así que no es la carga de
 * la máquina ni el servidor. Reintentadas en un trabajador nuevo (navegador nuevo), pasaron todas. No es un cuelgue: el
 * siguiente `newContext()` se retrasa de 15 a más de 40 s. En macOS no se reproduce: la portada abre en 3 s tras el recorrido.
 *
 * Regla, vigilada por `tests/unit/e2e/isolated-browser-rule.test.ts`: va con `isolatedTest` toda prueba que pida teselas de
 * relieve (`routeTerrain`, `TERRAIN_HOST`, «Sombreado», «Relieve en 3D», «Recorrido 3D») y el barrido de `shell-review-x3`.
 * El criterio es más amplio que el de los datos, que solo señalan las pruebas con cabeceo, vuelos o barrido. Se eligió por ser
 * sencillo de comprobar, y aislar de más solo cuesta arrancar un navegador (≈ 1 s).
 *
 * Cómo. Se sustituye el `context` por uno de un navegador lanzado para la prueba. Playwright aplica a TODO contexto creado
 * durante una prueba las opciones del proyecto y de `test.use` (viewport, `isMobile`, `reducedMotion`, idioma…) y le graba la
 * traza (`retain-on-failure`): no hay que copiarlas a mano. Se salta `_contextFactory`, así que NO heredan `video` ni
 * `connectOptions`; hoy no se usan.
 *
 * Plazos. El arranque y el cierre COMPARTEN un plazo propio de 90 s, que no se descuenta del de la prueba ni aparece en su
 * `duration`. El retraso que antes pagaba la prueba siguiente ahora cae en el cierre de esta. Para medirlo, cada prueba anota
 * cuánto tardaron el arranque y el cierre (`isolated-browser` en el informe JSON). El contexto se cierra antes que el
 * navegador porque es entonces cuando se guarda la traza. Ese cierre tiene un tope de 30 s; pase lo que pase, el navegador se
 * cierra después.
 */
const CONTEXT_CLOSE_LIMIT_MS = 30_000;

async function closeWithin(context: BrowserContext, ms: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<string>((resolve) => {
    timer = setTimeout(() => {
      resolve(`contexto sin cerrar tras ${String(ms)} ms`);
    }, ms);
  });
  try {
    return await Promise.race([context.close().then(() => 'ok'), limit]);
  } finally {
    clearTimeout(timer);
  }
}

export const isolatedTest = base.extend({
  context: [
    // `provide` es el `use` de Playwright: con ese nombre, la regla de los hooks de React lo confunde con `React.use`.
    async ({ playwright, browserName, launchOptions }, provide, testInfo) => {
      // La marca va desde el principio (así sale aunque el arranque falle) y se completa con los tiempos al cerrar.
      const note = { type: 'isolated-browser', description: 'arrancando' };
      testInfo.annotations.push(note);
      const started = Date.now();
      const browser = await playwright[browserName].launch(launchOptions);
      const launchMs = Date.now() - started;
      let closeNote = 'sin contexto';
      let closingAt = 0;
      try {
        const context = await browser.newContext();
        try {
          await provide(context);
        } finally {
          closingAt = Date.now();
          closeNote = await closeWithin(context, CONTEXT_CLOSE_LIMIT_MS);
        }
      } finally {
        await browser.close();
        const closeMs = closingAt ? Date.now() - closingAt : 0;
        note.description = `arranque ${String(launchMs)} ms · cierre ${String(closeMs)} ms (${closeNote})`;
      }
    },
    { scope: 'test', timeout: 90_000 },
  ],
});
