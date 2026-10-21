import { describe, expect, it } from 'vitest';
import { assembleAreas, type AreaRow } from '@/domains/geography/spatial-response';

const polygon = (extra = '') =>
  `{"type":"Polygon","coordinates":[[[-80,8],[-79,8],[-79,9],[-80,8]]]${extra}}`;

function row(over: Partial<AreaRow> = {}): AreaRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'protected_area',
    source_class: 'osm_derived',
    overture_id: 'ov-1',
    geometry_version: 1,
    area_m2: 1234567.8,
    area_method: 'ST_Area(geography, EPSG:4326)',
    source_version_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    version_label: '2026-09-23.1:overture-protected-areas:abcdef123456',
    retrieved_at: '2026-10-20T23:34:42Z',
    license_name: 'ODbL',
    license_url: 'https://opendatacommons.org/licenses/odbl/',
    attribution: '© OpenStreetMap contributors, Overture Maps Foundation',
    rights_status: 'provisional',
    source_key: 'overture',
    institution: 'Overture Maps Foundation',
    source_kind: 'osm_derived',
    geometry_json: polygon(),
    ...over,
  };
}

const ids = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const allow = new Set(['overture']);
const base = { names: [], locale: null, limit: 10, allowedSubjects: allow } as const;

describe('assembleAreas', () => {
  it('produce una entidad GeoJSON con procedencia, capa, nombre local y superficie con método', () => {
    const out = assembleAreas({
      ...base,
      rows: [row()],
      names: [
        { area_id: row().id, locale: null, provenance: 'source_local', name: 'Parque Test' },
        { area_id: row().id, locale: 'en', provenance: 'source_common', name: 'Test Park' },
      ],
      locale: 'en',
    });
    expect(out.returned).toBe(1);
    const f = out.features[0];
    expect(f).toMatchObject({
      type: 'Feature',
      id: row().id,
      geometry: { type: 'Polygon' },
      properties: {
        layer: 'protected_areas',
        sourceClass: 'osm_derived', // nunca se presenta como oficial
        name: { value: 'Test Park', locale: 'en', provenance: 'source_common' },
        area: { squareMeters: 1234567.8, method: 'ST_Area(geography, EPSG:4326)' },
        overtureId: 'ov-1',
      },
    });
    expect(out.sources).toEqual([
      expect.objectContaining({
        key: 'overture',
        rightsStatus: 'provisional',
        license: { name: 'ODbL', url: 'https://opendatacommons.org/licenses/odbl/' },
      }),
    ]);
    expect(f?.properties.sourceRef).toBe(out.sources[0]?.ref);
  });

  it('una superficie SIN método no se publica (un número sin método no es verificable)', () => {
    const out = assembleAreas({ ...base, rows: [row({ area_method: null })] });
    expect(out.features[0]?.properties.area).toBeNull();
    const none = assembleAreas({ ...base, rows: [row({ area_m2: null })] });
    expect(none.features[0]?.properties.area).toBeNull();
  });

  it('sin nombre en la fuente no hay nombre (no se inventa ni se rellena)', () => {
    expect(assembleAreas({ ...base, rows: [row()] }).features[0]?.properties.name).toBeNull();
  });

  it('deduplica la procedencia: una fuente aparece una vez aunque la usen muchas entidades', () => {
    const rows = [1, 2, 3].map((n) => row({ id: ids(n) }));
    const out = assembleAreas({ ...base, rows });
    expect(out.returned).toBe(3);
    expect(out.sources).toHaveLength(1);
  });

  it('el límite trunca de forma EXPLÍCITA (se pidió una fila más para saberlo)', () => {
    const rows = [1, 2, 3].map((n) => row({ id: ids(n) }));
    const out = assembleAreas({ ...base, rows, limit: 2 });
    expect(out).toMatchObject({ returned: 2, truncated: true, skippedTooLarge: 0 });
    expect(assembleAreas({ ...base, rows: rows.slice(0, 2), limit: 2 }).truncated).toBe(false);
  });

  it('el presupuesto de bytes omite lo demasiado grande y SIGUE con lo pequeño, avisando', () => {
    const big = row({ id: ids(1), geometry_json: polygon(`,"x":"${'a'.repeat(5000)}"`) });
    const small = row({ id: ids(2) });
    const out = assembleAreas({ ...base, rows: [big, small], budgetBytes: 2000 });
    expect(out.features.map((f) => f.id)).toEqual([ids(2)]);
    expect(out).toMatchObject({ truncated: true, skippedTooLarge: 1 });
  });

  it('DERECHOS por fila: una fuente sin permiso no se sirve aunque la capa se hubiera autorizado', () => {
    const rows = [row({ id: ids(1) }), row({ id: ids(2), source_key: 'otra-fuente' })];
    const out = assembleAreas({ ...base, rows });
    expect(out.features.map((f) => f.id)).toEqual([ids(1)]);
    expect(out.withheldByRights).toBe(1);
    expect(assembleAreas({ ...base, rows, allowedSubjects: new Set() }).returned).toBe(0);
  });

  it('una geometría editorial (nuestra) se sirve sin fuente de terceros; otra clase sin fuente, NO', () => {
    const noSource = {
      source_version_id: null,
      version_label: null,
      retrieved_at: null,
      license_name: null,
      license_url: null,
      attribution: null,
      rights_status: null,
      source_key: null,
      institution: null,
      source_kind: null,
    } as const;
    const editorial = row({ id: ids(1), source_class: 'editorial', ...noSource });
    const osmWithoutSource = row({ id: ids(2), source_class: 'osm_derived', ...noSource });
    const out = assembleAreas({ ...base, rows: [editorial, osmWithoutSource] });
    expect(out.features.map((f) => f.id)).toEqual([ids(1)]);
    expect(out.features[0]?.properties).toMatchObject({
      sourceClass: 'editorial',
      sourceRef: null,
    });
    expect(out.sources).toEqual([]);
    expect(out.withheldByRights).toBe(1);
  });

  it('sin geometría (localizar) la entidad lleva geometry: null y cuesta casi nada', () => {
    const out = assembleAreas({ ...base, rows: [row({ geometry_json: null })], budgetBytes: 800 });
    expect(out.features[0]?.geometry).toBeNull();
  });
});
