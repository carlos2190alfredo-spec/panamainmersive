// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { closesOnFocusOut } from '@/lib/focus-out';

/**
 * ¿Debe cerrarse un desplegable cuando el foco sale de él? (r2:F2, WCAG 2.4.11). Se prueba con nodos reales de un documento
 * (jsdom): `Node.contains` es lo que decide. Sin este cierre, un menú abierto en un teléfono (a todo el ancho) cubría lo que
 * recibía el foco a continuación.
 */
function dom() {
  document.body.innerHTML = `
    <a id="brand" href="#">marca</a>
    <button id="button" type="button">menú</button>
    <nav id="menu"><a id="first" href="#">uno</a><a id="last" href="#">dos</a></nav>
    <a id="after" href="#">después</a>`;
  const get = (id: string) => document.getElementById(id) as HTMLElement;
  return {
    menu: get('menu'),
    button: get('button'),
    first: get('first'),
    last: get('last'),
    after: get('after'),
    brand: get('brand'),
  };
}

describe('closesOnFocusOut', () => {
  it('el foco pasa a algo FUERA del menú y de su botón: se cierra', () => {
    const { menu, button, after, brand } = dom();
    expect(closesOnFocusOut([menu, button], after)).toBe(true);
    expect(closesOnFocusOut([menu, button], brand)).toBe(true); // Mayús+Tab desde el botón
  });

  it('el foco se mueve DENTRO del menú o hasta su botón: no se cierra (Tab entre enlaces, Mayús+Tab de vuelta al botón)', () => {
    const { menu, button, first, last } = dom();
    expect(closesOnFocusOut([menu, button], first)).toBe(false);
    expect(closesOnFocusOut([menu, button], last)).toBe(false);
    expect(closesOnFocusOut([menu, button], button)).toBe(false);
    expect(closesOnFocusOut(menu, menu)).toBe(false);
  });

  it('`relatedTarget` nulo (cambio de pestaña o de ventana, o un clic en algo no enfocable): no se cierra por aquí', () => {
    const { menu, button } = dom();
    expect(closesOnFocusOut([menu, button], null)).toBe(false);
    expect(closesOnFocusOut(menu, window)).toBe(false); // un EventTarget que no es un nodo
  });

  it('acepta un solo contenedor o una lista', () => {
    const { menu, after } = dom();
    expect(closesOnFocusOut(menu, after)).toBe(true);
    expect(closesOnFocusOut([menu], after)).toBe(true);
  });
});
