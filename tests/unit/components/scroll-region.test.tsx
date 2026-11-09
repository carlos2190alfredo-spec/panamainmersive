// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollRegion, scrollEdges } from '@/components/ScrollRegion';

/**
 * ScrollRegion avisa de que queda contenido por desplazar (r1:V-14): una sombra en el borde que tiene más. jsdom no
 * calcula la maquetación: los tamaños se fijan a mano en el elemento (`scrollWidth`, `clientWidth`, `scrollLeft`) y el
 * efecto se dispara con `scroll`, que es lo que hace el navegador.
 */
afterEach(cleanup);

describe('scrollEdges', () => {
  it('cabe entero: sin sombra por ningún lado', () => {
    expect(scrollEdges({ scrollWidth: 300, clientWidth: 300, scrollLeft: 0 })).toEqual({
      start: false,
      end: false,
    });
    // media unidad de redondeo no es «más contenido»
    expect(scrollEdges({ scrollWidth: 300.6, clientWidth: 300, scrollLeft: 0 })).toEqual({
      start: false,
      end: false,
    });
  });

  it('al principio queda por el final; en medio por los dos lados; al final solo por el principio', () => {
    expect(scrollEdges({ scrollWidth: 576, clientWidth: 358, scrollLeft: 0 })).toEqual({
      start: false,
      end: true,
    });
    expect(scrollEdges({ scrollWidth: 576, clientWidth: 358, scrollLeft: 100 })).toEqual({
      start: true,
      end: true,
    });
    expect(scrollEdges({ scrollWidth: 576, clientWidth: 358, scrollLeft: 218 })).toEqual({
      start: true,
      end: false,
    });
  });

  it('con escritura de derecha a izquierda `scrollLeft` es negativo: cuenta su valor absoluto', () => {
    expect(scrollEdges({ scrollWidth: 576, clientWidth: 358, scrollLeft: -100 })).toEqual({
      start: true,
      end: true,
    });
  });
});

describe('ScrollRegion', () => {
  const sizes = { scrollWidth: 576, clientWidth: 358 };
  let original: { sw: PropertyDescriptor | undefined; cw: PropertyDescriptor | undefined };

  beforeEach(() => {
    original = {
      sw: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth'),
      cw: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
    };
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get: () => sizes.scrollWidth,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => sizes.clientWidth,
    });
  });

  afterEach(() => {
    for (const [prop, d] of [
      ['scrollWidth', original.sw],
      ['clientWidth', original.cw],
    ] as const) {
      if (d) Object.defineProperty(HTMLElement.prototype, prop, d);
      else Reflect.deleteProperty(HTMLElement.prototype, prop);
    }
    sizes.scrollWidth = 576;
    sizes.clientWidth = 358;
    vi.restoreAllMocks();
  });

  function setup() {
    const { container } = render(
      <ScrollRegion labelledBy="t">
        <table>
          <tbody>
            <tr>
              <td>x</td>
            </tr>
          </tbody>
        </table>
      </ScrollRegion>,
    );
    const root = container.firstElementChild as HTMLElement;
    const region = root.querySelector('[role="region"]') as HTMLElement;
    return { root, region };
  }

  it('sigue siendo una región con nombre y enfocable (2.1.1)', () => {
    const { region } = setup();
    expect(region.getAttribute('aria-labelledby')).toBe('t');
    expect(region.tabIndex).toBe(0);
  });

  it('con la tabla más ancha que la caja avisa por el FINAL y deja de avisar al llegar al extremo', () => {
    const { root, region } = setup();
    expect(root.hasAttribute('data-ready')).toBe(true);
    expect(root.hasAttribute('data-more-end')).toBe(true);
    expect(root.hasAttribute('data-more-start')).toBe(false);

    region.scrollLeft = 100;
    act(() => {
      region.dispatchEvent(new Event('scroll'));
    });
    expect(root.hasAttribute('data-more-start')).toBe(true);
    expect(root.hasAttribute('data-more-end')).toBe(true);

    region.scrollLeft = 218;
    act(() => {
      region.dispatchEvent(new Event('scroll'));
    });
    expect(root.hasAttribute('data-more-start')).toBe(true);
    expect(root.hasAttribute('data-more-end')).toBe(false);
  });

  it('si la tabla cabe entera no avisa de nada (pantalla ancha)', () => {
    sizes.scrollWidth = 358;
    const { root } = setup();
    expect(root.hasAttribute('data-ready')).toBe(true);
    expect(root.hasAttribute('data-more-start')).toBe(false);
    expect(root.hasAttribute('data-more-end')).toBe(false);
  });

  it('observa los cambios de tamaño (girar el teléfono, texto agrandado) y los desengancha al desmontar', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let callback: () => void = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callback = cb;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const { root } = setup();
    expect(observe).toHaveBeenCalled(); // la caja y su contenido (la tabla)
    expect(observe.mock.calls.length).toBeGreaterThanOrEqual(2);
    sizes.scrollWidth = 358; // ahora cabe
    act(() => {
      callback();
    });
    expect(root.hasAttribute('data-more-end')).toBe(false);
    cleanup();
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
