import { describe, expect, it } from 'vitest';
import {
  candidatesFromFeatures,
  geometryBounds,
  parseAreaId,
} from '@/domains/geography/area-selection';
import {
  parseAreaDetail,
  safeHttpsUrl,
  sourceOf,
  squareMetersToHectares,
} from '@/domains/geography/area-detail';

const ID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const ID_B = '11111111-1111-4111-8111-111111111111';
const ID_C = '22222222-2222-4222-8222-222222222222';
const feature = (properties: Record<string, unknown>) => ({ properties });

describe('parseAreaId', () => {
  it('acepta un UUID y lo normaliza a minúsculas', () => {
    expect(parseAreaId(ID_A.toUpperCase())).toBe(ID_A);
  });

  it.each([
    'bocas-del-toro',
    '',
    '3f2504e04f8941d39a0c0305e82c3301',
    `${ID_A}'; drop table x;--`,
    `${ID_A}${ID_A}`,
    '../../etc/passwd',
    '<img src=x onerror=alert(1)>',
    ' ' + ID_A,
    `${ID_A}\n`,
    'a'.repeat(100_000),
  ])('rechaza «%s»: la identidad es el UUID, nunca el nombre', (bad) => {
    expect(parseAreaId(bad)).toBeNull();
  });
});

describe('candidatesFromFeatures', () => {
  it('deduplica el área que aparece en varias teselas y conserva el nombre si alguna lo trae', () => {
    const out = candidatesFromFeatures(
      [
        feature({ ovid: ID_A }),
        feature({ ovid: ID_A, name: 'Parque Uno' }),
        feature({ ovid: ID_A }),
        feature({ ovid: ID_B, name: 'Reserva Dos' }),
      ],
      'ovid',
      'es',
      10,
    );
    expect(out.total).toBe(2);
    expect(out.items).toEqual([
      { id: ID_A, name: 'Parque Uno' },
      { id: ID_B, name: 'Reserva Dos' },
    ]);
  });

  it('ordena con las reglas del idioma (Ñ después de N en español, números como números) y deja sin nombre al final', () => {
    const rows = [
      feature({ ovid: ID_A, name: 'Zona 10' }),
      feature({ ovid: ID_B, name: 'Zona 2' }),
      feature({ ovid: ID_C }),
      feature({ ovid: '44444444-4444-4444-8444-444444444444', name: 'Ñandú' }),
      feature({ ovid: '55555555-5555-4555-8555-555555555555', name: 'Nopal' }),
      feature({ ovid: '66666666-6666-4666-8666-666666666666', name: 'Ocelote' }),
    ];
    const names = candidatesFromFeatures(rows, 'ovid', 'es', 50).items.map((i) => i.name);
    expect(names).toEqual(['Nopal', 'Ñandú', 'Ocelote', 'Zona 2', 'Zona 10', null]);
  });

  it('el orden es determinista (no depende del orden de entrada)', () => {
    const rows = [
      feature({ ovid: ID_A }),
      feature({ ovid: ID_B }),
      feature({ ovid: ID_C }),
      feature({ ovid: '99999999-9999-4999-8999-999999999999', name: 'Mismo' }),
      feature({ ovid: '88888888-8888-4888-8888-888888888888', name: 'Mismo' }),
    ];
    const forward = candidatesFromFeatures(rows, 'ovid', 'es', 50).items;
    const backward = candidatesFromFeatures([...rows].reverse(), 'ovid', 'es', 50).items;
    expect(forward).toEqual(backward);
  });

  it('acota los elementos pero informa del total (nunca recorta en silencio)', () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      feature({
        ovid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        name: `Área ${i}`,
      }),
    );
    const out = candidatesFromFeatures(rows, 'ovid', 'es', 12);
    expect(out.items).toHaveLength(12);
    expect(out.total).toBe(40);
    expect(candidatesFromFeatures(rows, 'ovid', 'es', 0).items).toEqual([]);
  });

  it('descarta lo hostil: IDs que no son UUID o no son texto, propiedades ausentes y nombres no textuales', () => {
    const out = candidatesFromFeatures(
      [
        feature({ ovid: 'no-es-un-uuid', name: 'X' }),
        feature({ ovid: 12345, name: 'Y' }),
        feature({ ovid: null }),
        feature({ ovid: { toString: () => ID_A } }),
        { properties: null },
        {},
        feature({ ovid: ID_A, name: 42 }),
      ],
      'ovid',
      'es',
      10,
    );
    expect(out.items).toEqual([{ id: ID_A, name: null }]);
  });

  it('el nombre de una tesela es TEXTO: se limpia (control, espacios, longitud) y no se interpreta', () => {
    const hostile = '  <img src=x onerror=alert(1)>\u0000\u0007\n\tParque\u009f   Raro  ';
    const out = candidatesFromFeatures([feature({ ovid: ID_A, name: hostile })], 'ovid', 'es', 5);
    // El HTML no se elimina (React lo escapa al pintar): lo que se garantiza es que no hay caracteres de control
    expect(out.items[0]?.name).toBe('<img src=x onerror=alert(1)> Parque Raro');
    const long = candidatesFromFeatures(
      [feature({ ovid: ID_A, name: 'a'.repeat(5000) })],
      'ovid',
      'es',
      5,
    );
    expect(long.items[0]?.name).toHaveLength(200);
    expect(
      candidatesFromFeatures([feature({ ovid: ID_A, name: '   \n ' })], 'ovid', 'es', 5).items[0]
        ?.name,
    ).toBeNull();
  });
});

