/**
 * Lectura del informe JSON de Playwright (`reporter: json`) para el presupuesto de omisiones de `pnpm test:e2e`.
 *
 * El CI no genera el mapa base, así que decenas de pruebas se OMITEN diciéndolo. Sin un límite, otra omisión (un
 * `test.skip` nuevo, o una condición que deja de cumplirse) pierde cobertura en silencio y el job sigue en verde.
 */

export interface ReportSummary {
  readonly expected: number;
  readonly skipped: number;
  readonly unexpected: number;
  readonly flaky: number;
  readonly errors: number;
  /** Motivo declarado (`test.skip(cond, motivo)`) → cuántas pruebas se omitieron por él. */
  readonly skippedByReason: Readonly<Record<string, number>>;
  /** `stats` del propio informe: si no cuadra con lo contado, el informe no es de fiar. */
  readonly statsMismatch: string | null;
}

const NO_REASON = '(sin motivo declarado)';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(detail: string): Error {
  return new Error(`El informe de Playwright tiene una forma inesperada: ${detail}.`);
}

function reasonOf(test: Record<string, unknown>): string {
  const annotations = Array.isArray(test.annotations) ? (test.annotations as unknown[]) : [];
  for (const annotation of annotations) {
    if (
      isRecord(annotation) &&
      annotation.type === 'skip' &&
      typeof annotation.description === 'string' &&
      annotation.description !== ''
    ) {
      return annotation.description;
    }
  }
  return NO_REASON;
}

export function summarizeReport(raw: unknown): ReportSummary {
  if (!isRecord(raw)) throw malformed('no es un objeto');
  if (!Array.isArray(raw.suites)) throw malformed('falta `suites`');
  if (!isRecord(raw.stats)) throw malformed('falta `stats`');

  const counts = { expected: 0, skipped: 0, unexpected: 0, flaky: 0 };
  const skippedByReason: Record<string, number> = {};

  const visit = (suite: unknown): void => {
    if (!isRecord(suite)) return;
    for (const spec of Array.isArray(suite.specs) ? (suite.specs as unknown[]) : []) {
      if (!isRecord(spec)) continue;
      for (const test of Array.isArray(spec.tests) ? (spec.tests as unknown[]) : []) {
        if (!isRecord(test)) continue;
        const status = test.status;
        if (status === 'expected' || status === 'unexpected' || status === 'flaky') {
          counts[status] += 1;
        } else if (status === 'skipped') {
          counts.skipped += 1;
          const reason = reasonOf(test);
          skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
        }
      }
    }
    for (const child of Array.isArray(suite.suites) ? (suite.suites as unknown[]) : [])
      visit(child);
  };
  for (const suite of raw.suites as unknown[]) visit(suite);

  const mismatches = (['expected', 'skipped', 'unexpected', 'flaky'] as const).filter(
    (key) => raw.stats !== undefined && (raw.stats as Record<string, unknown>)[key] !== counts[key],
  );
  return {
    ...counts,
    errors: Array.isArray(raw.errors) ? raw.errors.length : 0,
    skippedByReason,
    statsMismatch:
      mismatches.length === 0
        ? null
        : `el informe no cuadra: ${mismatches
            .map(
              (key) =>
                `${key} = ${String((raw.stats as Record<string, unknown>)[key])} en \`stats\` y ${String(counts[key])} contadas`,
            )
            .join('; ')}`,
  };
}

export function reportProblems(
  summary: ReportSummary,
  options: { readonly maxSkipped: number },
): string[] {
  const problems: string[] = [];
  if (summary.statsMismatch !== null)
    problems.push(`Informe incoherente: ${summary.statsMismatch}.`);
  if (summary.expected === 0) {
    problems.push('No pasó ninguna prueba: una ejecución en la que todo se omite no prueba nada.');
  }
  if (summary.unexpected > 0) problems.push(`${String(summary.unexpected)} pruebas fallan.`);
  if (summary.flaky > 0) {
    problems.push(`${String(summary.flaky)} pruebas son intermitentes (pasan solo al reintentar).`);
  }
  if (summary.errors > 0)
    problems.push(`${String(summary.errors)} errores globales en la ejecución.`);
  if (summary.skipped > options.maxSkipped) {
    const reasons = Object.entries(summary.skippedByReason)
      .sort(([, a], [, b]) => b - a)
      .map(([reason, n]) => `  · ${String(n)} × ${reason}`)
      .join('\n');
    problems.push(
      `${String(summary.skipped)} pruebas omitidas > presupuesto de ${String(options.maxSkipped)} ` +
        `(una omisión nueva pierde cobertura en silencio; si es a propósito, súbelo con su motivo):\n${reasons}`,
    );
  }
  return problems;
}

/** Presupuesto de omisiones: obligatorio. Ausente o no válido NO se interpreta como «sin límite». */
export function parseMaxSkipped(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) {
    throw new Error(
      `Falta un presupuesto de omisiones válido (--max-skipped N o E2E_MAX_SKIPPED=N, entero ≥ 0): recibido ${JSON.stringify(raw)}.`,
    );
  }
  return Number(raw.trim());
}
