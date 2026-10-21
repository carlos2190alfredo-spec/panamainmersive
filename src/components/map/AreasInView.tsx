'use client';

import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { pickableLayers } from '@/domains/geography/layers';
import { DEFAULT_MAP_LAYERS } from '@/domains/geography/map-url-state';
import styles from './AreasInView.module.css';
import { useAreaStore } from './area-selection-store';
import { clearArea, selectArea, useHydrated, useMapUrlState } from './use-map-url-state';

/**
 * Alternativa por teclado (y para lectores de pantalla) al clic en el mapa: las áreas que el mapa dibuja en la
 * vista actual, como botones. Elegir una hace exactamente lo mismo que el clic (escribe `a` en la URL).
 */
function List() {
  const t = useTranslations('Map');
  const hydrated = useHydrated();
  const { state } = useMapUrlState();
  const { visible } = useAreaStore();
  const pickable = pickableLayers(state.layers ?? DEFAULT_MAP_LAYERS).length > 0;
  const truncated = visible.total > visible.items.length;

  let body;
  if (!pickable) body = <p className={styles.note}>{t('inView.layerOff')}</p>;
  else if (visible.mapUnavailable)
    body = <p className={styles.note}>{t('inView.mapUnavailable')}</p>;
  else if (!visible.ready) body = <p className={styles.note}>{t('inView.waiting')}</p>;
  else if (visible.total === 0) body = <p className={styles.note}>{t('inView.empty')}</p>;
  else {
    body = (
      <>
        <p className={styles.note}>
          {t('inView.count', { shown: visible.items.length, total: visible.total })}
          {truncated ? ` ${t('inView.zoomIn')}` : ''}
        </p>
        <ul className={styles.list}>
          {visible.items.map((item) => {
            const selected = item.id === state.area;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.item}
                  aria-pressed={selected}
                  disabled={!hydrated}
                  data-area-id={item.id}
                  onClick={() => {
                    if (selected) clearArea();
                    else selectArea(item.id);
                  }}
                >
                  {item.name ?? t('area.unnamed')}
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="areas-in-view-heading">
      <h2 id="areas-in-view-heading" className={styles.heading}>
        {t('inView.heading')}
      </h2>
      <p className={styles.help}>{t('inView.description')}</p>
      {body}
    </section>
  );
}

export function AreasInView() {
  return (
    <Suspense fallback={null}>
      <List />
    </Suspense>
  );
}
