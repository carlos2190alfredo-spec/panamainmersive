import { useLocale, useTranslations } from 'next-intl';
import {
  DESTINATIONS,
  destinationName,
  destinationSlug,
  type DestinationEntry,
} from '@/domains/tourism/destinations';
import { Link } from '@/i18n/navigation';
import { DestinationGlyph } from './DestinationGlyph';
import styles from './DestinationGrid.module.css';

/**
 * Rejilla de los destinos para la portada y para /destinations (Explorar sigue con `DestinationList`, su alternativa
 * textual del mapa). Componente de SERVIDOR y ESTÁTICO: no calcula nada que dependa del día (sin insignias de
 * cobertura, que caducan) ni lleva estado.
 *
 * Cada tarjeta (`<li data-destination data-kind>`) tiene DOS enlaces hermanos, nunca anidados:
 *  - el principal, a la ficha (nombre + tipo), extendido a toda la tarjeta con `::after` (enlace «estirado»);
 *  - el secundario, «Ver en el mapa», a Explorar con la CLAVE (`?d=`), nunca el nombre ni el slug (patrón de la ficha).
 * El primer `a` del `<li>` es SIEMPRE el principal (la prueba de movimiento reducido lee `[data-destination] a`).
 *
 * Sin fotos ni descripciones: no hay imagen con licencia verificada ni contenido editorial (Destinations.contentPending).
 * El pictograma es iconografía por TIPO. `.media` es el hueco que ocupará una FOTO REAL con su crédito el día que exista
 * una fuente con licencia verificada; hasta entonces solo lleva el pictograma decorativo.
 */
export function DestinationGrid({
  entries = DESTINATIONS,
}: {
  entries?: readonly DestinationEntry[];
}) {
  const locale = useLocale();
  const kinds = useTranslations('DestinationKind');
  const map = useTranslations('Map');

  return (
    <ul className={styles.grid}>
      {entries.map((d) => {
        const name = destinationName(d, locale);
        return (
          <li key={d.key} className={styles.card} data-destination={d.key} data-kind={d.kind}>
            <div className={styles.media}>
              <DestinationGlyph kind={d.kind} className={styles.glyph} />
            </div>
            <div className={styles.body}>
              <Link
                href={{
                  pathname: '/destinations/[slug]',
                  params: { slug: destinationSlug(d, locale) },
                }}
                className={styles.link}
              >
                <span className={styles.name}>{name}</span>{' '}
                <span className={styles.kind}>{kinds(d.kind)}</span>
              </Link>
              <Link
                href={{ pathname: '/explore', query: { d: d.key } }}
                className={styles.mapLink}
                // El nombre accesible EMPIEZA por el texto visible (WCAG 2.5.3) y añade el destino.
                aria-label={map('showOnMapLabel', { name })}
              >
                {map('showOnMap')}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
