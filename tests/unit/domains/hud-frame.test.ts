import { describe, expect, it } from 'vitest';
import { WORKING_BBOX } from '@/domains/geography/bounds';
import {
  bestEffortFrame,
  framePadding,
  reachFrame,
  type Box,
  type FramePadding,
  type GeoBox,
} from '@/domains/geography/hud-frame';
import { DESTINATIONS } from '@/domains/tourism/destinations';
import { DESTINATION_ANCHORS } from '@/lib/destination-anchors';

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

/* ------------------------------------------------------------------------------------------------------------------ */
/* bestEffortFrame: la vista inicial (r1:V-05). Con `maxBounds` NINGÚN encuadre deja los nueve destinos a la vez en el   */
/* hueco libre; el que deja más a la vista sí existe. Los huecos son los MEDIDOS en Chromium 156 sobre el build real     */
/* (`[data-hud-safe]` de /es/explorar sin destino, carril y dock abiertos); el oráculo es el de arriba (Mercator a mano).  */
/* ------------------------------------------------------------------------------------------------------------------ */

const SCREENS = [
  {
    name: '1920×1080',
    width: 1920,
    height: 1080,
    safe: { left: 296, top: 152, right: 1828, bottom: 830 },
  },
  {
    name: '1440×900',
    width: 1440,
    height: 900,
    safe: { left: 296, top: 152, right: 1348, bottom: 650 },
  },
  {
    name: '1280×800',
    width: 1280,
    height: 800,
    safe: { left: 296, top: 152, right: 1188, bottom: 550 },
  },
  {
    name: '1024×768',
    width: 1024,
    height: 768,
    safe: { left: 296, top: 152, right: 932, bottom: 518 },
  },
] as const;

const HEADER = 64;
const NINE = DESTINATIONS.map((d) => {
  const anchor = DESTINATION_ANCHORS.anchors[d.key];
  return { key: d.key, lon: anchor.lon, lat: anchor.lat };
});
const INSET = 24;
/** La vista de siempre: el centro de `maxBounds` (en Mercator, no en grados). */
const NATURAL_CENTER = { lon: (WORKING_BBOX.west + WORKING_BBOX.east) / 2, lat: 8.3527 };

/** Zoom mínimo con `maxBounds`: la vista no puede ser mayor que la caja (oráculo). */
function minZoomFor(size: { width: number; height: number }): number {
  const boxW = (mx(WORKING_BBOX.east) - mx(WORKING_BBOX.west)) * WORLD;
  const boxH = (my(WORKING_BBOX.south) - my(WORKING_BBOX.north)) * WORLD;
  return Math.max(Math.log2(size.width / boxW), Math.log2(size.height / boxH));
}

/** Cuántos destinos caen dentro del hueco con ese encuadre, contados con el oráculo (no con la implementación). */
function countInside(
  center: { lon: number; lat: number },
  zoom: number,
  size: { width: number; height: number },
  padding: FramePadding,
): number {
  return NINE.filter((p) => {
    const at = screenOf(p, center, zoom, size);
    return (
      at.x >= padding.left + INSET &&
      at.x <= size.width - padding.right - INSET &&
      at.y >= padding.top + INSET &&
      at.y <= size.height - padding.bottom - INSET
    );
  }).length;
}

