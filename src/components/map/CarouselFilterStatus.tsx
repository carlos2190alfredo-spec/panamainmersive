'use client';

import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useRef, useState } from 'react';
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
 *    filtro. Existe SIEMPRE (vacía) para que el cambio se anuncie. Al ESCRIBIR, el anuncio espera a que se deje de teclear
 *    (`SEARCH_ANNOUNCE_DELAY_MS`): sin esa espera un lector de pantalla recitaba un recuento por cada letra («3 destinos…»,
 *    «2 destinos…», «1 destino…»; r2:N3). El eco visible NO espera: cambia con cada pulsación (y es `aria-hidden`).
 *    El tipo de destino, que es un solo gesto, se anuncia al momento.
 *  - Al salir de la pantalla borra el filtro: es estado local de la visita, no un ajuste guardado.
 */
/** Cuánto se espera sin teclear antes de anunciar el recuento de una búsqueda (el habla de un lector tarda ≈ 1 s por frase). */
export const SEARCH_ANNOUNCE_DELAY_MS = 500;

/**
 * El mensaje que se anuncia: `message` tras `delayMs` sin cambios (cada cambio reinicia la espera, también una pulsación que
 * no cambia el recuento: `restart` es lo que se ha tecleado). Con `delayMs` 0 es el propio mensaje, sin esperar. El estado se actualiza SIEMPRE desde un temporizador (también con 0): así, al pasar de un gesto
 * inmediato (el tipo) a otro con espera (teclear), el valor retenido es el último que se dijo y no uno viejo.
 */
function useSettledMessage(message: string, delayMs: number, restart: string): string {
  const [settled, setSettled] = useState(message);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled(message);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
    // `restart` no se lee: solo reinicia la espera con cada pulsación, aunque el mensaje no cambie.
  }, [message, delayMs, restart]);
  return delayMs === 0 ? message : settled;
}

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

  const announced = useSettledMessage(
    message,
    filter.lastChange === 'search' ? SEARCH_ANNOUNCE_DELAY_MS : 0,
    query,
  );

  return (
    <span ref={anchor} className={styles.status} data-hud-island="status">
      <span role="status" className="visually-hidden">
        {announced}
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
