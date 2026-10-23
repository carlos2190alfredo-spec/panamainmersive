import { describe, expect, it } from 'vitest';
import { parseMaxSkipped, reportProblems, summarizeReport } from '../../../scripts/lib/e2e-report';

/**
 * Presupuesto de omisiones de `pnpm test:e2e`. El CI no genera el mapa base, así que decenas de pruebas se OMITEN
 * diciéndolo; el job seguía en verde con «E2E y accesibilidad» en el nombre. Una omisión que crece sin que nadie la vea
 * (otro `test.skip`, o una condición que ya no se cumple) es una cobertura que se pierde en silencio: el presupuesto
 * hace que crezca solo a propósito.
 */

const MAP_REASON = 'Falta public/data/panama-basemap.pmtiles';

function test(status: 'expected' | 'skipped' | 'unexpected' | 'flaky', reason?: string) {
  return {
    projectName: 'desktop',
    status,
    expectedStatus: status === 'skipped' ? 'skipped' : 'passed',
    annotations: reason === undefined ? [] : [{ type: 'skip', description: reason }],
    results: [],
  };
}

/** Informe con la forma REAL del reportero `json` de Playwright 1.64 (suites anidadas, `stats`, `errors`). */
function report(
  tests: ReturnType<typeof test>[],
  overrides: { stats?: Record<string, number>; errors?: unknown[] } = {},
) {
  const count = (s: string) => tests.filter((t) => t.status === s).length;
  return {
    config: {},
    suites: [
      {
        title: 'map.spec.ts',
        specs: [],
        suites: [
          { title: 'mapa', specs: tests.map((t) => ({ title: 't', ok: true, tests: [t] })) },
        ],
      },
    ],
    errors: overrides.errors ?? [],
    stats: overrides.stats ?? {
      expected: count('expected'),
      skipped: count('skipped'),
      unexpected: count('unexpected'),
      flaky: count('flaky'),
    },
  };
}

describe('summarizeReport', () => {
  it('cuenta por estado recorriendo las suites anidadas', () => {
    const summary = summarizeReport(
      report([test('expected'), test('expected'), test('skipped', MAP_REASON), test('flaky')]),
    );
    expect(summary).toMatchObject({ expected: 2, skipped: 1, unexpected: 0, flaky: 1, errors: 0 });
  });

  it('agrupa las omitidas por motivo (y dice cuando no declaran ninguno)', () => {
    const summary = summarizeReport(
      report([
        test('skipped', MAP_REASON),
        test('skipped', MAP_REASON),
        test('skipped', 'Hay DATABASE_URL'),
        test('skipped'),
      ]),
    );
    expect(summary.skippedByReason).toEqual({
      [MAP_REASON]: 2,
      'Hay DATABASE_URL': 1,
      '(sin motivo declarado)': 1,
    });
  });

  it.each([
    ['no es un objeto', 'texto'],
    ['sin suites', { stats: {} }],
    ['sin stats', { suites: [] }],
  ])(
    'un informe con forma inesperada FALLA (%s), no se lee como «0 pruebas, 0 problemas»',
    (_n, raw) => {
      expect(() => summarizeReport(raw)).toThrow(/informe/i);
    },
  );
});

describe('reportProblems', () => {
  const within = { maxSkipped: 2 };

  it('sin problemas: algo corrió, nada falla y las omitidas caben en el presupuesto', () => {
    const summary = summarizeReport(report([test('expected'), test('skipped', MAP_REASON)]));
    expect(reportProblems(summary, within)).toEqual([]);
  });

  it('más omitidas que el presupuesto es un problema y nombra el motivo', () => {
    const tests = [
      test('expected'),
      ...Array.from({ length: 3 }, () => test('skipped', MAP_REASON)),
    ];
    const problems = reportProblems(summarizeReport(report(tests)), within).join('\n');
    expect(problems).toMatch(/3 .*omitid.*2/i);
    expect(problems).toContain(MAP_REASON);
  });

  it('menos omitidas que el presupuesto SÍ es aceptable (no obliga a un número exacto)', () => {
    const summary = summarizeReport(report([test('expected')]));
    expect(reportProblems(summary, { maxSkipped: 56 })).toEqual([]);
  });

  it('una ejecución en la que no pasó ninguna prueba es un problema (aunque todo esté «omitido»)', () => {
    const summary = summarizeReport(report([test('skipped', MAP_REASON)]));
    expect(reportProblems(summary, within).join('\n')).toMatch(/ninguna prueba/i);
  });

  it('fallos, intermitentes y errores globales son problemas', () => {
    const summary = summarizeReport(
      report([test('expected'), test('unexpected'), test('flaky')], { errors: [{ message: 'x' }] }),
    );
    const problems = reportProblems(summary, within).join('\n');
    expect(problems).toMatch(/fall/i);
    expect(problems).toMatch(/intermitente/i);
    expect(problems).toMatch(/error/i);
  });

  it('un informe cuyo `stats` no cuadra con sus pruebas es un problema (no se confía en uno solo)', () => {
    const summary = summarizeReport(
      report([test('expected'), test('skipped', MAP_REASON)], {
        stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 },
      }),
    );
    expect(reportProblems(summary, within).join('\n')).toMatch(/no cuadra|incoherente/i);
  });
});

describe('parseMaxSkipped', () => {
  it('acepta un entero no negativo', () => {
    expect(parseMaxSkipped('56')).toBe(56);
    expect(parseMaxSkipped('0')).toBe(0);
  });

  it.each([undefined, '', '-1', '1.5', 'abc', '5 6', 'Infinity'])(
    'un presupuesto ausente o no válido (%j) FALLA: no se asume «sin límite»',
    (raw) => {
      expect(() => parseMaxSkipped(raw)).toThrow(/max-skipped|E2E_MAX_SKIPPED/);
    },
  );
});
