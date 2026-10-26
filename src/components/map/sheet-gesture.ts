/**
 * Arrastre vertical del asa de la hoja móvil (una MEJORA: el botón con `aria-expanded` hace lo mismo sin ningún gesto).
 * Lógica pura y sin React para poder probarla: dado cuánto se movió el dedo (en px, positivo = hacia abajo), decide si
 * fue un toque, un arrastre hacia arriba (abrir) o hacia abajo (cerrar).
 *
 * Por debajo del umbral es un toque (o un temblor del dedo): lo resuelve el `click` del botón. Con el umbral se
 * distinguen los dos intentos sin que un toque impreciso abra o cierre la hoja a medias.
 */
export const DRAG_THRESHOLD_PX = 24;

export type SheetDrag = 'tap' | 'open' | 'close';

export function decideSheetDrag(dy: number): SheetDrag {
  if (!Number.isFinite(dy) || Math.abs(dy) < DRAG_THRESHOLD_PX) return 'tap';
  return dy < 0 ? 'open' : 'close';
}
