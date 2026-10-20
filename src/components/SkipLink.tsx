import { getTranslations } from 'next-intl/server';
import styles from './SkipLink.module.css';

export async function SkipLink() {
  const t = await getTranslations('Common');
  return (
    <a className={styles.skip} href="#main-content">
      {t('skipToContent')}
    </a>
  );
}
