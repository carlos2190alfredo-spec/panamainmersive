/**
 * Aviso ANTES de que caduque la evidencia de cobertura (T-19, docs/coverage.md «Caducidad»).
 *
 * El Experience Resolver trata una cobertura caducada como «sin saber» el día `expiresAt` (`today >= expiresAt`, la misma
 * regla que `effectiveStatus` y que la vista SQL `current_visual_coverage`): desde ese día los nueve destinos degradarían
 * a mapa 2D. Una prueba con los datos reales ya falla DESPUÉS de esa fecha; esto avisa con antelación. Es PURA: el día
 * llega como parámetro (un reloj dentro la haría inestable y no se podría probar).
 */
export interface DatedEvidence {
  readonly destination: string;
  readonly capability: string;
  /** Día calendario ISO (AAAA-MM-DD). */
  readonly observedAt: string;
  readonly expiresAt: string;
  /** IDs de docs/research/evidence-log.md. */
  readonly evidence: readonly string[];
}

export type FreshnessStatus = 'ok' | 'expiring' | 'expired';

export interface Freshness {
  readonly status: FreshnessStatus;
  readonly total: number;
  readonly destinations: number;
  /** La primera caducidad de todas las observaciones. */
  readonly firstExpiry: string;
  /** Días que quedan hasta `firstExpiry` (0 = caduca hoy, negativo = ya caducó). */
  readonly daysLeft: number;
  readonly expired: number;
  readonly expiring: number;
  /** Evidencias de lo caducado o por caducar: lo que hay que reobservar. */
  readonly evidenceIds: readonly string[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

function toUtcMs(day: string): number {
  if (!DAY.test(day)) throw new Error(`fecha no válida: «${day}» (se espera AAAA-MM-DD)`);
  const ms = Date.parse(`${day}T00:00:00Z`);
  // `Date.parse('2026-02-31')` no da NaN (E-52): se comprueba que el día vuelve igual.
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== day) {
    throw new Error(`fecha no válida: «${day}» no existe en el calendario`);
  }
  return ms;
}

/** Días de calendario de `from` a `to` (negativo si `to` es anterior). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function coverageFreshness(
  rows: readonly DatedEvidence[],
  today: string,
  warnDays: number,
): Freshness {
  if (!Number.isInteger(warnDays) || warnDays < 0) {
    throw new Error(`umbral de aviso no válido: ${String(warnDays)} (entero ≥ 0)`);
  }
  if (rows.length === 0) {
    throw new Error('no hay ninguna observación de cobertura: no hay nada que vigilar');
  }
  toUtcMs(today);

  let firstExpiry = rows[0]?.expiresAt ?? '';
  let expired = 0;
  let expiring = 0;
  const ids = new Set<string>();
  for (const r of rows) {
    if (daysBetween(r.observedAt, r.expiresAt) < 0) {
      throw new Error(
        `${r.destination}/${r.capability}: caduca (${r.expiresAt}) antes de observarse (${r.observedAt})`,
      );
    }
    if (r.expiresAt < firstExpiry) firstExpiry = r.expiresAt;
    const left = daysBetween(today, r.expiresAt);
    if (left <= 0) expired += 1;
    else if (left <= warnDays) expiring += 1;
    if (left <= warnDays) for (const id of r.evidence) ids.add(id);
  }
  const daysLeft = daysBetween(today, firstExpiry);
  const status: FreshnessStatus =
    daysLeft <= 0 ? 'expired' : daysLeft <= warnDays ? 'expiring' : 'ok';
  return {
    status,
    total: rows.length,
    destinations: new Set(rows.map((r) => r.destination)).size,
    firstExpiry,
    daysLeft,
    expired,
    expiring,
    evidenceIds: [...ids].sort(),
  };
}