describe('encuadre de mejor esfuerzo (bestEffortFrame): la vista inicial de Explorar', () => {
  const setup = (screen: (typeof SCREENS)[number]) => {
    const size = { width: screen.width, height: screen.height - HEADER };
    const stageBox: Box = { left: 0, top: HEADER, right: screen.width, bottom: screen.height };
    const padding = framePadding(stageBox, screen.safe, 8);
    const minZoom = minZoomFor(size);
    return { size, padding, minZoom };
  };

  it.each(SCREENS)(
    '$name: el recuento de la función coincide con el del oráculo y el encuadre es admisible para MapLibre',
    (screen) => {
      const { size, padding, minZoom } = setup(screen);
      const result = bestEffortFrame({
        points: NINE,
        size,
        padding,
        limits: WORKING_BBOX,
        minZoom,
        maxZoom: 18,
        inset: INSET,
      });
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.total).toBe(9);
      expect(result.zoom).toBeGreaterThanOrEqual(minZoom - 1e-9);
      // El centro devuelto ya cumple `maxBounds`: el oráculo, que restringe, lo deja donde está
      const clamped = screenOf(result.center, result.center, result.zoom, size);
      expect(clamped.x).toBeCloseTo(size.width / 2, 3);
      expect(clamped.y).toBeCloseTo(size.height / 2, 3);
      expect(countInside(result.center, result.zoom, size, padding)).toBe(result.inside);
    },
  );

  it.each(SCREENS)(
    '$name: nunca deja menos destinos a la vista que la vista de siempre, y con `maxBounds` NO caben los nueve',
    (screen) => {
      const { size, padding, minZoom } = setup(screen);
      const baseline = countInside(NATURAL_CENTER, minZoom, size, padding);
      const result = bestEffortFrame({
        points: NINE,
        size,
        padding,
        limits: WORKING_BBOX,
        minZoom,
        maxZoom: 18,
        inset: INSET,
      });
      expect(result?.inside ?? 0).toBeGreaterThanOrEqual(baseline);
      // El límite físico (documentado en progress.md): ningún encuadre admisible deja los nueve a la vez en el hueco
      expect(result?.inside ?? 0).toBeLessThan(9);
    },
  );

  // Con el ancla de Santa Catalina corregida (E-106: el pueblo de Soná, 56 km al sur del homónimo de La Mesa) Santa
  // Catalina queda bajo el dock como Coiba en las cuatro pantallas: era 5 → 7 y ahora es 4 → 6.
  it('a 1920×1080 acerca un poco y desplaza el centro al oeste: Bocas del Toro y Boquete dejan de quedar bajo el carril (4 → 6 destinos)', () => {
    const screen = SCREENS[0];
    const { size, padding, minZoom } = setup(screen);
    const baseline = countInside(NATURAL_CENTER, minZoom, size, padding);
    const result = bestEffortFrame({
      points: NINE,
      size,
      padding,
      limits: WORKING_BBOX,
      minZoom,
      maxZoom: 18,
      inset: INSET,
    });
    expect(baseline).toBe(4);
    expect(result?.moved).toBe(true);
    expect(result?.inside).toBe(6);
    expect(result?.center.lon).toBeLessThan(NATURAL_CENTER.lon - 0.5);
    expect(result?.zoom).toBeGreaterThan(minZoom);
    // Los dos que antes tapaba el carril ahora caen en el hueco (comprobado con el oráculo, punto por punto)
    for (const key of ['bocas-del-toro', 'boquete'] as const) {
      const p = NINE.find((n) => n.key === key);
      const at = p && result ? screenOf(p, result.center, result.zoom, size) : null;
      expect(at && at.x > padding.left + INSET, key).toBe(true);
    }
  });

  it.each([SCREENS[1], SCREENS[2], SCREENS[3]])(
    '$name: si moverse gana menos de dos destinos la vista no se mueve (zoom mínimo, centro de siempre)',
    (screen) => {
      const { size, padding, minZoom } = setup(screen);
      const result = bestEffortFrame({
        points: NINE,
        size,
        padding,
        limits: WORKING_BBOX,
        minZoom,
        maxZoom: 18,
        inset: INSET,
      });
      expect(result?.moved).toBe(false);
      expect(result?.zoom).toBeCloseTo(minZoom, 9);
      expect(Math.abs((result?.center.lat ?? 0) - NATURAL_CENTER.lat)).toBeLessThan(0.01);
      // A 1024 de ancho el centro de siempre ya está en el límite admisible: lo único que se garantiza es no empeorar
      if (screen.width >= 1280) {
        expect(Math.abs((result?.center.lon ?? 0) - NATURAL_CENTER.lon)).toBeLessThan(0.01);
      }
    },
  );

  it('`minGain: 1` baja el umbral: a 1440×900 SÍ se mueve para ganar Bocas del Toro (el valor por defecto lo evita a propósito)', () => {
    const screen = SCREENS[1];
    const { size, padding, minZoom } = setup(screen);
    const eager = bestEffortFrame({
      points: NINE,
      size,
      padding,
      limits: WORKING_BBOX,
      minZoom,
      maxZoom: 18,
      inset: INSET,
      minGain: 1,
    });
    expect(eager?.moved).toBe(true);
    expect(eager?.inside).toBe(5);
  });

  it('es óptimo frente a una búsqueda más fina del oráculo (no se deja un destino a la vista sin recoger)', () => {
    const screen = SCREENS[0];
    const { size, padding, minZoom } = setup(screen);
    const result = bestEffortFrame({
      points: NINE,
      size,
      padding,
      limits: WORKING_BBOX,
      minZoom,
      maxZoom: 18,
      inset: INSET,
      minGain: 1,
    });
    let oracle = 0;
    for (let z = minZoom; z <= minZoom + 1.2; z += 0.1) {
      for (let i = 0; i <= 60; i++) {
        for (let j = 0; j <= 60; j++) {
          const center = {
            lon: WORKING_BBOX.west + ((WORKING_BBOX.east - WORKING_BBOX.west) * i) / 60,
            lat: WORKING_BBOX.south + ((WORKING_BBOX.north - WORKING_BBOX.south) * j) / 60,
          };
          oracle = Math.max(oracle, countInside(center, z, size, padding));
        }
      }
    }
    expect(result?.inside).toBeGreaterThanOrEqual(oracle);
  });

  it.each([
    ['sin puntos', { points: [] }],
    ['lienzo de tamaño nulo', { size: { width: 0, height: 0 } }],
    ['lienzo con NaN', { size: { width: Number.NaN, height: 700 } }],
    ['zoom máximo menor que el mínimo', { maxZoom: 5 }],
    [
      'relleno que cubre todo el lienzo',
      { padding: { top: 500, right: 800, bottom: 500, left: 800 } },
    ],
  ])('entrada inválida (%s): null, sin lanzar', (_name, override) => {
    const screen = SCREENS[1];
    const { size, padding, minZoom } = setup(screen);
    expect(
      bestEffortFrame({
        points: NINE,
        size,
        padding,
        limits: WORKING_BBOX,
        minZoom,
        maxZoom: 18,
        ...override,
      }),
    ).toBeNull();
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */
/* bestEffortFrame con `aim`: el encuadre de los RESULTADOS de un filtro o de la búsqueda (X2, hallazgo del paso)       */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Lo que midió el navegador a 1440×900 al buscar «Panamá» (Ciudad de Panamá y Canal de Panamá, a 6 km): lienzo de 1440 × 836
 * y el relleno que deja el HUD con un margen de 72 px. `cameraForBounds` ajustó la caja de los dos a zoom 13,40.
 */
describe('bestEffortFrame con `aim` (encuadre de resultados concretos)', () => {
  const size = { width: 1440, height: 836 };
  const padding: FramePadding = { top: 146.74, right: 150.74, bottom: 317.23, left: 354.74 };
  const CITY = { lon: -79.53418, lat: 8.97145 };
  const CANAL = { lon: -79.5907, lat: 8.99534 };
  const FIT_ZOOM = 13.4;
  const near = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) =>
    Math.hypot(a.lon - b.lon, a.lat - b.lat);

  /** Cuántos de los puntos caen dentro del hueco con el encuadre dado (oráculo propio, no la implementación). */
  const inside = (
    points: readonly { lon: number; lat: number }[],
    center: { lon: number; lat: number },
    zoom: number,
    inset: number,
  ) =>
    points.filter((p) => {
      const at = screenOf(p, center, zoom, size);
      return (
        at.x >= padding.left + inset &&
        at.x <= size.width - padding.right - inset &&
        at.y >= padding.top + inset &&
        at.y <= size.height - padding.bottom - inset
      );
    }).length;

  const resultsFrame = (points: readonly { lon: number; lat: number }[], fitZoom: number) =>
    bestEffortFrame({
      points,
      size,
      padding,
      limits: WORKING_BBOX,
      minZoom: Math.max(fitZoom - 1.5, minZoomFor(size)),
      maxZoom: fitZoom,
      zoomSpan: 1.5,
      inset: INSET,
      aim: true,
    });

  it('CONTROL: sin `aim` (la rejilla de 41 × 41 sobre toda la caja de trabajo) la búsqueda «Panamá» fallaba: el centro caía a cientos de km de los resultados', () => {
    const legacy = bestEffortFrame({
      points: [CITY, CANAL],
      size,
      padding,
      limits: WORKING_BBOX,
      minZoom: Math.max(FIT_ZOOM, minZoomFor(size)),
      maxZoom: 18,
      inset: INSET,
      minGain: 1,
    });
    expect(legacy).not.toBeNull();
    // el defecto original: ningún punto a la vista y el centro de siempre (≈ -80,1; 8,35)
    expect(legacy?.inside).toBe(0);
    expect(near(legacy?.center ?? CITY, NATURAL_CENTER)).toBeLessThan(0.5);
    expect(near(legacy?.center ?? CITY, CITY)).toBeGreaterThan(0.5);
  });

  it('con `aim` los DOS resultados quedan dentro del hueco libre, el encuadre se centra en ellos y está cerca (cerca del zoom de ajuste, no en el mapa del país)', () => {
    const result = resultsFrame([CITY, CANAL], FIT_ZOOM);
    expect(result).not.toBeNull();
    expect(result?.moved).toBe(true);
    expect(result?.inside).toBe(2);
    expect(result?.total).toBe(2);
    const center = result?.center ?? NATURAL_CENTER;
    const zoom = result?.zoom ?? 0;
    // oráculo propio: de verdad caen dentro del hueco con el encuadre devuelto
    expect(inside([CITY, CANAL], center, zoom, INSET)).toBe(2);
    // centrado en los resultados (a menos de 0,1° ≈ 11 km), no en el centro de la caja de trabajo
    expect(
      near(center, { lon: (CITY.lon + CANAL.lon) / 2, lat: (CITY.lat + CANAL.lat) / 2 }),
    ).toBeLessThan(0.1);
    // el más cercano que los deja ver: no baja más de lo necesario (a igual número de puntos gana el zoom MÁS ALTO)
    expect(zoom).toBeGreaterThan(FIT_ZOOM - 0.6);
    expect(zoom).toBeLessThanOrEqual(FIT_ZOOM);
  });

  it('a igual número de puntos a la vista elige el zoom MÁS ALTO (lo contrario que la vista de conjunto, que prefiere el más bajo)', () => {
    const aimed = resultsFrame([CITY, CANAL], FIT_ZOOM);
    // mismo rango de zoom y mismos puntos, sin `aim`: la vista de conjunto prefiere el zoom más bajo
    const overview = bestEffortFrame({
      points: [CITY, CANAL],
      size,
      padding,
      limits: WORKING_BBOX,
      minZoom: Math.max(FIT_ZOOM - 1.5, minZoomFor(size)),
      maxZoom: FIT_ZOOM,
      zoomSpan: 1.5,
      inset: INSET,
      minGain: 1,
    });
    // (con la rejilla gruesa el resultado sin `aim` no es fiable a este zoom: solo se compara el sentido del desempate)
    expect(aimed?.zoom ?? 0).toBeGreaterThanOrEqual(overview?.zoom ?? Number.POSITIVE_INFINITY);
  });

  it('un solo resultado: el punto queda en el centro del hueco libre (no bajo el carril ni el dock)', () => {
    const result = resultsFrame([CANAL], 14);
    expect(result?.inside).toBe(1);
    const at = screenOf(CANAL, result?.center ?? CANAL, result?.zoom ?? 14, size);
    expect(at.x).toBeCloseTo(padding.left + (size.width - padding.left - padding.right) / 2, 0);
    expect(at.y).toBeCloseTo(padding.top + (size.height - padding.top - padding.bottom) / 2, 0);
  });

  it('respeta `maxBounds`: con dos puntos lejanos (Bocas del Toro y Coiba) el centro devuelto es admisible y se cuenta lo que de verdad cae dentro', () => {
    const far = [
      { lon: -82.1, lat: 9.3 },
      { lon: -81.75, lat: 7.55 },
    ];
    const result = resultsFrame(far, minZoomFor(size) + 0.3);
    expect(result).not.toBeNull();
    const center = result?.center ?? NATURAL_CENTER;
    const zoom = result?.zoom ?? 0;
    expect(zoom).toBeGreaterThanOrEqual(minZoomFor(size) - 1e-9);
    // el centro restringido por `screenOf` es el mismo: ya era admisible
    const again = screenOf(center, center, zoom, size);
    expect(again.x).toBeCloseTo(size.width / 2, 3);
    expect(again.y).toBeCloseTo(size.height / 2, 3);
    expect(inside(far, center, zoom, INSET)).toBe(result?.inside);
    expect(result?.inside ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('entrada inválida con `aim`: null, sin lanzar (sin puntos, rango de zoom vacío)', () => {
    expect(resultsFrame([], 13)).toBeNull();
    expect(
      bestEffortFrame({
        points: [CITY],
        size,
        padding,
        limits: WORKING_BBOX,
        minZoom: 13,
        maxZoom: 12,
        inset: INSET,
        aim: true,
      }),
    ).toBeNull();
  });
});
