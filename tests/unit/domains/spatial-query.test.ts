import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DATA_WORKING_AREA,
  SPATIAL_LAYERS,
  SPATIAL_LAYER_IDS,
  SPATIAL_LIMITS,
  coordinateDecimals,
  kindsForLayers,
  layerForKind,
  parseAreaDetailQuery,
  parseAreasQuery,
  parseLocateQuery,
  pickName,
  simplifyToleranceDegrees,
  type AreaNameRow,
} from '@/domains/geography/spatial-query';
import { LOCALES } from '@/i18n/locales';

const params = (query: string) => new URLSearchParams(query);
const codes = (result: { ok: boolean; issues?: readonly { field: string; code: string }[] }) =>
  (result.issues ?? []).map((i) => `${i.field}:${i.code}`);

describe('parseAreasQuery', () => {
  it('acepta una ventana válida y aplica los valores por defecto', () => {
    const r = parseAreasQuery(params('bbox=-80,8,-79,9&zoom=8'));
    expect(r).toEqual({
      ok: true,
      value: {
        bbox: { west: -80, south: 8, east: -79, north: 9 },
        zoom: 8,
        layers: ['protected_areas'],
        limit: SPATIAL_LIMITS.defaultLimit,
        locale: null,
      },
    });
  });

  it('recorta la ventana al área de trabajo (no la rechaza si solo la sobrepasa)', () => {
    const r = parseAreasQuery(params('bbox=-90,3,-70,12&zoom=3'));
    // 20° × 9° recortado a 10° × 6° = 60 grados²: sigue siendo demasiado grande
    expect(codes(r)).toEqual(['bbox:bbox.too_large']);
    const edge = parseAreasQuery(params('bbox=-86,7,-82,9&zoom=6'));
    expect(edge).toMatchObject({ ok: true, value: { bbox: { west: -85, east: -82 } } });
  });

  it.each([
    ['bbox=-80,8,-79&zoom=8', 'bbox:bbox.format'],
    ['bbox=-80,8,-79,9,1&zoom=8', 'bbox:bbox.format'],
    ['bbox=1e1,8,-79,9&zoom=8', 'bbox:bbox.format'],
    ['bbox=NaN,8,-79,9&zoom=8', 'bbox:bbox.format'],
    ['bbox=0x10,8,-79,9&zoom=8', 'bbox:bbox.format'],
    ['bbox=%2B80,8,-79,9&zoom=8', 'bbox:bbox.format'],
    ['bbox=--80,8,-79,9&zoom=8', 'bbox:bbox.format'],
    ['bbox=-80,8,-79,9.12345678&zoom=8', 'bbox:bbox.format'],
    ['bbox=%EF%BC%98,8,-79,9&zoom=8', 'bbox:bbox.format'], // «８» de ancho completo
    ['bbox=-80,%208,-79,9&zoom=8', 'bbox:bbox.format'],
    ['bbox=&zoom=8', 'bbox:param.missing'],
    ['bbox=-200,8,-79,9&zoom=8', 'bbox:bbox.range'],
    ['bbox=-1800,8,-79,9&zoom=8', 'bbox:bbox.format'], // más de 3 dígitos enteros
    ['bbox=-181,8,-79,9&zoom=8', 'bbox:bbox.range'],
    ['bbox=-80,8,-79,91&zoom=8', 'bbox:bbox.range'],
    ['bbox=-79,8,-80,9&zoom=8', 'bbox:bbox.order'],
    ['bbox=-80,9,-79,8&zoom=8', 'bbox:bbox.order'],
    ['bbox=-80,8,-80,9&zoom=8', 'bbox:bbox.order'],
    ['bbox=8,-80,9,-79&zoom=8', 'bbox:bbox.outside_working_area'], // lat/lon intercambiados
    ['bbox=10,40,11,41&zoom=8', 'bbox:bbox.outside_working_area'],
    ['bbox=-70,8,-60,9&zoom=8', 'bbox:bbox.outside_working_area'],
  ])('rechaza «%s» → %s', (query, expected) => {
    expect(codes(parseAreasQuery(params(query)))).toContain(expected);
  });

  it('un bbox que solo TOCA el borde del área de trabajo no cuenta como dentro', () => {
    expect(codes(parseAreasQuery(params('bbox=-75,7,-70,8&zoom=5')))).toContain(
      'bbox:bbox.outside_working_area',
    );
  });

  it('limita el tamaño de la ventana', () => {
    expect(codes(parseAreasQuery(params('bbox=-85,5,-75,11&zoom=3')))).toEqual([
      'bbox:bbox.too_large',
    ]);
    // Todo Panamá continental cabe (≈ 15 grados²)
    expect(parseAreasQuery(params('bbox=-83.2,6.9,-77,9.8&zoom=5')).ok).toBe(true);
  });

  it.each([
    ['limit=0', 'limit:limit.range'],
    ['limit=201', 'limit:limit.range'],
    ['limit=abc', 'limit:limit.format'],
    ['limit=-5', 'limit:limit.format'],
    ['locale=it', 'locale:locale.unsupported'],
    ['locale=ES', 'locale:locale.unsupported'],
    ['layers=', 'layers:layers.empty'],
    ['layers=protected_areas,', 'layers:layers.empty'],
    ['layers=rivers', 'layers:layers.unknown'],
    ['layers=protected_areas;drop table', 'layers:layers.unknown'],
  ])('rechaza «%s» → %s', (extra, expected) => {
    expect(codes(parseAreasQuery(params(`bbox=-80,8,-79,9&zoom=8&${extra}`)))).toContain(expected);
  });

  it.each([
    ['zoom=-1', 'zoom:zoom.format'],
    ['zoom=19', 'zoom:zoom.range'],
    ['zoom=8.5', 'zoom:zoom.format'],
    ['zoom=1e1', 'zoom:zoom.format'],
    ['zoom=', 'zoom:zoom.format'],
    ['zoom=0008', 'zoom:zoom.format'],
  ])('rechaza «%s» → %s', (extra, expected) => {
    expect(codes(parseAreasQuery(params(`bbox=-80,8,-79,9&${extra}`)))).toContain(expected);
  });

  it('exige zoom', () => {
    expect(codes(parseAreasQuery(params('bbox=-80,8,-79,9')))).toEqual(['zoom:param.missing']);
  });

  it('rechaza parámetros desconocidos, repetidos y demasiado largos (contaminación de parámetros)', () => {
    expect(codes(parseAreasQuery(params('bbox=-80,8,-79,9&zoom=8&sql=1')))).toEqual([
      'sql:param.unknown',
    ]);
    expect(codes(parseAreasQuery(params('bbox=-80,8,-79,9&zoom=8&zoom=9')))).toContain(
      'zoom:param.duplicate',
    );
    expect(
      codes(parseAreasQuery(params(`bbox=-80,8,-79,9&zoom=8&locale=${'a'.repeat(500)}`))),
    ).toEqual(['locale:param.too_long']);
    // El nombre de un parámetro desconocido no se refleja entero (sin eco de entrada hostil)
    const long = parseAreasQuery(params(`bbox=-80,8,-79,9&zoom=8&${'x'.repeat(200)}=1`));
    expect((long.ok ? [] : long.issues).every((i) => i.field.length <= 32)).toBe(true);
  });

  it('elimina capas repetidas y respeta el máximo', () => {
    const r = parseAreasQuery(
      params('bbox=-80,8,-79,9&zoom=8&layers=protected_areas,context_areas,protected_areas'),
    );
    expect(r).toMatchObject({ ok: true, value: { layers: ['protected_areas', 'context_areas'] } });
  });

  it('acepta los cinco idiomas', () => {
    for (const locale of LOCALES) {
      expect(parseAreasQuery(params(`bbox=-80,8,-79,9&zoom=8&locale=${locale}`)).ok).toBe(true);
    }
  });

  it('normaliza el cero negativo (no hay «-0» en la consulta ni en el ETag)', () => {
    const r = parseAreasQuery(params('bbox=-80,-0,-79,9&zoom=8'));
    // south = -0 queda recortado al área de trabajo (5): comprobamos que nunca queda -0
    expect(r.ok && Object.is(r.value.bbox.south, -0)).toBe(false);
  });
});

