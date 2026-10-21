import { existsSync } from 'node:fs';

/**
 * Chromium para Playwright: PLAYWRIGHT_CHROMIUM_EXECUTABLE lo fija; si no, se usa el preinstalado de este
 * entorno cloud (no se descarga) y, si tampoco existe (CI, máquina local), el que gestiona Playwright
 * (`pnpm exec playwright install chromium`). WebGL por software (SwiftShader) para el mapa.
 */
const PREINSTALLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

export const launchOptions = {
  ...(executablePath ? { executablePath } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
