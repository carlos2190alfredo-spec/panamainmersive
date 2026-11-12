import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ButtonLink';

/** Título propio de la 404 (WCAG 2.4.2; r0:F-10): sin él heredaba el del sitio y no decía que la página no existe. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return { title: t('notFound.title') };
}

export default async function NotFound() {
  const t = await getTranslations('NotFound');
  return (
    <div className="page">
      <h1>{t('title')}</h1>
      <p className="lead">{t('body')}</p>
      {/* Los dos botones van en un grupo con separación propia (r1:V-02: entre ellos había 4 px, el espacio de una palabra). */}
      <div className="actions">
        <ButtonLink href="/">{t('home')}</ButtonLink>
        <ButtonLink href="/destinations" variant="secondary">
          {t('destinations')}
        </ButtonLink>
      </div>
    </div>
  );
}
