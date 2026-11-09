'use client';

import { useEffect } from 'react';
import { closesOnFocusOut } from '@/lib/focus-out';

/**
 * Cierra el menú de la cabecera (`<nav popover>`) cuando el foco sale de él con Tab (r2:F2, WCAG 2.4.11). El navegador ya
 * cierra el popover con Escape y con un clic fuera (y devuelve el foco a su botón), pero NO cuando el foco lo abandona por
 * teclado: el menú abierto cubre la pantalla a todo lo ancho y lo que recibía el foco después (zoom y marcadores del mapa)
 * quedaba enfocado sin verse. No pinta nada (la cabecera sigue siendo un componente de servidor: solo esta isla hidrata).
 *
 * El botón que lo abre (`popovertarget`) cuenta como «dentro»: pasar de él al primer enlace y volver no cierra nada.
 */
export function MenuFocusGuard({ menuId }: { menuId: string }) {
  useEffect(() => {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    const button = document.querySelector<HTMLElement>(`[popovertarget="${menuId}"]`);
    const inside = button ? [menu, button] : [menu];
    const onFocusOut = (event: FocusEvent): void => {
      if (!closesOnFocusOut(inside, event.relatedTarget)) return;
      try {
        menu.hidePopover();
      } catch {
        // Navegador sin API de popover, o ya cerrado: no hay nada que cerrar.
      }
    };
    menu.addEventListener('focusout', onFocusOut);
    button?.addEventListener('focusout', onFocusOut);
    return () => {
      menu.removeEventListener('focusout', onFocusOut);
      button?.removeEventListener('focusout', onFocusOut);
    };
  }, [menuId]);
  return null;
}
