import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ButtonLink';
import { DepthStage } from '@/components/DepthStage';
import { DestinationSearch } from '@/components/DestinationSearch';
import { IsthmusDefs, IsthmusMap } from '@/components/IsthmusMap';
import { Notice } from '@/components/Notice';
import { Travesia } from '@/components/Travesia';
import { getEnv } from '@/config/env';
import { SITE } from '@/config/site';
import { isthmusRights } from '@/domains/geography/rights';
import {
  DESTINATIONS,
  DESTINATION_KINDS,
  type DestinationKind,
} from '@/domains/tourism/destinations';
import { buildSearchIndex } from '@/domains/tourism/search';
import { ISTHMUS_PROVENANCE } from '@/domains/tourism/travesia';
import { assertLocale, type LocaleParams } from '@/lib/params';
import { RIGHTS_POLICIES } from '@/lib/rights-policies';
import { THEME_COLORS, pageMetadata } from '@/lib/seo';
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

/** La portada es de ámbito inmersivo (siempre oscura): la barra del navegador y el esquema de color lo anticipan. */
export const viewport: Viewport = { colorScheme: 'dark', themeColor: THEME_COLORS.dark };

/**
 * Portada «Travesía» (ADR-0026). ESTÁTICA a propósito: no calcula nada que dependa del día (sin getTodayIsoDate ni
 * insignias de cobertura). Va envuelta en `data-immersive`, que activa el ámbito oscuro de marca de tokens.css para TODA
 * la página (cabecera y pie incluidos). El texto va siempre sobre una superficie SÓLIDA (nunca sobre el degradado ni sobre
 * vidrio translúcido: así axe puede medirlo); el héroe no lleva vidrio. Los adornos del héroe son dos capas `aria-hidden`
 * sin texto (`.decor`, `.contours`) detrás del contenido.
 *
 * El istmo (contorno derivado de Overture) pasa por la MISMA puerta de derechos que el mapa base (`isthmusRights`): con la
 * política `provisional`, en producción no se pinta ni en el héroe ni en las escenas (r:D-01). El entorno se conoce al
 * construir (la página es estática).
 */
export default async function HomePage({ params }: LocaleParams) {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations('Home');
  const brand = await getTranslations('Brand');
  const travesia = await getTranslations('Home.travesia');
  const kinds = await getTranslations('DestinationKind');
  const footer = await getTranslations('Footer');
  const messages = await getMessages();

  // El índice de búsqueda viaja al navegador como prop (≈ 2 KB); la tipología, ya traducida (este espacio de mensajes no viaja).
  const searchIndex = buildSearchIndex(DESTINATIONS, locale);
  const kindLabels = Object.fromEntries(
    DESTINATION_KINDS.map((kind) => [kind, kinds(kind)]),
  ) as Record<DestinationKind, string>;
  const showMap = isthmusRights(RIGHTS_POLICIES, getEnv().SITE_ENV).allowed;

  return (
    <div data-immersive="">
      {showMap ? <IsthmusDefs /> : null}
      <section id="inicio" className={styles.hero} aria-labelledby="home-title">
        {/* Adornos del héroe: dos capas SIN texto detrás del contenido (degradado + resplandor, y una rejilla decorativa: no es una retícula geográfica). */}
        <div className={styles.decor} aria-hidden="true" />
        <div className={styles.contours} aria-hidden="true" />
        {showMap ? <DepthStage stageId="inicio" /> : null}
        <div className={styles.heroInner}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>{t('eyebrow')}</p>
            <p className={styles.tagline}>{brand('tagline')}</p>
            <h1 id="home-title" className={styles.title}>
              {t('title')}
            </h1>
            <p className={`lead ${styles.lead ?? ''}`}>{t('lead')}</p>
            {/* Los botones van ANTES del buscador (orden del DOM = orden visual = orden de tabulación): la llamada principal
                «Abrir el mapa» tiene que verse sin desplazarse en un teléfono de 640 px de alto (r1:V-04). */}
            <div className={styles.actions}>
              <ButtonLink href="/explore" variant="cta">
                {t('ctaExplore')}
              </ButtonLink>
              <ButtonLink href="/destinations" variant="onBrand">
                {t('ctaDestinations')}
              </ButtonLink>
            </div>
            {/* Solo los textos del buscador viajan al cliente, y solo en la portada (no se amplía CLIENT_NAMESPACES). */}
            <NextIntlClientProvider messages={{ Search: messages.Search }}>
              <DestinationSearch index={searchIndex} kindLabels={kindLabels} />
            </NextIntlClientProvider>
          </div>

          {/* El istmo con los nueve destinos (decorativo: la barra de paradas y las escenas dicen lo mismo en texto). */}
          {showMap ? (
            <figure className={styles.isthmus}>
              <IsthmusMap variant="hero" className={styles.isthmusMap ?? ''} />
              <figcaption className={styles.credit}>
                {travesia.rich('credit', {
                  release: ISTHMUS_PROVENANCE.release,
                  en: (chunks) => <span lang="en">{chunks}</span>,
                })}
              </figcaption>
            </figure>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="principles-title" className={`${styles.section} hyphenate`}>
        <div className={styles.wrap}>
          <h2 id="principles-title">{t('principlesHeading')}</h2>
          <ul className={styles.principleList}>
            <li className={styles.principle}>
              <h3>{t('principles.map.title')}</h3>
              <p>{t('principles.map.body')}</p>
              <div className={styles.principleAction}>
                <ButtonLink href="/explore" variant="secondary">
                  {t('ctaExplore')}
                </ButtonLink>
              </div>
            </li>
            <li className={styles.principle}>
              <h3>{t('principles.provenance.title')}</h3>
              <p>{t('principles.provenance.body')}</p>
              <div className={styles.principleAction}>
                <ButtonLink href="/sources" variant="secondary">
                  {footer('sourcesLink')}
                </ButtonLink>
              </div>
            </li>
            <li className={styles.principle}>
              <h3>{t('principles.languages.title')}</h3>
              <p>{t('principles.languages.body')}</p>
            </li>
          </ul>
        </div>
      </section>

      <Travesia showMap={showMap} />

      <section aria-labelledby="status-title" className={`${styles.section} hyphenate`}>
        <div className={styles.wrap}>
          <h2 id="status-title">{t('statusHeading')}</h2>
          <Notice>
            <p>{t('statusBody')}</p>
          </Notice>
        </div>
      </section>
    </div>
  );
}
