import { afterEach, describe, expect, it } from 'vitest';
import {
  coverageFreshness,
  daysBetween,
  type DatedEvidence,
} from '../../../scripts/lib/coverage-freshness';
import {
  COVERAGE,
  COVERAGE_EXPIRES_AT,
  COVERAGE_OBSERVED_AT,
} from '../../../src/domains/tourism/coverage-evidence';

/**
 * Aviso ANTES de que caduque la evidencia de cobertura (T-19). El Experience Resolver degrada a «sin saber» el día
 * `expiresAt` (`today >= expiresAt`, `effectiveStatus`): sin esto nada avisaba antes, y hoy solo lo vigila una prueba con
 * los datos reales que falla DESPUÉS. La lógica es pura: el día llega como parámetro.
 */
function row(over: Partial<DatedEvidence> = {}): DatedEvidence {
  return {
    destination: 'boquete',
    capability: 'terrain',
    observedAt: '2026-10-20',
    expiresAt: '2027-01-18',
    evidence: ['E-25'],
    ...over,
  };
}

describe('daysBetween (días de calendario ISO, sin horas ni zonas)', () => {
  it.each([
    ['2026-10-24', '2026-10-24', 0],
    ['2026-10-24', '2026-10-25', 1],
    ['2026-10-25', '2026-10-24', -1],
    ['2026-10-20', '2027-01-18', 90],
    ['2028-02-28', '2028-03-01', 2], // bisiesto
    ['2027-02-28', '2027-03-01', 1], // no bisiesto
    ['2026-12-31', '2027-01-01', 1],
  ])('%s → %s = %i', (from, to, days) => {
    expect(daysBetween(from, to)).toBe(days);
  });

  it.each([
    '',
    '2026-02-31',
    '2026-1-1',
    '24/10/2026',
    '2026-10-24T00:00:00Z',
    'hoy',
    '2026-13-01',
  ])('una fecha inválida («%s») se rechaza', (bad) => {
    expect(() => daysBetween(bad, '2026-10-24')).toThrow(/fecha/);
    expect(() => daysBetween('2026-10-24', bad)).toThrow(/fecha/);
  });
});

describe('los días de calendario no dependen de la zona horaria del equipo', () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  // Con el día leído en hora local, una zona al este de UTC lo corre al día anterior (y falla la comprobación de
  // ida y vuelta). Este contenedor está en UTC: sin forzar otras zonas la prueba no mediría nada.
  it.each([
    ['Asia/Tokyo', -540],
    ['Pacific/Kiritimati', -840],
    ['America/Los_Angeles', 480],
  ])('%s', (zone, offsetMinutes) => {
    process.env.TZ = zone;
    // Control: el motor aplicó la zona (si no, esta prueba pasaría por la razón equivocada).
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(offsetMinutes);
    expect(daysBetween('2026-10-20', '2027-01-18')).toBe(90);
    expect(coverageFreshness([row()], '2026-12-19', 30)).toMatchObject({
      status: 'expiring',
      daysLeft: 30,
    });
  });
});

