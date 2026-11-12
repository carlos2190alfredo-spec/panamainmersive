'use client';

import { useEffect } from 'react';

/**
 * Profundidad «espacial» del héroe (ADR-0026): con un puntero fino que puede pasar por encima y SIN preferencia de
 * movimiento reducido, publica `--depth-x` y `--depth-y` (de −1 a 1, desde el centro del escenario) en el istmo del héroe
 * (no en toda la sección: cada cuadro invalidaría el estilo de texto y buscador) y las capas `data-depth` se desplazan con
 * distinta amplitud (IsthmusMap.module.css). Con táctil (también el dedo en un portátil táctil, cuyo puntero principal es
 * fino), teclado o `reduce` no hace nada y todo queda quieto. Un `requestAnimationFrame` por cuadro como mucho, con la
 * ÚLTIMA posición del cuadro; `reset` cancela el cuadro pendiente (si no, lo volvía a desplazar con el cursor ya fuera).
 * `style.setProperty` es CSSOM (la CSP lo admite). Marca el escenario con `data-depth-ready` al escuchar (lo esperan las
 * pruebas: mover el ratón antes de hidratar no prueba nada).
 */
export function DepthStage({ stageId }: { stageId: string }) {
  useEffect(() => {
    const stage = document.getElementById(stageId);
    const target = stage?.querySelector<SVGElement>('[data-isthmus="hero"]');
    const query = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    );
    if (!stage || !target) return;
    let frame = 0;
    let lastX = 0;
    let lastY = 0;
    const reset = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      target.style.setProperty('--depth-x', '0');
      target.style.setProperty('--depth-y', '0');
    };
    const onMove = (event: PointerEvent): void => {
      if (!query.matches || event.pointerType === 'touch') return;
      lastX = event.clientX;
      lastY = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = stage.getBoundingClientRect();
        const x = ((lastX - box.left) / box.width) * 2 - 1;
        const y = ((lastY - box.top) / box.height) * 2 - 1;
        target.style.setProperty('--depth-x', Math.max(-1, Math.min(1, x)).toFixed(3));
        target.style.setProperty('--depth-y', Math.max(-1, Math.min(1, y)).toFixed(3));
      });
    };
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', reset);
    query.addEventListener('change', reset);
    stage.setAttribute('data-depth-ready', '');
    return () => {
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', reset);
      query.removeEventListener('change', reset);
      stage.removeAttribute('data-depth-ready');
      reset();
    };
  }, [stageId]);
  return null;
}
