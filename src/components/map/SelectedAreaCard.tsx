'use client';

import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { geometryBounds } from '@/domains/geography/area-selection';
import { LOCALES, type Locale } from '@/i18n/locales';
import styles from './SelectedAreaCard.module.css';
import { requestFrame, useAreaStore } from './area-selection-store';
import { useAreaDetail } from './use-area-detail';
import { clearArea, useMapUrlState } from './use-map-url-state';

/**
 * Lo que dibuja los datos de la BD (y el validador de la respuesta) solo hace falta cuando llega una ficha: se
 * carga entonces, no con la página (el JS inicial de Explorar tiene presupuesto, `docs/performance.md`).
 */
const AreaFacts = dynamic(() => import('./AreaFacts'), { ssr: false });

const asLocale = (value: string): Locale => LOCALES.find((l) => l === value) ?? 'es';

function Card() {
  const t = useTranslations('Map.area');
  const locale = asLocale(useLocale());
  const { state } = useMapUrlState();
  const { known } = useAreaStore();
  const id = state.area;
  const detail = useAreaDetail(id, locale);

  // Desconocido ≠ «sin nombre»: solo se dice que la fuente no tiene nombre cuando lo SABEMOS (la API lo dice, o
  // la tesela se vio sin nombre). Con un enlace cuyo nombre aún no conocemos, el título es neutro.
  const seen = id ? known.get(id) : undefined; // string = nombre visto · null = visto sin nombre · undefined = no visto
  const detailName = detail.status === 'ready' ? detail.detail.properties.name?.value : undefined;
  const nameIsKnownAbsent =
    (detail.status === 'ready' && detailName === undefined) || seen === null;
  const title =
    detailName ??
    (typeof seen === 'string' ? seen : undefined) ??
    (nameIsKnownAbsent ? t('unnamed') : t('untitled'));
  const bounds = detail.status === 'ready' ? geometryBounds(detail.detail.geometry) : null;

  // La región en vivo existe siempre; solo cambia su contenido (así el lector de pantalla anuncia la selección).
  return (
    <div aria-live="polite" className={styles.region}>
      {id ? (
        <section
          className={styles.card}
          aria-labelledby="selected-area-name"
          aria-busy={detail.status === 'loading'}
          data-area-status={detail.status}
        >
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h2 id="selected-area-name" className={styles.name}>
            {title}
          </h2>
          {detail.status === 'ready' ? <AreaFacts detail={detail.detail} locale={locale} /> : null}
          {detail.status === 'loading' ? <p className={styles.note}>{t('loading')}</p> : null}
          {detail.status === 'unavailable' ? (
            <p className={styles.note}>{t('unavailable')}</p>
          ) : null}
          {detail.status === 'blocked' ? <p className={styles.note}>{t('blocked')}</p> : null}
          {detail.status === 'notFound' ? <p className={styles.note}>{t('notFound')}</p> : null}
          <p className={styles.note}>{t('tileNote')}</p>
          <p className={styles.note}>{t('noVerifiedData')}</p>
          <div className={styles.actions}>
            {bounds ? (
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  requestFrame(bounds);
                }}
              >
                {t('frame')}
              </button>
            ) : null}
            <button type="button" className={styles.clear} onClick={clearArea}>
              {t('clear')}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function SelectedAreaCard() {
  return (
    <Suspense fallback={null}>
      <Card />
    </Suspense>
  );
}
