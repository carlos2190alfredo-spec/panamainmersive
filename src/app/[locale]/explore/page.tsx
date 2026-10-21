import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { DestinationList } from '@/components/DestinationList';
import { Notice } from '@/components/Notice';
import { StatusBadge } from '@/components/StatusBadge';
import { AreasInView } from '@/components/map/AreasInView';
import { LayerControls } from '@/components/map/LayerControls';
import { MapLegend } from '@/components/map/MapLegend';
import { MapStage } from '@/components/map/MapStage';
import { SelectedAreaCard } from '@/components/map/SelectedAreaCard';
import { SelectedDestinationCard } from '@/components/map/SelectedDestinationCard';
import { ShowOnMapButton } from '@/components/map/ShowOnMapButton';
import type { MapDestination, SelectedItem } from '@/components/map/map-data';
import { getEnv } from '@/config/env';
import { SITE } from '@/config/site';
import { resolveMapExperience } from '@/domains/geography/rights';
import { COVERAGE, effectiveStatus } from '@/domains/tourism/coverage-evidence';
import { DESTINATIONS, destinationName, destinationSlug } from '@/domains/tourism/destinations';
import { Link } from '@/i18n/navigation';
import { DESTINATION_ANCHORS } from '@/lib/destination-anchors';
import { assertLocale, type LocaleParams } from '@/lib/params';
import { RIGHTS_POLICIES } from '@/lib/rights-policies';
import { pageMetadata } from '@/lib/seo';
import { getTodayIsoDate } from '@/lib/today';
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

export default async function ExplorePage({ params }: LocaleParams) {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations('Explore');
  const kinds = await getTranslations('DestinationKind');
  const map = await getTranslations('Map');
  const nav = await getTranslations('Nav');
  const messages = await getMessages();
  const today = getTodayIsoDate();
  const { anchors, info } = DESTINATION_ANCHORS;
  // Experience Resolver v1: qué se puede ofrecer según los derechos y el entorno (provisional ⇒ no en producción).
  const experience = resolveMapExperience(getEnv().SITE_ENV, RIGHTS_POLICIES);
  const blocked = !experience.basemap.allowed;
  const terrainAllowed = experience.terrain.allowed;

  const mapDestinations: MapDestination[] = DESTINATIONS.map((d) => {
    const anchor = anchors[d.key];
    return {
      key: d.key,
      name: destinationName(d, locale),
      lon: anchor.lon,
      lat: anchor.lat,
      bounds: anchor.bounds,
      defaultZoom: anchor.defaultZoom,
    };
  });

  const selectedItems: SelectedItem[] = DESTINATIONS.map((d) => {
    const geometry = COVERAGE[d.key].find((c) => c.capability === 'geometry');
    return {
      key: d.key,
      name: destinationName(d, locale),
      kindLabel: kinds(d.kind),
      slug: destinationSlug(d, locale),
      badge: geometry ? <StatusBadge status={effectiveStatus(geometry, today)} /> : null,
    };
  });

  // Solo los textos del mapa viajan al cliente, y solo en esta página.
  return (
    <NextIntlClientProvider messages={{ Map: messages.Map }}>
      <div className={styles.shell}>
        <section className={styles.map} aria-label={t('mapLabel')}>
          <Suspense fallback={null}>
            <MapStage
              destinations={mapDestinations}
              blocked={blocked}
              terrainAllowed={terrainAllowed}
            />
          </Suspense>
          {/* Sin JavaScript no hay mapa: se dice con palabras (la lista de destinos es la alternativa completa). */}
          <noscript>
            <div className={styles.noscript}>
              <Notice>
                <p>{map('noscript')}</p>
              </Notice>
            </div>
          </noscript>
        </section>

        <aside className={styles.panel} aria-label={t('panelLabel')}>
          <h1 className={styles.title}>{t('title')}</h1>
          <SelectedDestinationCard items={selectedItems} />
          <SelectedAreaCard />
          <h2 className={styles.listHeading}>
            {t('listHeading')}{' '}
            <span className={styles.count}>({t('count', { count: DESTINATIONS.length })})</span>
          </h2>
          <p className={styles.help}>{t('listDescription')}</p>
          <DestinationList
            renderAction={(entry, name) => (
              <ShowOnMapButton destinationKey={entry.key} name={name} />
            )}
          />
          <AreasInView />
          <div className={styles.section}>
            <LayerControls terrainAllowed={terrainAllowed} />
          </div>
          <MapLegend terrainAllowed={terrainAllowed} />
          <p className={styles.attribution}>{map('attribution', { release: info.release })}</p>
          <p>
            <Link className={styles.sourcesLink} href="/sources">
              {nav('sources')}
            </Link>
          </p>
        </aside>
      </div>
    </NextIntlClientProvider>
  );
}
