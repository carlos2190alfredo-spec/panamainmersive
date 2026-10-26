'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Notice } from '@/components/Notice';
import styles from './MapBlocked.module.css';
import { markMapUnavailable } from './area-selection-store';
import { publishMapStatus, resetHudStore } from './hud-store';

/**
 * El mapa NO se muestra porque los derechos de sus datos no están verificados y el entorno es de producción
 * (`resolveMapExperience`). No lleva nada de MapLibre: se pinta ya en el servidor (también sin JavaScript), dice por qué
 * y deja al HUD en un estado explicado (la lista de destinos es la alternativa completa).
 */
export function MapBlocked() {
  const t = useTranslations('Map');
  useEffect(() => {
    publishMapStatus('unavailable');
    markMapUnavailable();
    return () => {
      resetHudStore();
    };
  }, []);
  return (
    <div className={styles.stage} data-map-status="blocked">
      <div className={styles.overlay}>
        <Notice role="status">
          <p>
            <strong>{t('blocked.title')}</strong>
          </p>
          <p>{t('blocked.body')}</p>
        </Notice>
      </div>
    </div>
  );
}
