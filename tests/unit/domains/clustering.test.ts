import { describe, expect, it } from 'vitest';
import {
  clusterByScreenDistance,
  separationZoom,
  type ClusterPoint,
} from '@/domains/geography/clustering';
import { worldSize, worldX, worldY } from '@/domains/geography/mercator';

const point = (key: string, x: number, y: number): ClusterPoint => ({
  key,
  x,
  y,
  lon: x / 100,
  lat: y / 100,
});

describe('agrupamiento de marcadores por distancia en pantalla', () => {
  it('puntos lejanos quedan cada uno en su propio grupo, en el orden de entrada', () => {
    const result = clusterByScreenDistance(
      [point('a', 0, 0), point('b', 200, 0), point('c', 0, 200)],
      48,
    );
    expect(result.map((c) => c.keys)).toEqual([['a'], ['b'], ['c']]);
  });

  it('puntos a menos del radio se agrupan; el id y el centro describen al grupo', () => {
    const [group, ...rest] = clusterByScreenDistance(
      [point('a', 0, 0), point('b', 10, 10), point('c', 300, 0)],
      48,
    );
    expect(rest).toHaveLength(1);
    expect(group?.keys).toEqual(['a', 'b']);
    expect(group?.id).toBe('a+b');
    expect(group?.lon).toBeCloseTo(0.05, 12);
    expect(group?.lat).toBeCloseTo(0.05, 12);
  });

  it('el radio es estricto: a exactamente `radiusPx` NO se agrupan', () => {
    expect(clusterByScreenDistance([point('a', 0, 0), point('b', 48, 0)], 48)).toHaveLength(2);
    expect(clusterByScreenDistance([point('a', 0, 0), point('b', 47.9, 0)], 48)).toHaveLength(1);
  });

  it('cada punto aparece exactamente una vez', () => {
    const points = [
      point('a', 0, 0),
      point('b', 5, 5),
      point('c', 400, 400),
      point('d', 405, 400),
      point('e', 9, 9),
    ];
    const keys = clusterByScreenDistance(points, 48).flatMap((c) => [...c.keys]);
    expect([...keys].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('sin puntos devuelve una lista vacía', () => {
    expect(clusterByScreenDistance([], 48)).toEqual([]);
  });

  it('propiedad: tras agrupar, dos grupos cualesquiera tienen sus centros a ≥ radio (sin botones solapados)', () => {
    // PRNG determinista (mulberry32).
    let seed = 0x2545f491;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let trial = 0; trial < 300; trial++) {
      const n = 1 + Math.floor(rand() * 12);
      const points = Array.from({ length: n }, (_, i) =>
        point(`p${i}`, rand() * 400, rand() * 300),
      );
      const clusters = clusterByScreenDistance(points, 48);
      const byKey = new Map(points.map((p) => [p.key, p]));
      const centers = clusters.map((c) => {
        const members = c.keys
          .map((k) => byKey.get(k))
          .filter((m): m is ClusterPoint => m !== undefined);
        return {
          x: members.reduce((s, m) => s + m.x, 0) / members.length,
          y: members.reduce((s, m) => s + m.y, 0) / members.length,
        };
      });
      for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
          const a = centers[i];
          const b = centers[j];
          expect(
            Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0)),
          ).toBeGreaterThanOrEqual(48);
        }
      }
      expect(clusters.flatMap((c) => c.keys)).toHaveLength(n);
    }
  });
});

/** Anclas reales de data/anchors (los tres destinos de la ciudad están a ≈ 0,06° entre sí). */
const CITY = [
  { key: 'panama-canal', lon: -79.5907, lat: 8.99534 },
  { key: 'panama-city', lon: -79.53418, lat: 8.97145 },
  { key: 'casco-antiguo', lon: -79.53472, lat: 8.95255 },
  { key: 'coiba', lon: -81.79592, lat: 7.48343 },
] as const;

/** Proyecta a píxeles de pantalla a `zoom` (el origen no importa: solo cuentan las distancias). */
const project = (zoom: number): ClusterPoint[] =>
  CITY.map((p) => ({
    key: p.key,
    x: worldX(p.lon) * worldSize(zoom),
    y: worldY(p.lat) * worldSize(zoom),
    lon: p.lon,
    lat: p.lat,
  }));

describe('zoom de separación (suelo para encuadrar un destino sin que se funda con un grupo)', () => {
  it('a ese zoom el destino NO queda dentro de un grupo; un poco por debajo, SÍ (control)', () => {
    const z = separationZoom(CITY, 'panama-canal', 52);
    expect(Number.isFinite(z)).toBe(true);
    const clusterOf = (zoom: number) =>
      clusterByScreenDistance(project(zoom), 52).find((c) => c.keys.includes('panama-canal'));
    expect(clusterOf(z + 0.01)?.keys).toEqual(['panama-canal']);
    // Control: por debajo del suelo el canal se funde con la ciudad (la prueba no es vacía)
    expect(clusterOf(z - 0.5)?.keys.length).toBeGreaterThan(1);
  });

  it('el suelo lo marca el vecino MÁS CERCANO: el canal necesita más zoom que Coiba, que no tiene vecinos', () => {
    expect(separationZoom(CITY, 'panama-canal', 52)).toBeGreaterThan(8);
    expect(separationZoom(CITY, 'coiba', 52)).toBeLessThan(
      separationZoom(CITY, 'panama-canal', 52),
    );
  });

  it('un punto sin vecinos o una clave desconocida no imponen nada (−∞)', () => {
    expect(separationZoom([CITY[3]], 'coiba', 52)).toBe(Number.NEGATIVE_INFINITY);
    expect(separationZoom(CITY, 'no-existe', 52)).toBe(Number.NEGATIVE_INFINITY);
    expect(separationZoom(CITY, 'panama-canal', 0)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('doblar el radio exige exactamente un nivel de zoom más', () => {
    expect(
      separationZoom(CITY, 'casco-antiguo', 104) - separationZoom(CITY, 'casco-antiguo', 52),
    ).toBeCloseTo(1, 9);
  });
});
