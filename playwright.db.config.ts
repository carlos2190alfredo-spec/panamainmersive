import { defineConfig, devices } from '@playwright/test';
import { launchOptions } from './e2e/launch-options';

/**
 * Suite E2E CON base de datos (`pnpm test:e2e:db`). La orquesta `scripts/e2e-db.ts`: levanta un PostgreSQL
 * temporal, importa y publica las áreas reales y arranca `next start` apuntando a él. Por eso aquí no hay
 * `webServer`: el servidor lo pone el script (y la suite normal `pnpm test:e2e` sigue sin necesitar BD).
 */
const PORT = Number(process.env.E2E_DB_PORT ?? 3200);

export default defineConfig({
  testDir: 'e2e-db',
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', launchOptions },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
