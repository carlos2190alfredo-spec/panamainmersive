import type { ReactNode } from 'react';
import styles from './ScrollRegion.module.css';

/**
 * Contenedor con desplazamiento horizontal (tablas anchas en pantallas estrechas).
 * Es una región con nombre y enfocable: sin `tabIndex`, quien usa solo teclado no podría
 * desplazarla (WCAG 2.1.1; regla axe `scrollable-region-focusable`).
 */
export function ScrollRegion({
  labelledBy,
  children,
}: {
  /** `id` del encabezado que nombra la región. */
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- región desplazable: debe ser enfocable (2.1.1)
    <div className={styles.scroll} role="region" tabIndex={0} aria-labelledby={labelledBy}>
      {children}
    </div>
  );
}
