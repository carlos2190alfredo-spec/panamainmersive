'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { DestinationKind } from '@/domains/tourism/destinations';
import { matchDestinations, type SearchIndexEntry } from '@/domains/tourism/search';
import { Link, getPathname, useRouter } from '@/i18n/navigation';
import styles from './DestinationSearch.module.css';

/**
 * Buscador de los nueve destinos («entrada a Explorar»). Honesto sobre su alcance: lo dice en pantalla (Search.scope) y
 * no promete atracciones, alojamientos ni actividades porque no existen.
 *
 * - Sin red: el índice llega del servidor como prop (≈ 2 KB) y se compara en el propio navegador; la consulta no se
 *   guarda ni sale de la página.
 * - Sin JavaScript no hay búsqueda posible (el emparejamiento es del cliente), y un campo que no busca engaña: el CSS
 *   oculta el formulario entero con `@media (scripting: none)` (quedan los dos botones del héroe y las nueve tarjetas con
 *   sus enlaces). Además el campo NO lleva `name`: en un navegador que no conozca esa consulta de medios y envíe el
 *   formulario sin JavaScript, el navegador solo abre Explorar (`action` = ruta localizada) y lo escrito NO viaja en la URL
 *   (r0:F-09: con `name="q"` acababa en `?q=…`, en el historial y en los registros del servidor y de la CDN, y Explorar lo
 *   ignoraba). Con JavaScript el formulario nunca se envía de forma nativa (`preventDefault`).
 * - Con JavaScript: los resultados salen mientras se escribe (enlaces a la ficha y a «Ver en el mapa»), Enter con
 *   resultados abre Explorar con el primero (`?d=<clave>`) y Escape borra la consulta.
 * - Un solo `role="search"` por página (no hay otro en la cabecera). Sin patrón ARIA «combobox»: es un campo con una
 *   lista de enlaces debajo, y el recuento se anuncia en una región `aria-live`.
 *
 * La lógica de emparejamiento es `matchDestinations` (src/domains/tourism/search.ts), pura y reutilizable.
 */

export interface DestinationSearchProps {
  index: readonly SearchIndexEntry[];
  /** Nombre del tipo de destino en el idioma de la interfaz (lo resuelve el servidor: este espacio de mensajes no viaja). */
  kindLabels: Readonly<Record<DestinationKind, string>>;
}

/** Destino al que lleva «Enter»: el primer resultado, por CLAVE. `null` si no hay nada que abrir. */
export function submitTarget(results: readonly SearchIndexEntry[]) {
  const first = results[0];
  return first ? ({ pathname: '/explore', query: { d: first.key } } as const) : null;
}

/** Recuento anunciado + lista de resultados. Presentación pura (sin estado) para poder probarla sin navegador. */
export function SearchResults({
  query,
  results,
  kindLabels,
  statusId,
}: {
  query: string;
  results: readonly SearchIndexEntry[];
  kindLabels: Readonly<Record<DestinationKind, string>>;
  statusId?: string;
}) {
  const t = useTranslations('Search');
  const hasQuery = query.trim() !== '';
  return (
    <>
      {/* La región existe SIEMPRE (vacía hasta que se escribe): las regiones vivas solo anuncian cambios de una que ya estaba. */}
      <div
        id={statusId}
        className={styles.status}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {hasQuery ? t('results', { count: results.length, query: query.trim() }) : null}
      </div>
      {results.length > 0 ? (
        <ul className={styles.results} aria-label={t('resultsLabel')}>
          {results.map((hit) => (
            <li key={hit.key} className={styles.result} data-search-result={hit.key}>
              <Link
                className={styles.resultLink}
                href={{ pathname: '/destinations/[slug]', params: { slug: hit.slug } }}
              >
                <span className={styles.resultName}>{hit.name}</span>{' '}
                <span className={styles.resultKind}>{kindLabels[hit.kind]}</span>
              </Link>
              <Link
                className={styles.mapLink}
                href={{ pathname: '/explore', query: { d: hit.key } }}
                aria-label={t('viewOnMapLabel', { name: hit.name })}
              >
                {t('viewOnMap')}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function DestinationSearch({ index, kindLabels }: DestinationSearchProps) {
  const t = useTranslations('Search');
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const ids = useId();
  const inputId = `${ids}-q`;
  const scopeId = `${ids}-scope`;
  const statusId = `${ids}-status`;
  const results = useMemo(() => matchDestinations(index, query), [index, query]);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    // Con JavaScript no se recarga la página: se abre Explorar con el primer resultado. Sin resultados no pasa nada
    // (el recuento ya dice que no hay ninguno) y sin JavaScript el envío nativo lleva al mapa.
    event.preventDefault();
    const target = submitTarget(results);
    if (target) router.push(target);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape' && query !== '') {
      event.preventDefault();
      setQuery('');
    }
  };

  return (
    <form
      className={styles.search}
      role="search"
      method="get"
      action={getPathname({ locale, href: '/explore' })}
      aria-label={t('label')}
      onSubmit={onSubmit}
    >
      <label className={styles.label} htmlFor={inputId}>
        {t('label')}
      </label>
      <div className={styles.row}>
        <input
          id={inputId}
          className={styles.input}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={t('placeholder')}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={80}
          aria-describedby={scopeId}
        />
        <button className={styles.submit} type="submit">
          {t('submit')}
        </button>
      </div>
      <p id={scopeId} className={styles.scope}>
        {t('scope')}
      </p>
      <SearchResults query={query} results={results} kindLabels={kindLabels} statusId={statusId} />
    </form>
  );
}