describe('parseLocateQuery', () => {
  it('acepta un punto dentro del área de trabajo', () => {
    expect(parseLocateQuery(params('lon=-79.5&lat=8.9'))).toEqual({
      ok: true,
      value: { lon: -79.5, lat: 8.9, layers: [...SPATIAL_LAYER_IDS], locale: null },
    });
  });

  it.each([
    ['lon=-79.5', 'lat:param.missing'],
    ['lat=8.9', 'lon:param.missing'],
    ['lon=&lat=8.9', 'lon:lon.format'],
    ['lon=8.9&lat=-79.5', 'lon:point.outside_working_area'], // intercambiados
    ['lon=-79.5&lat=89', 'lat:point.outside_working_area'],
    ['lon=abc&lat=8.9', 'lon:lon.format'],
    ['lon=-79.5&lat=8.9&zoom=3', 'zoom:param.unknown'],
  ])('rechaza «%s» → %s', (query, expected) => {
    expect(codes(parseLocateQuery(params(query)))).toContain(expected);
  });

  it('los bordes exactos del área de trabajo cuentan como dentro', () => {
    expect(parseLocateQuery(params('lon=-85&lat=5')).ok).toBe(true);
    expect(parseLocateQuery(params('lon=-75&lat=11')).ok).toBe(true);
  });
});

