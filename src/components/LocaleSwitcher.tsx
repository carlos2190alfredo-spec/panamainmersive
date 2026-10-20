'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense, useEffect, useRef } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { LOCALES, LOCALE_INFO } from '@/i18n/locales';
import { queryFromSearchParams, switchTarget, type Query } from '@/lib/locale-switch';
import styles from './LocaleSwitcher.module.css';

function LocaleLinks({ query }: { query: Query | undefined }) {
  const current = useLocale();
  const pathname = usePathname();
  const params = useParams<{ slug?: string }>();
  const t = useTranslations('Language');

  return (
    <ul className={styles.list} aria-describedby="locale-help">
      {LOCALES.map((locale) => {
        const info = LOCALE_INFO[locale];
        const href = switchTarget(pathname, params, current, locale, query);
        return (
          <li key={locale}>
            <Link
              href={href}
              locale={locale}
              lang={info.htmlLang}
              hrefLang={info.htmlLang}
              aria-current={locale === current ? 'true' : undefined}
              className={styles.option}
            >
              {info.endonym}
            </Link>
          </li>
        );
      })}
      <li id="locale-help" className={styles.help}>
        {t('help')}
      </li>
    </ul>
  );
}

function QueryAwareLinks() {
  const searchParams = useSearchParams();
  return (
    <LocaleLinks query={queryFromSearchParams(new URLSearchParams(searchParams.toString()))} />
  );
}

export function LocaleSwitcher() {
  const t = useTranslations('Language');
  const locale = useLocale();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Escape cierra el menú y devuelve el foco al botón; un clic fuera también lo cierra.
  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && el.open) {
        el.open = false;
        el.querySelector('summary')?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (el.open && e.target instanceof Node && !el.contains(e.target)) el.open = false;
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <details className={styles.root} ref={detailsRef}>
      <summary className={styles.summary}>
        <span className="visually-hidden">{t('menu')}: </span>
        <span aria-hidden="true" className={styles.globe} />
        <span lang={LOCALE_INFO[locale].htmlLang}>{LOCALE_INFO[locale].endonym}</span>
      </summary>
      <div className={styles.panel}>
        {/* useSearchParams exige Suspense en páginas estáticas; el respaldo ya son enlaces válidos. */}
        <Suspense fallback={<LocaleLinks query={undefined} />}>
          <QueryAwareLinks />
        </Suspense>
      </div>
    </details>
  );
}
