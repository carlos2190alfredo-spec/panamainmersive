// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuFocusGuard } from '@/components/MenuFocusGuard';

/**
 * `MenuFocusGuard` cierra el menú de la cabecera (`<nav popover>`) en lo que el navegador no cierra solo: cuando el foco SALE de él
 * por teclado (r2:F2), cuando se activa uno de sus enlaces y cuando cambia la ruta con el menú abierto (la cabecera es del diseño y
 * no se vuelve a montar al navegar). jsdom no trae la API Popover: `hidePopover` se sustituye por un espía en el elemento (lo que
 * importa es CUÁNDO se llama). La ruta se simula con un valor mutable que `usePathname` lee en cada render.
 */
const nav = vi.hoisted(() => ({ pathname: '/es/destinos' }));
vi.mock('@/i18n/navigation', () => ({ usePathname: () => nav.pathname }));

afterEach(() => {
  cleanup();
  nav.pathname = '/es/destinos';
  Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
});

/** Un elemento NUEVO en cada llamada: `rerender` con el mismo elemento no vuelve a ejecutar el componente. */
const tree = () => (
  <div>
    <a id="brand" href="#top">
      marca
    </a>
    <button type="button" popoverTarget="site-menu" id="button">
      menú
    </button>
    <nav id="site-menu" popover="auto">
      <ul id="list">
        <li>
          <a id="first" href="#a">
            <span id="inner">uno</span>
          </a>
        </li>
        <li>
          <a id="last" href="#b">
            dos
          </a>
        </li>
      </ul>
    </nav>
    <a id="after" href="#c">
      después
    </a>
    <MenuFocusGuard menuId="site-menu" />
  </div>
);

function setup() {
  // El espía va en el PROTOTIPO y ANTES de montar: así también se ve lo que el componente hace al montarse (una llamada que
  // cierre un menú que la persona abrió antes de que la página hidratara).
  const hide = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
    configurable: true,
    writable: true,
    value: hide,
  });
  const { container, rerender } = render(tree());
  const get = (id: string) => container.querySelector<HTMLElement>(`#${id}`) as HTMLElement;
  return {
    get,
    hide,
    rerender: () => {
      rerender(tree());
    },
  };
}

describe('MenuFocusGuard', () => {
  it('Tab desde el último enlace a algo de FUERA del menú lo cierra', () => {
    const { get, hide } = setup();
    fireEvent.focusOut(get('last'), { relatedTarget: get('after') });
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it('Mayús+Tab desde el botón del menú hasta la marca también lo cierra', () => {
    const { get, hide } = setup();
    fireEvent.focusOut(get('button'), { relatedTarget: get('brand') });
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it('el foco entre los enlaces del menú, o del botón al primero y vuelta, NO lo cierra', () => {
    const { get, hide } = setup();
    fireEvent.focusOut(get('first'), { relatedTarget: get('last') });
    fireEvent.focusOut(get('button'), { relatedTarget: get('first') });
    fireEvent.focusOut(get('first'), { relatedTarget: get('button') });
    expect(hide).not.toHaveBeenCalled();
  });

  it('un foco que se pierde sin destino (otra pestaña, otra ventana) no lo cierra', () => {
    const { get, hide } = setup();
    fireEvent.focusOut(get('last'), { relatedTarget: null });
    expect(hide).not.toHaveBeenCalled();
  });

  it('si el navegador no tiene la API Popover (o el menú ya está cerrado) no lanza', () => {
    const { get } = setup();
    const menu = get('site-menu') as HTMLElement & { hidePopover: () => void };
    menu.hidePopover = () => {
      throw new DOMException('not showing', 'InvalidStateError');
    };
    expect(() => {
      fireEvent.focusOut(get('last'), { relatedTarget: get('after') });
    }).not.toThrow();
  });

  describe('al activar un enlace del menú (la cabecera sobrevive a la navegación)', () => {
    it('un clic corriente en un enlace lo cierra, también si el clic cae en un elemento DENTRO del enlace', () => {
      const { get, hide } = setup();
      fireEvent.click(get('last'));
      expect(hide).toHaveBeenCalledTimes(1);
      fireEvent.click(get('inner'));
      expect(hide).toHaveBeenCalledTimes(2);
    });

    it('con Ctrl, Cmd, Mayús o Alt, o con otro botón, el enlace se abre aparte y el menú se queda', () => {
      const { get, hide } = setup();
      for (const init of [
        { ctrlKey: true },
        { metaKey: true },
        { shiftKey: true },
        { altKey: true },
        { button: 1 },
      ]) {
        fireEvent.click(get('first'), init);
      }
      expect(hide).not.toHaveBeenCalled();
      // control: el mismo clic sin modificadores SÍ lo cierra
      fireEvent.click(get('first'));
      expect(hide).toHaveBeenCalledTimes(1);
    });

    it('un clic dentro del menú que no es un enlace (la lista, el propio menú) no lo cierra', () => {
      const { get, hide } = setup();
      fireEvent.click(get('list'));
      fireEvent.click(get('site-menu'));
      expect(hide).not.toHaveBeenCalled();
    });

    it('un clic en un enlace de FUERA del menú (la marca, lo de debajo) no lo cierra: el oyente es del menú', () => {
      const { get, hide } = setup();
      fireEvent.click(get('brand'));
      fireEvent.click(get('after'));
      expect(hide).not.toHaveBeenCalled();
    });

    it('si el navegador no tiene la API Popover, activar un enlace no lanza', () => {
      const { get } = setup();
      (get('site-menu') as HTMLElement & { hidePopover: () => void }).hidePopover = () => {
        throw new TypeError('hidePopover is not a function');
      };
      expect(() => {
        fireEvent.click(get('last'));
      }).not.toThrow();
    });
  });

  describe('al cambiar la ruta con el menú abierto (Atrás o Adelante del navegador)', () => {
    it('lo cierra una sola vez por cambio; ni la primera lectura ni otro render con la MISMA ruta cierran nada', () => {
      const { hide, rerender } = setup();
      expect(hide).not.toHaveBeenCalled();
      rerender();
      expect(hide).not.toHaveBeenCalled();
      nav.pathname = '/es/fuentes';
      rerender();
      expect(hide).toHaveBeenCalledTimes(1);
      rerender();
      expect(hide).toHaveBeenCalledTimes(1);
      nav.pathname = '/es/destinos';
      rerender();
      expect(hide).toHaveBeenCalledTimes(2);
    });

    it('sin la API Popover, el cambio de ruta no lanza', () => {
      const { get, rerender } = setup();
      (get('site-menu') as HTMLElement & { hidePopover: () => void }).hidePopover = () => {
        throw new TypeError('hidePopover is not a function');
      };
      nav.pathname = '/es/fuentes';
      expect(rerender).not.toThrow();
    });
  });

  it('al desmontarse retira sus oyentes (el nodo desconectado ya no cierra nada)', () => {
    const { get, hide } = setup();
    const last = get('last');
    const after = get('after');
    // control: mientras está montado SÍ cierra
    fireEvent.focusOut(last, { relatedTarget: after });
    fireEvent.click(last);
    expect(hide).toHaveBeenCalledTimes(2);
    cleanup();
    fireEvent.focusOut(last, { relatedTarget: after });
    fireEvent.click(last);
    expect(hide).toHaveBeenCalledTimes(2);
  });
});
