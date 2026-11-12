import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESTINATIONS } from '@/domains/tourism/destinations';
import {
  ISTHMUS_PROVENANCE,
  ISTHMUS_SHAPE,
  LOW_POINT,
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

describe('travesía: lo DIBUJADO sale de la proyección, no a ojo (r:D-05)', () => {
  it('x e y de cada punto son la proyección de su lon/lat con el bbox y el viewBox del dibujo', () => {
    const [west, south, east, north] = ISTHMUS_PROVENANCE.bbox;
    const [, , width] = ISTHMUS_SHAPE.viewBox.split(' ').map(Number);
    const k = Math.cos((((south! + north!) / 2) * Math.PI) / 180);
    const scale = width! / ((east! - west!) * k);
    for (const d of DESTINATIONS) {
      const p = isthmusPoint(d.key);
      expect(Math.abs(p.x - (p.lon - west!) * k * scale), d.key).toBeLessThanOrEqual(0.051);
      expect(Math.abs(p.y - (north! - p.lat) * scale), d.key).toBeLessThanOrEqual(0.051);
    }
  });
});

describe('travesía: el contorno usa la misma proyección que los puntos (r2:H-11)', () => {
  it('la ruta llena el viewBox (los extremos del país tocan casi los bordes de la caja de trabajo)', () => {
    const [, , width, height] = ISTHMUS_SHAPE.viewBox.split(' ').map(Number);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const m of ISTHMUS_SHAPE.path.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)) {
      xs.push(Number(m[1]));
      ys.push(Number(m[2]));
    }
    expect(xs.length).toBeGreaterThan(500);
    // Panamá va de ≈ −83,05° a ≈ −77,17° y de ≈ 7,2° a ≈ 9,65° (caja de −83,1/−77,15 y 7,15/9,7): pocas unidades de margen
    expect(Math.min(...xs)).toBeLessThan(20);
    expect(Math.max(...xs)).toBeGreaterThan(width! - 20);
    expect(Math.min(...ys)).toBeLessThan(20);
    expect(Math.max(...ys)).toBeGreaterThan(height! - 20);
    // y cada punto cae dentro de la caja de la costa
    for (const d of DESTINATIONS) {
      const p = isthmusPoint(d.key);
      expect(p.x).toBeGreaterThan(Math.min(...xs));
      expect(p.y).toBeLessThan(Math.max(...ys));
    }
  });
});

describe('travesía: el panel no tapa el punto de su localizador (r:F1)', () => {
  it('mitad oeste → panel al este (`end`); mitad este → al oeste (`start`); Coiba y Santa Catalina son puntos «bajos»', () => {
    const byKey = new Map(travesiaStops().map((s) => [s.entry.key, s]));
    for (const s of byKey.values()) expect(s.panelSide).toBe(s.along < 0.5 ? 'end' : 'start');
    // Los dos que tapaba la alternancia por posición en la lista
    expect(byKey.get('boquete')!.panelSide).toBe('end');
    expect(byKey.get('coiba')!.panelSide).toBe('end');
    expect(byKey.get('panama-city')!.panelSide).toBe('start');
    expect(byKey.get('coiba')!.low).toBe(true);
    expect(byKey.get('santa-catalina')!.low).toBe(true);
    expect(byKey.get('bocas-del-toro')!.low).toBe(false);
    for (const s of byKey.values())
      expect(s.low).toBe(s.point.y / Number(ISTHMUS_SHAPE.viewBox.split(' ')[3]) > LOW_POINT);
  });
});
