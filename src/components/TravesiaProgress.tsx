'use client';

import { useEffect } from 'react';

/**
 * Marca en la barra de paradas la escena que está a la vista (`aria-current="step"` en su enlace) y publica en la barra
 * `--travesia-progress` (0 al oeste, 1 al este) para llenarla. No pinta nada; sin JavaScript la barra es una lista de
 * enlaces que funciona igual. `style.setProperty` es CSSOM: la CSP lo admite (no es `style=""`).
 */
export function TravesiaProgress() {
  useEffect(() => {
    const rail = document.querySelector<HTMLElement>('[data-travesia-rail]');
    const stops = [...document.querySelectorAll<HTMLElement>('[data-travesia-stop]')];
    if (!rail || stops.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const links = new Map(
      [...rail.querySelectorAll<HTMLAnchorElement>('[data-travesia-link]')].map((a) => [
        a.dataset.travesiaLink,
        a,
      ]),
    );
    const last = Math.max(1, stops.length - 1);
    const mark = (key: string | undefined): void => {
      const index = stops.findIndex((s) => s.dataset.travesiaStop === key);
      if (index < 0) return;
      for (const [k, a] of links) {
        if (k === key) a.setAttribute('aria-current', 'step');
        else a.removeAttribute('aria-current');
      }
      rail.style.setProperty('--travesia-progress', String(index / last));
      // La lista desplaza en horizontal en pantallas estrechas: se lleva la parada actual a la vista desplazando SOLO la
      // lista (nunca `scrollIntoView`, que movería también la página).
      const list = links.get(key)?.closest('ol');
      const link = links.get(key);
      if (list && link && list.scrollWidth > list.clientWidth) {
        list.scrollTo({ left: link.offsetLeft - list.clientWidth / 2 + link.offsetWidth / 2 });
      }
    };
    // Cuenta la escena que cruza la franja central de la pantalla (no la primera que asoma por abajo).
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) mark((entry.target as HTMLElement).dataset.travesiaStop);
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const s of stops) observer.observe(s);
    return () => {
      observer.disconnect();
    };
  }, []);
  return null;
}
