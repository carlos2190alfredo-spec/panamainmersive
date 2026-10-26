// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SHEET_TRANSITION_MS,
  isMobileLayout,
  isSheetOpen,
  resetSheetStore,
  revealInSheet,
  setSheetOpen,
} from '@/components/map/sheet-store';

/**
 * Almacén de la hoja inferior móvil: abierta/cerrada, presentación móvil/escritorio y «traer a la vista» un elemento de su
 * contenido (un grupo de capas, la ficha de un área). Lo que NO debe hacer en escritorio, donde la hoja no existe como caja.
 */
function stubViewport(layout: 'desktop' | 'mobile', reducedMotion = false): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width: 56rem')
        ? layout === 'desktop'
        : query.includes('prefers-reduced-motion')
          ? reducedMotion
          : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

let target: HTMLElement;
let body: HTMLElement;
let scrollTo: ReturnType<typeof vi.fn>;
let scrollIntoView: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  // El cuerpo desplazable de la hoja (200 px desde el borde de la página) con el elemento a 500 px: desplazado 40 px ya
  body = document.createElement('div');
  body.setAttribute('data-sheet-body', '');
  body.scrollTop = 40;
  scrollTo = vi.fn();
  body.scrollTo = scrollTo as never;
  vi.spyOn(body, 'getBoundingClientRect').mockReturnValue({ top: 200 } as DOMRect);
  target = document.createElement('div');
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
  scrollIntoView = vi.fn();
  target.scrollIntoView = scrollIntoView as never;
  body.append(target);
  document.body.append(body);
});
afterEach(() => {
  body.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetSheetStore();
});

describe('sheet-store', () => {
  it('abre, cierra y se reinicia', () => {
    expect(isSheetOpen()).toBe(false);
    setSheetOpen(true);
    expect(isSheetOpen()).toBe(true);
    resetSheetStore();
    expect(isSheetOpen()).toBe(false);
  });

  it('la presentación es la móvil por debajo de 56rem y la de escritorio desde 56rem', () => {
    stubViewport('mobile');
    expect(isMobileLayout()).toBe(true);
    stubViewport('desktop');
    expect(isMobileLayout()).toBe(false);
  });
});

describe('revealInSheet', () => {
  it('en escritorio no hace nada: ni abre una hoja que no existe ni desplaza', () => {
    stubViewport('desktop');
    revealInSheet(() => target);
    vi.advanceTimersByTime(SHEET_TRANSITION_MS * 2);
    expect(isSheetOpen()).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('en móvil con la hoja CERRADA la abre y desplaza SOLO cuando ha terminado de abrirse (antes su cuerpo mide casi nada)', () => {
    stubViewport('mobile');
    revealInSheet(() => target);
    expect(isSheetOpen()).toBe(true);
    vi.advanceTimersByTime(SHEET_TRANSITION_MS - 1);
    expect(scrollTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    // 40 (ya desplazado) + 500 − 200: el borde superior del elemento queda arriba del cuerpo
    expect(scrollTo).toHaveBeenCalledWith({ top: 340, behavior: 'smooth' });
  });

  it('desplaza SOLO el cuerpo de la hoja: nunca `scrollIntoView` (movería también la página: el mapa y la cabecera)', () => {
    stubViewport('mobile');
    setSheetOpen(true);
    revealInSheet(() => target);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('con la hoja ya ABIERTA desplaza al instante', () => {
    stubViewport('mobile');
    setSheetOpen(true);
    revealInSheet(() => target);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('con movimiento reducido el desplazamiento no es animado', () => {
    stubViewport('mobile', true);
    setSheetOpen(true);
    revealInSheet(() => target);
    expect(scrollTo).toHaveBeenCalledWith({ top: 340, behavior: 'auto' });
  });

  it('un elemento que NO está dentro de la hoja no se desplaza (no hay a qué)', () => {
    stubViewport('mobile');
    setSheetOpen(true);
    const outside = document.createElement('div');
    revealInSheet(() => outside);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('si el elemento ya no existe cuando termina de abrirse, no falla', () => {
    stubViewport('mobile');
    revealInSheet(() => null);
    expect(() => vi.advanceTimersByTime(SHEET_TRANSITION_MS)).not.toThrow();
  });

  it('el tiempo de espera cubre la transición del CSS (--motion-medium = 240 ms)', () => {
    expect(SHEET_TRANSITION_MS).toBeGreaterThanOrEqual(240);
  });
});
