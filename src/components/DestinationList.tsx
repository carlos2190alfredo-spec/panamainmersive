import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  DESTINATIONS,
  destinationName,
  destinationSlug,
  type DestinationEntry,
} from '@/domains/tourism/destinations';
import { Link } from '@/i18n/navigation';
import styles from './DestinationList.module.css';

/**
 * Lista de destinos: alternativa textual EQUIVALENTE al mapa (no un complemento).
 * Cada destino enlaza a su ficha; en Fase 2 también selecciona en el mapa.
 */
export function DestinationList({
  entries = DESTINATIONS,
  showKind = true,
  renderAction,
}: {
  entries?: readonly DestinationEntry[];
  showKind?: boolean;
  /** Acción adicional por destino (p. ej. «Ver en el mapa»); la ficha sigue siendo un enlace. */
  renderAction?: (entry: DestinationEntry, name: string) => ReactNode;
}) {
  const locale = useLocale();
  const kinds = useTranslations('DestinationKind');

  return (
    <ul className={styles.list}>
      {entries.map((d) => {
        const name = destinationName(d, locale);
        return (
          <li key={d.key} className={styles.item} data-destination={d.key}>
            <Link
              href={{
                pathname: '/destinations/[slug]',
                params: { slug: destinationSlug(d, locale) },
              }}
              className={styles.link}
            >
              <span className={styles.name}>{name}</span>
              {showKind ? <span className={styles.kind}>{kinds(d.kind)}</span> : null}
            </Link>
            {renderAction ? <div className={styles.action}>{renderAction(d, name)}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}
