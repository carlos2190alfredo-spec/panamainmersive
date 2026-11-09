import { latAt, lonAt, worldSize, worldX, worldY } from './mercator';

/**
 * Encuadre consciente del HUD (ADR-0025 §8). Lógica PURA (sin DOM ni MapLibre): recibe dos rectángulos en píxeles de
 * pantalla —el del mapa y el del hueco que dejan libre los paneles— y devuelve el relleno que hay que pasar a
 * `fitBounds`/`flyTo` para que el destino quede a la vista y no debajo de un panel.
 *
 * Quién mide qué: el CSS decide qué espacio queda libre (es un elemento vacío del HUD, `[data-hud-safe]`, que ocupa
 * la celda central de la rejilla); el navegador lo mide (`getBoundingClientRect`) en el momento de volar; esta función
 * solo hace la aritmética. Así no hay rem→px duplicados en TypeScript y el hueco sigue a los paneles aunque se plieguen.
 */

/** Rectángulo en píxeles de pantalla (mismas coordenadas que `getBoundingClientRect`). */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Relleno por lado en píxeles (el formato de `PaddingOptions` de MapLibre). */
export interface FramePadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * De los dos lados de un eje, como mucho esta parte del mapa puede quedar cubierta por relleno: por encima, MapLibre
 * no podría encuadrar nada («Map cannot fit within canvas with the given bounds, padding, and/or offset»).
 */
const MAX_COVERED_FRACTION = 0.75;

/** El respiro pedido se acota a esta fracción del lado menor del hueco libre (solo cuando hay hueco medido). */
const MAX_MARGIN_FRACTION = 0.12;

const uniform = (margin: number): FramePadding => ({
  top: margin,
  right: margin,
  bottom: margin,
  left: margin,
});

const finite = (box: Box): boolean =>
  [box.left, box.top, box.right, box.bottom].every((n) => Number.isFinite(n));

/** Reduce un par de rellenos opuestos para que su suma no pase de `limit`, conservando su proporción. */
function fitAxis(a: number, b: number, limit: number): [number, number] {
  const sum = a + b;
  if (sum <= limit || sum === 0) return [a, b];
  const k = limit / sum;
  return [a * k, b * k];
}

/**
 * Relleno para encuadrar dentro del hueco libre `safe` del mapa `stage`, con `margin` px de respiro en cada lado.
 *
 * - Sin hueco (móvil, sin HUD, caja vacía o inválida): relleno uniforme `margin`.
 * - Con hueco, `margin` se acota al 12 % de su lado menor (un hueco bajo no puede gastarse en respiro).
 * - El hueco se recorta al mapa: lo que sobresale del mapa no suma relleno negativo.
 * - Si el relleno cubriría casi todo un eje (ventana muy baja o estrecha), se reduce proporcionalmente.
 */
