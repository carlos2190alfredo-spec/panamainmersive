import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DestinationList } from '@/components/DestinationList';
import { Notice } from '@/components/Notice';
import { DESTINATIONS } from '@/domains/tourism/destinations';
import { assertLocale, type LocaleParams } from '@/lib/params';
import { pageMetadata } from '@/lib/seo';
import { SITE } from '@/config/site';
import styles from './page.module.css';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return pageMetadata({
    locale,
    title: t('explore.title'),
    description: t('explore.description', { siteName: SITE.name }),
    hrefFor: () => '/explore',
    hasRequiredFields: true,
  });
}

export default async function ExplorePage() {
  const t = await getTranslations('Explore');

  return (
    <div className={styles.shell}>
      <section className={styles.map} aria-label={t('mapLabel')}>
        <Notice role="status">
          <p>
            <strong>{t('mapPendingTitle')}</strong>
          </p>
          <p>{t('mapPendingBody')}</p>
        </Notice>
      </section>

      <aside className={styles.panel} aria-label={t('panelLabel')}>
        <h1 className={styles.title}>{t('title')}</h1>
        <h2 className={styles.listHeading}>
          {t('listHeading')}{' '}
          <span className={styles.count}>({t('count', { count: DESTINATIONS.length })})</span>
        </h2>
        <p className={styles.help}>{t('listDescription')}</p>
        <DestinationList />
      </aside>
    </div>
  );
}
