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
    trace: 'retain-on-failure',
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
