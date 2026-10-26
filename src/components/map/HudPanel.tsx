'use client';

import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from './HudPanel.module.css';
import { revealInSheet } from './sheet-store';
import { useHydrated, useMapUrlState } from './use-map-url-state';

/**
 * Cuando aparece un área en la URL (`a`: un clic en el mapa, la lista por teclado, un enlace) el panel se abre solo:
 * la ficha del área que acaba de elegirse no puede quedar plegada y sin anunciarse. Va aparte, dentro de su propio
 * `<Suspense>`, porque `useSearchParams` obliga a ello en una página estática y el panel no debe esperar por él.
 */
function AreaWatcher({ onArea }: { onArea: () => void }) {
  const { state } = useMapUrlState();
  const area = state.area;
  useEffect(() => {
    if (area) onArea();
  }, [area, onArea]);
  return null;
}

/**
 * Panel derecho del HUD de Explorar (el ÚNICO `<aside>` de la página): ficha del área elegida, áreas en la vista,
 * créditos y enlaces. Plegable en escritorio con un botón (`aria-expanded`/`aria-controls`); plegado se queda en un
 * botón de 44 px y su contenido desaparece (`display: none`: ni se ve ni se tabula). En móvil el panel es la última
 * sección de la hoja inferior y va siempre abierto (el botón no existe); elegir un área abre la hoja y llega hasta él.
 *
 * Estados (`data-state`): `pending` mientras no hay JavaScript (un botón sin función sería un control muerto: el panel
 * solo repite lo que el pie ya enlaza), `closed` (por defecto tras hidratar: el mapa manda) y `open`.
 */
export function HudPanel({
  label,
  title,
  className,
  children,
}: {
  /** Nombre del landmark (`Explore.panelLabel`). */
  label: string;
  /** Rótulo visible de la cabecera del panel. */
  title: string;
  className?: string | undefined;
  children: ReactNode;
}) {
  const t = useTranslations('Map');
  const hydrated = useHydrated();
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const openPanel = useCallback(() => {
    setOpen(true);
    // En móvil el panel vive dentro de la hoja inferior: se abre y se desplaza hasta la ficha del área elegida.
    revealInSheet(() => panelRef.current);
  }, []);
  const state = !hydrated ? 'pending' : open ? 'open' : 'closed';

  return (
    <aside
      ref={panelRef}
      className={[styles.panel, className].filter(Boolean).join(' ')}
      aria-label={label}
      data-hud-zone="panel"
      data-state={state}
    >
      <div className={styles.head}>
        <p className={styles.title}>{title}</p>
        {hydrated ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={bodyId}
            // Plegado, el botón lleva su propio rótulo visible (el nombre accesible ES ese texto, WCAG 2.5.3); abierto,
            // es solo el icono de cerrar y su nombre lo da el mensaje.
            aria-label={open ? t('panel.toggle') : undefined}
            onClick={() => {
              setOpen((value) => !value);
            }}
          >
            <span className={styles.icon} aria-hidden="true" />
            {open ? null : <span className={styles.toggleText}>{title}</span>}
          </button>
        ) : null}
      </div>
      <div id={bodyId} className={styles.body}>
        {children}
      </div>
      <Suspense fallback={null}>
        <AreaWatcher onArea={openPanel} />
      </Suspense>
    </aside>
  );
}
