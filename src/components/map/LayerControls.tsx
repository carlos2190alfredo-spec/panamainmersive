'use client';

import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import {
  DEFAULT_MAP_LAYERS,
  MAP_LAYER_IDS,
  THIRD_PARTY_LAYERS,
  allowedLayers,
  type MapLayerId,
} from '@/domains/geography/map-url-state';
import { usesTerrain } from '@/domains/geography/map-style';
import styles from './LayerControls.module.css';
import { useHydrated, useMapUrlState, writeLayers } from './use-map-url-state';

function Controls({ terrainAllowed }: { terrainAllowed: boolean }) {
  const t = useTranslations('Map.layers');
  const hydrated = useHydrated();
  const { state } = useMapUrlState();
  const fromUrl = allowedLayers(state.layers ?? DEFAULT_MAP_LAYERS, terrainAllowed);
  const urlKey = fromUrl.join(',');
  // Estado optimista: Next actualiza `useSearchParams` dentro de una transición y, sin esto, tras el clic React
  // revertiría la casilla al valor anterior hasta que llegase la URL nueva (un parpadeo). Se descarta en cuanto
  // la URL cambia (`from` deja de coincidir).
  const [pending, setPending] = useState<{ from: string; layers: readonly MapLayerId[] } | null>(
    null,
  );
  const active = pending?.from === urlKey ? pending.layers : fromUrl;

  function toggle(id: MapLayerId, on: boolean) {
    const next = MAP_LAYER_IDS.filter((l) => (l === id ? on : active.includes(l)));
    setPending({ from: urlKey, layers: next });
    writeLayers(next);
  }

  return (
    <fieldset className={styles.fieldset} disabled={!hydrated}>
      <legend className={styles.legend}>{t('heading')}</legend>
      <ul className={styles.list}>
        {MAP_LAYER_IDS.map((id) => (
          <li key={id} className={styles.item}>
            <label className={styles.label}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={active.includes(id)}
                disabled={!terrainAllowed && THIRD_PARTY_LAYERS.includes(id)}
                aria-describedby={`layer-hint-${id}`}
                onChange={(event) => {
                  toggle(id, event.currentTarget.checked);
                }}
              />
              <span>{t(`${id}.label`)}</span>
            </label>
            <p id={`layer-hint-${id}`} className={styles.hint}>
              {!terrainAllowed && THIRD_PARTY_LAYERS.includes(id)
                ? t('rightsPending')
                : t(`${id}.hint`)}
            </p>
          </li>
        ))}
      </ul>
      {usesTerrain(active) ? (
        <p className={styles.thirdParty} role="status">
          {t('thirdPartyNotice')}
        </p>
      ) : null}
    </fieldset>
  );
}

export function LayerControls({ terrainAllowed }: { terrainAllowed: boolean }) {
  return (
    <Suspense fallback={null}>
      <Controls terrainAllowed={terrainAllowed} />
    </Suspense>
  );
}
