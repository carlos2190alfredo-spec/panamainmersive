import { defineConfig, devices } from '@playwright/test';
import { launchOptions } from './e2e/launch-options';

const PORT = Number(process.env.E2E_PORT ?? 3100);
// IMPORTANTE: `localhost`, no `127.0.0.1`. Con `next start -H 127.0.0.1` Next normaliza el host a
// `localhost` en `nextUrl`, trata la reescritura del proxy como EXTERNA y las rutas localizadas
// entran en bucle 307. No es un defecto de la aplicación (ver docs/testing.md).
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Un reintento sirve para distinguir «intermitente» de «roto», pero NO para dar el verde: una prueba que falla y
  // pasa al reintentar es un FALLO en CI (antes salía con 0 y solo lo delataba una línea «1 flaky» del registro).
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // En CI también un informe JSON: `pnpm check:e2e-skips` lo lee para limitar las pruebas OMITIDAS (sin mapa base
  // decenas se omiten diciéndolo; sin un límite, otra omisión perdería cobertura en silencio).
  reporter: process.env.CI
    ? [['list'], ['json', { outputFile: 'test-results/e2e-report.json' }]]
    : [['list']],
  use: {
    baseURL,
    // La traza se graba siempre y solo se conserva si la prueba falla, pero SIN la cinta de capturas: grabarla obliga al
    // navegador a producir y leer cada cuadro, y con WebGL por software (SwiftShader: el Chromium de aquí y del CI) eso le
    // quita la CPU al mapa. `map.spec` «cambiar de idioma…» (dos cargas del mapa), una trabajadora, mismo árbol, alternando:
    // 18,3–20,1 s con las capturas frente a 9,8–13,7 s sin ellas; con las capturas vencía los 30 s en la suite completa.
    // La traza sigue llevando las instantáneas del DOM, la consola y la red; lo que no ve es el lienzo del mapa (para eso,
    // `E2E_TRACE_SCREENSHOTS=1`). docs/performance.md M-11.
    trace: { mode: 'retain-on-failure', screenshots: process.env.E2E_TRACE_SCREENSHOTS === '1' },
    launchOptions,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testIgnore: /.*\.mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
      testMatch: /.*\.(mobile|a11y)\.spec\.ts/,
    },
  ],
  webServer: {
    // Se prueba el build de producción (CSP/SRI/cabeceras reales), no el servidor de desarrollo.
    // Requiere `pnpm build` previo.
    command: `pnpm exec next start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { SITE_ENV: process.env.SITE_ENV ?? 'development' },
  },
});
