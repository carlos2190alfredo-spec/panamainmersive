import { getTranslations } from 'next-intl/server';
import { SITE } from '@/config/site';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './LocaleSwitcher';
import { NavLink } from './NavLink';
import styles from './SiteHeader.module.css';

export async function SiteHeader() {
  const t = await getTranslations('Nav');
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label={t('home', { siteName: SITE.name })}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.name}>{SITE.name}</span>
      </Link>
      <nav aria-label={t('main')} className={styles.nav}>
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
    </header>
  );
}
