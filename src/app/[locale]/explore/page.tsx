import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { DestinationList } from '@/components/DestinationList';
import { HudGroup } from '@/components/HudGroup';
import { Notice } from '@/components/Notice';
import { StatusBadge } from '@/components/StatusBadge';
import { AreasInView } from '@/components/map/AreasInView';
import { HudCarousel } from '@/components/map/HudCarousel';
import { HudPanel } from '@/components/map/HudPanel';
import { HudSheet } from '@/components/map/HudSheet';
import { LayerControls } from '@/components/map/LayerControls';
import { MapLegend } from '@/components/map/MapLegend';
import {
  CarouselFilterStatusLazy,
  FilterChipsLazy,
  MapToolsLazy,
  SearchBoxLazy,
} from '@/components/map/HudIslandsLazy';
import { MapStageLazy } from '@/components/map/MapStageLazy';
import { SelectedAreaCard } from '@/components/map/SelectedAreaCard';
import { SelectedDestinationCard } from '@/components/map/SelectedDestinationCard';
import { ShowOnMapButton } from '@/components/map/ShowOnMapButton';
import { LAYERS_GROUP_ID, LEGEND_GROUP_ID } from '@/components/map/hud-ids';
import type { MapDestination, SelectedItem } from '@/components/map/map-data';
import { getEnv } from '@/config/env';
import { SITE } from '@/config/site';
import { resolveMapExperience } from '@/domains/geography/rights';
import { COVERAGE, effectiveStatus } from '@/domains/tourism/coverage-evidence';
import { DESTINATIONS, destinationName, destinationSlug } from '@/domains/tourism/destinations';
import { kindOptions } from '@/domains/tourism/explore-filter';
import { buildSearchIndex } from '@/domains/tourism/search';
import { Link } from '@/i18n/navigation';
import { DESTINATION_ANCHORS } from '@/lib/destination-anchors';
import { assertLocale, type LocaleParams } from '@/lib/params';
import { RIGHTS_POLICIES } from '@/lib/rights-policies';
import { THEME_COLORS, pageMetadata } from '@/lib/seo';
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

/**
 * Explorar es de ámbito inmersivo (siempre oscuro): la barra del navegador y el esquema de color lo anticipan.
 * `interactiveWidget: 'resizes-content'`: el teclado en pantalla ENCOGE la pantalla útil (Chrome/Edge/Firefox en Android) en
 * lugar de tapar la parte baja. La hoja inferior mide ≈ 60dvh, así que se encoge con ella y el buscador (lo primero de su
 * cuerpo) queda por encima del teclado; con la opción por defecto la hoja quedaría debajo de él. Safari en iOS la ignora
 * (desplaza la página hasta el campo).
 */
export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: THEME_COLORS.dark,
  interactiveWidget: 'resizes-content',
};

/**
 * Las insignias de cobertura del carrusel y de la ficha (`effectiveStatus(…, hoy)`) dependen del DÍA: una página prerrenderizada
 * las congelaría en la fecha del build y, desde el 2027-01-18 (caduca la cobertura de terreno de los nueve destinos), diría
 * «Verificada» mientras la ficha de cada destino dice «Desconocida» (r0:F-07). Se regenera cada hora, igual que la ficha y el
 * sitemap. Debe ser un literal (Next lo analiza estáticamente); `pnpm check:bundle` lo comprueba sobre el build real.
 * ISR es _stale-while-revalidate_: la primera visita tras el plazo recibe la versión anterior (F4-16).
 */
export const revalidate = 3600;

/** `id` del encabezado que nombra la región del carrusel y de su descripción (la lista es la alternativa del mapa). */
const CAROUSEL_HEADING_ID = 'destinations-heading';
const CAROUSEL_HELP_ID = 'destinations-help';

