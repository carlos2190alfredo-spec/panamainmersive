'use client';

import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import type { LegendEntry, Symbolizer } from '@/domains/geography/layers';
import { paletteClassSuffix, type PaletteKey } from '@/domains/geography/map-core';
import { buildLegend } from '@/domains/geography/map-style';
import { DEFAULT_MAP_LAYERS, allowedLayers } from '@/domains/geography/map-url-state';
import styles from './MapLegend.module.css';
import { useMapUrlState } from './use-map-url-state';

/** Los colores salen de los tokens por CLASE (nunca por atributos `style`: la CSP los prohíbe). */
const fillClass = (key: PaletteKey) => styles[`fill${paletteClassSuffix(key)}`];
const strokeClass = (key: PaletteKey) => styles[`stroke${paletteClassSuffix(key)}`];

/**
 * Muestra de la leyenda dibujada DESDE el símbolo declarado (el mismo que genera la capa de MapLibre):
 * color, opacidad, grosor y trazo. El trazo discontinuo se escala con el grosor, como en el mapa.
 */
function Swatch({ symbol }: { symbol: Symbolizer }) {
  const { fill, line, point } = symbol;
  const width = line ? Math.max(2, line.width * 1.5) : 0;
  const dash = line?.dash ? line.dash.map((n) => n * width).join(' ') : undefined;
  return (
    <svg className={styles.swatch} viewBox="0 0 32 16" aria-hidden="true" focusable="false">
      {fill ? (
        <rect
          x="1"
          y="1"
          width="30"
          height="14"
          rx="2"
          className={fillClass(fill.color)}
          {...(fill.opacity === undefined ? {} : { fillOpacity: fill.opacity })}
        />
      ) : null}
      {line && fill ? (
        <rect
          x="1"
          y="1"
          width="30"
          height="14"
          rx="2"
          fill="none"
          strokeWidth={width}
          {...(dash ? { strokeDasharray: dash } : {})}
          className={strokeClass(line.color)}
        />
      ) : null}
      {line && !fill ? (
        <line
          x1="1"
          y1="8"
          x2="31"
          y2="8"
          strokeWidth={width}
          {...(dash ? { strokeDasharray: dash } : {})}
          className={strokeClass(line.color)}
        />
      ) : null}
      {point ? (
        <circle cx="16" cy="8" r={point.radius * 1.2} className={fillClass(point.color)} />
      ) : null}
    </svg>
  );
}

function Legend({ terrainAllowed }: { terrainAllowed: boolean }) {
  const t = useTranslations('Map.legend');
  const { state } = useMapUrlState();
  const entries: readonly LegendEntry[] = buildLegend(
    allowedLayers(state.layers ?? DEFAULT_MAP_LAYERS, terrainAllowed),
  );
  return (
    <section className={styles.legend} aria-labelledby="map-legend-heading">
      <h2 id="map-legend-heading" className={styles.heading}>
        {t('heading')}
      </h2>
      <ul className={styles.list}>
        {entries.map((entry) => (
          <li key={entry.id} className={styles.entry}>
            <Swatch symbol={entry.swatch} />
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
