import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAnchors } from '@/domains/geography/anchors';
import { WORKING_BBOX } from '@/domains/geography/bounds';
import { DESTINATION_ANCHORS } from '@/lib/destination-anchors';
import { DESTINATION_KEYS, type DestinationKey } from '@/domains/tourism/destinations';

const raw = JSON.parse(
  readFileSync(new URL('../../../data/anchors/destination-anchors.json', import.meta.url), 'utf8'),
) as Record<string, unknown> & { destinations: Record<string, Record<string, unknown>> };

const clone = (): typeof raw => structuredClone(raw);

function haversineKm(a: readonly [number, number], b: readonly [number, number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b[1] - a[1]) / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

describe('anclas de destino', () => {
  it('el documento generado es válido y cubre exactamente los destinos del registro', () => {
    const parsed = parseAnchors(raw);
    expect(Object.keys(parsed.anchors).sort()).toEqual([...DESTINATION_KEYS].sort());
    expect(parsed.info.release).toBe('2026-09-23.1');
    expect(DESTINATION_ANCHORS.info.attribution).toContain('OpenStreetMap');
    expect(DESTINATION_ANCHORS.info.disclaimer).toMatch(/NO son límites oficiales/);
  });

  it('todas están dentro del área de trabajo y de su propio encuadre', () => {
    for (const key of DESTINATION_KEYS) {
      const a = DESTINATION_ANCHORS.anchors[key];
      expect(a.lon).toBeGreaterThanOrEqual(WORKING_BBOX.west);
      expect(a.lon).toBeLessThanOrEqual(WORKING_BBOX.east);
      expect(a.lat).toBeGreaterThanOrEqual(WORKING_BBOX.south);
      expect(a.lat).toBeLessThanOrEqual(WORKING_BBOX.north);
      if (a.bounds) {
        expect(a.lon, key).toBeGreaterThanOrEqual(a.bounds[0]);
        expect(a.lon, key).toBeLessThanOrEqual(a.bounds[2]);
        expect(a.lat, key).toBeGreaterThanOrEqual(a.bounds[1]);
        expect(a.lat, key).toBeLessThanOrEqual(a.bounds[3]);
      }
    }
  });

  /**
   * Guarda de homonimias: coordenadas APROXIMADAS de referencia (conocimiento general, las mismas del sondeo
   * `pipelines/spikes/terrain_probe.py`, solo para esta comprobación gruesa). Si un ancla apuntase al
   * «Barú» equivocado, a otra «Santa Catalina» o a otra «El Valle», quedaría a decenas de km.
   */
  const REFERENCE: Record<
    DestinationKey,
    readonly [lon: number, lat: number, toleranceKm: number]
  > = {
    'panama-city': [-79.52, 8.98, 5],
    'casco-antiguo': [-79.535, 8.952, 2],
    'panama-canal': [-79.595, 8.996, 5],
    'el-valle-de-anton': [-80.126, 8.601, 3],
    boquete: [-82.437, 8.78, 3],
    'volcan-baru': [-82.543, 8.808, 3],
    'bocas-del-toro': [-82.24, 9.34, 3],
    'santa-catalina': [-81.267, 8.14, 1],
    coiba: [-81.75, 7.45, 10],
  };

  it.each(DESTINATION_KEYS.map((key) => [key] as const))(
    '%s está cerca de su referencia independiente',
    (key) => {
      const [lon, lat, tolerance] = REFERENCE[key];
      const a = DESTINATION_ANCHORS.anchors[key];
      expect(haversineKm([a.lon, a.lat], [lon, lat])).toBeLessThan(tolerance);
    },
  );

  it('Santa Catalina coincide con la localidad de Veraguas de E-23c y no con las otras tres', () => {
    const a = DESTINATION_ANCHORS.anchors['santa-catalina'];
    expect(haversineKm([a.lon, a.lat], [-81.2641, 8.1398])).toBeLessThan(0.2);
    for (const other of [
      [-81.2546, 7.6342],
      [-81.3101, 8.783],
    ] as const) {
      expect(haversineKm([a.lon, a.lat], other)).toBeGreaterThan(30);
    }
  });

  it('el marcador de un polígono multiparte NO es su punto representativo cuando hay punto de división enlazado', () => {
    // Bocas del Toro: el punto representativo del polígono caía a ~6 km del pueblo (otra isla o agua).
    expect(raw.destinations['bocas-del-toro']).toMatchObject({
      anchor: { method: 'division_point' },
    });
  });

  it('cada ancla se identifica por un ID de Overture (UUID), nunca por nombre', () => {
    for (const key of DESTINATION_KEYS) {
      const sources = raw.destinations[key]?.sources as { role: string; id?: string }[];
      const anchor = sources.find((s) => s.role === 'anchor');
      expect(anchor?.id, key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  it('Casco Antiguo y El Valle llevan corroboración espacial por contención', () => {
    for (const key of ['casco-antiguo', 'el-valle-de-anton']) {
      const corroboration = raw.destinations[key]?.corroboration as { withinAnchor: boolean }[];
      expect(corroboration.length, key).toBeGreaterThan(0);
      expect(
        corroboration.every((c) => c.withinAnchor),
        key,
      ).toBe(true);
    }
  });

  describe('rechaza documentos incoherentes', () => {
    it('destino ausente', () => {
      const bad = clone();
      delete bad.destinations.coiba;
      expect(() => parseAnchors(bad)).toThrow(/registro de destinos/);
    });

    it('destino ajeno al registro', () => {
      const bad = clone();
      bad.destinations['atlantida'] = bad.destinations.coiba as Record<string, unknown>;
      expect(() => parseAnchors(bad)).toThrow(/registro de destinos/);
    });

    it('ancla fuera de su encuadre', () => {
      const bad = clone();
      const entry = bad.destinations.boquete as { anchor: { lon: number } };
      entry.anchor.lon = -77.5;
      expect(() => parseAnchors(bad)).toThrow(/fuera de su propio encuadre/);
    });

    it('ancla fuera de Panamá', () => {
      const bad = clone();
      (bad.destinations.coiba as { anchor: { lat: number } }).anchor.lat = 40;
      expect(() => parseAnchors(bad)).toThrow();
    });

    it('fuente de otra release', () => {
      const bad = clone();
      const sources = bad.destinations.coiba?.sources as { release: string }[];
      sources[0]!.release = '2025-01-01.0';
      expect(() => parseAnchors(bad)).toThrow(/release/);
    });

    it('ancla identificada por nombre (sin ID)', () => {
      const bad = clone();
      const sources = bad.destinations.coiba?.sources as { role: string; id?: string }[];
      delete sources.find((s) => s.role === 'anchor')!.id;
      expect(() => parseAnchors(bad)).toThrow(/ID de Overture/);
    });

    it('corroboración que NO cae dentro del ancla', () => {
      const bad = clone();
      (
        bad.destinations['casco-antiguo']?.corroboration as { withinAnchor: boolean }[]
      )[0]!.withinAnchor = false;
      expect(() => parseAnchors(bad)).toThrow();
    });

    it('geometría presentada como oficial', () => {
      const bad = clone();
      bad.sourceClass = 'official';
      expect(() => parseAnchors(bad)).toThrow();
    });
  });

  it('el área de trabajo de TypeScript coincide con la del pipeline de Python', () => {
    const python = readFileSync(
      new URL('../../../pipelines/lib/overture.py', import.meta.url),
      'utf8',
    );
    const match = /PANAMA_BBOX = \(([-\d.]+), ([-\d.]+), ([-\d.]+), ([-\d.]+)\)/.exec(python);
    expect(match?.slice(1).map(Number)).toEqual([
      WORKING_BBOX.west,
      WORKING_BBOX.south,
      WORKING_BBOX.east,
      WORKING_BBOX.north,
    ]);
  });
});
