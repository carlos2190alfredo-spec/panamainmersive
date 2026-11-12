'use client';

import { useEffect } from 'react';

/**
 * Marca en la barra de paradas la escena que está a la vista (`aria-current="step"` en su enlace), llena la pista hasta el
 * CENTRO de esa parada (`--travesia-progress`, `(índice + 0,5) / total`: así coincide con su columna cuando las nueve
 * caben) y publica en su sección el alto real de la barra (`--travesia-rail-h`, 0 si no está pegada), que usa el
 * `scroll-margin` de las escenas y sus enlaces para que el foco y las anclas no queden debajo (WCAG 2.4.11). No pinta
 * nada; sin JavaScript la barra es una lista de enlaces que funciona igual. `style.setProperty` es CSSOM: la CSP lo
 * admite (no es `style=""`). En la sección y no en `<html>`: una propiedad heredable en la raíz invalida el estilo de
 * todo el documento.
 *
 * Cuál es «la actual»: de las escenas que cruzan la franja de lectura (el 10 % central de lo que queda VISIBLE bajo la
 * cabecera y la barra), la que contiene su línea central o, si ninguna, la de borde más cercano a ella. Se guarda el
 * CONJUNTO de las que cruzan (r:JS-1): con solo las entradas que cambian, al invertir el sentido con dos escenas dentro se
 * quedaba marcada la que ya había salido. Los cambios de tamaño se agrupan en un cuadro y el observador solo se rehace si
 * cambian el alto de la barra o el de la ventana.
 */
export function TravesiaProgress() {
  useEffect(() => {
    const rail = document.querySelector<HTMLElement>('[data-travesia-rail]');
    const stops = [...document.querySelectorAll<HTMLElement>('[data-travesia-stop]')];
    if (!rail || stops.length === 0) return;
    const section = rail.closest('section') ?? document.documentElement;
    const links = new Map(
      [...rail.querySelectorAll<HTMLAnchorElement>('[data-travesia-link]')].map((a) => [
        a.dataset.travesiaLink,
        a,
      ]),
    );
    const inside = new Set<HTMLElement>();
    let current: string | undefined;
    let observer: IntersectionObserver | undefined;

    // Lo que tapan arriba la cabecera fija y la barra (esta, solo si está pegada: con poca altura no lo está).
    const railHeight = (): number =>
      getComputedStyle(rail).position === 'sticky' ? rail.offsetHeight : 0;
    const covered = (): number =>
      (document.querySelector('header')?.getBoundingClientRect().height ?? 0) + railHeight();

    const mark = (key: string | undefined): void => {
      const index = stops.findIndex((s) => s.dataset.travesiaStop === key);
      if (index < 0 || key === current) return;
      current = key;
      for (const [k, a] of links) {
        if (k === key) a.setAttribute('aria-current', 'step');
        else a.removeAttribute('aria-current');
      }
      rail.style.setProperty('--travesia-progress', ((index + 0.5) / stops.length).toFixed(4));
      // La lista desplaza en horizontal en pantallas estrechas: se lleva la parada actual a la vista desplazando SOLO la
      // lista (nunca `scrollIntoView`, que movería también la página).
      const link = links.get(key);
      const list = link?.closest('ol');
      if (list && link && list.scrollWidth > list.clientWidth) {
        list.scrollTo({ left: link.offsetLeft - list.clientWidth / 2 + link.offsetWidth / 2 });
      }
    };

    const pick = (): void => {
      if (inside.size === 0) return; // entre dos escenas: se queda la última marcada
      const top = covered();
      const line = top + (window.innerHeight - top) / 2;
      let best: HTMLElement | undefined;
      let distance = Infinity;
      for (const s of inside) {
        // Distancia de la línea de lectura a la escena: 0 si la contiene; si no, a su borde más cercano.
        const box = s.getBoundingClientRect();
        const d =
          box.top <= line && line <= box.bottom
            ? 0
            : Math.min(Math.abs(box.top - line), Math.abs(box.bottom - line));
        if (d < distance) {
          distance = d;
          best = s;
        }
      }
      mark(best?.dataset.travesiaStop);
    };

    // La franja de lectura depende de lo que tapan cabecera y barra: se rehace el observador cuando cambian.
    let measured = '';
    let frame = 0;
    const observe = (): void => {
      frame = 0;
      const railH = railHeight();
      const key = `${String(railH)}×${String(window.innerHeight)}`;
      if (key === measured) return;
      measured = key;
      section.style.setProperty('--travesia-rail-h', `${String(railH)}px`);
      if (typeof IntersectionObserver === 'undefined') return;
      const top = covered();
      observer?.disconnect();
      inside.clear();
      const visible = Math.max(1, window.innerHeight - top);
      const band = visible * 0.1;
      const above = top + (visible - band) / 2;
      const below = window.innerHeight - above - band;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const el = entry.target as HTMLElement;
            if (entry.isIntersecting) inside.add(el);
            else inside.delete(el);
          }
          pick();
        },
        { rootMargin: `${String(-Math.round(above))}px 0px ${String(-Math.round(below))}px 0px` },
      );
      for (const s of stops) observer.observe(s);
    };
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(observe);
    };

    observe();
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    resize?.observe(rail);
    window.addEventListener('resize', schedule);
    return () => {
      observer?.disconnect();
      resize?.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
      section.style.removeProperty('--travesia-rail-h');
    };
  }, []);
  return null;
}
