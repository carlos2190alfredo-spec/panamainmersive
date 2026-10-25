import { getTranslations } from 'next-intl/server';
import { DATA_ATTRIBUTION } from '@/domains/geography/sources';
import { Link } from '@/i18n/navigation';
import { BrandMark } from './BrandMark';
import styles from './SiteFooter.module.css';

/**
 * Pie del sitio (ADR-0025 §7): Azul Profundo con texto Arena, la marca con el lema, los CUATRO enlaces reales y la
 * atribución de datos. Sin redes sociales, boletín, contacto ni enlaces legales: no existen (Accessibility.contactBody
 * dice que el canal de contacto está pendiente). Sin encabezados: es un `contentinfo`, no una sección con título.
 * Componente de servidor; los enlaces no llevan estado «actual» (sirven también de respaldo del menú de la cabecera).
 */
export async function SiteFooter() {
  const t = await getTranslations('Footer');
  const nav = await getTranslations('Nav');
  const brand = await getTranslations('Brand');
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          {/* Decorativa: el lema que la acompaña es el texto. `sizes` coincide con el alto de BrandMark en CSS (3rem). */}
          <BrandMark variant="map" className={styles.mark ?? ''} sizes="97px" />
          <p className={styles.tagline}>{brand('tagline')}</p>
        </div>
        <nav aria-label={nav('footer')}>
          <ul className={styles.list}>
            <li>
              <Link href="/explore" className={styles.link}>
                {nav('explore')}
              </Link>
            </li>
            <li>
              <Link href="/destinations" className={styles.link}>
                {nav('destinations')}
              </Link>
            </li>
            <li>
              <Link href="/sources" className={styles.link}>
                {nav('sources')}
              </Link>
            </li>
            <li>
              <Link href="/accessibility" className={styles.link}>
                {nav('accessibility')}
              </Link>
            </li>
          </ul>
        </nav>
        <p className={styles.note}>
          {t('development')} {t('dataLabel')}: {/* La atribución conserva su texto original. */}
          <span lang="en">{DATA_ATTRIBUTION}</span>
        </p>
      </div>
    </footer>
  );
}