describe('coverageFreshness', () => {
  const warn = 30;

  it('lejos de caducar: bien, con los días que quedan', () => {
    const f = coverageFreshness([row()], '2026-10-24', warn);
    expect(f).toMatchObject({
      status: 'ok',
      daysLeft: 86,
      firstExpiry: '2027-01-18',
      expired: 0,
      expiring: 0,
    });
  });

  it('justo en el umbral ya avisa; un día antes del umbral todavía no', () => {
    expect(coverageFreshness([row()], '2026-12-19', warn)).toMatchObject({
      status: 'expiring',
      daysLeft: 30,
    });
    expect(coverageFreshness([row()], '2026-12-18', warn)).toMatchObject({
      status: 'ok',
      daysLeft: 31,
    });
  });

  it('el día anterior a la caducidad quedan 1 día y avisa', () => {
    expect(coverageFreshness([row()], '2027-01-17', warn)).toMatchObject({
      status: 'expiring',
      daysLeft: 1,
    });
  });

  it('el día de la caducidad YA está caducada (misma regla que `effectiveStatus`: today >= expiresAt)', () => {
    expect(coverageFreshness([row()], '2027-01-18', warn)).toMatchObject({
      status: 'expired',
      daysLeft: 0,
      expired: 1,
    });
  });

  it('pasada la caducidad sigue caducada, con los días en negativo', () => {
    expect(coverageFreshness([row()], '2027-02-01', warn)).toMatchObject({
      status: 'expired',
      daysLeft: -14,
    });
  });

  it('con varias observaciones manda la PRIMERA en caducar y se cuentan las caducadas y las que vencen pronto', () => {
    const rows = [
      row({ destination: 'a', expiresAt: '2027-03-01' }),
      row({ destination: 'b', expiresAt: '2027-01-10' }),
      row({ destination: 'b', capability: 'geometry', expiresAt: '2027-01-12' }),
      row({ destination: 'c', expiresAt: '2026-12-01' }),
    ];
    const f = coverageFreshness(rows, '2027-01-11', warn);
    expect(f.firstExpiry).toBe('2026-12-01');
    expect(f.status).toBe('expired');
    expect(f).toMatchObject({ total: 4, destinations: 3, expired: 2, expiring: 1 });
  });

  it('lista los identificadores de evidencia SOLO de lo caducado o por caducar, sin repetir y ordenados', () => {
    const rows = [
      row({ expiresAt: '2027-01-18', evidence: ['E-25', 'E-22'] }),
      row({ expiresAt: '2027-01-18', evidence: ['E-25', 'E-23b'] }),
      row({ expiresAt: '2030-01-01', evidence: ['E-99'] }),
    ];
    expect(coverageFreshness(rows, '2027-01-01', warn).evidenceIds).toEqual([
      'E-22',
      'E-23b',
      'E-25',
    ]);
    expect(coverageFreshness(rows, '2026-10-24', warn).evidenceIds).toEqual([]);
  });

  it('la observación que caduca JUSTO en el umbral cuenta como «por caducar» (no solo las anteriores)', () => {
    // 2026-12-19 → 2027-01-18: 30 días.
    expect(coverageFreshness([row()], '2026-12-19', 30)).toMatchObject({ expiring: 1, expired: 0 });
    expect(coverageFreshness([row()], '2026-12-19', 29)).toMatchObject({ expiring: 0, expired: 0 });
  });

  it('una observación que caduca el mismo día que se hizo es válida y ya está caducada', () => {
    // Rechazarla («no se pudo evaluar») diría menos que lo que es verdad: no hay vigencia ninguna.
    const same = row({ observedAt: '2026-10-24', expiresAt: '2026-10-24' });
    expect(coverageFreshness([same], '2026-10-24', 30)).toMatchObject({
      status: 'expired',
      daysLeft: 0,
      expired: 1,
    });
  });

  it('sin observaciones dice que no hay nada que vigilar (no un error de fecha que despiste)', () => {
    expect(() => coverageFreshness([], '2026-10-24', 30)).toThrow(/no hay ninguna observación/);
  });

  it('un umbral de 0 solo avisa el mismo día de la caducidad', () => {
    expect(coverageFreshness([row()], '2027-01-17', 0)).toMatchObject({ status: 'ok' });
    expect(coverageFreshness([row()], '2027-01-18', 0)).toMatchObject({ status: 'expired' });
  });

  it.each([
    ['sin observaciones (no hay nada que vigilar: no es un verde)', [], 30],
    ['una caducidad inválida', [row({ expiresAt: '2027-02-30' })], 30],
    ['una observación inválida', [row({ observedAt: 'ayer' })], 30],
    [
      'una caducidad ANTERIOR a la observación',
      [row({ observedAt: '2027-02-01', expiresAt: '2027-01-18' })],
      30,
    ],
    ['un umbral negativo', [row()], -1],
    ['un umbral con decimales', [row()], 1.5],
    ['un umbral que no es un número', [row()], Number.NaN],
  ] as [string, DatedEvidence[], number][])(
    '%s: se rechaza (no se pudo evaluar)',
    (_label, rows, warnDays) => {
      expect(() => coverageFreshness(rows, '2026-10-24', warnDays)).toThrow();
    },
  );

  it('un día de hoy inválido se rechaza', () => {
    expect(() => coverageFreshness([row()], '2026-02-31', 30)).toThrow(/fecha/);
  });
});

describe('la evidencia REAL del proyecto', () => {
  const rows: DatedEvidence[] = Object.entries(COVERAGE).flatMap(([destination, list]) =>
    list.map((e) => ({
      destination,
      capability: e.capability,
      observedAt: e.observedAt,
      expiresAt: e.expiresAt,
      evidence: e.evidence,
    })),
  );

  it('cubre los nueve destinos y es evaluable', () => {
    const f = coverageFreshness(rows, COVERAGE_OBSERVED_AT, 30);
    expect(f.destinations).toBe(9);
    expect(f.total).toBeGreaterThan(50);
    expect(f.firstExpiry).toBe(COVERAGE_EXPIRES_AT);
  });

  it('caduca a los 90 días de la observación (docs/coverage.md, «Caducidad»)', () => {
    expect(daysBetween(COVERAGE_OBSERVED_AT, COVERAGE_EXPIRES_AT)).toBe(90);
  });

  it('el día de caducidad real y el de aviso, con los datos de hoy', () => {
    expect(coverageFreshness(rows, '2026-12-19', 30).status).toBe('expiring');
    expect(coverageFreshness(rows, COVERAGE_EXPIRES_AT, 30).status).toBe('expired');
  });
});
