'use client';

import { useTranslations } from 'next-intl';
import { Suspense, useId } from 'react';
import { DEFAULT_MAP_LAYERS, allowedLayers } from '@/domains/geography/map-url-state';
import { Link } from '@/i18n/navigation';
import { requestFrameDestination, requestStopTour, requestTour, useHudStore } from './hud-store';
import { enableRelief, reliefInUse } from './relief';
import { isMobileLayout, isSheetOpen, setSheetOpen } from './sheet-store';
import styles from './SelectedDestinationCard.module.css';
import type { SelectedItem } from './map-data';
import { clearDestination, useMapUrlState } from './use-map-url-state';

function Card({
  items,
  className,
  terrainAllowed,
}: {
  items: readonly SelectedItem[];
  className: string | undefined;
  terrainAllowed: boolean;
}) {
  const t = useTranslations('Map');
  const { state } = useMapUrlState();
  const { mapStatus, tour } = useHudStore();
  const reasonId = useId();
  const tourDescriptionId = useId();
  const tourNoticeId = useId();
  const tourRightsId = useId();
  const item = items.find((i) => i.key === state.destination);

  // Recorrido 3D (ADR-0027 A1): un vuelo alrededor del destino sobre el relieve de AWS. Lo pide SOLO la persona al pulsar; si
  // el relieve aún no está en uso, el aviso PREVIO dice a quién llegará la dirección IP (r3:F-01), visible y como descripción.
  // Durante el recorrido el mismo botón lo detiene. Sin mapa listo o sin derechos sobre el relieve no se ofrece, con su motivo.
  const touring = item !== undefined && tour?.key === item.key;
  const reliefOn = reliefInUse(allowedLayers(state.layers ?? DEFAULT_MAP_LAYERS, terrainAllowed));
  const tourDisabled = !touring && (mapStatus !== 'ready' || !terrainAllowed);
  // El aviso se ve mientras pulsar vaya a pedir algo a AWS (también mientras el mapa carga, para que la ficha no cambie de alto
  // al terminar); describe al botón solo cuando se puede pulsar (desactivado no envía nada a nadie).
  const showTourNotice = terrainAllowed && !reliefOn && mapStatus !== 'unavailable';
  const tourDescribedBy = [
    tourDescriptionId,
    showTourNotice && !tourDisabled ? tourNoticeId : null,
    !terrainAllowed ? tourRightsId : mapStatus === 'unavailable' ? reasonId : null,
  ]
    .filter(Boolean)
    .join(' ');

  // La región en vivo existe siempre; solo cambia su contenido (así el lector de pantalla anuncia la selección).
  return (
    <div
      aria-live="polite"
      className={[styles.region, className].filter(Boolean).join(' ')}
      data-hud-zone="featured"
    >
      {item ? (
        <section className={styles.card} aria-labelledby="selected-destination-name">
          <div className={styles.text}>
            <p className={styles.eyebrow}>{t('selectedHeading')}</p>
            <h2 id="selected-destination-name" className={styles.name}>
              {item.name}
            </h2>
            <p className={styles.meta}>
              <span className={styles.kind}>{item.kindLabel}</span>
              {item.badge}
            </p>
          </div>
          <Link
            className={styles.link}
            href={{ pathname: '/destinations/[slug]', params: { slug: item.slug } }}
          >
            {t('openFicha', { name: item.name })}
          </Link>
          <button
            type="button"
            className={styles.tour}
            disabled={tourDisabled}
            aria-describedby={tourDescribedBy}
            data-tour-button={touring ? 'running' : 'idle'}
            onClick={() => {
              if (touring) {
                requestStopTour();
                return;
              }
              enableRelief(terrainAllowed);
              requestTour(item.key);
              // En móvil el botón vive en la hoja inferior, que abierta tapa más de la mitad del mapa (y el aviso de estado
              // de AWS ocupaba lo que quedaba): se pliega para ver el vuelo. Este botón queda entonces inerte, así que el foco
              // pasa al asa (abrirla de nuevo da «Detener el recorrido»; un gesto sobre el mapa también lo para).
              if (isMobileLayout() && isSheetOpen()) {
                setSheetOpen(false);
                document.querySelector<HTMLElement>('[data-sheet-handle]')?.focus();
              }
            }}
          >
            {touring ? t('tour.stop') : t('tour.start')}
          </button>
          <p id={tourDescriptionId} className="visually-hidden">
            {t('tour.description')}
          </p>
          <div className={styles.notes}>
            <p className={styles.note}>{t('referencePoint')}</p>
            {showTourNotice ? (
              <p id={tourNoticeId} className={styles.note} data-tour-notice>
                {t('tour.notice')}
              </p>
            ) : null}
          </div>
          <div className={styles.actions}>
            {/* Vuelve a encuadrar el destino: la cámara explícita (`c`) gana a `d`, así que elegirlo otra vez no basta.
                Depende del mapa: hasta que está listo (o si no habrá mapa) no se ofrece, y se dice por qué. */}
            <button
              type="button"
              className={styles.secondary}
              disabled={mapStatus !== 'ready'}
              aria-describedby={mapStatus === 'unavailable' ? reasonId : undefined}
              onClick={() => {
                requestFrameDestination(item.key);
              }}
            >
              {t('featured.reframe')}
            </button>
            <button type="button" className={styles.secondary} onClick={clearDestination}>
              {t('clearSelection')}
            </button>
          </div>
          {mapStatus === 'unavailable' ? (
            <p id={reasonId} className={styles.reason}>
              {t('hud.mapUnavailable')}
            </p>
          ) : !terrainAllowed ? (
            <p id={tourRightsId} className={styles.reason}>
              {t('tour.rightsPending')}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export function SelectedDestinationCard({
  items,
  className,
  terrainAllowed,
}: {
  items: readonly SelectedItem[];
  className?: string | undefined;
  /** ¿Permiten los derechos el relieve de terceros? Sin él no hay recorrido 3D (se dice por qué). */
  terrainAllowed: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <Card items={items} className={className} terrainAllowed={terrainAllowed} />
    </Suspense>
  );
}
