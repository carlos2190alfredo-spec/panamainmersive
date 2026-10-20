import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ButtonLink';
import { Notice } from '@/components/Notice';
import { ScrollRegion } from '@/components/ScrollRegion';
import { StatusBadge } from '@/components/StatusBadge';
import { SITE } from '@/config/site';
import { getTodayIsoDate } from '@/lib/today';
import { COVERAGE, effectiveStatus } from '@/domains/tourism/coverage-evidence';
import {
  DESTINATIONS,
  destinationName,
  destinationSlug,
  getDestination,
  resolveDestinationSlug,
} from '@/domains/tourism/destinations';
import { LOCALE_INFO } from '@/i18n/locales';
import { formatCalendarDate } from '@/i18n/format';
import { permanentRedirect } from '@/i18n/navigation';
import { assertLocale } from '@/lib/params';
import { pageMetadata } from '@/lib/seo';
import styles from './page.module.css';

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Se prerrenderizan los slugs ACTUALES de cada idioma; alias y slugs de otros idiomas se resuelven bajo demanda. */
export async function generateStaticParams({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  return DESTINATIONS.map((d) => ({ slug: destinationSlug(d, locale) }));
}

async function resolve(props: Props) {
  const { locale: rawLocale, slug } = await props.params;
  const locale = assertLocale(rawLocale);
  const resolution = resolveDestinationSlug(locale, slug);
  if (resolution.kind === 'not_found') notFound();
  const entry = getDestination(resolution.key);
  if (!entry) notFound();
  return { locale, resolution, entry };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale, entry } = await resolve(props);
  const t = await getTranslations({ locale, namespace: 'Meta' });
  const name = destinationName(entry, locale);
  return pageMetadata({
    locale,
    title: t('destination.title', { name }),
    description: t('destination.description', { name, siteName: SITE.name }),
    hrefFor: (l) => ({
      pathname: '/destinations/[slug]',
      params: { slug: destinationSlug(entry, l) },
    }),
    // La ficha editorial aún no existe: no se indexan páginas vacías.
    hasRequiredFields: false,
  });
}

export default async function DestinationPage(props: Props) {
  const { locale, resolution, entry } = await resolve(props);

  // Slug anterior o de otro idioma → 308 al canónico del idioma de la URL (ADR-0003).
  if (resolution.kind === 'redirect') {
    permanentRedirect({
      href: { pathname: '/destinations/[slug]', params: { slug: resolution.slug } },
      locale,
    });
  }

  const t = await getTranslations('Destinations');
  const kinds = await getTranslations('DestinationKind');
  const capabilities = await getTranslations('Capability');
  const observations = await getTranslations('Coverage.observation');
  const editorial = await getTranslations('Editorial');
  const nav = await getTranslations('Common');

  const name = destinationName(entry, locale);
  const today = getTodayIsoDate();
  const evidence = COVERAGE[entry.key];
  const first = evidence[0];
  const isMachineTranslated = entry.names[locale].provenance === 'ai_translation_2026-10-20';

  return (
    <div className="page">
      <p>
        <ButtonLink href="/destinations" variant="secondary">
          {nav('backToDestinations')}
        </ButtonLink>
      </p>

      <h1>{name}</h1>
      <p className="lead">{kinds(entry.kind)}</p>

      {isMachineTranslated ? (
        <Notice lang={LOCALE_INFO[locale].htmlLang}>
          <p>{editorial('machineTranslatedNotice')}</p>
        </Notice>
      ) : null}

      {entry.noteKeys.length > 0 ? (
        <section aria-labelledby="notes-title" className={styles.section}>
          <h2 id="notes-title">{t('notesHeading')}</h2>
          {entry.noteKeys.map((key) => (
            <Notice key={key}>
              <p>{t(`notes.${key}`)}</p>
            </Notice>
          ))}
        </section>
      ) : null}

      <section aria-labelledby="content-title" className={styles.section}>
        <h2 id="content-title">{t('contentHeading')}</h2>
        <Notice>
          <p>{t('contentPending')}</p>
        </Notice>
      </section>

      <section aria-labelledby="data-title" className={styles.section}>
        <h2 id="data-title">{t('dataStatusHeading')}</h2>
        {first ? (
          <p className={styles.evidenceNote}>
            {t('evidenceNote', {
              date: formatCalendarDate(locale, first.observedAt),
              expires: formatCalendarDate(locale, first.expiresAt),
            })}
          </p>
        ) : null}
        <ScrollRegion labelledBy="data-title">
          <table className={styles.table}>
            <caption className="visually-hidden">{t('dataStatusHeading')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('capabilityColumn')}</th>
                <th scope="col">{t('statusColumn')}</th>
                <th scope="col">{t('observationColumn')}</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((row) => (
                <tr key={row.capability}>
                  <th scope="row">{capabilities(row.capability)}</th>
                  <td>
                    <StatusBadge status={effectiveStatus(row, today)} />
                  </td>
                  <td>{observations(row.observation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </section>

      <p>
        <ButtonLink href={{ pathname: '/explore', query: { d: entry.key } }}>
          {t('viewOnMap')}
        </ButtonLink>
      </p>
    </div>
  );
}
