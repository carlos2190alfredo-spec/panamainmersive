'use client';

import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useRef } from 'react';
import {
  isFiltering,
  matchingKeys,
  visibleKeys,
  type FilterItem,
} from '@/domains/tourism/explore-filter';
import styles from './CarouselFilterStatus.module.css';
import { resetExploreFilter, useExploreFilter } from './explore-filter-store';
import { useMapUrlState } from './use-map-url-state';

/**
 * La mitad «carrusel» del filtro por tipo y de la búsqueda de Explorar. No dibuja las tarjetas (las pinta el servidor,
 * una sola vez, con su único enlace y su único «Ver en el mapa»): decide cuáles se VEN y lo cuenta.
 *
 *  - Oculta (`hidden`) las tarjetas que no coinciden. El destino SELECCIONADO nunca se oculta (sin él, la ficha se
 *    quedaría sin tarjeta ni marcador). Sin filtro no toca nada: el DOM es el de siempre (las nueve).
 *  - Región `aria-live` (solo para lectores de pantalla) con el recuento tras cada cambio, y su eco visible mientras hay
 *    filtro. Existe SIEMPRE (vacía) para que el cambio se anuncie.
 *  - Al salir de la pantalla borra el filtro: es estado local de la visita, no un ajuste guardado.
 */
function Status({ items }: { items: readonly FilterItem[] }) {
  const t = useTranslations('Map');
  const filter = useExploreFilter();
  const { state } = useMapUrlState();
  const anchor = useRef<HTMLSpanElement>(null);

  const matching = matchingKeys(filter, items).length;
  const shownKey = visibleKeys(filter, items, state.destination).join(',');

  useEffect(() => resetExploreFilter, []);

  useEffect(() => {
    const section = anchor.current?.closest('[data-hud-zone="carousel"]');
    if (!section) return;
    const shown = new Set(shownKey.split(','));
    for (const card of section.querySelectorAll<HTMLElement>('li[data-destination]')) {
      card.hidden = !shown.has(card.dataset.destination ?? '');
    }
  }, [shownKey]);

  // Una lista nueva empieza por el principio (la que había se desplazó sobre otras tarjetas).
  const { kind, query } = filter;
  useEffect(() => {
    const body = anchor.current
      ?.closest('[data-hud-zone="carousel"]')
      ?.querySelector('li[data-destination]')
      ?.closest('ul')?.parentElement;
    body?.scrollTo({ left: 0 });
  }, [kind, query]);

  const message =
    filter.lastChange === null
      ? ''
      : filter.lastChange === 'search' && filter.matches !== null
        ? matching === 0
          ? t('search.empty')
          : t('search.count', { count: matching })
        : t('filter.announce', { count: matching });

  return (
    <span ref={anchor} className={styles.status} data-hud-island="status">
      <span role="status" className="visually-hidden">
        {message}
      </span>
      {isFiltering(filter) ? (
        <span className={styles.echo} aria-hidden="true" data-filter-echo>
          {message}
        </span>
      ) : null}
    </span>
  );
}

export function CarouselFilterStatus({ items }: { items: readonly FilterItem[] }) {
  return (
    <Suspense fallback={null}>
      <Status items={items} />
    </Suspense>
  );
}
