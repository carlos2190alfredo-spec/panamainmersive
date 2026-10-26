'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef } from 'react';
import { matchingKeys } from '@/domains/tourism/explore-filter';
import type { SearchIndexEntry } from '@/domains/tourism/search';
import { setSearchQuery, useExploreFilter } from './explore-filter-store';
import styles from './SearchBox.module.css';
import { selectDestination } from './use-map-url-state';

/**
 * Buscador de los nueve destinos (ADR-0025 §8): un `<form role="search">` con un campo de búsqueda y su etiqueta
 * visible. NO tiene lista de resultados propia: el resultado ES el carrusel filtrado (una segunda lista de botones
 * duplicaría «Ver en el mapa: X», que la suite exige único) y el recuento lo anuncia la región `aria-live` del carrusel.
 *
 *  - Coincide por CLAVE (`matchDestinations`: nombre en los CINCO idiomas, sin acentos ni mayúsculas), nunca por nombre.
 *  - Enter con un ÚNICO resultado lo selecciona (`?d=` en la URL, como «Ver en el mapa»); con varios no hace nada.
 *  - Escape vacía el campo (con el campo vacío, la tecla sigue su camino).
 *  - Estado local (almacén `explore-filter-store`): la URL no cambia y el filtro por tipo se combina por intersección.
 */
export function SearchBox({ index }: { index: readonly SearchIndexEntry[] }) {
  const t = useTranslations('Map');
  const filter = useExploreFilter();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const clear = () => {
    setSearchQuery('', index);
  };

  return (
    <form
      role="search"
      className={styles.form}
      aria-label={t('hud.searchRegionLabel')}
      data-hud-island="search"
      onSubmit={(event) => {
        event.preventDefault();
        const found = matchingKeys(filter, index);
        const [only] = found;
        if (found.length === 1 && only) selectDestination(only);
      }}
    >
      <label className={styles.label} htmlFor={inputId}>
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" />
        </svg>
        <span className={styles.text}>{t('search.label')}</span>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className={styles.input}
        type="search"
        value={filter.query}
        placeholder={t('search.placeholder')}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(event) => {
          setSearchQuery(event.currentTarget.value, index);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && filter.query !== '') {
            event.preventDefault();
            clear();
          }
        }}
      />
      {filter.query === '' ? null : (
        <button
          type="button"
          className={styles.clear}
          aria-label={t('search.clear')}
          onClick={() => {
            clear();
            inputRef.current?.focus();
          }}
        >
          <span className={styles.cross} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
