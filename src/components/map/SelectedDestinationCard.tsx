'use client';

import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import styles from './SelectedDestinationCard.module.css';
import type { SelectedItem } from './map-data';
import { clearDestination, useMapUrlState } from './use-map-url-state';

function Card({ items }: { items: readonly SelectedItem[] }) {
  const t = useTranslations('Map');
  const { state } = useMapUrlState();
  const item = items.find((i) => i.key === state.destination);

  // La región en vivo existe siempre; solo cambia su contenido (así el lector de pantalla anuncia la selección).
  return (
    <div aria-live="polite" className={styles.region}>
      {item ? (
        <section className={styles.card} aria-labelledby="selected-destination-name">
          <p className={styles.eyebrow}>{t('selectedHeading')}</p>
          <h2 id="selected-destination-name" className={styles.name}>
            {item.name}
          </h2>
          <p className={styles.kind}>{item.kindLabel}</p>
          <p className={styles.badge}>{item.badge}</p>
          <p className={styles.note}>{t('referencePoint')}</p>
          <div className={styles.actions}>
            <Link
              className={styles.link}
              href={{ pathname: '/destinations/[slug]', params: { slug: item.slug } }}
            >
              {t('openFicha', { name: item.name })}
            </Link>
            <button type="button" className={styles.clear} onClick={clearDestination}>
              {t('clearSelection')}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function SelectedDestinationCard({ items }: { items: readonly SelectedItem[] }) {
  return (
    <Suspense fallback={null}>
      <Card items={items} />
    </Suspense>
  );
}
