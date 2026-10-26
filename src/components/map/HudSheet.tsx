'use client';

import { useTranslations } from 'next-intl';
import {
  Suspense,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { DestinationKey } from '@/domains/tourism/destinations';
import { useHudStore } from './hud-store';
import styles from './HudSheet.module.css';
import { decideSheetDrag } from './sheet-gesture';
import { resetSheetStore, setSheetOpen, useMobileLayout, useSheetOpen } from './sheet-store';
import { useHydrated, useMapUrlState } from './use-map-url-state';

/** Lo mínimo de cada destino para el resumen de la hoja cerrada (la ficha completa vive dentro de la hoja). */
export interface SheetSummaryItem {
  readonly key: DestinationKey;
  readonly name: string;
  readonly kindLabel: string;
}

/**
 * Resumen del destino elegido en la hoja CERRADA (solo móvil): es la región en vivo mientras la ficha (dentro del cuerpo,
 * inerte) no puede hablar. Con la hoja abierta (o en escritorio) se queda vacía y anuncia la ficha, para que la elección
 * no se diga dos veces.
 * `useMapUrlState` exige un `<Suspense>` (la página es estática).
 */
function Summary({
  items,
  open,
  mobile,
}: {
  items: readonly SheetSummaryItem[];
  open: boolean;
  mobile: boolean;
}) {
  const t = useTranslations('Map');
  const { state } = useMapUrlState();
  // Solo en móvil y con la hoja cerrada: en escritorio la ficha del HUD está a la vista y el resumen repetiría su texto
  // (oculto por CSS, pero en el DOM: «Destino seleccionado» saldría dos veces para cualquier búsqueda por texto).
  const item = open || !mobile ? undefined : items.find((i) => i.key === state.destination);
  return (
    <div className={styles.summary} aria-live="polite" data-sheet-summary>
      {item ? (
        <p className={styles.selected} data-sheet-selected>
          <span className="visually-hidden">{t('selectedHeading')}</span>
          <span className="visually-hidden">{': '}</span>
          <strong className={styles.name}>{item.name}</strong>
          <span className={styles.kind}>{item.kindLabel}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Hoja inferior de Explorar en móvil (< 56rem; ADR-0025 §8). Con el mapa a pantalla completa, todo el HUD que no flota
 * sobre el mapa (buscador, filtro por tipo, capas y leyenda, ficha, carrusel, información del mapa y los enlaces que
 * el pie ya no deja alcanzar) va DENTRO de ella. Es el MISMO DOM que en escritorio: allí la hoja no es una caja
 * (`display: contents`) y sus zonas son celdas de la rejilla del HUD; no se duplica ni se mueve nada.
 *
 * Dos detentes:
 *  - cerrada: el asa, el título (`<h1>`) y, si hay un destino elegido, su nombre y tipo;
 *  - abierta (≈ 60dvh): el cuerpo, con su propio desplazamiento.
 *
 * Reglas (con prueba):
 *  - Se maneja con un `<button>` (`aria-expanded`/`aria-controls`): sin gesto obligatorio. El arrastre vertical del asa es
 *    una mejora (`decideSheetDrag`). Escape la cierra y devuelve el foco al asa (salvo que Escape ya lo hubiera usado el
 *    buscador para vaciarse).
 *  - Cerrada, el cuerpo es `inert` (y `visibility: hidden` por CSS): nada plegado se ve, se tabula ni se lee. En escritorio
 *    no se pliega nada: `inert` solo con la presentación móvil.
 *  - Sin mapa (sin WebGL2, sin datos, con error, bloqueado) se abre sola una vez: la lista de destinos es entonces la
 *    pantalla, no un extra.
 *  - Sin JavaScript no hay asa (sería un control muerto): el CSS muestra el cuerpo entero bajo el mapa
 *    (`@media (scripting: none)`). Antes de hidratar, el estado es `pending` y se ve como cerrada.
 *  - El alto que ocupa se publica en `--sheet-h` del contenedor inmersivo: los créditos y la escala del mapa quedan
 *    SIEMPRE por encima de ella (la licencia ODbL obliga a que se vean).
 */
export function HudSheet({
  title,
  items,
  children,
}: {
  /** El `<h1>` de la pantalla (lo pinta el servidor: en escritorio es el título del carril). */
  title: ReactNode;
  items: readonly SheetSummaryItem[];
  children: ReactNode;
}) {
  const t = useTranslations('Map');
  const hydrated = useHydrated();
  const open = useSheetOpen();
  const mobile = useMobileLayout();
  const { mapStatus } = useHudStore();
  const bodyId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; startY: number; dy: number } | null>(null);
  const swallowClick = useRef(false);
  const state = !hydrated ? 'pending' : open ? 'open' : 'closed';
  const folded = hydrated && mobile && !open;

  // La hoja no sobrevive a la visita: al volver a Explorar arranca cerrada.
  useEffect(() => resetSheetStore, []);

  // Sin mapa (sin WebGL2, sin datos, con error o bloqueado por derechos) la lista de destinos ES la pantalla: no puede
  // quedar plegada tras un asa. Se abre UNA vez; si la persona la cierra, no se vuelve a abrir sola.
  const openedForNoMap = useRef(false);
  useEffect(() => {
    if (mapStatus !== 'unavailable' || openedForNoMap.current) return;
    openedForNoMap.current = true;
    setSheetOpen(true);
  }, [mapStatus]);

  // El alto real de la hoja (cambia al abrir, al elegir un destino y con el tamaño del texto) se publica para que los
  // controles de MapLibre de abajo (créditos y escala) queden por encima. `style.setProperty` es CSSOM: la CSP lo admite.
  useEffect(() => {
    const root = rootRef.current;
    const shell = root?.closest<HTMLElement>('[data-immersive]');
    if (!root || !shell) return;
    const publish = () => {
      shell.style.setProperty(
        '--sheet-h',
        `${String(Math.round(root.getBoundingClientRect().height))}px`,
      );
    };
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(root);
    return () => {
      observer?.disconnect();
      shell.style.removeProperty('--sheet-h');
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Escape' || event.defaultPrevented || !open || !mobile) return;
    // El buscador usa Escape para vaciarse (y lo marca como atendido): solo con el campo vacío cierra la hoja.
    event.preventDefault();
    setSheetOpen(false);
    handleRef.current?.focus();
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag.current = { id: event.pointerId, startY: event.clientY, dy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>): void {
    const current = drag.current;
    if (current?.id === event.pointerId) current.dy = event.clientY - current.startY;
  }

  function onPointerEnd(event: PointerEvent<HTMLButtonElement>): void {
    const current = drag.current;
    if (current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.type === 'pointercancel') return;
    const result = decideSheetDrag(current.dy);
    if (result === 'tap') return; // lo resuelve el `click` del botón
    setSheetOpen(result === 'open');
    // Tras un arrastre el navegador aún dispara el `click` del botón: no debe deshacer lo decidido.
    swallowClick.current = true;
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 60);
  }

  return (
    // El contenedor no es interactivo ni enfocable: solo recoge el Escape que burbujea desde sus hijos (el asa, el buscador…).
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={rootRef}
      className={styles.sheet}
      data-hud-zone="sheet"
      data-state={state}
      onKeyDown={onKeyDown}
    >
      <div className={styles.head}>
        {hydrated ? (
          <button
            ref={handleRef}
            type="button"
            className={styles.handle}
            data-sheet-handle
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? t('sheet.close') : t('sheet.open')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onClick={() => {
              if (swallowClick.current) return;
              setSheetOpen(!open);
            }}
          >
            <span className={styles.grip} aria-hidden="true" />
          </button>
        ) : (
          <span className={styles.handle} aria-hidden="true">
            <span className={styles.grip} />
          </span>
        )}
        {title}
        <span className={styles.chevron} aria-hidden="true" />
        <Suspense fallback={null}>
          <Summary items={items} open={open} mobile={mobile} />
        </Suspense>
      </div>
      <div id={bodyId} className={styles.body} data-sheet-body inert={folded}>
        {children}
      </div>
    </div>
  );
}
