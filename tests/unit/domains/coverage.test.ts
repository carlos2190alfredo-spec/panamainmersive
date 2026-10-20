import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES,
  COVERAGE,
  COVERAGE_EXPIRES_AT,
  COVERAGE_OBSERVED_AT,
  effectiveStatus,
  type CoverageEvidence,
} from '@/domains/tourism/coverage-evidence';
import { DESTINATION_KEYS } from '@/domains/tourism/destinations';

const sample: CoverageEvidence = {
  capability: 'geometry',
  status: 'VERIFIED',
  observation: 'geoCounty',
  evidence: ['E-22'],
  observedAt: COVERAGE_OBSERVED_AT,
  expiresAt: COVERAGE_EXPIRES_AT,
};

describe('evidencia de cobertura', () => {
  it('cada destino tiene cada capacidad exactamente una vez', () => {
    for (const key of DESTINATION_KEYS) {
      const caps = COVERAGE[key].map((c) => c.capability).sort();
      expect(caps, key).toEqual([...CAPABILITIES].sort());
    }
  });

  it('caduca a los 90 días exactos', () => {
    const days = (Date.parse(COVERAGE_EXPIRES_AT) - Date.parse(COVERAGE_OBSERVED_AT)) / 86_400_000;
    expect(days).toBe(90);
  });

  it('una evidencia vigente conserva su estado', () => {
    expect(effectiveStatus(sample, '2026-12-01')).toBe('VERIFIED');
    expect(effectiveStatus(sample, '2027-01-17')).toBe('VERIFIED');
  });

  it('una evidencia caducada pasa a UNKNOWN, nunca a UNAVAILABLE', () => {
    expect(effectiveStatus(sample, COVERAGE_EXPIRES_AT)).toBe('UNKNOWN');
    expect(effectiveStatus({ ...sample, status: 'UNAVAILABLE' }, '2027-06-01')).toBe('UNKNOWN');
    expect(effectiveStatus({ ...sample, status: 'PARTIAL' }, '2027-06-01')).toBe('UNKNOWN');
  });

  it('lo que no se pudo comprobar es UNKNOWN con motivo, nunca UNAVAILABLE', () => {
    const external = [
      'google3d',
      'streetView',
      'streetImagery',
      'openSatellite',
      'officialGeometry',
    ];
    for (const key of DESTINATION_KEYS) {
      for (const c of COVERAGE[key].filter((x) => external.includes(x.capability))) {
        expect(c.status, `${key}/${c.capability}`).toBe('UNKNOWN');
        expect(c.observation).toMatch(/^reason/);
      }
    }
  });

  it('toda evidencia cita al menos una entrada del registro de evidencias', () => {
    for (const key of DESTINATION_KEYS) {
      for (const c of COVERAGE[key]) {
        expect(c.evidence.length, `${key}/${c.capability}`).toBeGreaterThan(0);
        for (const id of c.evidence) expect(id).toMatch(/^E-\d{2}[a-z]?$/);
      }
    }
  });

  it('Casco Antiguo NO figura como geometría verificada (solo existe un landuse=retail)', () => {
    const geom = COVERAGE['casco-antiguo'].find((c) => c.capability === 'geometry');
    expect(geom?.status).toBe('UNAVAILABLE');
  });

  it('ninguna geometría oficial figura como verificada: no hay acceso a las fuentes oficiales', () => {
    for (const key of DESTINATION_KEYS) {
      const off = COVERAGE[key].find((c) => c.capability === 'officialGeometry');
      expect(off?.status, key).toBe('UNKNOWN');
    }
  });
});
