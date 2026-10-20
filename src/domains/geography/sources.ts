/**
 * Fuentes de datos mostradas en la página «Fuentes y atribuciones» (docs/data-sources.md).
 * Los nombres, licencias y atribuciones conservan su texto ORIGINAL: no se traducen.
 * Hoy ninguna política de derechos está `verified` (docs/provider-rights.md).
 */
export type RightsStatus = 'verified' | 'provisional';

export type SourceUseKey =
  'overture' | 'naturalEarth' | 'awsTerrain' | 'anati' | 'miambiente' | 'atp' | 'unesco';

export interface UsedSource {
  readonly id: string;
  readonly name: string;
  readonly useKey: SourceUseKey;
  readonly license: string;
  readonly rights: RightsStatus;
  readonly attribution: string;
}

export interface BlockedSource {
  readonly id: string;
  readonly name: string;
  readonly useKey: SourceUseKey;
}

export const USED_SOURCES: readonly UsedSource[] = [
  {
    id: 'overture',
    name: 'Overture Maps Foundation, release 2026-09-23.1',
    useKey: 'overture',
    license: 'ODbL (datos derivados de OpenStreetMap); Places: CDLA-Permissive-2.0',
    rights: 'provisional',
    attribution: '© OpenStreetMap contributors, Overture Maps Foundation',
  },
  {
    id: 'natural-earth',
    name: 'Natural Earth',
    useKey: 'naturalEarth',
    license: 'Public domain',
    rights: 'provisional',
    attribution: 'Made with Natural Earth',
  },
  {
    id: 'aws-terrain',
    name: 'Terrain Tiles on AWS (Terrarium)',
    useKey: 'awsTerrain',
    license: 'SRTM, GMTED, ETOPO1 (see source attributions)',
    rights: 'provisional',
    attribution: 'Terrain Tiles on AWS: SRTM, GMTED2010, ETOPO1',
  },
];

export const BLOCKED_SOURCES: readonly BlockedSource[] = [
  { id: 'anati-ign', name: 'IGN «Tommy Guardia» / ANATI', useKey: 'anati' },
  { id: 'miambiente', name: 'MiAmbiente (SINAP)', useKey: 'miambiente' },
  { id: 'atp', name: 'Autoridad de Turismo de Panamá (ATP)', useKey: 'atp' },
  { id: 'unesco', name: 'UNESCO World Heritage Centre', useKey: 'unesco' },
];

/** Cadena corta de atribución de datos para el pie de página y el control del mapa. */
export const DATA_ATTRIBUTION =
  '© OpenStreetMap contributors, Overture Maps Foundation · Natural Earth · Terrain Tiles on AWS';
