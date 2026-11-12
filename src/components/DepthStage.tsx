'use client';

import { useEffect } from 'react';

/**
 * Profundidad «espacial» del héroe (ADR-0026): con un puntero fino que puede pasar por encima y SIN preferencia de
 * movimiento reducido, publica en el escenario `--depth-x` y `--depth-y` (de −1 a 1, desde su centro) y las capas
 * `data-depth` se desplazan con distinta amplitud (IsthmusMap.module.css). Con táctil, teclado o `reduce` no hace nada y
 * todo queda quieto. Un `requestAnimationFrame` por movimiento como mucho; `style.setProperty` es CSSOM (la CSP lo admite).
 */
export function DepthStage({ stageId }: { stageId: string }) {
  useEffect(() => {
    const stage = document.getElementById(stageId);
    const query = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    );
    if (!stage) return;
    let frame = 0;
    const reset = (): void => {
      stage.style.setProperty('--depth-x', '0');
      stage.style.setProperty('--depth-y', '0');
    };
    const onMove = (event: PointerEvent): void => {
      if (!query.matches || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = stage.getBoundingClientRect();
        const x = ((event.clientX - box.left) / box.width) * 2 - 1;
        const y = ((event.clientY - box.top) / box.height) * 2 - 1;
        stage.style.setProperty('--depth-x', Math.max(-1, Math.min(1, x)).toFixed(3));
        stage.style.setProperty('--depth-y', Math.max(-1, Math.min(1, y)).toFixed(3));
      });
    };
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', reset);
    query.addEventListener('change', reset);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', reset);
      query.removeEventListener('change', reset);
      reset();
    };
  }, [stageId]);
  return null;
}
