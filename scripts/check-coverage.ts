/**
 * Avisa ANTES de que caduque la evidencia de cobertura (T-19; docs/coverage.md «Caducidad»): el día `expiresAt` el
 * Experience Resolver la trata como «sin saber» y los nueve destinos degradarían a mapa 2D. Reobservar la cobertura sigue
 * siendo un trabajo manual (consultar de nuevo las fuentes); esto solo evita que la fecha pase sin que nadie lo vea.
 *
 * Códigos de salida: 0 bien · 1 caduca dentro del umbral o ya caducó · 2 no se pudo evaluar (argumentos o datos
 * inválidos). El día de hoy es el UTC: con un aviso de 30 días la diferencia con la hora de Panamá no importa.
 *
 * Uso:  node --import tsx scripts/check-coverage.ts [--warn-days N] [--today AAAA-MM-DD]
 *       (`--today` es solo para pruebas y simulaciones; por defecto, 30 días y la fecha de hoy)
 */
import { COVERAGE } from '../src/domains/tourism/coverage-evidence';
import { coverageFreshness, type DatedEvidence } from './lib/coverage-freshness';

const DEFAULT_WARN_DAYS = 30;

interface Options {
  readonly warnDays: number;
  readonly today: string;
}

function parseArgs(argv: string[]): Options | string {
  let warnDays = DEFAULT_WARN_DAYS;
  let today = new Date().toISOString().slice(0, 10);
  const valueAfter = (i: number): string | undefined => {
    const next = argv[i + 1];
    return next === undefined || next.startsWith('--') ? undefined : next;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--warn-days' || arg === '--today') {
      const v = valueAfter(i);
      if (v === undefined) return `\`${arg}\` necesita un valor`;
      i += 1;
      if (arg === '--warn-days') {
        if (!/^\d+$/.test(v)) return `\`--warn-days\` necesita un entero ≥ 0: «${v}»`;
        warnDays = Number(v);
      } else {
        today = v;
      }
    } else if (arg !== undefined && arg.startsWith('--warn-days=')) {
      const v = arg.slice('--warn-days='.length);
      if (!/^\d+$/.test(v)) return `\`--warn-days\` necesita un entero ≥ 0: «${v}»`;
      warnDays = Number(v);
    } else if (arg !== undefined && arg.startsWith('--today=')) {
      today = arg.slice('--today='.length);
    } else {
      return `Argumento no reconocido: ${String(arg)}`;
    }
  }
  return { warnDays, today };
}

function main(argv: string[]): number {
  const options = parseArgs(argv);
  if (typeof options === 'string') {
    console.error(options);
    return 2;
  }
  const rows: DatedEvidence[] = Object.entries(COVERAGE).flatMap(([destination, list]) =>
    list.map((e) => ({
      destination,
      capability: e.capability,
      observedAt: e.observedAt,
      expiresAt: e.expiresAt,
      evidence: e.evidence,
    })),
  );

  let result;
  try {
    result = coverageFreshness(rows, options.today, options.warnDays);
  } catch (error) {
    console.error(
      `FALLO (no se pudo evaluar): ${error instanceof Error ? error.message : String(error)}`,
    );
    return 2;
  }

  const summary = `${String(result.total)} observaciones de ${String(result.destinations)} destinos`;
  if (result.status === 'ok') {
    console.log(
      `Cobertura: ${summary}; la primera caduca el ${result.firstExpiry} (quedan ${String(result.daysLeft)} días, aviso a ${String(options.warnDays)}).`,
    );
    return 0;
  }
  const how =
    'Reobserva la cobertura (docs/coverage.md) y actualiza COVERAGE_OBSERVED_AT y COVERAGE_EXPIRES_AT en ' +
    'src/domains/tourism/coverage-evidence.ts.';
  const evidence =
    result.evidenceIds.length > 0 ? ` Evidencias: ${result.evidenceIds.join(', ')}.` : '';
  if (result.status === 'expired') {
    console.error(
      `FALLO: la evidencia de cobertura caducó el ${result.firstExpiry} (hace ${String(-result.daysLeft)} días; ${summary}). ` +
        `Desde ese día el resolver degrada a «sin saber». ${how}${evidence}`,
    );
  } else {
    console.error(
      `FALLO: la evidencia de cobertura caduca el ${result.firstExpiry} (quedan ${String(result.daysLeft)} días; umbral ${String(options.warnDays)}; ${summary}). ${how}${evidence}`,
    );
  }
  return 1;
}

process.exit(main(process.argv.slice(2)));
