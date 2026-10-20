import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ButtonLink';
import { Notice } from '@/components/Notice';
import { SITE } from '@/config/site';
import { assertLocale, type LocaleParams } from '@/lib/params';
import { pageMetadata } from '@/lib/seo';
import styles from './page.module.css';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Meta' });
  const title = t('home.title', { siteName: SITE.name });
  const meta = pageMetadata({
    locale,
    title,
    description: t('home.description', { siteName: SITE.name }),
    hrefFor: () => '/',
    hasRequiredFields: true,
    isHome: true,
  });
  return { ...meta, title: { absolute: title } };
}

export default async function HomePage() {
  const t = await getTranslations('Home');

  return (
    <div className="page">
      <section className={styles.hero} aria-labelledby="home-title">
        <p className={styles.eyebrow}>{t('eyebrow')}</p>
        <h1 id="home-title">{t('title')}</h1>
        <p className="lead">{t('lead')}</p>
        <div className={styles.actions}>
          <ButtonLink href="/explore">{t('ctaExplore')}</ButtonLink>
          <ButtonLink href="/destinations" variant="secondary">
            {t('ctaDestinations')}
          </ButtonLink>
        </div>
      </section>

      <section aria-labelledby="principles-title" className={styles.principles}>
        <h2 id="principles-title">{t('principlesHeading')}</h2>
        <ul className={styles.principleList}>
          {(['map', 'provenance', 'languages'] as const).map((key) => (
            <li key={key} className={styles.principle}>
              <h3>{t(`principles.${key}.title`)}</h3>
              <p>{t(`principles.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="status-title">
        <h2 id="status-title">{t('statusHeading')}</h2>
        <Notice>
          <p>{t('statusBody')}</p>
        </Notice>
      </section>
    </div>
  );
}
