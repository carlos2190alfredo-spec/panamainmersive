'use client';

import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import type { DestinationKey } from '@/domains/tourism/destinations';
import { CAROUSEL_UNAVAILABLE_ID, useHudStore } from './hud-store';
import styles from './ShowOnMapButton.module.css';
import { selectDestination, useHydrated, useMapUrlState } from './use-map-url-state';

function Button({ destinationKey, name }: { destinationKey: DestinationKey; name: string }) {
  const t = useTranslations('Map');
  const hydrated = useHydrated();
  const { state } = useMapUrlState();
  // Sin mapa (sin WebGL, sin datos, bloqueado por derechos, con error) elegir «ver en el mapa» no llevaría a ningún
  // sitio: se ofrece desactivado y con su motivo (el aviso del carrusel). Mientras CARGA sí vale: el destino queda
  // en la URL y el mapa lo encuadra al estar listo.
  const unavailable = useHudStore().mapStatus === 'unavailable';
  // Sin JavaScript la lista de enlaces es la alternativa completa: el botón solo aparece cuando funciona.
  if (!hydrated) return null;
  return (
    <button
      type="button"
      className={styles.button}
      aria-pressed={state.destination === destinationKey}
      disabled={unavailable}
      aria-describedby={unavailable ? CAROUSEL_UNAVAILABLE_ID : undefined}
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