/**
 * Explorar (ADR-0025 §8): el mapa ocupa toda la pantalla bajo la cabecera y los componentes REALES de siempre flotan
 * encima como un HUD de vidrio. Cada función existe UNA sola vez en el DOM (la suite E2E usa selectores únicos): se
 * re-visten y se recolocan, nunca se duplican.
 *
 * Desde 56rem el HUD (`.hud`) es una rejilla sobre el mapa; por debajo es una HOJA INFERIOR (`HudSheet`) de dos detentes
 * sobre el mapa a pantalla completa. Zonas, con el orden del DOM (= orden de tabulación):
 *   herramientas (3D y «Capas y leyenda»: flotan sobre el mapa y NO se pliegan con la hoja) · [hoja: título (h1) ·
 *   buscador · carril (tipo de destino abierto; capas y leyenda plegadas) · «dock» inferior (ficha del destino +
 *   carrusel, una al lado de la otra: la altura que ocupan NO cambia al elegir un destino) · panel (<aside>: área
 *   elegida, áreas en la vista, créditos y los enlaces a Fuentes y Accesibilidad)]
 * El buscador, el filtro por tipo, las herramientas y el recuento del carrusel son islas de cliente en UN solo chunk
 * diferido (`HudIslandsLazy`): sin JavaScript no se pintan (serían controles sin función) y el CSS reserva su sitio.
 * `[data-hud-safe]` es el hueco que los paneles (o la hoja) dejan libre: el mapa lo mide para encuadrar un destino a la
 * vista y no debajo de un panel (`src/domains/geography/hud-frame.ts`).
 */
