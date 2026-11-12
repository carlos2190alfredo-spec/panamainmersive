'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './ScrollRegion.module.css';

/**
 * Contenedor con desplazamiento horizontal (tablas anchas en pantallas estrechas).
 * Es una región con nombre y enfocable: sin `tabIndex`, quien usa solo teclado no podría
 * desplazarla (WCAG 2.1.1; regla axe `scrollable-region-focusable`).
 *
 * Avisa de que hay más contenido (r1:V-14): en un teléfono la columna «Observación» quedaba FUERA de la pantalla y solo asomaba
 * un fragmento cortado, sin sombra ni rótulo que dijera que se desplaza. Una sombra en el borde (inicio y/o fin) aparece
 * mientras queda contenido por ese lado y desaparece al llegar al otro extremo o cuando la tabla cabe entera. La calcula un
 * efecto del cliente (tamaño de la caja y del contenido + `scroll`), que es lo único que funciona igual en todos los
 * navegadores; sin JavaScript, en pantallas estrechas se muestra la del final siempre (el CSS lo decide con
 * `@media (scripting: none)`). Es un componente de cliente que recibe como `children` la tabla ya renderizada en el servidor.
 *
 * Nombre: lo da el encabezado `labelledBy`. La sección que contiene el encabezado y la tabla NO debe llevar el mismo nombre
 * (r2:F1, axe `landmark-unique`): sin `aria-labelledby` una `<section>` no es un hito y solo queda esta región.
 */

interface Edges {
  start: boolean;
  end: boolean;
}

/** ¿Queda contenido por desplazar hacia el inicio y/o el final? `scrollLeft` es negativo en RTL: se usa su valor absoluto. */
export function scrollEdges(box: {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
}): Edges {
  const room = box.scrollWidth - box.clientWidth;
  if (room <= 1) return { start: false, end: false };
  const position = Math.abs(box.scrollLeft);
  return { start: position > 1, end: position < room - 1 };
}

export function ScrollRegion({
  labelledBy,
  children,
}: {
  /** `id` del encabezado que nombra la región. */
  labelledBy: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<Edges | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = (): void => {
      const next = scrollEdges(el);
      setEdges((prev) =>
        prev && prev.start === next.start && prev.end === next.end ? prev : next,
      );
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(el);
      for (const child of el.children) observer.observe(child);
    }
    return () => {
      el.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      className={styles.root}
      data-ready={edges ? '' : undefined}
      data-more-start={edges?.start ? '' : undefined}
      data-more-end={edges?.end ? '' : undefined}
    >
      <div
        ref={box}
        className={styles.scroll}
        role="region"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- región desplazable: debe ser enfocable (2.1.1)
        tabIndex={0}
        aria-labelledby={labelledBy}
      >
        {children}
      </div>
    </div>
  );
}
