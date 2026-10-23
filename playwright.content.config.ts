import { defineConfig, devices } from '@playwright/test';
import { launchOptions } from './e2e/launch-options';

/**
 * Suite E2E de la ficha CON contenido verificado (`pnpm test:e2e:content`). La orquesta `scripts/e2e-content.ts`, que
 * construye y sirve una copia de la aplicación con contenido sintético: por eso aquí no hay `webServer`.
 */
const PORT = Number(process.env.E2E_CONTENT_PORT ?? 3300);

export default defineConfig({
  testDir: 'e2e-content',
  fullyParallel: true,
  workers: 2,
  // En CI, un `test.only` olvidado ejecutaría UNA prueba y saldría en verde; y una prueba intermitente es un fallo.
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', launchOptions },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
