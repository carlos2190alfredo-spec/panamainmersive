'use client';

import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import type { DestinationKey } from '@/domains/tourism/destinations';
import styles from './ShowOnMapButton.module.css';
import { selectDestination, useHydrated, useMapUrlState } from './use-map-url-state';

function Button({ destinationKey, name }: { destinationKey: DestinationKey; name: string }) {
  const t = useTranslations('Map');
  const hydrated = useHydrated();
  const { state } = useMapUrlState();
  // Sin JavaScript la lista de enlaces es la alternativa completa: el botón solo aparece cuando funciona.
  if (!hydrated) return null;
  return (
    <button
      type="button"
      className={styles.button}
      aria-pressed={state.destination === destinationKey}
      // El nombre accesible EMPIEZA por el texto visible (WCAG 2.5.3) y añade el destino.
      aria-label={t('showOnMapLabel', { name })}
      onClick={() => {
        selectDestination(destinationKey);
      }}
    >
      {t('showOnMap')}
    </button>
  );
}

export function ShowOnMapButton(props: { destinationKey: DestinationKey; name: string }) {
  return (
    <Suspense fallback={null}>
      <Button {...props} />
    </Suspense>
  );
}
