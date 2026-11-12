/**
 * Qué marcadores muestran su ETIQUETA (el nombre del destino) sin que haga falta pasar el cursor ni enfocarlos (r1:V-15).
 * Función PURA (sin DOM): quien llama mide en pantalla las cajas de los botones y el tamaño de cada etiqueta y pasa los
 * números. Antes los nueve destinos eran puntos anónimos hasta que se pasaba el ratón, se enfocaban o se elegían, y en un
 * móvil (sin ratón) no se sabía cuál era cuál.
 *
 * La etiqueta cuelga DEBAJO de su marcador, centrada, y sube `overlap` px sobre su caja (como en el CSS). Se muestra solo si
 * «hay sitio», es decir, si su caja:
 *  - no toca ningún OTRO botón (marcador suelto o grupo, con su holgura `gap`: una etiqueta encima de otro punto lo tapa y
 *    confunde cuál es cuál);
 *  - no toca otra etiqueta ya colocada (gana la de más prioridad: primero el seleccionado, después el orden del registro);
 *  - cabe ENTERA en `bounds` (el hueco que el HUD deja libre: una etiqueta a medias bajo un panel es peor que ninguna).
 * Lo que no cabe NO se esconde: sigue apareciendo al pasar el cursor y al enfocar (es el nombre accesible del botón; este
 * módulo solo decide lo que se ve SIN hacer nada).
 *
 * El seleccionado (`pinned`) siempre muestra la suya (el CSS ya lo hace) y reserva su sitio ANTES que los demás, aunque
 * tocase algo: no se juzga, solo se respeta.
 */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface LabelCandidate {
  readonly key: string;
  /** Centro del marcador en pantalla. */
  readonly x: number;
  readonly y: number;
  /** Tamaño de su etiqueta ya medido (texto + relleno + borde). */
  readonly width: number;
  readonly height: number;
  /** El destino seleccionado: su etiqueta se ve siempre y ocupa su sitio antes que las demás. */
  readonly pinned?: boolean;
}

export interface LabelObstacle {
  /** `key` del marcador al que pertenece la caja (la etiqueta puede solaparse con SU propio botón: cuelga de él). */
  readonly key: string;
  readonly box: Box;
}

export interface LabelLayoutInput {
  /** Marcadores sueltos (no los grupos), en orden de prioridad: los fijados primero y después el orden del registro. */
  readonly candidates: readonly LabelCandidate[];
  /** Todos los botones del mapa (marcadores sueltos y grupos): una etiqueta no puede tapar ninguno que no sea el suyo. */
  readonly obstacles: readonly LabelObstacle[];
  /** Donde debe caber entera la etiqueta (`null` = en cualquier parte). */
  readonly bounds: Box | null;
  /** Lado de la caja de pulsación del marcador (px). */
  readonly target: number;
  /** Cuánto sube la etiqueta sobre la caja de su marcador (px; `0.35rem` en el CSS). */
  readonly overlap: number;
  /** Holgura mínima entre la etiqueta y lo que la rodea (px). */
  readonly gap: number;
}

/** La caja que ocupa la etiqueta de un candidato (debajo del marcador, centrada). */
export function labelBox(
  candidate: Pick<LabelCandidate, 'x' | 'y' | 'width' | 'height'>,
  target: number,
  overlap: number,
): Box {
  const top = candidate.y + target / 2 - overlap;
  return {
    left: candidate.x - candidate.width / 2,
    right: candidate.x + candidate.width / 2,
    top,
    bottom: top + candidate.height,
  };
}

const intersects = (a: Box, b: Box, margin: number): boolean =>
  a.left < b.right + margin &&
  b.left < a.right + margin &&
  a.top < b.bottom + margin &&
  b.top < a.bottom + margin;

const inside = (inner: Box, outer: Box): boolean =>
  inner.left >= outer.left &&
  inner.right <= outer.right &&
  inner.top >= outer.top &&
  inner.bottom <= outer.bottom;

/** Claves de los marcadores cuya etiqueta se muestra sin pasar el cursor (los fijados siempre; los demás, si hay sitio). */
export function chooseLabels(input: LabelLayoutInput): Set<string> {
  const { candidates, obstacles, bounds, target, overlap, gap } = input;
  const shown = new Set<string>();
  const placed: Box[] = [];
  // Primero lo que se ve SIEMPRE (el seleccionado): ocupa su sitio antes de juzgar a los demás.
  for (const candidate of candidates) {
    if (!candidate.pinned) continue;
    shown.add(candidate.key);
    placed.push(labelBox(candidate, target, overlap));
  }
  for (const candidate of candidates) {
    if (candidate.pinned) continue;
    if (candidate.width <= 0 || candidate.height <= 0) continue; // sin medir: no se juzga a ciegas
    const box = labelBox(candidate, target, overlap);
    if (bounds && !inside(box, bounds)) continue;
    if (obstacles.some((o) => o.key !== candidate.key && intersects(box, o.box, gap))) continue;
    if (placed.some((p) => intersects(box, p, gap))) continue;
    shown.add(candidate.key);
    placed.push(box);
  }
  return shown;
}
