'use client';

import type { ComponentProps } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

type Props = ComponentProps<typeof Link>;

/** Enlace de navegación que marca la página actual con `aria-current` (no solo con estilo). */
export function NavLink({ href, ...rest }: Props) {
  const pathname = usePathname();
  const target = typeof href === 'string' ? href : href.pathname;
  const isCurrent = pathname === target || (target !== '/' && pathname.startsWith(`${target}/`));
  return <Link href={href} aria-current={isCurrent ? 'page' : undefined} {...rest} />;
}
