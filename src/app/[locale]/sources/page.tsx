import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScrollRegion } from '@/components/ScrollRegion';
import { SITE } from '@/config/site';
import { BLOCKED_SOURCES, USED_SOURCES } from '@/domains/geography/sources';
import { assertLocale, type LocaleParams } from '@/lib/params';
import { pageMetadata } from '@/lib/seo';
import styles from './page.module.css';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return pageMetadata({
    locale,
    title: t('sources.title'),
    description: t('sources.description', { siteName: SITE.name }),
    hrefFor: () => '/sources',
    hasRequiredFields: true,
  });
}

export default async function SourcesPage() {
  const t = await getTranslations('Sources');
  return (
    <div className="page">
      <h1>{t('title')}</h1>
      <p className="lead">{t('lead')}</p>

      <section aria-labelledby="used-title">
        <h2 id="used-title">{t('usedHeading')}</h2>
        <ScrollRegion labelledBy="used-title">
          <table className={styles.table}>
            <caption className="visually-hidden">{t('usedHeading')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('columns.source')}</th>
                <th scope="col">{t('columns.use')}</th>
                <th scope="col">{t('columns.license')}</th>
                <th scope="col">{t('columns.rights')}</th>
                <th scope="col">{t('columns.attribution')}</th>
              </tr>
            </thead>
            <tbody>
              {USED_SOURCES.map((s) => (
                <tr key={s.id} data-source={s.id}>
                  {/* Nombre, licencia y atribución conservan su texto original (no se traducen). */}
                  <th scope="row" lang="en">
                    {s.name}
                  </th>
                  <td>{t(`use.${s.useKey}`)}</td>
                  <td lang="en">{s.license}</td>
                  <td>{t(`rights.${s.rights}`)}</td>
                  <td lang="en">{s.attribution}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </section>

      <section aria-labelledby="blocked-title" className={styles.blocked}>
        <h2 id="blocked-title">{t('blockedHeading')}</h2>
        <p>{t('blockedLead')}</p>
        <ul>
          {BLOCKED_SOURCES.map((s) => (
            <li key={s.id} data-source={s.id}>
              <strong>{s.name}</strong>: {t(`use.${s.useKey}`)} {t('pendingAccess')}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
