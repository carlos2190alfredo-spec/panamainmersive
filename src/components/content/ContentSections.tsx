import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Notice } from '@/components/Notice';
import type { DestinationContentView, VerifiedItem } from '@/domains/content/completeness';
import { isLanguageTag } from '@/domains/content/language-tag';
import { safeHttpsUrl } from '@/domains/geography/area-detail';
import {
  formatCalendarDate,
  formatElevation,
  formatLanguageName,
  formatPanamaDateTime,
} from '@/i18n/format';
import { LOCALE_INFO, type Locale } from '@/i18n/locales';
import styles from './ContentSections.module.css';

/**
 * Contenido editorial de la ficha (ADR-0019). Todo lo que se muestra es una afirmación VERIFICADA con sus fuentes,
 * vigencia y confianza; lo demás se dice con palabras: vencido, en disputa, o sin datos verificados. Nunca se
 * presenta un texto en español como traducido ni se muestra una traducción que nadie revisó.
 */
export function ContentSections({
  view,
  locale,
  generatedAt,
}: {
  view: DestinationContentView;
  locale: Locale;
  /** Cuándo se exportó el contenido publicado (`null`: nunca; la instantánea está vacía). */
  generatedAt: string | null;
}) {
  const t = useTranslations('Content');
  const destinations = useTranslations('Destinations');
  const fieldLabel = (key: string) => t(`fields.${key}` as 'fields.overview.summary');
  // «Sin redactar» solo si NO hay nada que decir: con un campo vencido o en disputa sí se redactó, y el aviso
  // de abajo lo cuenta; los dos mensajes juntos se contradirían.
  const hasContent =
    view.verified.length > 0 || view.expired.length > 0 || view.disputed.length > 0;

  return (
    <>
      {!hasContent ? (
        <Notice>
          <p>{destinations('contentPending')}</p>
        </Notice>
      ) : null}

      {view.verified.map((item) => (
        <VerifiedField key={item.field.key} item={item} locale={locale} />
      ))}

      {view.expired.map((e) => (
        <Notice key={e.field.key}>
          <p>
            {t('expired', {
              field: fieldLabel(e.field.key),
              date: formatCalendarDate(locale, e.validUntil),
            })}
          </p>
        </Notice>
      ))}

      {view.disputed.map((field) => (
        <Notice key={field.key}>
          <p>{t('disputed', { field: fieldLabel(field.key) })}</p>
        </Notice>
      ))}

      {view.unknown.length > 0 ? (
        <section aria-labelledby="content-unknown-title" className={styles.unknown}>
          <h3 id="content-unknown-title">{t('unknownHeading')}</h3>
          <p>{t('unknownLead')}</p>
          <ul>
            {view.unknown.map((field) => (
              <li key={field.key}>{fieldLabel(field.key)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* La instantánea es una para todo el sitio: su fecha es la del sitio, y solo se muestra si esta ficha publica algo. */}
      {generatedAt !== null && hasContent ? (
        <p className={styles.meta}>
          {t('siteContentUpdatedOn', {
            date: formatPanamaDateTime(locale, new Date(generatedAt), { dateStyle: 'long' }),
          })}
        </p>
      ) : null}
    </>
  );
}

function VerifiedField({ item, locale }: { item: VerifiedItem; locale: Locale }) {
  const t = useTranslations('Content');
  const common = useTranslations('Common');
  const headingId = `content-${item.field.key.replace('.', '-')}`;
  const label = t(`fields.${item.field.key}` as 'fields.overview.summary');
  const text = item.text;

  return (
    <article aria-labelledby={headingId} className={styles.item}>
      <h3 id={headingId}>{label}</h3>

      {item.quantity ? (
        <p className={styles.value}>{formatElevation(locale, item.quantity.value, 'metric')}</p>
      ) : null}

      {text?.kind === 'original_fallback' ? (
        <>
          <p className={styles.fallback}>
            {t('originalShown', {
              language: formatLanguageName(locale, text.locale),
              reason: t(`reason.${text.reason}`),
            })}
          </p>
          <p className={styles.text} lang={LOCALE_INFO[text.locale].htmlLang}>
            {text.text}
          </p>
        </>
      ) : null}
      {text?.kind === 'exact' ? (
        <>
          <p className={styles.text} lang={LOCALE_INFO[text.locale].htmlLang}>
            {text.text}
          </p>
          {text.translated ? <p className={styles.meta}>{t('translationReviewed')}</p> : null}
        </>
      ) : null}

      <p className={styles.meta}>
        {[
          t('verifiedOn', {
            date: formatPanamaDateTime(locale, new Date(item.verifiedAt), { dateStyle: 'long' }),
          }),
          item.validUntil === null
            ? null
            : t('validUntil', { date: formatCalendarDate(locale, item.validUntil) }),
          t('confidenceLine', { level: t(`confidence.${item.confidence}`) }),
        ]
          .filter((part): part is string => part !== null)
          .join(' · ')}
      </p>

      <h4 className={styles.sourcesHeading}>{t('sources')}</h4>
      <ul className={styles.sources}>
        {item.sources.map((source) => {
          const href = safeHttpsUrl(source.url);
          // WCAG 3.1.2: el título, la institución, la licencia y el localizador están en el idioma del DOCUMENTO. Solo se
          // marca si se SABE (y está bien formado: defensa en profundidad, igual que `safeHttpsUrl`); nunca se adivina.
          const language = isLanguageTag(source.language) ? source.language : undefined;
          const inSourceLanguage = (chunks: ReactNode): ReactNode =>
            language ? <span lang={language}>{chunks}</span> : chunks;
          return (
            <li key={source.id}>
              {href ? (
                <a href={href} lang={language} rel="noopener noreferrer" target="_blank">
                  {source.title}
                  <span
                    className="visually-hidden"
                    lang={language ? LOCALE_INFO[locale].htmlLang : undefined}
                  >
                    {' '}
                    {common('opensInNewTab')}
                  </span>
                </a>
              ) : (
                <span lang={language}>{source.title}</span>
              )}
              {' · '}
              {inSourceLanguage(source.institution)}
              <span className={styles.meta}>
                {' '}
                {t.rich('sourceMeta', {
                  date: formatPanamaDateTime(locale, new Date(source.retrievedAt), {
                    dateStyle: 'long',
                  }),
                  license: source.license.name,
                  doc: inSourceLanguage,
                })}
                {source.locator ? (
                  <>
                    {' · '}
                    {t.rich('locator', { locator: source.locator, doc: inSourceLanguage })}
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
