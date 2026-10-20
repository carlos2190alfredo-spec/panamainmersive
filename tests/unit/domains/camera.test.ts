import { describe, expect, it } from 'vitest';
import {
  MAP_FOV_RAD,
  altitudeFromView,
  cameraToCenterDistancePx,
  fromMapView,
  metersPerPixel,
  normalizeHeading,
  normalizeRoll,
  toMapView,
  zoomFromAltitude,
  type CameraState,
} from '@/domains/geography/camera';

/** Circunferencia ecuatorial de Web Mercator (EPSG:3857), constante publicada: 40 075 016,6856 m. */
const CIRCUMFERENCE_M = 40_075_016.685_578_5;

describe('cámara: conversión 2D ↔ altitud', () => {
  it('el FOV vertical de MapLibre cumple tan(fov/2) = 1/3, así que la distancia al centro es 1,5 × la altura', () => {
    expect(Math.tan(MAP_FOV_RAD / 2)).toBeCloseTo(1 / 3, 12);
    expect(cameraToCenterDistancePx(512)).toBeCloseTo(768, 9);
  });

  it('a zoom 0 en el ecuador una tesela de 512 px cubre el mundo: 78 271,517 m/px', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(CIRCUMFERENCE_M / 512, 6);
    expect(metersPerPixel(0, 0)).toBeCloseTo(78_271.517, 3);
  });

  it('valor analítico independiente: zoom 0, ecuador, pitch 0, viewport 512 px ⇒ 1,5 × circunferencia', () => {
    const altitude = altitudeFromView({ zoom: 0, pitch: 0, lat: 0 }, 512);
    expect(altitude).toBeCloseTo(1.5 * CIRCUMFERENCE_M, 0);
  });

  it('cada nivel de zoom divide la altitud entre dos', () => {
    const a = altitudeFromView({ zoom: 10, pitch: 0, lat: 9 }, 800);
    const b = altitudeFromView({ zoom: 11, pitch: 0, lat: 9 }, 800);
    expect(a / b).toBeCloseTo(2, 12);
  });

  it('a pitch 60° la altitud sobre el centro es la mitad (cos 60° = 0,5) para el mismo zoom', () => {
    const nadir = altitudeFromView({ zoom: 12, pitch: 0, lat: 9 }, 800);
    const oblique = altitudeFromView({ zoom: 12, pitch: 60, lat: 9 }, 800);
    expect(oblique / nadir).toBeCloseTo(0.5, 12);
  });

  it('orden de magnitud real: la ciudad de Panamá a zoom 11 (viewport 800 px) está a unos 45 km', () => {
    const altitude = altitudeFromView({ zoom: 11, pitch: 0, lat: 8.97 }, 800);
    expect(altitude).toBeGreaterThan(40_000);
    expect(altitude).toBeLessThan(50_000);
  });

  it('a igual zoom, una ventana más alta implica una cámara más alta', () => {
    expect(altitudeFromView({ zoom: 10, pitch: 0, lat: 9 }, 1200)).toBeGreaterThan(
      altitudeFromView({ zoom: 10, pitch: 0, lat: 9 }, 600),
    );
  });

  it.each([
    [0, 0, 512],
    [3.7, 20, 300],
    [11, 8.97, 800],
    [15.5, 8.95, 1080],
    [18, 9.4, 400],
  ])('ida y vuelta zoom→altitud→zoom (zoom %s, pitch %s°, alto %s px)', (zoom, pitch, height) => {
    const lat = 8.5;
    const altitudeM = altitudeFromView({ zoom, pitch, lat }, height);
    expect(zoomFromAltitude({ lat, altitudeM, pitchDeg: pitch }, height)).toBeCloseTo(zoom, 9);
  });

  it('toMapView/fromMapView son inversas y normalizan rumbo y alabeo', () => {
    const camera: CameraState = {
      lon: -79.5342,
      lat: 8.9714,
      altitudeM: 12_345,
      headingDeg: 370,
      pitchDeg: 45,
      rollDeg: 190,
    };
    const view = toMapView(camera, 900);
    expect(view.bearing).toBe(10);
    expect(view.roll).toBe(-170);
    expect(view.center).toEqual([-79.5342, 8.9714]);
    const back = fromMapView(view, 900);
    expect(back.altitudeM).toBeCloseTo(12_345, 6);
    expect(back).toMatchObject({
      lon: -79.5342,
      lat: 8.9714,
      headingDeg: 10,
      pitchDeg: 45,
      rollDeg: -170,
    });
  });

  it('normaliza ángulos', () => {
    expect(normalizeHeading(-10)).toBe(350);
    expect(normalizeHeading(360)).toBe(0);
    expect(normalizeRoll(180)).toBe(180);
    expect(normalizeRoll(181)).toBe(-179);
    expect(normalizeRoll(-180)).toBe(180);
  });

  it('rechaza entradas imposibles en vez de devolver NaN', () => {
    expect(() => altitudeFromView({ zoom: 5, pitch: 0, lat: 9 }, 0)).toThrow(RangeError);
    expect(() => altitudeFromView({ zoom: 5, pitch: 90, lat: 9 }, 800)).toThrow(RangeError);
    expect(() => zoomFromAltitude({ lat: 9, altitudeM: 0, pitchDeg: 0 }, 800)).toThrow(RangeError);
    expect(() => zoomFromAltitude({ lat: 9, altitudeM: Number.NaN, pitchDeg: 0 }, 800)).toThrow(
      RangeError,
    );
    expect(() => zoomFromAltitude({ lat: 9, altitudeM: 1000, pitchDeg: -1 }, 800)).toThrow(
      RangeError,
    );
  });
});
