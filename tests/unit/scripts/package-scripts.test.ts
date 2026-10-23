import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Los scripts de `package.json` son la interfaz de los CI y de las personas; tres de sus detalles se descubrieron al
 * romperse, y ninguna otra prueba los vigilaba:
 *  · `typecheck` y `lint` necesitan los tipos de rutas de Next (`next typegen`); en una copia limpia, sin ellos, ESLint
 *    falla con «unsafe any» por `next/root-params` (solo funcionaba donde quedaba un `.next` de otra ejecución);
 *  · los orquestadores E2E se lanzan con `node --import tsx`, NO con el CLI `tsx`: éste, ante Ctrl+C, mata al hijo con
 *    SIGKILL si no responde en 30 ms, y los clústeres de PostgreSQL y servidores quedaban huérfanos;
 *  · un `pnpm <script>` del CI que no existe (o está mal escrito) solo falla cuando corre en GitHub.
 */
const root = process.cwd();
const scripts = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;
const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');

describe('package.json', () => {
  it.each(['typecheck', 'lint'])('%s genera antes los tipos de rutas de Next', (name) => {
    expect(scripts[name]).toMatch(/^next typegen && /);
  });

  it('tiene un script `typegen`', () => {
    expect(scripts.typegen).toBe('next typegen');
  });

  it.each(['test:e2e:db', 'test:e2e:content'])(
    '%s se lanza con `node --import tsx` (no con el CLI `tsx`, que mata al hijo 30 ms tras una señal)',
    (name) => {
      expect(scripts[name]).toMatch(/^node --import tsx scripts\//);
      expect(scripts[name]).not.toMatch(/^tsx /);
    },
  );

  it('`check:e2e-skips` se lanza igual (lo usa el CI tras los E2E)', () => {
    expect(scripts['check:e2e-skips']).toBe('node --import tsx scripts/check-e2e-skips.ts');
  });

  it('`check` encadena las cuatro puertas rápidas, en orden', () => {
    expect(scripts.check).toBe('pnpm typecheck && pnpm lint && pnpm format && pnpm test');
  });

  it('todo `pnpm <script>` que ejecuta el CI existe en package.json', () => {
    const builtins = new Set(['install', 'exec', 'dlx', 'store', 'run']);
    const used = [...workflow.matchAll(/^\s*(?:- )?run:\s*(.+)$/gm)]
      .flatMap((m) => [...(m[1] ?? '').matchAll(/\bpnpm\s+(?:run\s+)?([a-z0-9:-]+)/g)])
      .map((m) => m[1] ?? '')
      .filter((name) => name !== '' && !builtins.has(name));
    expect(used.length, 'el CI ejecuta algún script de pnpm').toBeGreaterThan(5);
    for (const name of used) expect(Object.keys(scripts), `pnpm ${name}`).toContain(name);
  });
});
