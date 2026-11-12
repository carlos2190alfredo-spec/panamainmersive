import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESTINATIONS } from '@/domains/tourism/destinations';
import {
  ISTHMUS_SHAPE,
  coordinateParts,
  isthmusPoint,
  travesiaStops,
} from '@/domains/tourism/travesia';

const anchors = JSON.parse(
  readFileSync(join(process.cwd(), 'data/anchors/destination-anchors.json'), 'utf8'),
) as { destinations: Record<string, { anchor: { lat: number; lon: number } }> };

describe('travesía: orden y posiciones reales', () => {
  it('las nueve paradas van de oeste a este (longitud creciente) y no falta ni sobra ninguna', () => {
    const stops = travesiaStops();
    expect(stops.map((s) => s.entry.key).sort()).toEqual(DESTINATIONS.map((d) => d.key).sort());
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]!.point.lon).toBeGreaterThanOrEqual(stops[i - 1]!.point.lon);
    }
    expect(stops[0]!.entry.key).toBe('volcan-baru');
    expect(stops.at(-1)!.point.lon).toBeGreaterThan(-79.6);
  });

  it('cada punto es el ancla REAL del destino (mismas coordenadas que data/anchors), no una posición a ojo', () => {
    for (const d of DESTINATIONS) {
      const p = isthmusPoint(d.key);
      expect(p.lon).toBe(anchors.destinations[d.key]!.anchor.lon);
      expect(p.lat).toBe(anchors.destinations[d.key]!.anchor.lat);
    }
  });

  it('la proyección conserva el orden: más al este = más a la derecha; más al norte = más arriba', () => {
    const baru = isthmusPoint('volcan-baru');
    const city = isthmusPoint('panama-city');
    const coiba = isthmusPoint('coiba');
    const bocas = isthmusPoint('bocas-del-toro');
    expect(city.x).toBeGreaterThan(baru.x);
    expect(bocas.y).toBeLessThan(coiba.y); // Bocas (Caribe) arriba, Coiba (Pacífico) abajo
  });

  it('las posiciones a lo largo del istmo están entre 0 y 1 y dentro del dibujo', () => {
    const [, , w, h] = ISTHMUS_SHAPE.viewBox.split(' ').map(Number);
    for (const s of travesiaStops()) {
      expect(s.along).toBeGreaterThanOrEqual(0);
      expect(s.along).toBeLessThanOrEqual(1);
      expect(s.point.x).toBeLessThanOrEqual(w!);
      expect(s.point.y).toBeLessThanOrEqual(h!);
    }
    expect(ISTHMUS_SHAPE.path.startsWith('M')).toBe(true);
  });

  it('control: un destino sin ancla en el dibujo lanza (no se coloca a ojo)', () => {
    expect(() => isthmusPoint('no-existe' as never)).toThrow(/Sin ancla/);
  });
});

describe('coordenadas', () => {
  it('grados con dos decimales en el formato del idioma y su hemisferio', () => {
    expect(coordinateParts(8.776, 'lat', 'es')).toEqual({ degrees: '8,78', hemisphere: 'north' });
    expect(coordinateParts(-82.435, 'lon', 'en')).toEqual({
      degrees: '82.44',
      hemisphere: 'west',
    });
    expect(coordinateParts(-1.5, 'lat', 'de').hemisphere).toBe('south');
    expect(coordinateParts(3, 'lon', 'fr').hemisphere).toBe('east');
  });
});
