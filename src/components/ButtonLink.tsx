import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';
import styles from './ButtonLink.module.css';

/**
 * - `primary`: relleno de acento (azul de marca en claro, azul claro en oscuro).
 * - `secondary`: contorno sobre la superficie de la página.
 * - `cta`: llamada a la acción (rojo Panamá con texto blanco). El rojo SOLO vale como relleno (ADR-0025).
 * - `onBrand`: contorno claro para una banda oscura de marca (héroe, cabecera de color); no se usa sobre fondos claros.
 */
export type ButtonLinkVariant = 'primary' | 'secondary' | 'cta' | 'onBrand';

type Props = ComponentProps<typeof Link> & { variant?: ButtonLinkVariant };

const VARIANT_CLASS: Record<ButtonLinkVariant, string> = {
  primary: styles.primary ?? '',
  secondary: styles.secondary ?? '',
  cta: styles.cta ?? '',
  onBrand: styles.onBrand ?? '',
};

export function ButtonLink({ variant = 'primary', className, ...rest }: Props) {
  const classes = [styles.button, VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return <Link className={classes} {...rest} />;
}
