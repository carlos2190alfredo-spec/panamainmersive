import { useTranslations } from 'next-intl';
import type { DestinationKey } from '@/domains/tourism/destinations';
import { ISTHMUS_SHAPE, travesiaStops } from '@/domains/tourism/travesia';
import styles from './IsthmusMap.module.css';

const [, , WIDTH = 1000, HEIGHT = 433] = ISTHMUS_SHAPE.viewBox.split(' ').map(Number);

/**
 * El istmo de la «Travesía» (ADR-0026): el contorno REAL del país (Overture, derivado de OpenStreetMap; derechos
 * provisionales, L-01) con cada destino en su ancla real. Es DECORATIVO para la tecnología de apoyo (`aria-hidden`): la
 * misma información (orden, nombre y posición) está en texto en la barra de paradas y en cada escena.
 *
 *  - `hero`: el mar Caribe arriba y el océano Pacífico abajo, la línea que une las paradas de oeste a este (es el ORDEN de
 *    la travesía, no una carretera) y un punto por destino, en capas a distinta profundidad (`data-depth`) que el
 *    escenario espacial desplaza con el puntero;
 *  - `mini`: la misma silueta con UN destino resaltado (localizador de cada escena).
 */
export function IsthmusMap({
  variant,
  highlight,
  className,
}: {
  variant: 'hero' | 'mini';
  highlight?: DestinationKey;
  className?: string;
}) {
  const t = useTranslations('Home.travesia');
  const stops = travesiaStops();
  const route = stops.map((s, i) => `${i === 0 ? 'M' : 'L'}${s.point.x} ${s.point.y}`).join('');

  return (
    <svg
      viewBox={ISTHMUS_SHAPE.viewBox}
      className={[styles.map, styles[variant], className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
      data-isthmus={variant}
    >
      {variant === 'hero' ? (
        <text x={WIDTH * 0.34} y={48} className={styles.ocean} data-depth="far">
          {t('caribbean')}
        </text>
      ) : null}
      <g data-depth="mid">
        <path d={ISTHMUS_SHAPE.path} className={styles.land} />
      </g>
      {variant === 'hero' ? (
        <path d={route} className={styles.route} data-depth="near" pathLength={1} />
      ) : null}
      <g data-depth="near">
        {stops.map((s) => (
          <g
            key={s.entry.key}
            className={[styles.stop, highlight === s.entry.key ? styles.current : '']
              .filter(Boolean)
              .join(' ')}
            data-stop={s.entry.key}
          >
            <circle
              cx={s.point.x}
              cy={s.point.y}
              r={variant === 'hero' ? 7 : highlight === s.entry.key ? 26 : 6}
              className={styles.halo}
            />
            <circle
              cx={s.point.x}
              cy={s.point.y}
              r={variant === 'hero' ? 3.5 : highlight === s.entry.key ? 9 : 3.5}
              className={styles.dot}
            />
          </g>
        ))}
      </g>
      {variant === 'hero' ? (
        <text x={WIDTH * 0.08} y={HEIGHT - 14} className={styles.ocean} data-depth="far">
          {t('pacific')}
        </text>
      ) : null}
    </svg>
  );
}