export function framePadding(stage: Box, safe: Box | null, margin: number): FramePadding {
  const m = Math.max(0, margin);
  if (!safe || !finite(stage) || !finite(safe)) return uniform(m);
  const width = stage.right - stage.left;
  const height = stage.bottom - stage.top;
  if (width <= 0 || height <= 0 || safe.right <= safe.left || safe.bottom <= safe.top) {
    return uniform(m);
  }
  // Sin hueco dentro del mapa (cajas que no se tocan) = como si no hubiera HUD.
  if (
    safe.right <= stage.left ||
    safe.left >= stage.right ||
    safe.bottom <= stage.top ||
    safe.top >= stage.bottom
  ) {
    return uniform(m);
  }
  // El respiro nunca pasa de una fracción del lado menor del hueco: en un hueco bajo (ficha y carrusel abiertos) un
  // respiro fijo de 48 px se comería la mitad de la altura y el destino quedaría encuadrado a un zoom menor del debido.
  const room = Math.min(safe.right - safe.left, safe.bottom - safe.top);
  const gap = Math.min(m, room * MAX_MARGIN_FRACTION);
  const top = Math.max(0, safe.top - stage.top) + gap;
  const bottom = Math.max(0, stage.bottom - safe.bottom) + gap;
  const left = Math.max(0, safe.left - stage.left) + gap;
  const right = Math.max(0, stage.right - safe.right) + gap;
  const [t, b] = fitAxis(top, bottom, height * MAX_COVERED_FRACTION);
  const [l, r] = fitAxis(left, right, width * MAX_COVERED_FRACTION);
  return { top: t, right: r, bottom: b, left: l };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Encuadre ALCANZABLE: el relleno del HUD pide poner el destino en el hueco libre, pero `maxBounds` puede impedirlo.   */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Caja geográfica (grados). */
export interface GeoBox {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

/** Entrada de {@link reachFrame}; el tamaño y el relleno son los del lienzo en píxeles CSS. */
export interface ReachInput {
  /** Zoom al que el ajuste a la caja (`cameraForBounds`) deja el encuadre. */
  readonly zoom: number;
  /** Zoom máximo al que se puede subir para que el destino sea alcanzable. */
  readonly maxZoom: number;
  /** Lo que se quiere ver (un destino, un grupo de ellos, un área): el ajuste la centra en el hueco libre. */
  readonly box: GeoBox;
  /**
   * Puntos que DEBEN quedar dentro del hueco (los marcadores): el ancla de un destino no está en el centro de su caja
   * (el canal está en una esquina de la suya) y es el marcador lo que se pulsa. Sin puntos, vale el centro de la caja.
   */
  readonly must?: readonly { readonly lon: number; readonly lat: number }[];
  readonly size: { readonly width: number; readonly height: number };
  /** Relleno del HUD (`framePadding`): el destino debe quedar DENTRO del rectángulo que deja libre. */
  readonly padding: FramePadding;
  /** `maxBounds` del mapa. */
  readonly limits: GeoBox;
  /** Giro del mapa en grados (0 = norte arriba). */
  readonly bearing?: number;
  /** Margen extra (px) entre el destino y el borde del hueco: el pin mide 44 px. */
  readonly inset?: number;
  /** Margen extra solo por ABAJO (la etiqueta del marcador seleccionado cuelga bajo el pin); por defecto, `inset`. */
  readonly insetBottom?: number;
}

export interface ReachResult {
  readonly zoom: number;
  readonly center: { readonly lon: number; readonly lat: number };
  /** `true` si hubo que subir el zoom respecto del pedido (el ajuste de la librería habría dejado el punto tapado). */
  readonly adjusted: boolean;
  /** Qué se centró en el hueco: la caja (como `fitBounds`) o, si así tapaba un punto, los propios puntos. */
  readonly aim: 'box' | 'points';
}

const ZOOM_STEP = 0.05;
const RAD = Math.PI / 180;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * `maxBounds` de MapLibre manda sobre el relleno: con la vista más alta que la caja de trabajo (Panamá es una franja de
 * 2,9° de alto) el centro queda CLAVADO en el medio, y un destino del sur (Coiba) cae donde el HUD lo tapa. Esta función
 * dice si, al zoom que pide el ajuste, los puntos que importan quedarán dentro del hueco libre una vez aplicadas las
 * mismas restricciones de MapLibre (`_constrainToWorldSquare`: la vista no se sale de `limits` y, si no cabe, el centro
 * se clava). Devuelve el MENOR zoom ≥ `zoom` (paso 0,05) al que sí quedan, con el centro ya restringido, y si hubo que
 * subirlo (`adjusted`). `null` = ningún zoom hasta `maxZoom` lo logra (o entrada inválida): se deja el ajuste de la librería.
 *
 * Dos centros posibles en cada zoom: el de la caja (lo que hace `fitBounds`) y, si ese deja fuera algún punto, el de los
 * propios puntos (el marcador en el centro del hueco; la caja ya no cabe entera y es lo de menos).
 */
export function reachFrame(input: ReachInput): ReachResult | null {
  const { zoom, maxZoom, box, size, padding, limits } = input;
  const { width: w, height: h } = size;
  const availW = w - padding.left - padding.right;
  const availH = h - padding.top - padding.bottom;
  const numbers = [zoom, maxZoom, w, h, availW, availH, padding.top, padding.left];
  if (!numbers.every(Number.isFinite) || w <= 0 || h <= 0 || availW <= 0 || availH <= 0) {
    return null;
  }
  const bearing = (input.bearing ?? 0) * RAD;
  const cos = Math.cos(bearing);
  const sin = Math.sin(bearing);
  // Dónde se quiere el punto en pantalla: el centro del hueco, medido desde el centro del lienzo.
  const dx = w / 2 - (padding.left + availW / 2);
  const dy = h / 2 - (padding.top + availH / 2);
  const inset = Math.min(Math.max(0, input.inset ?? 0), availW / 2, availH / 2);
  const insetBottom = Math.min(Math.max(0, input.insetBottom ?? inset), availH / 2);

  // Mundo 0..1: el centro de la caja y los puntos que deben verse (si no hay, el propio centro).
  const boxCenter = {
    x: (worldX(box.west) + worldX(box.east)) / 2,
    y: (worldY(box.south) + worldY(box.north)) / 2,
  };
  const musts = (input.must ?? []).map((p) => ({ x: worldX(p.lon), y: worldY(p.lat) }));
  const watch = musts.length > 0 ? musts : [boxCenter];
  const centroid = {
    x: watch.reduce((sum, p) => sum + p.x, 0) / watch.length,
    y: watch.reduce((sum, p) => sum + p.y, 0) / watch.length,
  };
  const aims: readonly { aim: ReachResult['aim']; x: number; y: number }[] =
    musts.length > 0
      ? [
          { aim: 'box', ...boxCenter },
          { aim: 'points', ...centroid },
        ]
      : [{ aim: 'box', ...boxCenter }];

  for (let z = zoom; z <= maxZoom + 1e-9; z += ZOOM_STEP) {
    const s = worldSize(z);
    const minX = worldX(limits.west) * s;
    const maxX = worldX(limits.east) * s;
    const minY = worldY(limits.north) * s;
    const maxY = worldY(limits.south) * s;
    // Con la vista mayor que la caja MapLibre sube el zoom por su cuenta: ese zoom no existe, se sigue.
    if (maxX - minX < w || maxY - minY < h) continue;
    for (const aimAt of aims) {
      // Centro de cámara ideal (`aim` en el centro del hueco) y centro restringido a `maxBounds`.
      const idealX = aimAt.x * s + dx * cos - dy * sin;
      const idealY = aimAt.y * s + dx * sin + dy * cos;
      const cx = clamp(idealX, minX + w / 2, maxX - w / 2);
      const cy = clamp(idealY, minY + h / 2, maxY - h / 2);
      const inside = watch.every((p) => {
        // Posición en pantalla del punto con ese centro (rotación inversa)
        const rx = p.x * s - cx;
        const ry = p.y * s - cy;
        const sx = w / 2 + rx * cos + ry * sin;
        const sy = h / 2 - rx * sin + ry * cos;
        return (
          sx >= padding.left + inset &&
          sx <= w - padding.right - inset &&
          sy >= padding.top + inset &&
          sy <= h - padding.bottom - insetBottom
        );
      });
      if (inside) {
        return {
          zoom: z,
          center: { lon: lonAt(cx / s), lat: latAt(cy / s) },
          adjusted: z > zoom,
          aim: aimAt.aim,
        };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Encuadre de MEJOR ESFUERZO: cuando varios puntos no caben a la vez en el hueco libre, el que deja más a la vista.     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Entrada de {@link bestEffortFrame}; el tamaño y el relleno son los del lienzo en píxeles CSS. */
export interface BestFrameInput {
  /** Los puntos que se quieren ver (los marcadores). */
  readonly points: readonly { readonly lon: number; readonly lat: number }[];
  readonly size: { readonly width: number; readonly height: number };
  /** Relleno del HUD (`framePadding`): solo cuentan los puntos que caen DENTRO del rectángulo libre que deja. */
  readonly padding: FramePadding;
  /** `maxBounds` del mapa. */
  readonly limits: GeoBox;
  /** Zoom MÍNIMO con el que MapLibre deja el mapa dentro de `maxBounds` (`map.getMinZoom(true)`): de ahí se empieza a buscar. */
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Margen (px) entre un punto y el borde del hueco: el marcador mide 44 px. */
  readonly inset?: number;
  /** Cuánto por encima de `minZoom` se busca (por defecto 1,2 niveles). */
  readonly zoomSpan?: number;
  /**
   * Cuántos puntos más debe dejar a la vista un encuadre para preferirlo a la vista de siempre (por defecto 2). Mover el
   * mapa y acercarlo para ganar UN punto a costa de perder contexto no compensa (y a veces cambia uno por otro: lo que el
   * carril tapaba pasa a verse y lo que se veía junto al borde queda bajo el dock).
   */
  readonly minGain?: number;
  /**
   * Encuadre de RESULTADOS concretos (el filtro y la búsqueda de Explorar), no vista de conjunto (r0:F-05 / X2). Cambia tres
   * cosas: (1) además de la rejilla se prueban centros que ponen los propios puntos (cada uno, su centroide y el centro de su
   * caja) en el centro del hueco libre, porque a zoom alto la rejilla de 41 × 41 sobre TODA la caja de trabajo salta cientos
   * de píxeles entre muestras y no acertaba con dos destinos a 6 km (la búsqueda «Panamá» dejaba el mapa en el océano, con los
   * dos resultados a 9 000 px); (2) a igual número de puntos a la vista gana el zoom MÁS ALTO (el encuadre más cercano que los
   * deja ver), no el más bajo; (3) devuelve siempre el mejor encuadre (`moved` verdadero): aquí no hay «vista de siempre» a la
   * que volver, el mapa tiene que ir a los resultados.
   */
  readonly aim?: boolean;
}

export interface BestFrameResult {
  readonly zoom: number;
  readonly center: { readonly lon: number; readonly lat: number };
  /** Cuántos de los puntos quedan dentro del hueco libre con ese encuadre. */
  readonly inside: number;
  readonly total: number;
  /** `false` = la vista de siempre (zoom mínimo y centro de `limits`, ya restringido): ningún otro encuadre gana lo bastante. */
  readonly moved: boolean;
}

/** Un encuadre candidato: zoom, centro en píxeles del mundo a ese zoom (`s`), puntos dentro del hueco y distancia al centro de siempre. */
interface BestCandidate {
  readonly zoom: number;
  readonly cx: number;
  readonly cy: number;
  readonly inside: number;
  readonly distance: number;
  readonly s: number;
}

const BEST_SAMPLES_PER_AXIS = 41;
const BEST_ZOOM_SPAN = 1.2;
const BEST_MIN_GAIN = 2;

/**
 * `maxBounds` impide, con la vista más alta que la caja de trabajo, que ningún encuadre deje TODOS los puntos dentro del hueco
 * libre (Panamá es una franja de 2,9° de alto y el carril y el dock tapan justo el oeste y el sur: ver `reachFrame`, que sube
 * el zoom hasta lograrlo para UNO o para un grupo pequeño). Esta función resuelve el caso general: entre todos los encuadres
 * que MapLibre admite (zoom desde el mínimo, centro dentro de lo que `maxBounds` permite a ese zoom), elige el que deja DENTRO
 * del hueco libre el MAYOR NÚMERO de puntos; a igualdad, el de MENOR zoom (más país a la vista) y, a igualdad, el centro más
 * cercano al de `limits` (la vista de siempre: no se mueve nada que no gane un punto). Giro 0, como la vista inicial.
 *
 * Solo se aparta de la vista de siempre si gana al menos `minGain` puntos (`moved`). Devuelve `null` si la entrada es inválida
 * (lienzo o hueco de tamaño no positivo, sin puntos) y se deja el ajuste de la librería.
 */
export function bestEffortFrame(input: BestFrameInput): BestFrameResult | null {
  const { points, size, padding, limits, minZoom, maxZoom } = input;
  const { width: w, height: h } = size;
  const availW = w - padding.left - padding.right;
  const availH = h - padding.top - padding.bottom;
  const numbers = [minZoom, maxZoom, w, h, availW, availH, padding.top, padding.left];
  if (!numbers.every(Number.isFinite) || w <= 0 || h <= 0 || availW <= 0 || availH <= 0) {
    return null;
  }
  if (points.length === 0 || maxZoom < minZoom) return null;
  const inset = Math.min(Math.max(0, input.inset ?? 0), availW / 2, availH / 2);
  const span = Math.max(0, input.zoomSpan ?? BEST_ZOOM_SPAN);
  const world = points.map((p) => ({ x: worldX(p.lon), y: worldY(p.lat) }));
  const preferred = {
    x: (worldX(limits.west) + worldX(limits.east)) / 2,
    y: (worldY(limits.south) + worldY(limits.north)) / 2,
  };

  const countInside = (s: number, cx: number, cy: number): number => {
    let inside = 0;
    for (const p of world) {
      const sx = w / 2 + (p.x * s - cx);
      const sy = h / 2 + (p.y * s - cy);
      if (
        sx >= padding.left + inset &&
        sx <= w - padding.right - inset &&
        sy >= padding.top + inset &&
        sy <= h - padding.bottom - inset
      ) {
        inside += 1;
      }
    }
    return inside;
  };

  // Dónde se quiere un punto en pantalla: el centro del hueco libre, medido desde el centro del lienzo (como `reachFrame`).
  const dx = w / 2 - (padding.left + availW / 2);
  const dy = h / 2 - (padding.top + availH / 2);
  const worldBox = {
    west: Math.min(...world.map((p) => p.x)),
    east: Math.max(...world.map((p) => p.x)),
    north: Math.min(...world.map((p) => p.y)),
    south: Math.max(...world.map((p) => p.y)),
  };
  const aims = [
    {
      x: world.reduce((sum, p) => sum + p.x, 0) / world.length,
      y: world.reduce((sum, p) => sum + p.y, 0) / world.length,
    },
    { x: (worldBox.west + worldBox.east) / 2, y: (worldBox.north + worldBox.south) / 2 },
    ...world,
  ];
  /** A qué distancia (px) del centro del hueco cae el centroide de los puntos con ese centro de cámara. */
  const centroidOffset = (s: number, cx: number, cy: number): number => {
    const [centroid] = aims;
    if (!centroid) return 0;
    return Math.hypot(centroid.x * s - cx - dx, centroid.y * s - cy - dy);
  };

  let best: BestCandidate | null = null;
  let natural: BestCandidate | null = null;
  const consider = (z: number, s: number, cx: number, cy: number): void => {
    const inside = countInside(s, cx, cy);
    const distance = input.aim
      ? centroidOffset(s, cx, cy)
      : Math.hypot(cx - preferred.x * s, cy - preferred.y * s);
    const better =
      best === null ||
      inside > best.inside ||
      (inside === best.inside && (input.aim ? z > best.zoom + 1e-9 : z < best.zoom - 1e-9)) ||
      (inside === best.inside && Math.abs(z - best.zoom) < 1e-9 && distance < best.distance);
    if (better) best = { zoom: z, cx, cy, inside, distance, s };
    // La vista de siempre: el zoom mínimo y, a ese zoom, el centro admisible más cercano al de `limits`.
    const home = Math.hypot(cx - preferred.x * s, cy - preferred.y * s);
    if (natural === null || (z === minZoom && home < natural.distance)) {
      natural = { zoom: z, cx, cy, inside, distance: home, s };
    }
  };
  const top = Math.min(maxZoom, minZoom + span);
  for (let z = minZoom; z <= top + 1e-9; z += ZOOM_STEP) {
    const s = worldSize(z);
    const minX = worldX(limits.west) * s;
    const maxX = worldX(limits.east) * s;
    const minY = worldY(limits.north) * s;
    const maxY = worldY(limits.south) * s;
    // Por debajo del zoom mínimo MapLibre lo sube por su cuenta: ese zoom no existe (con medio píxel de tolerancia).
    if (maxX - minX < w - 0.5 || maxY - minY < h - 0.5) continue;
    const loX = minX + w / 2;
    const hiX = Math.max(loX, maxX - w / 2);
    const loY = minY + h / 2;
    const hiY = Math.max(loY, maxY - h / 2);
    const clamp = (value: number, lo: number, hi: number): number =>
      Math.min(Math.max(value, lo), hi);
    if (input.aim) {
      for (const aimAt of aims) {
        consider(z, s, clamp(aimAt.x * s + dx, loX, hiX), clamp(aimAt.y * s + dy, loY, hiY));
      }
      continue;
    }
    const stepsX = hiX - loX < 0.5 ? 1 : BEST_SAMPLES_PER_AXIS;
    const stepsY = hiY - loY < 0.5 ? 1 : BEST_SAMPLES_PER_AXIS;
    for (let i = 0; i < stepsX; i++) {
      const cx = stepsX === 1 ? (loX + hiX) / 2 : loX + ((hiX - loX) * i) / (stepsX - 1);
      for (let j = 0; j < stepsY; j++) {
        const cy = stepsY === 1 ? (loY + hiY) / 2 : loY + ((hiY - loY) * j) / (stepsY - 1);
        consider(z, s, cx, cy);
      }
    }
  }
  if (best === null || natural === null) return null;
  const minGain = Math.max(1, input.minGain ?? BEST_MIN_GAIN);
  const chosen: BestCandidate = input.aim
    ? best
    : (best as BestCandidate).inside >= (natural as BestCandidate).inside + minGain
      ? best
      : natural;
  return {
    zoom: chosen.zoom,
    center: { lon: lonAt(chosen.cx / chosen.s), lat: latAt(chosen.cy / chosen.s) },
    inside: chosen.inside,
    total: points.length,
    moved: chosen === best,
  };
}
