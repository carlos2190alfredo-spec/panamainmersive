'use client';

import { useTranslations } from 'next-intl';
import { Suspense, useId } from 'react';
import { Link } from '@/i18n/navigation';
import { requestFrameDestination, useHudStore } from './hud-store';
import styles from './SelectedDestinationCard.module.css';
import type { SelectedItem } from './map-data';
import { clearDestination, useMapUrlState } from './use-map-url-state';

function Card({
  items,
  className,
}: {
  items: readonly SelectedItem[];
  className: string | undefined;
}) {
  const t = useTranslations('Map');
  const { state } = useMapUrlState();
  const { mapStatus } = useHudStore();
  const reasonId = useId();
  const item = items.find((i) => i.key === state.destination);

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
          <p className={styles.note}>{t('referencePoint')}</p>
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
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export function SelectedDestinationCard({
  items,
  className,
}: {
  items: readonly SelectedItem[];
  className?: string | undefined;
}) {
  return (
    <Suspense fallback={null}>
      <Card items={items} className={className} />
    </Suspense>
  );
}
