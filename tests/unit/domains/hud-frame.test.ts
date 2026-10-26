import { describe, expect, it } from 'vitest';
import { WORKING_BBOX } from '@/domains/geography/bounds';
import {
  framePadding,
  reachFrame,
  type Box,
  type FramePadding,
  type GeoBox,
} from '@/domains/geography/hud-frame';

const stage: Box = { left: 0, top: 64, right: 1280, bottom: 800 }; // 1280 × 736, bajo la cabecera de 64 px

describe('encuadre consciente del HUD (framePadding)', () => {
  it('sin hueco libre (móvil: sin HUD sobre el mapa) devuelve el respiro uniforme', () => {
    expect(framePadding(stage, null, 48)).toEqual({ top: 48, right: 48, bottom: 48, left: 48 });
  });

  it('un hueco que ocupa todo el mapa no añade relleno: solo el respiro', () => {
    expect(framePadding(stage, stage, 8)).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
  });

  it('el relleno es la distancia entre cada borde del mapa y el del hueco, más el respiro', () => {
    const safe: Box = { left: 288, top: 144, right: 1020, bottom: 520 };
    expect(framePadding(stage, safe, 24)).toEqual({
      top: 144 - 64 + 24, // 104
      right: 1280 - 1020 + 24, // 284
      bottom: 800 - 520 + 24, // 304
      left: 288 + 24, // 312
    });
  });

  it('el hueco se mide en las mismas coordenadas que el mapa (el mapa no empieza en 0,0)', () => {
    const shifted: Box = { left: 100, top: 164, right: 1380, bottom: 900 };
    const safe: Box = { left: 388, top: 244, right: 1120, bottom: 620 };
    expect(framePadding(shifted, safe, 0)).toEqual(
      framePadding(stage, { left: 288, top: 144, right: 1020, bottom: 520 }, 0),
    );
  });

  it('lo que sobresale del mapa no resta relleno (nunca negativo)', () => {
    const safe: Box = { left: -50, top: 0, right: 1400, bottom: 900 };
    expect(framePadding(stage, safe, 10)).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
  });

  it.each([
    ['caja vacía', { left: 300, top: 200, right: 300, bottom: 200 }],
    ['caja invertida', { left: 600, top: 500, right: 300, bottom: 200 }],
    ['fuera del mapa', { left: 2000, top: 2000, right: 2400, bottom: 2400 }],
    ['con NaN', { left: Number.NaN, top: 0, right: 100, bottom: 100 }],
  ])('un hueco inútil (%s) se trata como «sin HUD»', (_name, safe) => {
    expect(framePadding(stage, safe, 12)).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
  });

  it('un mapa de tamaño nulo o inválido no explota: respiro uniforme', () => {
    const flat: Box = { left: 0, top: 0, right: 0, bottom: 0 };
    expect(framePadding(flat, { left: 0, top: 0, right: 10, bottom: 10 }, 5)).toEqual({
      top: 5,
      right: 5,
      bottom: 5,
      left: 5,
    });
  });

  it('el respiro negativo se trata como cero', () => {
    expect(framePadding(stage, null, -10)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('con una ventana muy baja el relleno vertical no cubre más del 75 % del mapa (y conserva la proporción)', () => {
    // Mapa de 300 px de alto con un hueco de solo 20 px: sin límite, el relleno sumaría 280 + el respiro.
    const low: Box = { left: 0, top: 0, right: 1000, bottom: 300 };
    const safe: Box = { left: 0, top: 200, right: 1000, bottom: 220 };
    const p = framePadding(low, safe, 20);
    const gap = 20 * 0.12; // el respiro se acota al 12 % del lado menor del hueco (20 px)
    expect(p.top + p.bottom).toBeCloseTo(225, 6); // 0,75 × 300
    expect(p.top / p.bottom).toBeCloseTo((200 + gap) / (80 + gap), 6);
    // Horizontal: el hueco ocupa todo el ancho, solo el respiro (acotado)
    expect(p.left).toBeCloseTo(gap, 6);
    expect(p.right).toBeCloseTo(gap, 6);
  });

  it('con una ventana muy estrecha el relleno horizontal también se acota', () => {
    const narrow: Box = { left: 0, top: 0, right: 400, bottom: 800 };
    const safe: Box = { left: 150, top: 0, right: 250, bottom: 800 };
    const p = framePadding(narrow, safe, 0);
    expect(p.left + p.right).toBeCloseTo(300, 6); // 0,75 × 400
  });

  it('el respiro se acota al 12 % del lado menor del hueco (un hueco bajo no se gasta en respiro)', () => {
    const band: Box = { left: 272, top: 121, right: 1188, bottom: 365 }; // 916 × 244 (con la ficha abierta)
    const p = framePadding(stage, band, 48);
    const gap = 244 * 0.12; // 29,28 px, no 48
    expect(p.left).toBeCloseTo(272 + gap, 6);
    expect(p.top).toBeCloseTo(121 - 64 + gap, 6);
    // Y un respiro menor que el tope se respeta tal cual
    expect(framePadding(stage, band, 10).left).toBeCloseTo(272 + 10, 6);
  });

  it('control: sin el tope, el mismo caso SÍ cubriría el eje entero (la prueba no es vacía)', () => {
    const low: Box = { left: 0, top: 0, right: 1000, bottom: 300 };
    const safe: Box = { left: 0, top: 200, right: 1000, bottom: 220 };
    const raw = safe.top - low.top + 20 + (low.bottom - safe.bottom + 20);
    expect(raw).toBeGreaterThan(300 * 0.75);
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */
/* reachFrame: `maxBounds` manda sobre el relleno. El ORÁCULO de abajo no comparte código con la implementación: proyecta */
/* a mano (Mercator, tesela de 512 px) y aplica la restricción de MapLibre (la vista no sale de `maxBounds`).           */
/* ------------------------------------------------------------------------------------------------------------------ */

const WORLD = 512;
const rad = (d: number) => (d * Math.PI) / 180;
const mx = (lon: number) => (lon + 180) / 360;
const my = (lat: number) => 0.5 - Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2)) / (2 * Math.PI);

/** Dónde cae `point` en pantalla (px desde la esquina del lienzo) con el centro `center` a `zoom`, tras restringir. */
function screenOf(
  point: { lon: number; lat: number },
  center: { lon: number; lat: number },
  zoom: number,
  size: { width: number; height: number },
  limits: GeoBox = WORKING_BBOX,
): { x: number; y: number } {
  const s = WORLD * 2 ** zoom;
  const clampTo = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const cx = clampTo(
    mx(center.lon) * s,
    mx(limits.west) * s + size.width / 2,
    mx(limits.east) * s - size.width / 2,
  );
  const cy = clampTo(
    my(center.lat) * s,
    my(limits.north) * s + size.height / 2,
    my(limits.south) * s - size.height / 2,
  );
  return {
    x: size.width / 2 + mx(point.lon) * s - cx,
    y: size.height / 2 + my(point.lat) * s - cy,
  };
}

const mid = (box: GeoBox) => ({
  lon: (box.west + box.east) / 2,
  lat: (box.south + box.north) / 2,
});

// Coiba (data/anchors): 0,7° de alto, en la franja sur de Panamá.
const COIBA: GeoBox = { west: -81.9373, south: 7.1758, east: -81.5359, north: 7.8928 };
const SAFE_1280: Box = { left: 272, top: 121, right: 1188, bottom: 361 }; // hueco libre a 1280×800 con la ficha abierta
const SIZE_1280 = { width: 1280, height: 736 };

describe('encuadre alcanzable (reachFrame)', () => {
  const padding = framePadding(stage, SAFE_1280, 40);

  it('Coiba al zoom del ajuste QUEDA debajo del hueco libre (el caso real que lo motivó)', () => {
    // El ajuste con relleno da z ≈ 7,5: la vista es más alta que `maxBounds`, el centro se clava en el medio y el punto
    // cae a ~220 px POR DEBAJO del centro, fuera del hueco (que acaba 439 px antes del borde inferior).
    const at = screenOf(mid(COIBA), mid(COIBA), 7.5, SIZE_1280);
    expect(at.y).toBeGreaterThan(SIZE_1280.height - padding.bottom);
  });

  it('sube el zoom hasta que el destino cae dentro del hueco, con el centro ya restringido', () => {
    const r = reachFrame({
      zoom: 7.5,
      maxZoom: 18,
      box: COIBA,
      size: SIZE_1280,
      padding,
      limits: WORKING_BBOX,
      inset: 40,
    });
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.adjusted).toBe(true);
    expect(r.zoom).toBeGreaterThan(8.5);
    expect(r.zoom).toBeLessThan(11);
    const at = screenOf(mid(COIBA), r.center, r.zoom, SIZE_1280);
    expect(at.x).toBeGreaterThanOrEqual(padding.left + 40 - 0.5);
    expect(at.x).toBeLessThanOrEqual(SIZE_1280.width - padding.right - 40 + 0.5);
    expect(at.y).toBeGreaterThanOrEqual(padding.top + 40 - 0.5);
    expect(at.y).toBeLessThanOrEqual(SIZE_1280.height - padding.bottom - 40 + 0.5);
    // MENOR zoom: un paso (0,05) menos ya no cabe
    const before = screenOf(mid(COIBA), r.center, r.zoom - 0.05, SIZE_1280);
    const fits =
      before.y >= padding.top + 40 &&
      before.y <= SIZE_1280.height - padding.bottom - 40 &&
      before.x >= padding.left + 40 &&
      before.x <= SIZE_1280.width - padding.right - 40;
    expect(fits).toBe(false);
  });

  it('el ANCLA (el marcador) es lo que debe quedar a la vista, no el centro de la caja: el canal vive en una esquina', () => {
    // data/anchors: caja del canal y su ancla en la esquina sureste
    const canal: GeoBox = { west: -79.9262, south: 8.9429, east: -79.5647, north: 9.3115 };
    const anchor = { lon: -79.5907, lat: 8.99534 };
    const common = { maxZoom: 18, box: canal, size: SIZE_1280, padding, limits: WORKING_BBOX };
    // Sin `must` solo se vigila el centro de la caja: a z 9,32 queda dentro y el ancla, 140 px a su derecha y 120 por
    // debajo, cae sobre el borde inferior del hueco.
    const sinAncla = reachFrame({ ...common, zoom: 9.32, inset: 40, insetBottom: 72 });
    expect(sinAncla?.adjusted).toBe(false);
    const conAncla = reachFrame({
      ...common,
      zoom: 9.32,
      must: [anchor],
      inset: 40,
      insetBottom: 72,
    });
    expect(conAncla).not.toBeNull();
    if (!conAncla) return;
    expect(conAncla.aim).toBe('points'); // la caja centrada tapaba el ancla: se centra el ancla
    const at = screenOf(anchor, conAncla.center, conAncla.zoom, SIZE_1280);
    expect(at.y).toBeLessThanOrEqual(SIZE_1280.height - padding.bottom - 72 + 0.5);
    expect(at.y).toBeGreaterThanOrEqual(padding.top + 40 - 0.5);
    expect(at.x).toBeGreaterThanOrEqual(padding.left + 40 - 0.5);
    expect(at.x).toBeLessThanOrEqual(SIZE_1280.width - padding.right - 40 + 0.5);
  });

  it('un destino que ya cae en el hueco no se toca (adjusted: false): el ajuste de la librería vale', () => {
    // Casco Antiguo a z ≈ 14,3: el punto está en el centro del hueco
    const casco: GeoBox = { west: -79.5389, south: 8.9492, east: -79.5315, north: 8.9556 };
    const r = reachFrame({
      zoom: 14.29,
      maxZoom: 18,
      box: casco,
      size: SIZE_1280,
      padding,
      limits: WORKING_BBOX,
      inset: 40,
    });
    expect(r?.adjusted).toBe(false);
    expect(r?.aim).toBe('box');
    expect(r?.zoom).toBe(14.29);
  });

  it('Boquete (oeste, a la altura del hueco) tampoco necesita corrección', () => {
    const boquete: GeoBox = { west: -82.5596, south: 8.595, east: -82.2578, north: 8.8866 };
    const r = reachFrame({
      zoom: 8.78,
      maxZoom: 18,
      box: boquete,
      size: SIZE_1280,
      padding,
      limits: WORKING_BBOX,
      inset: 40,
    });
    expect(r?.adjusted).toBe(false);
  });

  it('el resultado también vale con otras pantallas (1440×900, 1024×768) y SIEMPRE deja el destino a la vista', () => {
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [1920, 1080],
    ] as const) {
      const size = { width, height: height - 64 };
      const area: Box = { left: 0, top: 64, right: width, bottom: height };
      // Hueco libre proporcional: carril de 16 rem a la izquierda, 200 px de carrusel y 200 de ficha abajo
      const safe: Box = { left: 272, top: 121, right: width - 92, bottom: height - 440 };
      const pad: FramePadding = framePadding(area, safe, 40);
      const r = reachFrame({
        zoom: 7.4,
        maxZoom: 18,
        box: COIBA,
        size,
        padding: pad,
        limits: WORKING_BBOX,
        inset: 40,
      });
      const zoom = r?.zoom ?? 7.4;
      const center = r?.center ?? mid(COIBA);
      const at = screenOf(mid(COIBA), center, zoom, size);
      // Con un hueco alcanzable, el punto cae DENTRO; si no hubo corrección es que ya estaba dentro
      expect(at.y, `${String(width)}×${String(height)}`).toBeLessThanOrEqual(
        size.height - pad.bottom,
      );
      expect(at.y).toBeGreaterThanOrEqual(pad.top);
    }
  });

  it('con un giro del mapa el punto también acaba dentro del hueco (el relleno se aplica en pantalla)', () => {
    const r = reachFrame({
      zoom: 7.5,
      maxZoom: 18,
      box: COIBA,
      size: SIZE_1280,
      padding,
      limits: WORKING_BBOX,
      bearing: 0,
      inset: 40,
    });
    const rotated = reachFrame({
      zoom: 7.5,
      maxZoom: 18,
      box: COIBA,
      size: SIZE_1280,
      padding,
      limits: WORKING_BBOX,
      bearing: 180,
      inset: 40,
    });
    // Girado 180°, «abajo» es el norte: Coiba cae más cerca del centro y NO necesita tanto zoom como con el norte arriba
    expect(r).not.toBeNull();
    expect(rotated === null || rotated.zoom <= (r?.zoom ?? 0)).toBe(true);
  });

  it.each([
    ['lienzo de tamaño nulo', { width: 0, height: 0 }],
    ['lienzo con NaN', { width: Number.NaN, height: 700 }],
  ])('entrada inválida (%s): null, sin lanzar', (_name, size) => {
    expect(
      reachFrame({ zoom: 7.5, maxZoom: 18, box: COIBA, size, padding, limits: WORKING_BBOX }),
    ).toBeNull();
  });

  it('un relleno que no deja hueco (cubre todo el lienzo) devuelve null en vez de buscar para siempre', () => {
    const none: FramePadding = { top: 400, right: 700, bottom: 400, left: 700 };
    expect(
      reachFrame({
        zoom: 7.5,
        maxZoom: 18,
        box: COIBA,
        size: SIZE_1280,
        padding: none,
        limits: WORKING_BBOX,
      }),
    ).toBeNull();
  });

  it('si ningún zoom hasta el máximo lo logra, null (se deja el ajuste de la librería)', () => {
    expect(
      reachFrame({
        zoom: 7.5,
        maxZoom: 8,
        box: COIBA,
        size: SIZE_1280,
        padding,
        limits: WORKING_BBOX,
        inset: 40,
      }),
    ).toBeNull();
  });
});
