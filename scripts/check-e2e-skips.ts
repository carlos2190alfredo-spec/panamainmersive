/**
 * Presupuesto de omisiones de `pnpm test:e2e` (`pnpm check:e2e-skips`, tras la ejecución con `CI=true`, que deja
 * `test-results/e2e-report.json`). Falla si algo no corrió, si hay fallos o intermitentes, o si hay más pruebas omitidas
 * que las del presupuesto (`--max-skipped N` o `E2E_MAX_SKIPPED`). Las omitidas se agrupan por motivo.
 *
 * Uso:  node --import tsx scripts/check-e2e-skips.ts [informe.json] [--max-skipped N]
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseMaxSkipped, reportProblems, summarizeReport } from './lib/e2e-report';

const DEFAULT_REPORT = 'test-results/e2e-report.json';

function main(argv: string[]): number {
  let reportPath = DEFAULT_REPORT;
  let rawBudget = process.env.E2E_MAX_SKIPPED;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--max-skipped') {
      rawBudget = argv[++i];
    } else if (arg !== undefined && arg.startsWith('--max-skipped=')) {
      rawBudget = arg.slice('--max-skipped='.length);
    } else if (arg !== undefined && !arg.startsWith('-')) {
      reportPath = arg;
    } else {
      console.error(`Argumento no reconocido: ${String(arg)}`);
      return 2;
    }
  }

  let maxSkipped: number;
  try {
    maxSkipped = parseMaxSkipped(rawBudget);
  } catch (error) {
    console.error(`FALLO: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  if (!existsSync(reportPath)) {
    console.error(
      `FALLO: no existe ${reportPath}. Ejecuta \`CI=true pnpm test:e2e\` antes (el reportero JSON solo se activa con CI).`,
    );
    return 2;
  }

  let summary;
  try {
    summary = summarizeReport(JSON.parse(readFileSync(reportPath, 'utf8')));
  } catch (error) {
    console.error(`FALLO: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  console.log(
    `E2E: ${String(summary.expected)} pasan · ${String(summary.skipped)} omitidas (presupuesto ${String(maxSkipped)}) · ` +
      `${String(summary.unexpected)} fallan · ${String(summary.flaky)} intermitentes`,
  );
  for (const [reason, n] of Object.entries(summary.skippedByReason)) {
    console.log(`  omitidas: ${String(n)} × ${reason}`);
  }
  const problems = reportProblems(summary, { maxSkipped });
  for (const problem of problems) console.error(`FALLO: ${problem}`);
  return problems.length > 0 ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