describe('geometryBounds', () => {
  it('caja de un polígono y de un multipolígono (lon, lat)', () => {
    expect(
      geometryBounds({
        type: 'Polygon',
        coordinates: [
          [
            [-80, 8],
            [-79, 8],
            [-79, 9],
            [-80, 9],
            [-80, 8],
          ],
        ],
      }),
    ).toEqual([-80, 8, -79, 9]);
    expect(
      geometryBounds({
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-80, 8],
              [-79.5, 8],
              [-79.5, 8.5],
              [-80, 8],
            ],
          ],
          [
            [
              [-78, 9],
              [-77, 9],
              [-77, 10],
              [-78, 9],
            ],
          ],
        ],
      }),
    ).toEqual([-80, 8, -77, 10]);
  });

  it.each([
    ['sin coordenadas', { type: 'Polygon', coordinates: [] }],
    ['no es un objeto', 'texto'],
    ['null', null],
    ['sin `coordinates`', { type: 'Polygon' }],
    ['NaN', { coordinates: [[[Number.NaN, 8]]] }],
    ['Infinity', { coordinates: [[[Infinity, 8]]] }],
    ['fuera de rango', { coordinates: [[[500, 8]]] }],
    ['latitud fuera de rango', { coordinates: [[[-80, 95]]] }],
    ['textos en lugar de números', { coordinates: [['-80', '8']] }],
  ])('devuelve null si %s', (_name, geometry) => {
    expect(geometryBounds(geometry)).toBeNull();
  });

  it('ignora las posiciones inválidas pero usa las válidas, y no se cuelga con anidamiento enorme', () => {
    expect(
      geometryBounds({
        coordinates: [
          [-80, 8],
          [Number.NaN, 8],
          [-70, 9],
        ],
      }),
    ).toEqual([-80, 8, -70, 9]);
    let deep: unknown = [-80, 8];
    for (let i = 0; i < 10_000; i++) deep = [deep];
    expect(geometryBounds({ coordinates: deep })).toBeNull();
  });
});

