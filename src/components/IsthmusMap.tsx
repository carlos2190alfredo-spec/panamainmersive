import { useTranslations } from 'next-intl';
import type { DestinationKey } from '@/domains/tourism/destinations';
import { ISTHMUS_SHAPE, travesiaStops } from '@/domains/tourism/travesia';
import styles from './IsthmusMap.module.css';

const [, , WIDTH = 1000, HEIGHT = 433] = ISTHMUS_SHAPE.viewBox.split(' ').map(Number);

/** Identificador de la ruta compartida: UNA copia en el documento (`IsthmusDefs`) y cada mapa la usa con `<use>`. */
const LAND_ID = 'isthmus-land';

/**
 * La ruta del contorno (≈ 9 KB) se define UNA vez por página y cada istmo la reutiliza con `<use href>` (r:JS-3: diez
 * copias eran el 60 % del HTML de la portada y otras diez del payload RSC). Se pinta donde la página tenga istmos, una
 * sola vez; sin él, los `<use>` no dibujan nada (la prueba unitaria lo exige junto a los mapas).
 */
export function IsthmusDefs() {
  return (
    <svg className={styles.defs} aria-hidden="true" focusable="false" data-isthmus-defs="">
      <defs>
        <path id={LAND_ID} d={ISTHMUS_SHAPE.path} className={styles.landPath} />
      </defs>
    </svg>
  );
}

/**
 * El istmo de la «Travesía» (ADR-0026): el contorno de referencia del país (Overture, derivado de OpenStreetMap; NO es un
 * límite oficial; derechos provisionales, L-01) con cada destino en su punto de referencia. Es DECORATIVO para la
 * tecnología de apoyo (`aria-hidden`): la misma información (orden, nombre y punto de referencia) está en texto en la
 * barra de paradas y en cada escena. Sin líneas entre los puntos: una línea que une las paradas se leería como un
 * itinerario practicable (r:D-03; Bocas → Coiba cruzaría la cordillera y el mar).
 *
 *  - `hero`: el mar Caribe arriba y el océano Pacífico abajo (rótulos solo donde se pueden leer) y un punto por destino, en
 *    capas a distinta profundidad (`data-depth`) que el escenario espacial desplaza con el puntero;
 *  - `mini`: la misma silueta con UN destino resaltado (localizador de cada escena), pintado el ÚLTIMO para que los puntos
 *    vecinos (Casco Antiguo, Ciudad de Panamá y el Canal están a 3–10 unidades) no lo tapen.
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
  const ordered = [
    ...stops.filter((s) => s.entry.key !== highlight),
    ...stops.filter((s) => s.entry.key === highlight),
  ];

  return (
    <svg
      viewBox={ISTHMUS_SHAPE.viewBox}
      className={[styles.map, styles[variant], className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
      data-isthmus={variant}
    >
      {variant === 'hero' ? (
        <text x={WIDTH * 0.24} y={36} className={styles.ocean} data-depth="far">
          {t('caribbean')}
        </text>
      ) : null}
      <g data-depth="mid">
        <use href={`#${LAND_ID}`} className={styles.land} />
      </g>
      <g data-depth="near">
        {ordered.map((s) => {
          const current = highlight === s.entry.key;
          return (
            <g
              key={s.entry.key}
              className={[styles.stop, current ? styles.current : ''].filter(Boolean).join(' ')}
              data-stop={s.entry.key}
            >
              <circle
                cx={s.point.x}
                cy={s.point.y}
                r={variant === 'hero' ? 15 : current ? 26 : 6}
                className={styles.halo}
              />
              <circle
                cx={s.point.x}
                cy={s.point.y}
                r={variant === 'hero' ? 7 : current ? 10 : 4}
                className={styles.dot}
              />
            </g>
          );
        })}
      </g>
      {variant === 'hero' ? (
        <text x={WIDTH * 0.08} y={HEIGHT - 14} className={styles.ocean} data-depth="far">
          {t('pacific')}
        </text>
      ) : null}
    </svg>
  );
}
