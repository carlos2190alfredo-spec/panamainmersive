'use client';

import { useTranslations } from 'next-intl';
import {
  safeHttpsUrl,
  sourceOf,
  squareMetersToHectares,
  type AreaDetail,
} from '@/domains/geography/area-detail';
import { formatNumber, formatPanamaDateTime } from '@/i18n/format';
import type { Locale } from '@/i18n/locales';
import styles from './SelectedAreaCard.module.css';

function formatRetrieved(locale: Locale, iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : formatPanamaDateTime(locale, date, { dateStyle: 'long' });
}

export default function AreaFacts({ detail, locale }: { detail: AreaDetail; locale: Locale }) {
  const t = useTranslations('Map.area');
  const { properties } = detail;
  const source = sourceOf(detail);
  const licenseUrl = safeHttpsUrl(source?.license.url ?? null);
  const hectares = properties.area ? squareMetersToHectares(properties.area.squareMeters) : null;
  const name = properties.name;
  const nameNote =
    name === null
      ? null
      : name.provenance === 'editorial'
        ? t('nameEditorial')
        : name.locale === null
          ? t('nameLocal')
          : t('nameCommon');

  return (
    <>
      <p className={styles.kind}>
        {t(properties.kind === 'protected_area' ? 'kind.protected_area' : 'kind.other')}
      </p>
      <p className={styles.badge}>{t(`sourceClass.${properties.sourceClass}`)}</p>
      {nameNote ? <p className={styles.note}>{nameNote}</p> : null}
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{t('areaHeading')}</dt>
          <dd>
            {properties.area && hectares !== null ? (
              <>
                {formatNumber(locale, hectares, {
                  style: 'unit',
                  unit: 'hectare',
                  maximumFractionDigits: hectares < 100 ? 1 : 0,
                })}
                <span className={styles.method}>
                  {t('areaMethod', { method: properties.area.method })}
                </span>
              </>
            ) : (
              t('areaUnknown')
            )}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('sourceHeading')}</dt>
          <dd>
            {source ? (
              <>
                <span>
                  {t('sourceLine', {
                    institution: source.institution,
                    version: source.versionLabel,
                    date: formatRetrieved(locale, source.retrievedAt),
                  })}
                </span>
                <span className={styles.method}>{source.attribution}</span>
                <span className={styles.method}>
                  {t('license', { license: source.license.name })}
                  {licenseUrl ? (
                    <>
                      {' '}
                      <a href={licenseUrl} rel="noreferrer noopener" target="_blank">
                        {t('licenseLink')}
                      </a>
                    </>
                  ) : null}
                </span>
                <span className={styles.method}>
                  {source.rightsStatus === 'verified'
                    ? t('rightsVerified')
                    : t('rightsProvisional')}
                </span>
              </>
            ) : (
              t('unavailable')
            )}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('geometryVersion', { version: properties.geometryVersion })}</dt>
        </div>
      </dl>
    </>
  );
}
