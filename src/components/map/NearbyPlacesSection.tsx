'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Suspense, useEffect, useId, useRef } from 'react';
import type { DestinationKey } from '@/domains/tourism/destinations';
import { useRevealPanel } from './HudPanel';
import styles from './NearbyPlaces.module.css';
import {
  closeNearbyPlaces,
  openNearbyPlaces,
  resetPlacesStore,
  usePlacesStore,
} from './places-store';
import { isMobileLayout } from './sheet-store';
import { useMapUrlState } from './use-map-url-state';

/**
 * La lista (pestañas, petición a la API, validador) solo hace falta cuando la persona pide ver los lugares: se carga entonces,
 * no con la página (el JS inicial de Explorar tiene presupuesto, `docs/performance.md`).
 */
const NearbyPlacesBody = dynamic(() => import('./NearbyPlacesBody'), { ssr: false });

/**
 * Lleva el foco a `target` en cuanto se pueda: tras pedir que se abra el panel (escritorio) o la hoja (móvil), lo que hay dentro
 * sigue oculto o inerte uno o varios cuadros. Se reintenta cuadro a cuadro (≈ medio segundo como mucho).
 */
function focusWhenReachable(target: () => HTMLElement | null, tries = 30): void {
  const el = target();
  if (el) {
    // En móvil el desplazamiento lo hace `revealInSheet` (solo el cuerpo de la hoja, nunca la página).
    el.focus({ preventScroll: isMobileLayout() });
    if (document.activeElement === el) return;
  }
  if (tries > 0) {
    requestAnimationFrame(() => {
      focusWhenReachable(target, tries - 1);
    });
  }
}

export interface PlacesSectionItem {
  readonly key: DestinationKey;
  readonly name: string;
}

function Section({ items }: { items: readonly PlacesSectionItem[] }) {
  const t = useTranslations('Map.places');
  const { state } = useMapUrlState();
  const { open, revealRequest } = usePlacesStore();
  const reveal = useRevealPanel();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const handledReveal = useRef(revealRequest);
  const headingId = useId();
  const bodyId = useId();
  const item = items.find((i) => i.key === state.destination);

  // La ficha del destino pidió los lugares: se abre el panel (o la hoja) y el foco llega al encabezado de la lista.
  useEffect(() => {
    if (revealRequest === handledReveal.current) return;
    handledReveal.current = revealRequest;
    reveal(() => headingRef.current);
    focusWhenReachable(() => headingRef.current);
  }, [revealRequest, reveal]);

  // Al salir de Explorar no queda nada (ni la lista abierta ni puntos en un mapa que ya no existe).
  useEffect(
    () => () => {
      resetPlacesStore();
    },
    [],
  );

  if (!item) return null;
  return (
    <section className={styles.section} aria-labelledby={headingId} data-places>
      <h2 ref={headingRef} id={headingId} className={styles.heading} tabIndex={-1}>
        {t('heading', { name: item.name })}
      </h2>
      <p className={styles.notice}>
        <span className={styles.tag}>{t('unverified')}</span> {t('notice')}
      </p>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          if (open) closeNearbyPlaces();
          else openNearbyPlaces(false);
        }}
      >
        {open ? t('hide') : t('show')}
      </button>
      <div id={bodyId} hidden={!open}>
        {/* Una lista por destino: al elegir otro, empieza de cero (pestaña, estado de la petición). */}
        {open ? <NearbyPlacesBody key={item.key} destination={item.key} /> : null}
      </div>
    </section>
  );
}

/**
 * Lugares cercanos SIN VERIFICAR del destino elegido (ADR-0027 A2), dentro del panel del HUD. Solo existe si los derechos de
 * Overture Places lo permiten (en producción, con su política `provisional`, no se ofrece) y si hay un destino elegido. Hasta que
 * la persona los pide no se descarga nada ni se pinta nada en el mapa.
 */
export function NearbyPlacesSection({
  items,
  allowed,
}: {
  items: readonly PlacesSectionItem[];
  allowed: boolean;
}) {
  if (!allowed) return null;
  return (
    <Suspense fallback={null}>
      <Section items={items} />
    </Suspense>
  );
}
