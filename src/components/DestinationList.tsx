import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  DESTINATIONS,
  destinationName,
  destinationSlug,
  type DestinationEntry,
} from '@/domains/tourism/destinations';
import { Link } from '@/i18n/navigation';
import { DestinationGlyph } from './DestinationGlyph';
import styles from './DestinationList.module.css';

/**
 * Lista de destinos: alternativa textual EQUIVALENTE al mapa (no un complemento).
 * Cada destino enlaza a su ficha; en Fase 2 también selecciona en el mapa.
 *
 * Dos presentaciones del MISMO contenido (un `<ul>` con un `<li data-destination>` y UN solo enlace a la ficha por destino):
 *  - `list` (por defecto): filas apiladas;
 *  - `cards`: tarjetas tipográficas en una fila con desplazamiento horizontal (el carrusel del HUD de Explorar). Sin fotos
 *    ni descripciones —no existen con licencia ni verificadas—: el pictograma es iconografía por TIPO. El enlace se
 *    estira a toda la tarjeta (`::after`) y la acción («Ver en el mapa») queda por encima, como HERMANA (nunca anidada).
 *
 * Componente de SERVIDOR: no pesa nada en el bundle. Lo que necesita estado (botón de la acción, insignia) llega ya hecho.
 */
export function DestinationList({
  entries = DESTINATIONS,
  showKind = true,
  variant = 'list',
  renderAction,
  renderMeta,
  label,
}: {
  entries?: readonly DestinationEntry[];
  showKind?: boolean;
  variant?: 'list' | 'cards';
  /** Acción adicional por destino (p. ej. «Ver en el mapa»); la ficha sigue siendo un enlace. */
  renderAction?: (entry: DestinationEntry, name: string) => ReactNode;
  /** Solo en `cards`: dato breve bajo el tipo (p. ej. la insignia de cobertura de la geometría). */
  renderMeta?: (entry: DestinationEntry) => ReactNode;
  /** Solo en `cards`: nombre accesible de la lista (el carrusel). */
  label?: string;
}) {
  const locale = useLocale();
  const kinds = useTranslations('DestinationKind');

  if (variant === 'cards') {
    return (
      <ul className={styles.cards} aria-label={label}>
        {entries.map((d) => {
          const name = destinationName(d, locale);
          const meta = renderMeta?.(d);
          return (
            <li key={d.key} className={styles.card} data-destination={d.key} data-kind={d.kind}>
              <DestinationGlyph kind={d.kind} className={styles.glyph} />
              <div className={styles.titles}>
                <Link
                  href={{
                    pathname: '/destinations/[slug]',
                    params: { slug: destinationSlug(d, locale) },
                  }}
                  className={styles.cardLink}
                >
                  {name}
                </Link>
                {showKind ? <span className={styles.cardKind}>{kinds(d.kind)}</span> : null}
              </div>
              <div className={styles.cardFoot}>
                {meta ? <div className={styles.cardMeta}>{meta}</div> : null}
                {renderAction ? (
                  <div className={styles.cardAction}>{renderAction(d, name)}</div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

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
