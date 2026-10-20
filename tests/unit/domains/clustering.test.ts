import { describe, expect, it } from 'vitest';
import { clusterByScreenDistance, type ClusterPoint } from '@/domains/geography/clustering';

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
