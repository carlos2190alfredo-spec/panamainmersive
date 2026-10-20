import '@fontsource-variable/fraunces/index.css';
import '@fontsource-variable/figtree/index.css';
import '@/styles/tokens.css';
import '@/styles/base.css';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { SkipLink } from '@/components/SkipLink';
import { SITE } from '@/config/site';
import { LOCALES, LOCALE_INFO } from '@/i18n/locales';
import { assertLocale, type LocaleParams } from '@/lib/params';
import { getEnv } from '@/config/env';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4efe4' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1a20' },
  ],
};

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Meta' });
  const env = getEnv();
  return {
    metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
    applicationName: SITE.name,
    title: { default: SITE.name, template: `%s · ${SITE.name}` },
    description: t('home.description', { siteName: SITE.name }),
    // Respaldo: fuera de producción nada se indexa. Cada página lo recalcula con su política.
    robots: env.SITE_ENV === 'production' ? undefined : { index: false, follow: false },
  };
}

/** Solo los namespaces que usan componentes de cliente: cada idioma viaja con lo mínimo. */
const CLIENT_NAMESPACES = ['Language'] as const;

export default async function LocaleLayout({
  children,
  params,
}: { children: ReactNode } & LocaleParams) {
  const locale = assertLocale((await params).locale);
  const info = LOCALE_INFO[locale];
  const all = await getMessages();
  const clientMessages = Object.fromEntries(CLIENT_NAMESPACES.map((ns) => [ns, all[ns]]));

  return (
    <html lang={info.htmlLang} dir={info.dir}>
      <body>
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          <SkipLink />
          <SiteHeader />
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
