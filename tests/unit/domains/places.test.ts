import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PLACE_DATASETS,
  PLACE_GROUPS,
  PLACE_KINDS,
  PLACE_LICENSES,
  contributingDatasets,
  displayDistanceM,
  groupOfKind,
  isCleanPlaceName,
  parseDestinationPlaces,
  placeLicenses,
  type NearbyPlace,
} from '@/domains/tourism/places';
import { LOCALES } from '@/i18n/locales';

/**
 * Lugares cercanos sin verificar (ADR-0027 A2): el validador del navegador. La respuesta de la API es entrada hostil (aunque sea
 * nuestra): cualquier desajuste la rechaza ENTERA. Cada caso cambia UNA cosa de una respuesta válida (control: la válida pasa).
 */
const config = JSON.parse(
  readFileSync(new URL('../../../pipelines/places/places.config.json', import.meta.url), 'utf8'),
) as {
  groups: Record<string, string[]>;
  datasets: string[];
  licenses: string[];
  maxNameLength: number;
  kinds: Record<string, string>;
};

const place = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  name: `Lugar ${String(n)}`,
  kind: 'hotel',
  lon: -82.43482,
  lat: 8.77637 + n * 0.0009,
  distanceM: n * 100,
  sourceUpdated: '2026-08-01',
  sources: [
    { dataset: 'Overture', license: 'CDLA-Permissive-2.0' },
    { dataset: 'meta', license: 'CDLA-Permissive-2.0' },
  ],
  ...overrides,
});

const response = (
  lodging: unknown[] = [place(1), place(2)],
  extra: Record<string, unknown> = {},
) => ({
  status: 'unverified',
  destination: 'boquete',
  release: '2026-09-23.1',
  radiusKm: 3,
  groups: {
    activities: { total: 0, places: [] },
    food: { total: 0, places: [] },
    lodging: { total: lodging.length, places: lodging },
  },
  ...extra,
});

describe('parseDestinationPlaces', () => {
  it('acepta una respuesta válida (control) y conserva el orden', () => {
    const parsed = parseDestinationPlaces(response(), 'boquete');
    expect(parsed?.groups.lodging.places.map((p) => p.name)).toEqual(['Lugar 1', 'Lugar 2']);
    expect(parsed?.radiusKm).toBe(3);
  });

  it.each([
    ['no declara «unverified»', response(undefined, { status: 'verified' })],
    ['es de otro destino', response(undefined, { destination: 'coiba' })],
    ['release mal formada', response(undefined, { release: 'latest' })],
    ['radio absurdo', response(undefined, { radiusKm: 500 })],
    ['falta un grupo', { ...response(), groups: { activities: { total: 0, places: [] } } }],
    ['id que no es UUID', response([place(1, { id: 'x' })])],
    ['nombre con un carácter bidi', response([place(1, { name: 'Hotel‮' })])],
    ['nombre con anchura cero', response([place(1, { name: 'Hotel​' })])],
    ['nombre con salto de línea', response([place(1, { name: 'Hotel\nSol' })])],
    ['nombre vacío', response([place(1, { name: '' })])],
    ['nombre sin recortar', response([place(1, { name: ' Hotel' })])],
    ['nombre demasiado largo', response([place(1, { name: 'x'.repeat(121) })])],
    ['tipo de otro grupo', response([place(1, { kind: 'bar' })])],
    ['tipo inventado', response([place(1, { kind: 'casino' })])],
    ['fuera del rectángulo de Panamá', response([place(1, { lon: -90 })])],
    ['distancia mayor que el radio', response([place(1, { distanceM: 3500 })])],
    ['distancia no entera', response([place(1, { distanceM: 10.5 })])],
    ['fecha mal formada', response([place(1, { sourceUpdated: 'ayer' })])],
    [
      'proveedor fuera de la lista',
      response([place(1, { sources: [{ dataset: 'Yelp', license: 'CC0-1.0' }] })]),
    ],
    [
      'licencia fuera de la lista',
      response([place(1, { sources: [{ dataset: 'meta', license: 'proprietary' }] })]),
    ],
    ['sin fuentes', response([place(1, { sources: [] })])],
    ['desordenada', response([place(2), place(1)])],
    ['id repetido', response([place(1), place(1, { distanceM: 150 })])],
    [
      'total menor que la lista',
      {
        ...response(),
        groups: { ...response().groups, lodging: { total: 1, places: [place(1), place(2)] } },
      },
    ],
    [
      'más del tope duro',
      response(Array.from({ length: 51 }, (_, i) => place(i + 1, { distanceM: i }))),
    ],
    ['no es un objeto', null],
  ])('rechaza una respuesta que %s', (_why, json) => {
    expect(parseDestinationPlaces(json, 'boquete')).toBeNull();
  });

  it('el nombre limpio tal como lo deja el pipeline pasa (control de `isCleanPlaceName`)', () => {
    expect(isCleanPlaceName('Café Ruiz · Boquete')).toBe(true);
    expect(isCleanPlaceName('Hotel  Sol')).toBe(false);
  });
});

