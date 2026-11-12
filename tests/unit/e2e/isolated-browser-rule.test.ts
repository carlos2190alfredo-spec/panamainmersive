import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guarda TEXTUAL de la regla de `e2e/isolated-browser.ts` (E-108): una prueba E2E que pide teselas de relieve, o el barrido de
 * la portada, va con `isolatedTest` (un navegador propio que se cierra al terminar). Si vuelve a `test(`, el CI de Linux
 * repite los «setting up "context"» de la prueba siguiente, pero solo de vez en cuando y en otra prueba: sin esta guarda,
 * nada lo señalaría. También se exige lo contrario: una prueba sin relieve no se aísla sin motivo, porque cada aislamiento
 * arranca un navegador.
 *
 * Las pruebas se reconocen por sus llamadas al principio de línea (`test(` o `isolatedTest(`). Cada trozo llega hasta la
 * llamada siguiente, que es como Prettier deja estos archivos.
 */
const E2E = join(process.cwd(), 'e2e');
const SPECS = readdirSync(E2E).filter((f) => f.endsWith('.spec.ts'));

/** Lo que pide relieve a AWS (servido por el fixture en las pruebas) o es el barrido de 40 tamaños de la portada. */
const NEEDS_ISOLATION =
  /routeTerrain\(|TERRAIN_HOST|hillshade|terrain3d|barrido:|(?:threeD\(page\)|tourButton\(page\)|name: '(?:Relieve en 3D|Recorrido 3D)'[^)]*\))\s*\.click\(/;

interface Block {
  file: string;
  line: number;
  isolated: boolean;
  needs: boolean;
}

function blocks(file: string, source: string): Block[] {
  const starts = [...source.matchAll(/^[ \t]*(isolatedTest|test)\(/gm)];
  return starts.map((match, i) => {
    const from = match.index;
    const to = starts[i + 1]?.index ?? source.length;
    const body = source.slice(from, to);
    return {
      file,
      line: source.slice(0, from).split('\n').length,
      isolated: match[1] === 'isolatedTest',
      needs: NEEDS_ISOLATION.test(body),
    };
  });
}

const problems = (all: Block[]) =>
  all
    .filter((b) => b.isolated !== b.needs)
    .map(
      (b) =>
        `${b.file}:${String(b.line)} ${b.needs ? 'pide relieve y no va con isolatedTest' : 'va con isolatedTest sin pedir relieve'}`,
    );

const ALL = SPECS.flatMap((f) => blocks(f, readFileSync(join(E2E, f), 'utf8')));

describe('regla del navegador propio para las pruebas de relieve (E-108)', () => {
  it('cada prueba que pide relieve, y solo esas, va con isolatedTest', () => {
    expect(problems(ALL)).toEqual([]);
  });

  it('control: reconoce las pruebas y las aisladas (si el troceo fallara, la regla pasaría sin mirar nada)', () => {
    expect(ALL.length).toBeGreaterThan(250); // 292 llamadas el 2026-11-12 (los bucles generan más pruebas)
    const isolated = ALL.filter((b) => b.isolated);
    expect(isolated.length).toBeGreaterThanOrEqual(22);
    for (const file of [
      'explore-tour.spec.ts',
      'explore-interactions.spec.ts',
      'shell-review-x3.spec.ts',
    ]) {
      expect(
        isolated.some((b) => b.file === file),
        file,
      ).toBe(true);
    }
  });

  it('control: con `test(` en lugar de `isolatedTest(` la guarda lo señala, y al revés también', () => {
    const tour = readFileSync(join(E2E, 'explore-tour.spec.ts'), 'utf8');
    const reverted = tour.replace(/^([ \t]*)isolatedTest\(/m, '$1test(');
    expect(reverted).not.toBe(tour);
    expect(problems(blocks('explore-tour.spec.ts', reverted))).toHaveLength(1);

    const home = readFileSync(join(E2E, 'home.spec.ts'), 'utf8');
    const overIsolated = home.replace(/^([ \t]*)test\(/m, '$1isolatedTest(');
    expect(overIsolated).not.toBe(home);
    expect(problems(blocks('home.spec.ts', overIsolated))).toHaveLength(1);
  });
});
