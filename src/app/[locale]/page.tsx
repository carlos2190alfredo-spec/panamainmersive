import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { BrandMark } from '@/components/BrandMark';
import { ButtonLink } from '@/components/ButtonLink';
import { DestinationGrid } from '@/components/DestinationGrid';
import { DestinationSearch } from '@/components/DestinationSearch';
import { Notice } from '@/components/Notice';
import { SITE } from '@/config/site';
import {
  DESTINATIONS,
  DESTINATION_KINDS,
  type DestinationKind,
} from '@/domains/tourism/destinations';
import { buildSearchIndex } from '@/domains/tourism/search';
import { assertLocale, type LocaleParams } from '@/lib/params';
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
 * `sizes` de la marca del héroe (ver page.module.css `.mark`): compacta en columna estrecha, grande en dos columnas.
 * Con ellos el navegador elige 160, 320 o 640 px de ancho según el tamaño real y la densidad de pantalla.
 */
const MARK_SIZES = '(min-width: 48rem) clamp(8.5rem, 19vw, 15.2rem), clamp(5.2rem, 20.8vw, 6.6rem)';

/**
 * Portada. ESTÁTICA a propósito: no calcula nada que dependa del día (sin getTodayIsoDate ni insignias de cobertura).
 * Va envuelta en `data-immersive`, que activa el ámbito oscuro de marca de tokens.css para TODA la página (cabecera y
 * pie incluidos). El texto va siempre sobre una superficie SÓLIDA (nunca sobre el degradado ni sobre vidrio
 * translúcido: así axe puede medirlo); el vidrio solo enmarca la imagen de la marca. Los adornos del héroe son dos capas `aria-hidden` sin texto (`.decor`, `.contours`) detrás del contenido.
 */
export default async function HomePage({ params }: LocaleParams) {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations('Home');
  const brand = await getTranslations('Brand');
  const destinations = await getTranslations('Destinations');
  const kinds = await getTranslations('DestinationKind');
  const footer = await getTranslations('Footer');
  const messages = await getMessages();

  // El índice de búsqueda viaja al navegador como prop (≈ 2 KB); la tipología, ya traducida (este espacio de mensajes no viaja).
  const searchIndex = buildSearchIndex(DESTINATIONS, locale);
  const kindLabels = Object.fromEntries(
    DESTINATION_KINDS.map((kind) => [kind, kinds(kind)]),
  ) as Record<DestinationKind, string>;

  return (
    <div data-immersive="">
      <section className={styles.hero} aria-labelledby="home-title">
        {/* Adornos del héroe: dos capas SIN texto detrás del contenido (degradado + resplandor, y curvas de nivel). */}
        <div className={styles.decor} aria-hidden="true" />
        <div className={styles.contours} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>{t('eyebrow')}</p>
            <p className={styles.tagline}>{brand('tagline')}</p>
            <h1 id="home-title" className={styles.title}>
              {t('title')}
            </h1>
            <p className="lead">{t('lead')}</p>
            {/* Solo los textos del buscador viajan al cliente, y solo en la portada (no se amplía CLIENT_NAMESPACES). */}
            <NextIntlClientProvider messages={{ Search: messages.Search }}>
              <DestinationSearch index={searchIndex} kindLabels={kindLabels} />
            </NextIntlClientProvider>
            <div className={styles.actions}>
              <ButtonLink href="/explore" variant="cta">
                {t('ctaExplore')}
              </ButtonLink>
              <ButtonLink href="/destinations" variant="onBrand">
                {t('ctaDestinations')}
              </ButtonLink>
            </div>
          </div>

          <div className={styles.brand}>
            <div className={styles.frame}>
              <BrandMark variant="p" priority className={styles.mark ?? ''} sizes={MARK_SIZES} />
              {/* El nombre es TEXTO VIVO (nunca una imagen de texto); no es un encabezado: el único h1 es el título. */}
              <p className={styles.wordmark}>
                <span className={styles.wordmarkMain}>{SITE.wordmark.primary}</span>
                <span className={styles.wordmarkSub}>{SITE.wordmark.secondary}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="principles-title" className={styles.section}>
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

      <section aria-labelledby="destinations-title" className={styles.section}>
        <div className={styles.wrap}>
          <h2 id="destinations-title">{destinations('indexTitle')}</h2>
          <p className="lead">{destinations('indexLead')}</p>
          <DestinationGrid />
        </div>
      </section>

      <section aria-labelledby="status-title" className={styles.section}>
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
