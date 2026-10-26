import type { ReactNode } from 'react';
import styles from './HudGroup.module.css';

/**
 * Grupo plegable del HUD (filtro, capas, leyenda): un `<details>` NATIVO. Sin JavaScript, sin hidratación y con el
 * teclado y el anuncio de «expandido/contraído» que da el navegador. `open` decide si arranca desplegado.
 *
 * `<summary>` solo existe DESPUÉS de la cabecera: el selector de idioma debe seguir siendo el PRIMER `<summary>` del
 * DOM (varias pruebas E2E lo asumen). Componente de servidor.
 *
 * `id` permite que un control de otra zona (el botón «Capas y leyenda» de las herramientas del mapa) lo abra o lo
 * cierre; `data-hud-group` lo identifica en las pruebas sin depender del idioma del título.
 */
export function HudGroup({
  title,
  open = true,
  id,
  group,
  className,
  children,
}: {
  title: ReactNode;
  open?: boolean;
  id?: string | undefined;
  group?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      className={[styles.group, className].filter(Boolean).join(' ')}
      open={open}
      data-hud-group={group}
    >
      <summary className={styles.summary}>
        <span className={styles.title}>{title}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}
