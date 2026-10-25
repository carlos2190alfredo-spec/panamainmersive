import type { ReactNode } from 'react';
import type { DestinationKind } from '@/domains/tourism/destinations';
import styles from './DestinationGlyph.module.css';

/**
 * Pictograma SVG propio de cada tipo de destino (siete). Es DECORATIVO: `aria-hidden` y sin `<title>` (el nombre y el
 * tipo ya están en el texto de la tarjeta; un `<title>` sería además texto literal en JSX, que la prueba de textos
 * rechaza). Color por herencia (`currentColor`), nunca con `style=""` (CSP): el contenedor fija `color`, el tamaño
 * (`inline-size`/`block-size` por clase) y, si quiere un acento, `--glyph-accent`.
 *
 * Dibujos en una malla de 64×64, trazo 2,5, sin degradados ni filtros; la parte de acento (`.accent`) es un detalle
 * pequeño (sol, barca, humo…) que nunca es lo único que distingue un tipo de otro.
 */

type Shape = () => ReactNode;

/** Oleaje: dos curvas encadenadas (`t` repite la inflexión) a la altura `y`. */
const waves = (y: number): ReactNode => (
  <path d={`M4 ${String(y)}q4-3 8 0t8 0 8 0 8 0 8 0 8 0 8 0`} />
);

const SHAPES: Readonly<Record<DestinationKind, Shape>> = {
  city: () => (
    <>
      <path d="M4 56h56" />
      <path d="M8 56V30h12v26M20 56V14h16v42M36 56V26h12v30" />
      <path d="M25 22h6M25 30h6M25 38h6M25 46h6M12 38h4M12 46h4M40 34h4M40 42h4" />
      <g className={styles.accent} fill="currentColor" stroke="currentColor">
        <circle cx="53" cy="14" r="4" />
      </g>
    </>
  ),
  historic_district: () => (
    <>
      <path d="M4 56h56" />
      <path d="M8 56V26h12v30M6 26l8-11 8 11" />
      <path d="M12 44v-5a2 2 0 0 1 4 0v5" />
      <path d="M26 56V34h30v22M24 34h34" />
      <path d="M30 56v-9a4 4 0 0 1 8 0v9M44 56v-9a4 4 0 0 1 8 0v9" />
      <g className={styles.accent} fill="none" stroke="currentColor">
        <path d="M14 15V8M11 11h6" />
      </g>
    </>
  ),
  infrastructure: () => (
    <>
      <path d="M4 38h56" />
      <path d="M10 38c0-14 10-22 22-22s22 8 22 22" />
      <path d="M20 38V24M26 38V19M32 38V16M38 38V19M44 38V24" />
      {waves(48)}
      {waves(56)}
      <g className={styles.accent} fill="currentColor" stroke="currentColor">
        <path d="M24 41h14l-2 5H26z" />
      </g>
    </>
  ),
  locality: () => (
    <>
      <path d="M4 56h56" />
      <path d="M4 56V40l8-8 8 8v16M24 56V34l11-11 11 11v22M48 56V44l6-6 6 6v12" />
      <path d="M31 56V46h8v10M9 48h6" />
      <g className={styles.accent} fill="currentColor" stroke="currentColor">
        <circle cx="52" cy="16" r="4" />
      </g>
    </>
  ),
  volcano: () => (
    <>
      <path d="M4 56h56" />
      <path d="M8 56l18-34h12l18 34" />
      <path d="M26 22q6 5 12 0" />
      <path d="M31 16q-4-4 0-8M38 14q4-4 0-9" />
      <g className={styles.accent} fill="none" stroke="currentColor">
        <path d="M32 28v9M28 34l-3 8M36 34l3 8" />
      </g>
    </>
  ),
  archipelago: () => (
    <>
      <path d="M4 46q8-14 16 0zM22 46q10-18 20 0zM44 46q6-10 14 0z" />
      {waves(52)}
      <g className={styles.accent} fill="currentColor" stroke="currentColor">
        <circle cx="14" cy="16" r="4" />
      </g>
    </>
  ),
  island: () => (
    <>
      <path d="M10 48q22-20 44 0z" />
      <path d="M34 36q-1-10 3-18" />
      <path d="M37 18q-9-6-17-1M37 18q9-6 15-1M37 18q-5-9 2-13" />
      {waves(54)}
      <g className={styles.accent} fill="currentColor" stroke="currentColor">
        <circle cx="12" cy="14" r="4" />
      </g>
    </>
  ),
};

export function DestinationGlyph({
  kind,
  className,
}: {
  kind: DestinationKind;
  className?: string | undefined;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width="64"
      height="64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-glyph={kind}
      className={className}
    >
      {SHAPES[kind]()}
    </svg>
  );
}