describe('parseAreaDetail', () => {
  const base = {
    type: 'Feature',
    id: ID_A,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-80, 8],
          [-79, 8],
          [-79, 9],
          [-80, 8],
        ],
      ],
    },
    properties: {
      id: ID_A,
      layer: 'protected_areas',
      kind: 'protected_area',
      sourceClass: 'osm_derived',
      name: { value: 'Parque Uno', locale: null, provenance: 'source_local' },
      area: { squareMeters: 12_345_678, method: 'ST_Area(geography, EPSG:4326)' },
      geometryVersion: 1,
      overtureId: ID_A,
      sourceRef: 'ref-1',
      names: [{ locale: null, name: 'Parque Uno', provenance: 'source_local' }],
    },
    sources: [
      {
        ref: 'ref-1',
        key: 'overture',
        institution: 'Overture Maps Foundation',
        kind: 'osm_derived',
        versionLabel: '2026-09-23.1:overture-protected-areas:abcdef123456',
        retrievedAt: '2026-10-20T23:34:42Z',
        license: { name: 'ODbL', url: 'https://opendatacommons.org/licenses/odbl/' },
        attribution: '© OpenStreetMap contributors, Overture Maps Foundation',
        rightsStatus: 'provisional',
      },
    ],
    meta: { zoom: 10 },
  };

  it('acepta la respuesta de la API y resuelve la fuente del área', () => {
    const detail = parseAreaDetail(base);
    expect(detail?.properties.name?.value).toBe('Parque Uno');
    expect(detail && sourceOf(detail)?.institution).toBe('Overture Maps Foundation');
  });

  it('una superficie sin método se admite como null (la API no la publica); con número sin método, no', () => {
    expect(
      parseAreaDetail({ ...base, properties: { ...base.properties, area: null } }),
    ).not.toBeNull();
    expect(
      parseAreaDetail({ ...base, properties: { ...base.properties, area: { squareMeters: 5 } } }),
    ).toBeNull();
  });

  it.each([
    ['no es un Feature', { ...base, type: 'FeatureCollection' }],
    ['falta la fuente', { ...base, sources: undefined }],
    [
      'clase de fuente desconocida',
      { ...base, properties: { ...base.properties, sourceClass: 'oficial' } },
    ],
    [
      'superficie negativa',
      { ...base, properties: { ...base.properties, area: { squareMeters: -1, method: 'x' } } },
    ],
    [
      'idioma de nombre desconocido',
      {
        ...base,
        properties: {
          ...base.properties,
          name: { value: 'x', locale: 'xx', provenance: 'source_local' },
        },
      },
    ],
    [
      'estado de derechos inventado',
      { ...base, sources: [{ ...base.sources[0], rightsStatus: 'ok' }] },
    ],
    ['versión de geometría 0', { ...base, properties: { ...base.properties, geometryVersion: 0 } }],
  ])('rechaza una respuesta que %s', (_name, json) => {
    expect(parseAreaDetail(json)).toBeNull();
  });

  it('rechaza lo que no es un objeto', () => {
    for (const bad of [null, undefined, 'x', 3, [], {}]) expect(parseAreaDetail(bad)).toBeNull();
  });

  it('sourceOf es null si el área no tiene fuente o la referencia no está', () => {
    const none = parseAreaDetail({ ...base, properties: { ...base.properties, sourceRef: null } });
    expect(none && sourceOf(none)).toBeNull();
    const dangling = parseAreaDetail({
      ...base,
      properties: { ...base.properties, sourceRef: 'otra' },
    });
    expect(dangling && sourceOf(dangling)).toBeNull();
  });
});

describe('safeHttpsUrl y superficie', () => {
  it('solo https se convierte en enlace', () => {
    expect(safeHttpsUrl('https://opendatacommons.org/licenses/odbl/')).toBe(
      'https://opendatacommons.org/licenses/odbl/',
    );
    for (const bad of [
      'http://example.org',
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///etc/passwd',
      '//evil.example',
      'no es url',
      '',
      null,
    ]) {
      expect(safeHttpsUrl(bad)).toBeNull();
    }
  });

  it('metros cuadrados a hectáreas (valores analíticos)', () => {
    expect(squareMetersToHectares(10_000)).toBe(1);
    expect(squareMetersToHectares(1_000_000)).toBe(100); // 1 km² = 100 ha
    expect(squareMetersToHectares(0)).toBe(0);
  });
});
