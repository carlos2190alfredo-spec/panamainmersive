/**
 * Arrastre vertical del asa de la hoja móvil (una MEJORA: el botón con `aria-expanded` hace lo mismo sin ningún gesto).
 * Lógica pura y sin React para poder probarla: dado cuánto se movió el dedo (en px, positivo = hacia abajo), decide si
 * fue un toque, un arrastre hacia arriba (abrir) o hacia abajo (cerrar).
 *
 * Por debajo del umbral es un toque (o un temblor del dedo): lo resuelve el `click` del botón. Con el umbral se
 * distinguen los dos intentos sin que un toque impreciso abra o cierre la hoja a medias.
 */
export const DRAG_THRESHOLD_PX = 24;

/**
 * Un `click` que llega menos de esto después del `pointerup` que ya decidió el gesto es el eco de ese mismo gesto y se descarta.
 * Generoso a propósito (el eco llega en milisegundos): un `click` de otro origen (teclado, tecnología de asistencia) llega mucho
 * después de un toque y no se confunde con él.
 */
export const CLICK_AFTER_GESTURE_MS = 400;

export type SheetDrag = 'tap' | 'open' | 'close';

export function decideSheetDrag(dy: number): SheetDrag {
  if (!Number.isFinite(dy) || Math.abs(dy) < DRAG_THRESHOLD_PX) return 'tap';
  return dy < 0 ? 'open' : 'close';
}
