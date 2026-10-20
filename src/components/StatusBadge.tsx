import { useTranslations } from 'next-intl';
import type { CoverageStatus } from '@/domains/tourism/coverage-evidence';
import styles from './StatusBadge.module.css';

// Símbolo + palabra + color: el estado nunca depende solo del color (WCAG 1.4.1).
const SYMBOL: Record<CoverageStatus, string> = {
  VERIFIED: '✓',
  PARTIAL: '◐',
  UNAVAILABLE: '✕',
  UNKNOWN: '?',
  ERROR: '!',
};

export function StatusBadge({ status }: { status: CoverageStatus }) {
  const t = useTranslations('Coverage.status');
  return (
    <span className={`${styles.badge} ${styles[status]}`} data-status={status}>
      <span aria-hidden="true" className={styles.symbol}>
        {SYMBOL[status]}
      </span>
      {t(status)}
    </span>
  );
}
