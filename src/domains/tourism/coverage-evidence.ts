import type { DestinationKey } from './destinations';

/**
 * Evidencia de cobertura de la evaluación inicial (docs/coverage.md, 2026-10-20).
 * Los estados son POR FUENTE Y VERSIÓN, no una afirmación general.
 * `UNKNOWN` y `ERROR` no equivalen a ausencia (ADR-0007).
 */
export const COVERAGE_STATUSES = [
  'UNKNOWN',
  'VERIFIED',
  'PARTIAL',
  'UNAVAILABLE',
  'ERROR',
] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export const CAPABILITIES = [
  'geometry',
  'terrain',
  'google3d',
  'streetView',
  'streetImagery',
  'openSatellite',
  'officialGeometry',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type ObservationKey =
  | 'geoCounty'
  | 'geoRegionCountyLocality'
  | 'geoLocality'
  | 'geoProtectedArea'
  | 'geoProtectedIsland'
  | 'geoCanalLines'
  | 'geoPointOnly'
  | 'geoNoPolygon'
  | 'terrainLand'
  | 'terrainLandNoBathymetry'
  | 'reasonNoCredential'
  | 'reasonBlockedHost'
  | 'reasonNotEvaluated';

export interface CoverageEvidence {
  readonly capability: Capability;
  readonly status: CoverageStatus;
  readonly observation: ObservationKey;
  /** IDs de docs/research/evidence-log.md. */
  readonly evidence: readonly string[];
  /** Día calendario ISO (AAAA-MM-DD). */
  readonly observedAt: string;
  readonly expiresAt: string;
}

export const COVERAGE_OBSERVED_AT = '2026-10-20';
/** 90 días después de la observación (docs/coverage.md, «Caducidad»). */
export const COVERAGE_EXPIRES_AT = '2027-01-18';

const base = { observedAt: COVERAGE_OBSERVED_AT, expiresAt: COVERAGE_EXPIRES_AT } as const;

function row(
  capability: Capability,
  status: CoverageStatus,
  observation: ObservationKey,
  evidence: readonly string[],
): CoverageEvidence {
  return { capability, status, observation, evidence, ...base };
}

/** Lo que NO se pudo comprobar es UNKNOWN con su motivo: sin credencial, sin acceso o sin evaluar. */
function unverifiedExternal(): CoverageEvidence[] {
  return [
    row('google3d', 'UNKNOWN', 'reasonNoCredential', ['E-30']),
    row('streetView', 'UNKNOWN', 'reasonNoCredential', ['E-30']),
    row('streetImagery', 'UNKNOWN', 'reasonBlockedHost', ['E-00', 'E-36']),
    row('openSatellite', 'UNKNOWN', 'reasonNotEvaluated', ['E-00']),
    row('officialGeometry', 'UNKNOWN', 'reasonBlockedHost', ['E-00', 'E-34']),
  ];
}

export const COVERAGE: Readonly<Record<DestinationKey, readonly CoverageEvidence[]>> = {
  'panama-city': [
    row('geometry', 'VERIFIED', 'geoCounty', ['E-22', 'E-23']),
    row('terrain', 'VERIFIED', 'terrainLand', ['E-25']),
    ...unverifiedExternal(),
  ],
  'casco-antiguo': [
    row('geometry', 'UNAVAILABLE', 'geoNoPolygon', ['E-23']),
    row('terrain', 'VERIFIED', 'terrainLand', ['E-25']),
    ...unverifiedExternal(),
  ],
  'panama-canal': [
    row('geometry', 'PARTIAL', 'geoCanalLines', ['E-23b']),
    row('terrain', 'VERIFIED', 'terrainLand', ['E-25']),
    ...unverifiedExternal(),
  ],
  'el-valle-de-anton': [
    row('geometry', 'PARTIAL', 'geoPointOnly', ['E-23']),
    row('terrain', 'VERIFIED', 'terrainLand', ['E-25']),
    ...unverifiedExternal(),
  ],
  boquete: [
    row('geometry', 'VERIFIED', 'geoCounty', ['E-22', 'E-23']),
    row('terrain', 'VERIFIED', 'terrainLand', ['E-25']),
    ...unverifiedExternal(),
  ],
  'volcan-baru': [
    row('geometry', 'PARTIAL', 'geoProtectedArea', ['E-23']),
    row('terrain', 'VERIFIED', 'terrainLand', ['E-25']),
    ...unverifiedExternal(),
  ],
  'bocas-del-toro': [
    row('geometry', 'VERIFIED', 'geoRegionCountyLocality', ['E-22']),
    row('terrain', 'PARTIAL', 'terrainLandNoBathymetry', ['E-25']),
    ...unverifiedExternal(),
  ],
  'santa-catalina': [
    row('geometry', 'PARTIAL', 'geoLocality', ['E-23c']),
    row('terrain', 'VERIFIED', 'terrainLand', ['E-25']),
    ...unverifiedExternal(),
  ],
  coiba: [
    row('geometry', 'PARTIAL', 'geoProtectedIsland', ['E-23']),
    row('terrain', 'PARTIAL', 'terrainLandNoBathymetry', ['E-25']),
    ...unverifiedExternal(),
  ],
};

/**
 * Estado efectivo: una evidencia caducada pasa a `UNKNOWN`, NUNCA a `UNAVAILABLE`.
 * Es la misma regla que la vista SQL `current_visual_coverage` (docs/data-model.md).
 * `today` es un día calendario ISO (AAAA-MM-DD); la evidencia caduca el día `expiresAt`.
 */
export function effectiveStatus(evidence: CoverageEvidence, today: string): CoverageStatus {
  return today >= evidence.expiresAt ? 'UNKNOWN' : evidence.status;
}
