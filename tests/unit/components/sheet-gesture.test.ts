import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD_PX, decideSheetDrag } from '@/components/map/sheet-gesture';

/**
 * El arrastre vertical del asa de la hoja móvil es una MEJORA (el botón hace lo mismo sin gesto): hacia arriba abre,
 * hacia abajo cierra y un toque o un temblor del dedo no decide nada (lo resuelve el `click` del botón).
 */
describe('decideSheetDrag', () => {
  it('un arrastre hacia ARRIBA (dy negativo) abre y hacia ABAJO cierra', () => {
    expect(decideSheetDrag(-DRAG_THRESHOLD_PX)).toBe('open');
    expect(decideSheetDrag(-120)).toBe('open');
    expect(decideSheetDrag(DRAG_THRESHOLD_PX)).toBe('close');
    expect(decideSheetDrag(120)).toBe('close');
  });

  it('por debajo del umbral es un toque (un temblor del dedo no abre ni cierra a medias)', () => {
    for (const dy of [0, 1, -1, DRAG_THRESHOLD_PX - 0.5, -(DRAG_THRESHOLD_PX - 0.5)]) {
      expect(decideSheetDrag(dy), String(dy)).toBe('tap');
    }
  });

  it('un valor que no es un número finito no decide nada', () => {
    expect(decideSheetDrag(Number.NaN)).toBe('tap');
    expect(decideSheetDrag(Number.POSITIVE_INFINITY)).toBe('tap');
  });

  it('el umbral es el que se documenta (24 px: el mínimo de un objetivo táctil de WCAG 2.5.8)', () => {
    expect(DRAG_THRESHOLD_PX).toBe(24);
  });
});
