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
