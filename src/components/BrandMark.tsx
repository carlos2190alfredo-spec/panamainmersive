import styles from './BrandMark.module.css';

/**
 * Marca gráfica (ADR-0025): la P con paisaje y brújula (`p`) o la silueta del país (`map`), extraídas con transparencia
 * de los diseños entregados (public/brand/*.webp). El NOMBRE «Panamá Immersive» no va en la imagen: es texto vivo
 * (`SITE.wordmark`), así que aquí `alt` es vacío por defecto (decorativa junto al rótulo; el enlace lleva su `aria-label`).
 *
 * Es un `<img>` NATIVO y no `next/image`: este emite `style="color:transparent"` en el HTML y la CSP de producción
 * (`style-src 'self'`) lo bloquea. Por eso no puede aparecer ningún `style=` aquí (tests/unit/components/brand-mark.test.tsx
 * lo vigila) y la única excepción de ESLint (`@next/next/no-img-element`) es este archivo (override en eslint.config.mjs).
 * Componente de servidor: no lleva estado ni efectos.
 *
 * El tamaño visible lo fija el CSS, no la imagen: `size` elige uno del sistema o `className` pone el suyo (con
 * `block-size`; el ancho sale de la proporción). `width`/`height` son los intrínsecos del archivo de `src` (320 px) y
 * reservan el sitio antes de descargarlo (CLS 0); `srcSet` ofrece 160/320/640 px de ancho.
 */

type Variant = 'p' | 'map';
type Size = 'header' | 'hero';

interface Mark {
  readonly file: string;
  /** Ancho → alto intrínsecos de cada archivo. */
  readonly heights: Readonly<Record<160 | 320 | 640, number>>;
}

const MARKS: Readonly<Record<Variant, Mark>> = {
  p: { file: 'mark-p', heights: { 160: 169, 320: 339, 640: 678 } },
  map: { file: 'mark-map', heights: { 160: 79, 320: 159, 640: 318 } },
};

const WIDTHS = [160, 320, 640] as const;
const DEFAULT_WIDTH = 320;

/** `sizes` según el tamaño en CSS (ver BrandMark.module.css): ancho = alto × proporción de cada variante. */
const SIZES: Readonly<Record<Size, Readonly<Record<Variant, string>>>> = {
  header: { p: '38px', map: '80px' },
  hero: { p: 'clamp(8.5rem, 25vw, 17rem)', map: 'clamp(18rem, 52vw, 36rem)' },
};
const FALLBACK_SIZES = '160px';

interface Props {
  variant?: Variant;
  /** Tamaño del sistema (cabecera o héroe). Sin él, el de la imagen limitado al contenedor; o pon tu `className`. */
  size?: Size;
  /** Vacío por defecto: decorativa. Si la imagen va sola, pasa el texto (localizado, desde los mensajes). */
  alt?: string;
  /** La marca que se ve al abrir la página (héroe): prioridad alta de descarga y carga inmediata. */
  priority?: boolean;
  /** Carga: por defecto «lazy», o «eager» con `priority`. La cabecera usa `eager` sin prioridad alta. */
  loading?: 'eager' | 'lazy';
  /** Sustituye a `size` cuando el tamaño real no es uno de los del sistema (`sizes` del HTML). */
  sizes?: string;
  className?: string;
}

export function BrandMark({
  variant = 'p',
  size,
  alt = '',
  priority = false,
  loading,
  sizes,
  className,
}: Props) {
  const mark = MARKS[variant];
  const url = (width: number) => `/brand/${mark.file}-${width}.webp`;
  const classes = [styles.mark, size ? styles[size] : undefined, className]
    .filter(Boolean)
    .join(' ');
  return (
    <img
      src={url(DEFAULT_WIDTH)}
      srcSet={WIDTHS.map((w) => `${url(w)} ${w}w`).join(', ')}
      sizes={sizes ?? (size ? SIZES[size][variant] : FALLBACK_SIZES)}
      width={DEFAULT_WIDTH}
      height={mark.heights[DEFAULT_WIDTH]}
      alt={alt}
      loading={loading ?? (priority ? 'eager' : 'lazy')}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
      className={classes}
    />
  );
}
