'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from '@/i18n/navigation';
import { closesOnFocusOut } from '@/lib/focus-out';

/** ¿Es un clic corriente (botón principal, sin teclas modificadoras)? Con Ctrl/Cmd/Mayús el enlace se abre aparte y esta página no cambia. */
const isPlainClick = (event: MouseEvent): boolean =>
  event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;

/**
 * Cierra el menú de la cabecera (`<nav popover>`) en lo que el navegador NO cierra solo. Escape y un clic fuera ya los resuelve
 * él (y devuelve el foco al botón); quedan tres casos:
 *  - el foco sale del menú con Tab (r2:F2, WCAG 2.4.11): el menú abierto cubre la pantalla a todo lo ancho y lo que recibía el
 *    foco después (zoom y marcadores del mapa) quedaba enfocado sin verse;
 *  - se activa uno de sus enlaces: la cabecera es del diseño `[locale]`, que NO se vuelve a montar al navegar dentro de un
 *    idioma, y una navegación dentro del mismo documento no cierra un popover. Sin esto el menú seguía abierto sobre la página
 *    nueva (en Explorar, tapando el carril y las herramientas del mapa) hasta tocar fuera, y ese toque activaba lo que hubiera
 *    debajo. Un clic corriente lo cierra al momento, también si el enlace lleva a la página en la que ya se está;
 *  - cambia la ruta por otra vía (Atrás o Adelante del navegador) con el menú abierto.
 * No pinta nada (la cabecera sigue siendo un componente de servidor: solo esta isla hidrata).
 *
 * El botón que lo abre (`popovertarget`) cuenta como «dentro»: pasar de él al primer enlace y volver no cierra nada.
 */
export function MenuFocusGuard({ menuId }: { menuId: string }) {
  useEffect(() => {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    const button = document.querySelector<HTMLElement>(`[popovertarget="${menuId}"]`);
    const inside = button ? [menu, button] : [menu];
    const close = (): void => {
      try {
        menu.hidePopover();
      } catch {
        // Navegador sin API de popover, o ya cerrado: no hay nada que cerrar.
      }
    };
    const onFocusOut = (event: FocusEvent): void => {
      if (closesOnFocusOut(inside, event.relatedTarget)) close();
    };
    const onClick = (event: MouseEvent): void => {
      if (!isPlainClick(event)) return;
      if (event.target instanceof Element && event.target.closest('a[href]')) close();
    };
    menu.addEventListener('focusout', onFocusOut);
    menu.addEventListener('click', onClick);
    button?.addEventListener('focusout', onFocusOut);
    return () => {
      menu.removeEventListener('focusout', onFocusOut);
      menu.removeEventListener('click', onClick);
      button?.removeEventListener('focusout', onFocusOut);
    };
  }, [menuId]);

  // Atrás y Adelante cambian la ruta sin pasar por un enlace del menú. La primera lectura no cierra nada.
  const pathname = usePathname();
  const lastPathname = useRef(pathname);
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    try {
      document.getElementById(menuId)?.hidePopover();
    } catch {
      // Navegador sin API de popover, o ya cerrado.
    }
  }, [pathname, menuId]);

  return null;
}
