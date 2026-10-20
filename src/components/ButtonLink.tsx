import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';
import styles from './ButtonLink.module.css';

type Props = ComponentProps<typeof Link> & { variant?: 'primary' | 'secondary' };

export function ButtonLink({ variant = 'primary', className, ...rest }: Props) {
  const classes = [styles.button, variant === 'primary' ? styles.primary : styles.secondary, className]
    .filter(Boolean)
    .join(' ');
  return <Link className={classes} {...rest} />;
}
