/**
 * ¿Debe cerrarse un desplegable cuando el foco abandona uno de sus elementos? (r2:F2, WCAG 2.4.11 Foco no oculto)
 *
 * Un menú o un selector abierto cubre parte de la pantalla (en un teléfono, a todo lo ancho). Si el foco sigue su camino
 * con Tab hacia lo que queda DEBAJO, ese elemento recibe el foco sin verse. Se cierra cuando el foco pasa a un nodo que
 * está FUERA de todos los `inside` (el contenedor y su botón). Tres casos que NO lo cierran, a propósito:
 *  - `relatedTarget === null`: el foco salió de la ventana (cambio de pestaña o de aplicación) o se pulsó algo no enfocable;
 *    lo segundo ya lo cierra el clic fuera (`pointerdown`) y lo primero no es motivo para perder el menú;
 *  - el foco pasa a otro elemento del propio desplegable o a su botón (Tab entre sus enlaces, Mayús+Tab de vuelta al botón).
 */
export function closesOnFocusOut(
  inside: Node | readonly Node[],
  relatedTarget: EventTarget | null,
): boolean {
  if (!(relatedTarget instanceof Node)) return false;
  const containers: readonly Node[] = isNodeList(inside) ? inside : [inside];
  return !containers.some((container) => container.contains(relatedTarget));
}

function isNodeList(value: Node | readonly Node[]): value is readonly Node[] {
  return Array.isArray(value);
}
