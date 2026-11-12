import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_ATTRIBUTION } from '@/domains/geography/sources';
import { LOCALES, type Locale } from '@/i18n/locales';

/**
 * El pie REAL de cada idioma (ADR-0025 §7): los CUATRO enlaces reales, la marca con su lema, «Versión de desarrollo» y
 * la atribución de datos en su idioma original (`lang="en"`). Sin redes sociales, boletín, contacto ni enlaces legales
 * (no existen), sin encabezados y sin landmark complementary.
 */
const messages = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf8')) as Record<
      string,
      Record<string, string>
    >,
  ]),
) as Record<Locale, Record<string, Record<string, string>>>;

const state: { locale: Locale } = { locale: 'es' };

vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) =>
    Promise.resolve(
      createTranslator({
        locale: state.locale,
        messages: messages[state.locale] as never,
        namespace: namespace as never,
      }),
    ),
}));

type MockLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname: string };
  children?: ReactNode;
};

vi.mock('@/i18n/navigation', async () => {
  const { createElement } = await import('react');
  return {
    Link: ({ href, children, ...rest }: MockLinkProps) =>
      createElement(
        'a',
        { href: typeof href === 'string' ? href : href.pathname, ...rest },
        children,
      ),
  };
});

async function renderFooter(locale: Locale): Promise<string> {
  state.locale = locale;
  const { SiteFooter } = await import('@/components/SiteFooter');
  return renderToStaticMarkup(await SiteFooter());
}

beforeEach(() => {
  state.locale = 'es';
});

describe.each(LOCALES)('SiteFooter en «%s»', (locale) => {
  const t = messages[locale];

  it('un <footer> con el nav del pie y los CUATRO enlaces reales, en este orden', async () => {
    const html = await renderFooter(locale);
    expect(html.match(/<footer[\s>]/g)).toHaveLength(1);
    const nav = /<nav[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
    expect(nav).toContain(`aria-label="${t.Nav?.['footer']}"`);
    const links = [...nav.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(links).toEqual([
      ['/explore', t.Nav?.['explore']],
      ['/destinations', t.Nav?.['destinations']],
      ['/sources', t.Nav?.['sources']],
      ['/accessibility', t.Nav?.['accessibility']],
    ]);
  });

  it('lleva el lema de la marca, la versión de desarrollo y la atribución de datos con lang="en"', async () => {
    const html = await renderFooter(locale);
    expect(html).toContain(`>${t.Brand?.['tagline']}</p>`);
    expect(html).toContain(t.Footer?.['development']);
    expect(html).toContain(`${t.Footer?.['dataLabel']}: `);
    expect(html).toContain(`<span lang="en">${DATA_ATTRIBUTION.replace('&', '&amp;')}</span>`);
  });

  it('la marca es una imagen decorativa (alt vacío) y perezosa, sin style=', async () => {
    const html = await renderFooter(locale);
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toMatch(/<img [^>]*src="\/brand\/mark-map-320\.webp"[^>]*alt=""/);
    expect(html).toMatch(/<img [^>]*loading="lazy"/);
    expect(html).not.toMatch(/\sstyle\s*=/i);
  });

  it('sin encabezados, sin landmark complementary y sin redes, boletín, contacto ni enlaces legales', async () => {
    const html = await renderFooter(locale);
    expect(html).not.toMatch(/<h[1-6][\s>]/);
    expect(html).not.toMatch(/<aside[\s>]|role="complementary"/);
    expect(html).not.toMatch(/<form|<input|<button|mailto:|https?:\/\//i);
    expect(html.match(/<a /g)).toHaveLength(4);
  });
});
