'use client';

import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { buildLegend, type LegendEntry, type PaletteKey } from '@/domains/geography/map-style';
import { DEFAULT_MAP_LAYERS, allowedLayers } from '@/domains/geography/map-url-state';
import styles from './MapLegend.module.css';
import { useMapUrlState } from './use-map-url-state';

const DASH: Record<'solid' | 'dashed' | 'dotted', string | undefined> = {
  solid: undefined,
  dashed: '6 3',
  dotted: '1.5 3',
};

/** Clase de color por clave de paleta (los colores salen de los tokens, nunca de atributos `style`: CSP). */
const FILL: Partial<Record<PaletteKey, string | undefined>> = {
  water: styles.fillWater,
  protectedFill: styles.fillProtected,
  shade: styles.fillShade,
};
const STROKE: Partial<Record<PaletteKey, string | undefined>> = {
  boundary: styles.strokeBoundary,
  protectedLine: styles.strokeProtected,
};

function Swatch({ entry }: { entry: LegendEntry }) {
  const dash = entry.line ? DASH[entry.line.pattern] : undefined;
  return (
    <svg className={styles.swatch} viewBox="0 0 32 16" aria-hidden="true" focusable="false">
      {entry.fill ? (
        <rect x="1" y="1" width="30" height="14" rx="2" className={FILL[entry.fill]} />
      ) : null}
      {entry.line ? (
        <line
          x1="1"
          y1={entry.fill ? 1 : 8}
          x2="31"
          y2={entry.fill ? 1 : 8}
          strokeWidth="2"
          {...(dash ? { strokeDasharray: dash } : {})}
          className={STROKE[entry.line.color]}
        />
      ) : null}
    </svg>
  );
}

function Legend({ terrainAllowed }: { terrainAllowed: boolean }) {
  const t = useTranslations('Map.legend');
  const { state } = useMapUrlState();
  const entries = buildLegend(allowedLayers(state.layers ?? DEFAULT_MAP_LAYERS, terrainAllowed));
  return (
    <section className={styles.legend} aria-labelledby="map-legend-heading">
      <h2 id="map-legend-heading" className={styles.heading}>
        {t('heading')}
      </h2>
      <ul className={styles.list}>
        {entries.map((entry) => (
          <li key={entry.id} className={styles.entry}>
            <Swatch entry={entry} />
            <span>{t(entry.labelKey)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MapLegend({ terrainAllowed }: { terrainAllowed: boolean }) {
  return (
    <Suspense fallback={null}>
      <Legend terrainAllowed={terrainAllowed} />
    </Suspense>
  );
}
