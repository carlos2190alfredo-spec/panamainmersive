'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { DestinationGlyph } from '@/components/DestinationGlyph';
import type { DestinationKind } from '@/domains/tourism/destinations';
import { setKindFilter, useExploreFilter } from './explore-filter-store';
import styles from './FilterChips.module.css';

/** Un tipo de destino REAL (los que existen en el registro), ya traducido y con su recuento. Lo prepara el servidor. */
export interface FilterOption {
  readonly kind: DestinationKind;
  readonly label: string;
  readonly count: number;
}

/** «Todos»: cuatro cuadrados. Iconografía genérica propia (nada de librerías), decorativa. */
function AllIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}

function Chip({
  filter,
  pressed,
  label,
  count,
  icon,
  onPress,
}: {
  filter: string;
  pressed: boolean;
  label: string;
  count: number;
  icon: ReactNode;
  onPress: () => void;
}) {
  const t = useTranslations('Map');
  return (
    <li className={styles.item}>
      <button
        type="button"
        className={styles.chip}
        aria-pressed={pressed}
        data-kind-filter={filter}
        onClick={onPress}
      >
        <span className={styles.glyph} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.label}>{label}</span>
        {/* El número se ve; el nombre accesible lleva la frase completa («1 destino»). El recuento es un dato del
            registro (cuántos hay de cada tipo), no depende de la búsqueda. */}
        <span className={styles.count} aria-hidden="true">
          {count}
        </span>{' '}
        <span className="visually-hidden">{t('filter.count', { count })}</span>
      </button>
    </li>
  );
}

/**
 * Filtro por tipo de destino (ADR-0025 §8): «Todos» y un botón por cada tipo REAL con su recuento. Estado local (el
 * almacén `explore-filter-store`), nunca en la URL. Volver a pulsar el tipo elegido lo quita. Es una isla de cliente que
 * llega tras hidratar: sin JavaScript serían botones sin función, así que el servidor solo reserva su sitio.
 */
export function FilterChips({
  options,
  total,
}: {
  options: readonly FilterOption[];
  total: number;
}) {
  const t = useTranslations('Map');
  const { kind } = useExploreFilter();
  return (
    <ul
      className={styles.list}
      aria-label={t('filter.heading')}
      data-filter-chips
      data-hud-island="filter"
    >
      <Chip
        filter="all"
        pressed={kind === 'all'}
        label={t('filter.all')}
        count={total}
        icon={<AllIcon />}
        onPress={() => {
          setKindFilter('all');
        }}
      />
      {options.map((option) => (
        <Chip
          key={option.kind}
          filter={option.kind}
          pressed={kind === option.kind}
          label={option.label}
          count={option.count}
          icon={<DestinationGlyph kind={option.kind} />}
          onPress={() => {
            setKindFilter(kind === option.kind ? 'all' : option.kind);
          }}
        />
      ))}
    </ul>
  );
}
