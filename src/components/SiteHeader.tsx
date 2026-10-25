import { getTranslations } from 'next-intl/server';
import { SITE } from '@/config/site';
import { Link } from '@/i18n/navigation';
import { BrandMark } from './BrandMark';
import { ButtonLink } from './ButtonLink';
import { LocaleSwitcher } from './LocaleSwitcher';
import { NavLink } from './NavLink';
import styles from './SiteHeader.module.css';

/** Identificador del menú desplegable: lo comparten el botón (`popovertarget`) y la navegación (`popover`). */
const MENU_ID = 'site-menu';

/**
 * Cabecera del sitio (ADR-0025 §7). Altura EXACTA `--header-height` en todos los anchos (el mapa de Explorar mide
 * `100dvh − esa altura`): una sola fila, sin envolver. Orden del DOM = orden visual = orden de tabulación:
 *   marca → [botón del menú] → navegación → selector de idioma → llamada a la acción.
 *
 * El menú de pantallas estrechas es la API Popover NATIVA (`<button popovertarget>` + `<nav popover>`): sin JavaScript,
 * sin hidratación y sin `<details>`/`<summary>` (el selector de idioma debe seguir siendo el PRIMER `<summary>` del DOM:
 * lo asumen varias pruebas E2E). Escape, clic fuera y devolver el foco al botón los da el navegador. En navegadores sin
 * soporte el botón no se muestra y los enlaces quedan visibles en línea (ver SiteHeader.module.css).
 *
 * Sin «Iniciar sesión» ni «Planifica tu viaje»: no existen cuentas ni planificador (ADR-0025 §9).
 */
export async function SiteHeader() {
  const t = await getTranslations('Nav');
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label={t('home', { siteName: SITE.name })}>
        <BrandMark size="header" loading="eager" />
        {/* El nombre accesible ya lo da el aria-label del enlace: el rótulo es solo su forma visible. */}
        <span className={styles.wordmark} aria-hidden="true">
          <span className={styles.primary}>{SITE.wordmark.primary}</span>{' '}
          <span className={styles.secondary}>{SITE.wordmark.secondary}</span>
        </span>
      </Link>
      <button
        type="button"
        className={styles.menuButton}
        popoverTarget={MENU_ID}
        aria-controls={MENU_ID}
        aria-label={t('menu')}
      >
        <span className={styles.menuIcon} aria-hidden="true" />
      </button>
      <nav id={MENU_ID} popover="auto" aria-label={t('main')} className={styles.nav}>
        <ul className={styles.list}>
          <li>
            <NavLink href="/explore" className={styles.link}>
              {t('explore')}
            </NavLink>
          </li>
          <li>
            <NavLink href="/destinations" className={styles.link}>
              {t('destinations')}
            </NavLink>
          </li>
          <li>
            <NavLink href="/sources" className={styles.link}>
              {t('sources')}
            </NavLink>
          </li>
        </ul>
      </nav>
      <LocaleSwitcher />
      <ButtonLink variant="cta" href="/explore" className={styles.cta}>
        {t('cta')}
      </ButtonLink>
    </header>
  );
}