describe('parseAreaDetailQuery', () => {
  const id = '3F2504E0-4F89-41D3-9A0C-0305E82C3301';
  it('acepta un UUID (se normaliza a minúsculas) y usa el zoom de detalle por defecto', () => {
    expect(parseAreaDetailQuery(id, params(''))).toEqual({
      ok: true,
      value: { id: id.toLowerCase(), zoom: SPATIAL_LIMITS.detailZoom, locale: null },
    });
  });

  it.each([
    ['bocas-del-toro'],
    ["3f2504e0-4f89-41d3-9a0c-0305e82c3301'; drop table x;--"],
    ['3f2504e04f8941d39a0c0305e82c3301'],
    ['../../etc/passwd'],
    [''],
  ])('rechaza el identificador «%s»: la identidad es el UUID, nunca el nombre', (bad) => {
    expect(codes(parseAreaDetailQuery(bad, params('')))).toContain('id:id.format');
  });
});

describe('invariantes (fuzz determinista)', () => {
  // PRNG con semilla fija: reproducible.
  let seed = 20261020;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const alphabet = [
    '0',
    '1',
    '7',
    '9',
    '-',
    '.',
    ',',
    '+',
    'e',
    'E',
    'x',
    ' ',
    'N',
    'a',
    '%',
    '８',
  ];
  const junk = () =>
    Array.from(
      { length: Math.floor(rnd() * 24) },
      () => alphabet[Math.floor(rnd() * alphabet.length)],
    ).join('');

  it('toda entrada: o es válida y cumple los límites, o falla con ≥ 1 motivo; nunca lanza', () => {
    for (let i = 0; i < 4000; i++) {
      const query = new URLSearchParams();
      for (const key of ['bbox', 'zoom', 'layers', 'limit', 'locale', 'lon', 'lat']) {
        if (rnd() < 0.6) query.set(key, junk());
      }
      const areas = parseAreasQuery(query);
      if (areas.ok) {
        const { bbox, zoom, limit } = areas.value;
        expect(bbox.west).toBeGreaterThanOrEqual(DATA_WORKING_AREA.west);
        expect(bbox.east).toBeLessThanOrEqual(DATA_WORKING_AREA.east);
        expect(bbox.south).toBeGreaterThanOrEqual(DATA_WORKING_AREA.south);
        expect(bbox.north).toBeLessThanOrEqual(DATA_WORKING_AREA.north);
        expect(bbox.west).toBeLessThan(bbox.east);
        expect(bbox.south).toBeLessThan(bbox.north);
        expect((bbox.east - bbox.west) * (bbox.north - bbox.south)).toBeLessThanOrEqual(
          SPATIAL_LIMITS.maxBboxAreaDeg2,
        );
        expect(Number.isInteger(zoom) && zoom >= 0 && zoom <= SPATIAL_LIMITS.zoomMax).toBe(true);
        expect(limit >= 1 && limit <= SPATIAL_LIMITS.maxLimit).toBe(true);
      } else {
        expect(areas.issues.length).toBeGreaterThan(0);
      }
      const locate = parseLocateQuery(query);
      if (!locate.ok) expect(locate.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('simplificación para mostrar', () => {
  it('un píxel de una tesela de 512 px (valores analíticos)', () => {
    expect(simplifyToleranceDegrees(0)).toBeCloseTo(360 / 512, 12);
    expect(simplifyToleranceDegrees(1)).toBeCloseTo(360 / 1024, 12);
    expect(simplifyToleranceDegrees(10) * 1024).toBeCloseTo(simplifyToleranceDegrees(0), 12);
  });

  it('los decimales crecen con el zoom y se acotan entre 2 y 7', () => {
    const d = Array.from({ length: SPATIAL_LIMITS.zoomMax + 1 }, (_, z) => coordinateDecimals(z));
    expect(d[0]).toBe(2);
    expect(d.at(-1)).toBeLessThanOrEqual(7);
    for (let z = 1; z < d.length; z++) expect(d[z]).toBeGreaterThanOrEqual(d[z - 1] ?? 0);
    // Al menos 1/10 de píxel de resolución
    for (let z = 0; z <= 14; z++) {
      expect(10 ** -coordinateDecimals(z)).toBeLessThanOrEqual(
        simplifyToleranceDegrees(z) / 10 + 1e-12,
      );
    }
  });
});

describe('pickName: nunca se traduce ni se inventa', () => {
  const row = (
    locale: AreaNameRow['locale'],
    provenance: AreaNameRow['provenance'],
    name: string,
  ): AreaNameRow => ({ area_id: 'a', locale, provenance, name });
  const names = [
    row(null, 'source_local', 'Parque Local'),
    row('en', 'source_common', 'Local Park'),
    row('en', 'editorial', 'Local Park (editorial)'),
    row('fr', 'source_common', 'Parc local'),
  ];

  it('prefiere el nombre editorial del idioma, luego el de fuente en ese idioma', () => {
    expect(pickName(names, 'en')).toMatchObject({
      value: 'Local Park (editorial)',
      provenance: 'editorial',
    });
    expect(pickName(names, 'fr')).toMatchObject({ value: 'Parc local', locale: 'fr' });
  });

  it('si no hay nombre en el idioma pedido, usa el LOCAL de la fuente (sin traducir)', () => {
    expect(pickName(names, 'de')).toEqual({
      value: 'Parque Local',
      locale: null,
      provenance: 'source_local',
    });
    expect(pickName(names, null)).toMatchObject({ value: 'Parque Local' });
  });

  it('sin nombre local ni del idioma pedido, no hay nombre (nunca el de otro idioma)', () => {
    expect(pickName([row('fr', 'source_common', 'Parc')], 'en')).toBeNull();
    expect(pickName([], 'es')).toBeNull();
  });
});

describe('capas de la API', () => {
  it('cada tipo de área pertenece como mucho a una capa', () => {
    const all = SPATIAL_LAYER_IDS.flatMap((id) => SPATIAL_LAYERS[id].kinds);
    expect(new Set(all).size).toBe(all.length);
    expect(layerForKind('protected_area')).toBe('protected_areas');
    expect(layerForKind('locality')).toBe('context_areas');
    expect(layerForKind('editorial_area')).toBeNull();
    expect(kindsForLayers(['protected_areas', 'context_areas'])).toHaveLength(all.length);
  });
});

describe('contratos con la BD, el pipeline y las políticas', () => {
  const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

  it('el área de trabajo coincide con el CHECK de la BD y con el pipeline de Python', () => {
    const w = DATA_WORKING_AREA;
    expect(read('db/migrations/0002_sources_and_geography.sql')).toContain(
      `st_makeenvelope(${w.west}, ${w.south}, ${w.east}, ${w.north}, 4326)`,
    );
    expect(read('pipelines/ingest/validate.py')).toContain(
      `WORKING_AREA = (${w.west.toFixed(1)}, ${w.south.toFixed(1)}, ${w.east.toFixed(1)}, ${w.north.toFixed(1)})`,
    );
  });

  it('las capas cubren todos los tipos de área de la BD salvo el editorial', () => {
    const sql = read('db/migrations/0002_sources_and_geography.sql');
    const table = sql.slice(sql.indexOf('create table public.geographic_areas'));
    const block = /kind\s+text not null check \(kind in \(([^)]*)\)\)/.exec(table)?.[1] ?? '';
    const dbKinds = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? '');
    expect(dbKinds.length).toBeGreaterThan(5);
    const served = SPATIAL_LAYER_IDS.flatMap((id) => SPATIAL_LAYERS[id].kinds);
    expect([...served].sort()).toEqual(dbKinds.filter((k) => k !== 'editorial_area').sort());
  });

  it('el sujeto de derechos de cada capa tiene política, y coincide con la clave de fuente de los conjuntos', () => {
    const policies = JSON.parse(read('data/rights/policies.json')) as {
      policies: { subject: string }[];
    };
    const subjects = policies.policies.map((p) => p.subject);
    for (const id of SPATIAL_LAYER_IDS)
      expect(subjects).toContain(SPATIAL_LAYERS[id].rightsSubject);
    const datasets = JSON.parse(read('pipelines/ingest/datasets.json')) as Record<
      string,
      { rightsSubject: string; source: { key: string } }
    >;
    // La fila se autoriza por `data_sources.key`: debe ser igual al sujeto de la política.
    for (const dataset of Object.values(datasets))
      expect(dataset.source.key).toBe(dataset.rightsSubject);
  });
});
