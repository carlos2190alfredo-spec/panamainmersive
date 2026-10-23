import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Las tres configuraciones de Playwright en CI. Una revisión independiente reprodujo dos formas de «verde» engañoso:
 * un `test.only` olvidado en `e2e-content/` ejecutaba UNA prueba y salía con 0 (solo la configuración principal tenía
 * `forbidOnly`), y una prueba intermitente que fallaba y pasaba al reintentar salía con 0 y solo se notaba en una
 * línea «1 flaky» del registro.
 */
const CONFIGS = [
  ['principal', '../../../playwright.config'],
  ['contenido', '../../../playwright.content.config'],
  ['con BD', '../../../playwright.db.config'],
] as const;

async function load(path: string, ci: string | undefined) {
  vi.resetModules();
  if (ci === undefined) vi.stubEnv('CI', '');
  else vi.stubEnv('CI', ci);
  return ((await import(/* @vite-ignore */ path)) as { default: Record<string, unknown> }).default;
}

describe('configuraciones de Playwright', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(CONFIGS)(
    '%s: en CI prohíbe `test.only` y trata una prueba intermitente como FALLO',
    async (_name, path) => {
      const config = await load(path, 'true');
      expect(config.forbidOnly, 'forbidOnly').toBe(true);
      expect(config.failOnFlakyTests, 'failOnFlakyTests').toBe(true);
    },
  );

  it.each(CONFIGS)(
    '%s: en local no estorba (se puede usar `test.only` y no se exige lo mismo)',
    async (_name, path) => {
      const config = await load(path, undefined);
      expect(config.forbidOnly).toBe(false);
      expect(config.failOnFlakyTests).toBe(false);
    },
  );

  it('la principal escribe en CI el informe JSON que lee `check:e2e-skips` (y en local solo la lista)', async () => {
    const reporters = (config: Record<string, unknown>) => config.reporter as [string, unknown?][];
    const ci = reporters(await load(CONFIGS[0][1], 'true'));
    expect(ci.map(([name]) => name)).toEqual(['list', 'json']);
    expect(ci[1]?.[1]).toEqual({ outputFile: 'test-results/e2e-report.json' });
    expect(reporters(await load(CONFIGS[0][1], undefined)).map(([name]) => name)).toEqual(['list']);
  });

  it('el reintento de la configuración principal sigue existiendo en CI (para distinguir «flaky» de «roto»)', async () => {
    const config = await load(CONFIGS[0][1], 'true');
    expect(config.retries).toBe(1);
  });
});
