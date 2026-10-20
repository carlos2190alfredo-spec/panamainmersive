import type { ReactNode } from 'react';
import styles from './Notice.module.css';

/** Aviso informativo (traducción pendiente, contenido desactualizado, estado del mapa). */
export function Notice({
  children,
  role,
  lang,
}: {
  children: ReactNode;
  /** `status` para avisos que aparecen dinámicamente; sin rol para los estáticos. */
  role?: 'status' | 'alert';
  lang?: string;
}) {
  return (
    <div className={styles.notice} role={role} lang={lang}>
      <span aria-hidden="true" className={styles.icon} />
      <div>{children}</div>
    </div>
  );
}
