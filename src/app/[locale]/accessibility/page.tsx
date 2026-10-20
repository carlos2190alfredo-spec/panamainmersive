import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SITE } from '@/config/site';
import { assertLocale, type LocaleParams } from '@/lib/params';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return pageMetadata({
    locale,
    title: t('accessibility.title'),
    description: t('accessibility.description', { siteName: SITE.name }),
    hrefFor: () => '/accessibility',
    hasRequiredFields: true,
  });
}

export default async function AccessibilityPage() {
  const t = await getTranslations('Accessibility');
  return (
    <div className="page">
      <h1>{t('title')}</h1>
      <p className="lead">{t('lead')}</p>

      <section aria-labelledby="kb">
        <h2 id="kb">{t('keyboardHeading')}</h2>
        <p>{t('keyboardBody')}</p>
      </section>
      <section aria-labelledby="alt">
        <h2 id="alt">{t('textAlternativeHeading')}</h2>
        <p>{t('textAlternativeBody')}</p>
      </section>
      <section aria-labelledby="motion">
        <h2 id="motion">{t('motionHeading')}</h2>
        <p>{t('motionBody')}</p>
      </section>
      <section aria-labelledby="langs">
        <h2 id="langs">{t('languagesHeading')}</h2>
        <p>{t('languagesBody')}</p>
      </section>
      <section aria-labelledby="limits">
        <h2 id="limits">{t('limitationsHeading')}</h2>
        <ul>
          <li>{t('limitations.map')}</li>
          <li>{t('limitations.testing')}</li>
          <li>{t('limitations.screenReaders')}</li>
        </ul>
      </section>
      <section aria-labelledby="contact">
        <h2 id="contact">{t('contactHeading')}</h2>
        <p>{t('contactBody')}</p>
      </section>
    </div>
  );
}
