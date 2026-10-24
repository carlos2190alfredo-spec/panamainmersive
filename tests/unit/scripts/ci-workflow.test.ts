import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardas TEXTUALES de `.github/workflows/ci.yml`. No ejecutan el flujo (eso solo ocurre en GitHub: ESTADO IMPLEMENTED,
 * no VERIFIED) ni parsean YAML (el proyecto no tiene un analizador): reconocen los bloques por indentación. Fijan lo que
 * una revisión independiente encontró mal (la SINTAXIS YAML la valida `pnpm format`: Prettier analiza el archivo y
 * rechazó un `: ` sin comillas en un nombre de job que estas guardas textuales no podían ver):
 *  · sin `timeout-minutes` un job colgado consume 6 h;
 *  · `cancel-in-progress: true` también en `main` cancela la ejecución de un commit ya integrado, que se queda sin veredicto;
 *  · no había un único job que resumiera el resultado (protección de rama sobre UN check obligatorio);
 *  · un job llamado «E2E y accesibilidad» salía en verde con 56 de 160 pruebas omitidas sin que nada lo limitara;
 *  · tras un fallo no quedaba ninguna traza y no se imprimían las versiones (Chromium, PostgreSQL) con las que corrió.
 */
const workflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

function jobBlocks(source: string): Record<string, string> {
  const start = source.indexOf('\njobs:\n');
  expect(start, 'el flujo tiene la sección `jobs:`').toBeGreaterThan(-1);
  const lines = source.slice(start + 1).split('\n');
  const blocks: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of lines.slice(1)) {
    const header = /^ {2}([a-z0-9-]+):\s*$/.exec(line);
    if (header?.[1] !== undefined) {
      current = header[1];
      blocks[current] = [];
    } else if (current !== null) {
      blocks[current]?.push(line);
    }
  }
  return Object.fromEntries(Object.entries(blocks).map(([id, body]) => [id, body.join('\n')]));
}

const jobs = jobBlocks(workflow);
const TEST_JOBS = ['check', 'pipelines', 'integration', 'e2e', 'e2e-content'] as const;

describe('ci.yml', () => {
  it('declara los jobs que se esperan (y ci-ok)', () => {
    expect(Object.keys(jobs).sort()).toEqual([...TEST_JOBS, 'ci-ok'].sort());
  });

  it.each(Object.keys(jobs))('%s: tiene `timeout-minutes` razonable (1–60)', (id) => {
    const match = /^ {4}timeout-minutes:\s*(\d+)\s*$/m.exec(jobs[id] ?? '');
    expect(match, 'falta timeout-minutes').not.toBeNull();
    const minutes = Number(match?.[1]);
    expect(minutes).toBeGreaterThanOrEqual(1);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  it('no cancela las ejecuciones de `main` (solo las de ramas y PR)', () => {
    const value = /cancel-in-progress:\s*(.+)$/m.exec(workflow)?.[1]?.trim();
    expect(value).toBeDefined();
    expect(value).not.toBe('true');
    expect(value).toContain("github.ref != 'refs/heads/main'");
  });

  describe('ci-ok (el único check que haría falta exigir)', () => {
    const block = jobs['ci-ok'] ?? '';

    it('espera a TODOS los demás jobs', () => {
      const needs = /^ {4}needs:\s*\[([^\]]*)\]/m.exec(block)?.[1] ?? '';
      expect(
        needs
          .split(',')
          .map((n) => n.trim())
          .sort(),
      ).toEqual([...TEST_JOBS].sort());
    });

    it('se ejecuta SIEMPRE (si no, un job fallido lo dejaría «omitido», que no es rojo)', () => {
      expect(block).toMatch(/^ {4}if:\s*\$\{\{\s*always\(\)\s*\}\}/m);
    });

    it('falla si algún job falló, se canceló o se omitió', () => {
      for (const state of ['failure', 'cancelled', 'skipped']) {
        expect(block).toContain(`contains(needs.*.result, '${state}')`);
      }
    });
  });

  describe('e2e', () => {
    const block = jobs.e2e ?? '';

    it('limita las pruebas omitidas con un presupuesto numérico', () => {
      expect(block).toMatch(/pnpm check:e2e-skips/);
      expect(block).toMatch(/E2E_MAX_SKIPPED:\s*'\d+'/);
    });

    it('su nombre no promete cobertura que el CI no tiene (el mapa base no se genera)', () => {
      const name = /^ {4}name:\s*(.+)$/m.exec(block)?.[1] ?? '';
      expect(name).toMatch(/omit|sin mapa|mapa base/i);
    });
  });

  it.each(['e2e', 'e2e-content'])('%s: sube las trazas si falla', (id) => {
    const block = jobs[id] ?? '';
    // fijada por hash de commit (F4-17b); la forma de TODAS las acciones la vigila `action-pins.test.ts`
    expect(block).toMatch(/uses:\s*actions\/upload-artifact@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+/);
    expect(block).toMatch(/if:\s*failure\(\)/);
    expect(block).toMatch(/path:\s*test-results\//);
    expect(block).toMatch(/if-no-files-found:\s*ignore/);
  });

  it.each(['e2e', 'e2e-content', 'integration'])(
    '%s: imprime las versiones con las que corre',
    (id) => {
      const block = jobs[id] ?? '';
      expect(block).toMatch(/name:\s*Versiones/);
      expect(block).toContain('node --version');
      expect(block).toContain('pnpm --version');
    },
  );

  it('los jobs con Chromium imprimen su versión y los de PostgreSQL la suya', () => {
    expect(jobs.e2e).toContain('playwright --version');
    expect(jobs['e2e-content']).toContain('playwright --version');
    expect(jobs.integration).toContain('postgres --version');
    expect(jobs['e2e-content']).toContain('postgres --version');
  });

  it('el job `check` comprueba las licencias de las dependencias (determinista, sin red)', () => {
    expect(jobs.check).toMatch(/^ {6}- run: pnpm check:licenses\s*$/m);
  });

  it('la auditoría de avisos NO está en este flujo: cambia con la base de avisos aunque el código no cambie (audit.yml)', () => {
    expect(workflow).not.toMatch(/check:audit/);
  });

  it('declara que `test:e2e:db` no está en el flujo (necesita datos que el CI no genera)', () => {
    expect(workflow).toMatch(/test:e2e:db/);
    expect(workflow).not.toMatch(/run:\s*pnpm test:e2e:db/);
  });
});
