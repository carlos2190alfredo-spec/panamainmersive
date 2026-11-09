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

/**
 * Insignia del estado de una capacidad de cobertura (geometría, relieve…). **Sin `label` solo vale donde la fila o el
 * encabezado ya dicen de QUÉ es el estado** (la tabla de la ficha: «Geometría (Overture/OpenStreetMap)» | «Verificada»).
 * Fuera de ahí, sola junto al nombre de un destino, «Verificada» se lee como «el destino está verificado» cuando es el estado de
 * la GEOMETRÍA derivada de OpenStreetMap (r0:F-01): el carrusel y la ficha de Explorar pasan `label` y se ve «Geometría ✓
 * Verificada». El rótulo es texto visible (no solo para lectores de pantalla) y va ANTES de la insignia en el DOM.
 */
export function StatusBadge({ status, label }: { status: CoverageStatus; label?: string }) {
  const t = useTranslations('Coverage.status');
  const badge = (
    <span className={`${styles.badge} ${styles[status]}`} data-status={status}>
      <span aria-hidden="true" className={styles.symbol}>
        {SYMBOL[status]}
      </span>
      {t(status)}
    </span>
  );
  if (label === undefined) return badge;
  return (
    <span className={styles.labelled} data-status-labelled>
      <span className={styles.label}>{label}</span>
      {badge}
    </span>
  );
}
