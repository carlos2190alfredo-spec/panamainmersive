import { getTranslations } from 'next-intl/server';
import { DATA_ATTRIBUTION } from '@/domains/geography/sources';
import { Link } from '@/i18n/navigation';
import styles from './SiteFooter.module.css';

export async function SiteFooter() {
  const t = await getTranslations('Footer');
  const nav = await getTranslations('Nav');
  return (
    <footer className={styles.footer}>
      <nav aria-label={nav('footer')} className={styles.nav}>
        <ul className={styles.list}>
          <li>
            <Link href="/sources">{t('sourcesLink')}</Link>
          </li>
          <li>
            <Link href="/accessibility">{nav('accessibility')}</Link>
          </li>
        </ul>
      </nav>
      <p className={styles.note}>
        {t('development')} {t('dataLabel')}: {/* La atribución conserva su texto original. */}
        <span lang="en">{DATA_ATTRIBUTION}</span>
      </p>
    </footer>
  );
}
