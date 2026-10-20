import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Envoltorios ligeros de la navegación de Next que respetan la configuración de rutas.
export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
