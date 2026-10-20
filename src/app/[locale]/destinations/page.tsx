import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DestinationList } from '@/components/DestinationList';
import { SITE } from '@/config/site';
import { assertLocale, type LocaleParams } from '@/lib/params';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return pageMetadata({
    locale,
    title: t('destinations.title'),
    description: t('destinations.description', { siteName: SITE.name }),
    hrefFor: () => '/destinations',
    hasRequiredFields: true,
  });
}

export default async function DestinationsPage() {
  const t = await getTranslations('Destinations');
  return (
    <div className="page">
      <h1>{t('indexTitle')}</h1>
      <p className="lead">{t('indexLead')}</p>
      <DestinationList />
    </div>
  );
}
