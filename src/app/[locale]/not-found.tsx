import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ButtonLink';

export default async function NotFound() {
  const t = await getTranslations('NotFound');
  return (
    <div className="page">
      <h1>{t('title')}</h1>
      <p className="lead">{t('body')}</p>
      <p>
        <ButtonLink href="/">{t('home')}</ButtonLink>{' '}
        <ButtonLink href="/destinations" variant="secondary">
          {t('destinations')}
        </ButtonLink>
      </p>
    </div>
  );
}