describe('presentación', () => {
  it('la distancia se enseña redondeada (decenas de metros; cientos por encima de 1 km) y nunca 0', () => {
    expect(displayDistanceM(0)).toBe(10);
    expect(displayDistanceM(344)).toBe(340);
    expect(displayDistanceM(999)).toBe(1000);
    expect(displayDistanceM(1260)).toBe(1300);
  });

  it('los proveedores sin el propio Overture y las licencias sin repetir', () => {
    const p = parseDestinationPlaces(
      response([
        place(1, {
          sources: [
            { dataset: 'Overture', license: 'CDLA-Permissive-2.0' },
            { dataset: 'meta', license: 'CDLA-Permissive-2.0' },
            { dataset: 'Foursquare', license: 'Apache-2.0' },
          ],
        }),
      ]),
      'boquete',
    )?.groups.lodging.places[0] as NearbyPlace;
    expect(contributingDatasets(p)).toEqual(['meta', 'Foursquare']);
    expect(placeLicenses(p)).toEqual(['CDLA-Permissive-2.0', 'Apache-2.0']);
  });

  it('cada tipo pertenece a su grupo', () => {
    for (const group of PLACE_GROUPS) {
      for (const kind of PLACE_KINDS[group]) expect(groupOfKind(kind)).toBe(group);
    }
  });
});

describe('las listas cerradas coinciden con la configuración del pipeline (una sola regla)', () => {
  it('grupos, tipos, proveedores, licencias y longitud del nombre', () => {
    expect(Object.keys(config.groups)).toEqual([...PLACE_GROUPS]);
    for (const group of PLACE_GROUPS) expect(config.groups[group]).toEqual([...PLACE_KINDS[group]]);
    expect(config.datasets).toEqual([...PLACE_DATASETS]);
    expect(config.licenses).toEqual([...PLACE_LICENSES]);
    expect(config.maxNameLength).toBe(120);
  });

  it('cada tipo tiene su texto en los cinco idiomas (y los grupos, sus pestañas)', () => {
    for (const locale of LOCALES) {
      const messages = JSON.parse(
        readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8'),
      ) as { Map: { places: { kind: Record<string, string>; group: Record<string, string> } } };
      for (const group of PLACE_GROUPS) {
        expect(messages.Map.places.group[group], `${locale}: ${group}`).toBeTruthy();
        for (const kind of PLACE_KINDS[group]) {
          expect(messages.Map.places.kind[kind], `${locale}: ${kind}`).toBeTruthy();
        }
      }
      expect(Object.keys(messages.Map.places.kind).sort()).toEqual(
        PLACE_GROUPS.flatMap((g) => [...PLACE_KINDS[g]]).sort(),
      );
    }
  });
});
