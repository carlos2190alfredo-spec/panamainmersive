/**
 * Fuentes de datos mostradas en la página «Fuentes y atribuciones» (docs/data-sources.md).
 * Los nombres, licencias y atribuciones conservan su texto ORIGINAL: no se traducen. La página los pinta con `lang="en"`
 * (el idioma de las licencias y de las atribuciones de esas fuentes), así que TODO lo que se escriba aquí debe estar
 * en inglés: una explicación en español dentro de una celda `lang="en"` la leería un lector de pantalla con la voz
 * equivocada (r0:F-14; las traducciones al idioma de la interfaz van en las claves `Sources.*` de messages/).
 * Hoy ninguna política de derechos está `verified` (docs/provider-rights.md).
 */
export type RightsStatus = 'verified' | 'provisional';

export type SourceUseKey =
  'overture' | 'awsTerrain' | 'glyphs' | 'anati' | 'miambiente' | 'atp' | 'unesco';

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
    license: 'ODbL (data derived from OpenStreetMap); Places: CDLA-Permissive-2.0',
    rights: 'provisional',
    attribution: '© OpenStreetMap contributors, Overture Maps Foundation',
  },
  {
    id: 'aws-terrain',
    name: 'Terrain Tiles on AWS (Terrarium)',
    useKey: 'awsTerrain',
    license: 'SRTM, GMTED, ETOPO1 (see source attributions)',
    rights: 'provisional',
    attribution: 'Terrain Tiles on AWS: SRTM, GMTED2010, ETOPO1',
  },
  {
    id: 'noto-sans-glyphs',
    name: 'Noto Sans (SDF glyphs from openmaptiles/fonts v2.0)',
    useKey: 'glyphs',
    license: 'SIL Open Font License 1.1',
    rights: 'provisional',
    attribution: 'Noto Sans © The Noto Project Authors (SIL OFL 1.1)',
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
  '© OpenStreetMap contributors, Overture Maps Foundation · Terrain Tiles on AWS · Noto Sans (SIL OFL)';
