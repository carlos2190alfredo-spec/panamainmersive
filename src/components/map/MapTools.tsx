'use client';

import { useTranslations } from 'next-intl';
import { Suspense, useRef, useSyncExternalStore } from 'react';
import {
  DEFAULT_MAP_LAYERS,
  MAP_LAYER_IDS,
  allowedLayers,
  type MapLayerId,
} from '@/domains/geography/map-url-state';
import { CAROUSEL_UNAVAILABLE_ID, requestPitch, useHudStore } from './hud-store';
import { LAYERS_GROUP_ID, LEGEND_GROUP_ID } from './hud-ids';
import styles from './MapTools.module.css';
import {
  isMobileLayout,
  isSheetOpen,
  revealInSheet,
  useMobileLayout,
  useSheetOpen,
} from './sheet-store';
import { readMapUrlState, useHydrated, useMapUrlState, writeLayers } from './use-map-url-state';

/** Cabeceo (grados) al activar el relieve en 3D: lo justo para que se distinga sin perder el mapa de vista. */
const TILT_DEGREES = 55;

const GROUP_IDS = [LAYERS_GROUP_ID, LEGEND_GROUP_ID] as const;

const groups = (): HTMLDetailsElement[] =>
  GROUP_IDS.map((id) => document.getElementById(id)).filter(
    (el): el is HTMLDetailsElement => el instanceof HTMLDetailsElement,
  );

/** ¿Está desplegado el grupo «Capas» del carril? (también cuando la persona lo abre o lo cierra con su propio botón) */
function useLayersGroupOpen(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const els = groups();
      for (const el of els) el.addEventListener('toggle', notify);
      return () => {
        for (const el of els) el.removeEventListener('toggle', notify);
      };
    },
    () => document.getElementById(LAYERS_GROUP_ID)?.hasAttribute('open') ?? false,
    () => false,
  );
}

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Tools({ terrainAllowed }: { terrainAllowed: boolean }) {
  const t = useTranslations('Map');
  const hydrated = useHydrated();
  const { mapStatus } = useHudStore();
  const { state } = useMapUrlState();
  // En móvil las capas y la leyenda viven DENTRO de la hoja inferior: solo están «abiertas» si la hoja también lo está.
  const mobile = useMobileLayout();
  const sheetOpen = useSheetOpen();
  const layersOpen = useLayersGroupOpen() && (!mobile || sheetOpen);
  /** Si el botón añadió el sombreado (no lo había pedido la persona), al apagar el 3D se retira con él. */
  const addedHillshade = useRef(false);

  const active = allowedLayers(state.layers ?? DEFAULT_MAP_LAYERS, terrainAllowed);
  const threeD = active.includes('terrain3d');
  const unavailable = mapStatus === 'unavailable';
  // Sin mapa listo no hay nada que inclinar; sin derechos tampoco. El motivo va como descripción y como `title`.
  const reason = !terrainAllowed
    ? t('layers.rightsPending')
    : unavailable
      ? t('hud.mapUnavailable')
      : null;
  const threeDDisabled = !hydrated || mapStatus !== 'ready' || !terrainAllowed;

  /** Capas actuales LEÍDAS DE LA URL (no del render): dos pulsaciones seguidas no pueden usar un estado viejo. */
  const currentLayers = (): readonly MapLayerId[] =>
    allowedLayers(
      readMapUrlState(window.location.search).state.layers ?? DEFAULT_MAP_LAYERS,
      terrainAllowed,
    );

  /**
   * Solo al pulsar (nunca por defecto): el relieve de AWS se pide cuando `l` lleva `terrain3d`. Se añade también el
   * sombreado, sin el cual el relieve en 3D casi no se distingue (el terreno se dibuja sin luz), y se inclina la cámara.
   */
  function toggleThreeD(): void {
    const current = currentLayers();
    if (current.includes('terrain3d')) {
      const dropHillshade = addedHillshade.current;
      addedHillshade.current = false;
      writeLayers(
        MAP_LAYER_IDS.filter(
          (id) =>
            current.includes(id) && id !== 'terrain3d' && !(dropHillshade && id === 'hillshade'),
        ),
      );
      requestPitch(0);
      return;
    }
    addedHillshade.current = !current.includes('hillshade');
    writeLayers(
      MAP_LAYER_IDS.filter(
        (id) => current.includes(id) || id === 'terrain3d' || id === 'hillshade',
      ),
    );
    requestPitch(TILT_DEGREES);
  }

  /**
   * Abre o cierra, a la vez, los grupos «Capas» y «Leyenda» del carril (plegados por defecto) y trae el de capas a la vista.
   * En móvil, con la hoja cerrada, el botón abre la hoja Y los grupos (no hay nada que ver en un grupo inerte): se
   * desplaza hasta ellos cuando la hoja terminó de abrirse.
   */
  function toggleLayers(): void {
    // Se lee del DOM (no del render): dos pulsaciones seguidas no pueden usar un estado que aún no se repintó.
    const current = (document.getElementById(LAYERS_GROUP_ID) as HTMLDetailsElement | null)?.open;
    const hiddenInSheet = isMobileLayout() && !isSheetOpen();
    const next = hiddenInSheet || !current;
    for (const el of groups()) el.open = next;
    if (!next) return;
    const layers = () => document.getElementById(LAYERS_GROUP_ID);
    if (isMobileLayout()) revealInSheet(layers);
    else {
      layers()?.scrollIntoView({
        block: 'nearest',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }
  }

  return (
    <div
      role="group"
      className={styles.tools}
      aria-label={t('tools.label')}
      data-hud-island="tools"
    >
      <button
        type="button"
        className={styles.tool}
        aria-pressed={threeD}
        // El nombre accesible CONTIENE el texto visible («3D», WCAG 2.5.3).
        aria-label={t('tools.threeD')}
        aria-describedby={
          reason === null
            ? undefined
            : !terrainAllowed
              ? 'layer-hint-terrain3d'
              : CAROUSEL_UNAVAILABLE_ID
        }
        title={reason ?? undefined}
        disabled={threeDDisabled}
        onClick={toggleThreeD}
      >
        <span aria-hidden="true">{t('tools.threeDShort')}</span>
      </button>
      <button
        type="button"
        className={styles.tool}
        aria-expanded={layersOpen}
        aria-controls={GROUP_IDS.join(' ')}
        aria-label={t('tools.layersOpen')}
        disabled={!hydrated}
        onClick={toggleLayers}
      >
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
          <path d="m3 12 9 4.5 9-4.5" />
          <path d="m3 16.5 9 4.5 9-4.5" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Herramientas del mapa (zona `tools` del HUD, columna derecha, bajo el zoom y la brújula nativos de MapLibre):
 *  - «Relieve en 3D» (`aria-pressed`): activa SOLO cuando la persona lo pide el relieve de terceros (AWS), escribe `l`
 *    en la URL, inclina la cámara y muestra el mismo aviso de terceros que la casilla (lo pinta el lienzo). Se apaga
 *    con su motivo si el mapa no está listo o los derechos no lo permiten.
 *  - «Capas y leyenda» (`aria-expanded`): despliega o pliega los grupos del carril.
 * No hay botones de ubicación ni de pantalla completa (ADR-0025 §9). Isla de cliente (llega tras hidratar).
 */
export function MapTools({ terrainAllowed }: { terrainAllowed: boolean }) {
  return (
    <Suspense fallback={null}>
      <Tools terrainAllowed={terrainAllowed} />
    </Suspense>
  );
}
