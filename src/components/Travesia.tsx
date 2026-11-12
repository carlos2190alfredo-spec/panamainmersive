import { useLocale, useTranslations } from 'next-intl';
import { destinationName, destinationSlug } from '@/domains/tourism/destinations';
import { coordinateParts, travesiaStops } from '@/domains/tourism/travesia';
import { Link } from '@/i18n/navigation';
import { DestinationGlyph } from './DestinationGlyph';
import { IsthmusMap } from './IsthmusMap';
import styles from './Travesia.module.css';
import { TravesiaProgress } from './TravesiaProgress';

/**
 * «Travesía» (ADR-0026): los nueve destinos de OESTE a ESTE, cada uno en su punto de referencia. Componente de servidor y
 * estático (no depende del día). Dos piezas:
 *  - la barra de paradas (`<nav>`): un enlace por parada, en el orden de la travesía; `TravesiaProgress` marca la parada a la
 *    vista (`aria-current="step"`), llena la barra y publica su alto (para que el foco y las anclas no queden debajo:
 *    WCAG 2.4.11). Sin JavaScript es una lista de enlaces que funciona igual;
 *  - las escenas (`<li data-destination data-kind>`): nombre (h3 con el enlace a la ficha, estirado a todo el PANEL),
 *    «Parada N de 9» DESPUÉS del h3 (quien salta por encabezados lo oye), tipo, punto de referencia y localizador del
 *    istmo; «Ver en el mapa» abre Explorar con la CLAVE. Los dos `a` de cada escena no se anidan y el primero es SIEMPRE
 *    la ficha. El panel va al lado contrario del punto (`data-panel-side`) para no taparlo.
 * Con `showMap` falso (derechos del contorno denegados en este entorno: `isthmusRights`) no hay localizadores y las
 * escenas son solo el panel.
 * Sin fotos ni descripciones: no hay imagen con licencia verificada ni contenido editorial verificado (se dice en la ficha).
 */
export function Travesia({ showMap }: { showMap: boolean }) {
  const locale = useLocale();
  const t = useTranslations('Home.travesia');
  const kinds = useTranslations('DestinationKind');
  const map = useTranslations('Map');
  const stops = travesiaStops();
  const total = stops.length;

  return (
    <section id="travesia" className={styles.section} aria-labelledby="travesia-title">
      <div className={styles.intro}>
        <h2 id="travesia-title" className={styles.heading}>
          {t('heading')}
        </h2>
        <p className={`lead ${styles.lead ?? ''}`}>{t('lead')}</p>
      </div>

      <nav className={styles.rail} aria-label={t('navLabel')} data-travesia-rail="">
        <p className={styles.ends} aria-hidden="true">
          <span>{t('west')}</span>
          <span>{t('east')}</span>
        </p>
        <span className={styles.track} aria-hidden="true">
          <span className={styles.fill} />
        </span>
        <ol className={styles.railList}>
          {stops.map((s, i) => (
            <li key={s.entry.key}>
              <a
                href={`#parada-${s.entry.key}`}
                className={styles.railLink}
                data-travesia-link={s.entry.key}
              >
                <span className={styles.railIndex} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={styles.railName}>{destinationName(s.entry, locale)}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <TravesiaProgress />

      <ol className={styles.stops}>
        {stops.map((s, i) => {
          const name = destinationName(s.entry, locale);
          const lat = coordinateParts(s.point.lat, 'lat', locale);
          const lon = coordinateParts(s.point.lon, 'lon', locale);
          return (
            <li
              key={s.entry.key}
              id={`parada-${s.entry.key}`}
              className={styles.stop}
              data-destination={s.entry.key}
              data-kind={s.entry.kind}
              data-travesia-stop={s.entry.key}
              data-panel-side={showMap ? s.panelSide : undefined}
              data-point-low={showMap && s.low ? '' : undefined}
            >
              {showMap ? (
                <div className={styles.locator} aria-hidden="true">
                  <IsthmusMap variant="mini" highlight={s.entry.key} />
                </div>
              ) : null}
              <div className={styles.panel}>
                <h3 className={styles.name}>
                  <Link
                    href={{
                      pathname: '/destinations/[slug]',
                      params: { slug: destinationSlug(s.entry, locale) },
                    }}
                    className={styles.link}
                  >
                    {name}
                  </Link>
                </h3>
                <p className={styles.step}>{t('stop', { number: i + 1, total })}</p>
                <p className={styles.kind}>
                  <DestinationGlyph kind={s.entry.kind} className={styles.glyph} />
                  {kinds(s.entry.kind)}
                </p>
                <p className={styles.coords}>
                  <span className={styles.coordsLabel}>{t('reference')}</span>{' '}
                  {t('coordinates', {
                    y: lat.degrees,
                    ns: t(`hemisphere.${lat.hemisphere}`),
                    x: lon.degrees,
                    ew: t(`hemisphere.${lon.hemisphere}`),
                  })}
                </p>
                <Link
                  href={{ pathname: '/explore', query: { d: s.entry.key } }}
                  className={styles.mapLink}
                  aria-label={map('showOnMapLabel', { name })}
                >
                  {map('showOnMap')}
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