export default async function ExplorePage({ params }: LocaleParams) {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations('Explore');
  const kinds = await getTranslations('DestinationKind');
  const map = await getTranslations('Map');
  const coverage = await getTranslations('Coverage');
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
      kind: d.kind,
      lon: anchor.lon,
      lat: anchor.lat,
      bounds: anchor.bounds,
      defaultZoom: anchor.defaultZoom,
    };
  });

  // Filtro por tipo y buscador (islas de cliente): los tipos que de verdad existen, con su recuento, y el índice de
  // búsqueda por CLAVE (nombres en los cinco idiomas, normalizados). Solo datos planos: viajan al navegador como props.
  const searchIndex = buildSearchIndex(DESTINATIONS, locale);
  const filterOptions = kindOptions(searchIndex).map((o) => ({ ...o, label: kinds(o.kind) }));
  const filterItems = searchIndex.map(({ key, kind }) => ({ key, kind }));

  /**
   * Estado de la GEOMETRÍA de un destino hoy (la insignia que ya mostraba la ficha), con su rótulo visible: sola, junto al
   * nombre de un lugar, «Verificada» se leería como «destino verificado» y es el estado del polígono derivado de OSM (r0:F-01).
   */
  const geometryBadge = (key: (typeof DESTINATIONS)[number]['key']) => {
    const geometry = COVERAGE[key].find((c) => c.capability === 'geometry');
    return geometry ? (
      <StatusBadge status={effectiveStatus(geometry, today)} label={coverage('geometryLabel')} />
    ) : null;
  };

  const selectedItems: SelectedItem[] = DESTINATIONS.map((d) => ({
    key: d.key,
    name: destinationName(d, locale),
    kindLabel: kinds(d.kind),
    slug: destinationSlug(d, locale),
    badge: geometryBadge(d.key),
  }));
  // El resumen de la hoja móvil cerrada solo necesita nombre y tipo (sin la insignia ni el enlace: no se repiten en el HTML).
  const sheetItems = selectedItems.map(({ key, name, kindLabel }) => ({ key, name, kindLabel }));

  // Solo los textos del mapa viajan al cliente, y solo en esta página.
  return (
    <NextIntlClientProvider messages={{ Map: messages.Map }}>
      <div className={styles.shell} data-immersive data-explore>
        <section className={styles.map} aria-label={t('mapLabel')}>
          <Suspense fallback={null}>
            <MapStageLazy
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

        <div className={styles.hud} data-hud>
          {/* Herramientas del mapa (columna derecha, bajo el zoom y la brújula nativos): isla de cliente tras hidratar.
              Van ANTES de la hoja en el DOM (y en la tabulación): en móvil flotan sobre el mapa y no se pliegan con ella. */}
          <div className={styles.tools} data-hud-zone="tools">
            <MapToolsLazy terrainAllowed={terrainAllowed} />
          </div>
          {/* Hueco libre de HUD: el mapa lo mide para encuadrar (decorativo, sin contenido). */}
          <div className={styles.safe} data-hud-safe aria-hidden="true" />
          <HudSheet
            titleText={t('title')}
            title={
              <h1 className={styles.title} data-hud-zone="title">
                {t('title')}
              </h1>
            }
            items={sheetItems}
          >
            {/* Buscador de destinos (arriba al centro): isla de cliente tras hidratar; el CSS reserva su sitio. */}
            <div className={styles.search} data-hud-zone="search">
              <SearchBoxLazy index={searchIndex} />
            </div>
            {/* Carril: tipo de destino (abierto) y capas y leyenda (plegadas: las abre «Capas y leyenda» de las herramientas). */}
            <section className={styles.rail} aria-label={map('hud.railLabel')} data-hud-zone="rail">
              <HudGroup title={map('filter.heading')} group="filter" className={styles.filterGroup}>
                <div className={styles.filterSlot}>
                  <FilterChipsLazy options={filterOptions} total={DESTINATIONS.length} />
                </div>
              </HudGroup>
              <HudGroup
                title={map('layers.heading')}
                id={LAYERS_GROUP_ID}
                group="layers"
                open={false}
              >
                <LayerControls terrainAllowed={terrainAllowed} />
              </HudGroup>
              <HudGroup
                title={map('legend.heading')}
                id={LEGEND_GROUP_ID}
                group="legend"
                open={false}
              >
                <MapLegend terrainAllowed={terrainAllowed} />
              </HudGroup>
            </section>
            <div className={styles.dock}>
              <SelectedDestinationCard items={selectedItems} className={styles.featured} />
              <HudCarousel
                className={styles.carousel}
                headingId={CAROUSEL_HEADING_ID}
                describedBy={CAROUSEL_HELP_ID}
                heading={
                  <h2 id={CAROUSEL_HEADING_ID} className={styles.carouselHeading}>
                    {t('listHeading')}{' '}
                    <span className={styles.count}>
                      ({t('count', { count: DESTINATIONS.length })})
                    </span>
                  </h2>
                }
                status={<CarouselFilterStatusLazy items={filterItems} />}
              >
                <p id={CAROUSEL_HELP_ID} className="visually-hidden">
                  {t('listDescription')}
                </p>
                <DestinationList
                  variant="cards"
                  label={map('hud.carouselLabel')}
                  renderMeta={(entry) => geometryBadge(entry.key)}
                  renderAction={(entry, name) => (
                    <ShowOnMapButton destinationKey={entry.key} name={name} />
                  )}
                />
              </HudCarousel>
            </div>
            <HudPanel className={styles.panel} label={t('panelLabel')} title={t('panelLabel')}>
              <SelectedAreaCard />
              <AreasInView />
              {/* Los créditos conservan su idioma original (`lang="en"`, WCAG 3.1.2); el resto del párrafo es el de la interfaz. */}
              <p className={styles.attribution}>
                {map.rich('attribution', {
                  release: info.release,
                  en: (chunks) => <span lang="en">{chunks}</span>,
                })}
              </p>
              <ul className={styles.links}>
                <li>
                  <Link className={styles.link} href="/sources">
                    {nav('sources')}
                  </Link>
                </li>
                <li>
                  <Link className={styles.link} href="/accessibility">
                    {nav('accessibility')}
                  </Link>
                </li>
              </ul>
            </HudPanel>
          </HudSheet>
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
