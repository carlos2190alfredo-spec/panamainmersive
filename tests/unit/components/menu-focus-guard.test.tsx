// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuFocusGuard } from '@/components/MenuFocusGuard';

/**
 * `MenuFocusGuard` cierra el menú de la cabecera (`<nav popover>`) cuando el foco SALE de él por teclado (r2:F2). jsdom no
 * trae la API Popover: `hidePopover` se sustituye por un espía en el elemento (lo que importa es CUÁNDO se llama).
 */
afterEach(cleanup);

function setup() {
  const { container } = render(
    <div>
      <a id="brand" href="#top">
        marca
      </a>
      <button type="button" popoverTarget="site-menu" id="button">
        menú
      </button>
      <nav id="site-menu" popover="auto">
        <a id="first" href="#a">
          uno
        </a>
        <a id="last" href="#b">
          dos
        </a>
      </nav>
      <a id="after" href="#c">
        después
      </a>
      <MenuFocusGuard menuId="site-menu" />
    </div>,
  );
  const get = (id: string) => container.querySelector<HTMLElement>(`#${id}`) as HTMLElement;
  const menu = get('site-menu');
  const hide = vi.fn();
  (menu as HTMLElement & { hidePopover: () => void }).hidePopover = hide;
  return { get, hide };
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

  it('al desmontarse retira sus oyentes (el nodo desconectado ya no cierra nada)', () => {
    const { get, hide } = setup();
    const last = get('last');
    const after = get('after');
    // control: mientras está montado SÍ cierra
    fireEvent.focusOut(last, { relatedTarget: after });
    expect(hide).toHaveBeenCalledTimes(1);
    cleanup();
    fireEvent.focusOut(last, { relatedTarget: after });
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
