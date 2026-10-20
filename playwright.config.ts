import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
// IMPORTANTE: `localhost`, no `127.0.0.1`. Con `next start -H 127.0.0.1` Next normaliza el host a
// `localhost` en `nextUrl`, trata la reescritura del proxy como EXTERNA y las rutas localizadas
// entran en bucle 307. No es un defecto de la aplicación (ver docs/testing.md).
const baseURL = `http://localhost:${PORT}`;

// Chromium: PLAYWRIGHT_CHROMIUM_EXECUTABLE lo fija; si no, se usa el preinstalado de este entorno cloud
// (no se descarga) y, si tampoco existe (CI, máquina local), el que gestiona Playwright
// (`pnpm exec playwright install chromium`).
const PREINSTALLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
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
