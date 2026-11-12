import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE } from '@/config/site';
import { LOCALES, LOCALE_INFO, type Locale } from '@/i18n/locales';

/**
 * La cabecera REAL (`SiteHeader`, `NavLink`, `LocaleSwitcher`, `ButtonLink`, `BrandMark`) renderizada a HTML estático con
 * los mensajes reales de cada idioma. Solo se simulan los bordes de Next: `getTranslations` (servidor), la navegación
 * localizada y los hooks de `next/navigation`.
 *
 * Lo que se vigila es el CONTRATO de la cabecera (ADR-0025 §7 y las pruebas E2E que dependen de ella):
 *  - el selector de idioma es el PRIMER y ÚNICO `<summary>`/`<details>` del DOM (7 pruebas E2E usan `.first()`);
 *  - el menú móvil es `<button popovertarget>` + `<nav popover>`, sin JavaScript ni `<details>`;
 *  - sin encabezados ni `<aside>`/`complementary` (el panel de Explorar es el único complementary: map.mobile.spec);
 *  - navegación real (Explorar, Destinos, Fuentes) + CTA «Abrir el mapa» → /explore, y nada de «Iniciar sesión» ni
 *    «Planifica tu viaje» (no existen: ADR-0025 §9);
 *  - orden del DOM = orden visual = orden de tabulación;
 *  - ningún `style=` (la CSP de producción lo bloquea).
 */
const messages = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf8')) as Record<
      string,
      Record<string, unknown>
    >,
  ]),
) as Record<Locale, Record<string, Record<string, unknown>>>;

const state: { locale: Locale; pathname: string } = { locale: 'es', pathname: '/explore' };

vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) =>
    Promise.resolve(
      createTranslator({
        locale: state.locale,
        // La mesa de mensajes es la real; el tipo estricto de `Messages` no aporta nada aquí.
        messages: messages[state.locale] as never,
        namespace: namespace as never,
      }),
    ),
}));

type MockLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname: string };
  locale?: string;
  children?: ReactNode;
};

vi.mock('@/i18n/navigation', async () => {
  const { createElement } = await import('react');
  return {
    // La ruta interna (sin prefijo de idioma) es lo que importa: el prefijo lo pone next-intl y se prueba en e2e.
    Link: ({ href, children, ...rest }: MockLinkProps) =>
      createElement(
        'a',
        { href: typeof href === 'string' ? href : href.pathname, ...rest },
        children,
      ),
    usePathname: () => state.pathname,
  };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

async function renderHeader(locale: Locale, pathname = '/explore'): Promise<string> {
  state.locale = locale;
  state.pathname = pathname;
  const { SiteHeader } = await import('@/components/SiteHeader');
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {await SiteHeader()}
    </NextIntlClientProvider>,
  );
}

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)?.[1];

/** Todas las etiquetas `<a …>…</a>` con su texto. */
function links(html: string): { tag: string; text: string; href: string | undefined }[] {
  return [...html.matchAll(/<a\s[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    tag: m[0].slice(0, m[0].indexOf('>') + 1),
    text: m[1]?.replace(/<[^>]+>/g, '').trim() ?? '',
    href: attr(m[0].slice(0, m[0].indexOf('>') + 1), 'href'),
  }));
}

beforeEach(() => {
  state.locale = 'es';
  state.pathname = '/explore';
});

describe('SiteHeader: estructura', () => {
  it('es UN <header> (landmark banner) y no lleva encabezados ni <aside>', async () => {
    const html = await renderHeader('es');
    expect(html.match(/<header[\s>]/g)).toHaveLength(1);
    expect(html).not.toMatch(/<h[1-6][\s>]/);
    expect(html).not.toMatch(/<aside[\s>]/);
    expect(html).not.toMatch(/role="(?:complementary|search|banner|heading)"/);
  });

  it('el selector de idioma es el ÚNICO <details> y el ÚNICO <summary> del DOM (el menú móvil no usa ninguno)', async () => {
    const html = await renderHeader('es');
    expect(html.match(/<details[\s>]/g)).toHaveLength(1);
    expect(html.match(/<summary[\s>]/g)).toHaveLength(1);
    // Y el <summary> es el del selector de idioma (cuyo texto accesible es «Seleccionar idioma: …»).
    const summary = /<summary[\s\S]*?<\/summary>/.exec(html)?.[0] ?? '';
    expect(summary).toContain(messages.es.Language?.['menu']);
  });

  it('el menú móvil es <button popovertarget> + <nav popover> enlazados por el mismo id, sin JavaScript', async () => {
    const html = await renderHeader('es');
    const button = /<button[^>]*>/.exec(html)?.[0] ?? '';
    const nav = /<nav[^>]*>/.exec(html)?.[0] ?? '';
    expect(html.match(/<button[\s>]/g)).toHaveLength(1);
    expect(attr(button, 'type')).toBe('button');
    expect(attr(button, 'popovertarget')).toBe('site-menu');
    expect(attr(button, 'aria-controls')).toBe('site-menu');
    expect(attr(button, 'aria-label')).toBe(messages.es.Nav?.['menu']);
    // Un botón con solo icono: el icono es decorativo.
    expect(/<button[\s\S]*?<\/button>/.exec(html)?.[0]).toContain('aria-hidden="true"');
    expect(attr(nav, 'id')).toBe('site-menu');
    expect(attr(nav, 'popover')).toBe('auto');
    expect(attr(nav, 'aria-label')).toBe(messages.es.Nav?.['main']);
    expect(html).not.toMatch(/<script/);
    // `aria-expanded` estático mentiría (nadie lo actualizaría sin JS): lo expone el navegador con el popover.
    expect(html).not.toMatch(/aria-expanded/);
  });

  it('orden del DOM = orden visual: marca → botón del menú → navegación → idioma → CTA', async () => {
    const html = await renderHeader('es');
    const at = (needle: string | RegExp): number => {
      const i = typeof needle === 'string' ? html.indexOf(needle) : html.search(needle);
      expect(i, String(needle)).toBeGreaterThanOrEqual(0);
      return i;
    };
    const order = [
      at('aria-label="Panamá Immersive, ir al inicio"'),
      at('<button'),
      at('<nav'),
      at('<details'),
      at(/<a [^>]*href="\/explore"[^>]*>Abrir el mapa/),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('la marca: enlace al inicio con aria-label, imagen decorativa y rótulo vivo oculto a los lectores', async () => {
    const html = await renderHeader('es');
    const brand = links(html)[0];
    expect(brand?.href).toBe('/');
    expect(attr(brand?.tag ?? '', 'aria-label')).toBe('Panamá Immersive, ir al inicio');
    const brandHtml = /<a [^>]*href="\/"[\s\S]*?<\/a>/.exec(html)?.[0] ?? '';
    expect(brandHtml).toMatch(/<img [^>]*alt=""/);
    expect(brandHtml).toMatch(/<img [^>]*loading="eager"/);
    expect(brandHtml).not.toMatch(/fetchpriority/i);
    // El rótulo es TEXTO vivo (no una imagen de texto) y no se lee dos veces.
    expect(brandHtml).toMatch(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*Panamá[\s\S]*Immersive/);
    expect(`${SITE.wordmark.primary} ${SITE.wordmark.secondary}`).toBe(SITE.name);
  });

  it('nunca deja un style= en el HTML (la CSP de producción lo bloquea)', async () => {
    for (const locale of LOCALES) expect(await renderHeader(locale)).not.toMatch(/\sstyle\s*=/i);
  });
});

describe.each(LOCALES)('SiteHeader en «%s»', (locale) => {
  it('tres enlaces de navegación reales con el texto del idioma + el CTA a /explore', async () => {
    const html = await renderHeader(locale, '/');
    const nav = /<nav[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
    const t = messages[locale].Nav as Record<string, string>;
    expect(links(nav).map((l) => [l.href, l.text])).toEqual([
      ['/explore', t['explore']],
      ['/destinations', t['destinations']],
      ['/sources', t['sources']],
    ]);
    const cta = links(html).find((l) => l.text === t['cta']);
    expect(cta?.href).toBe('/explore');
    expect(cta?.tag).toMatch(/class="[^"]*\b[^" ]*cta[^"]*"/); // la clase de la variante rellena
  });

  it('los cinco idiomas del selector, cada uno con su lang/hreflang y su endónimo', async () => {
    const html = await renderHeader(locale);
    const switcher = links(html).filter((l) => attr(l.tag, 'hreflang') !== undefined);
    expect(switcher.map((l) => l.text)).toEqual(LOCALES.map((l) => LOCALE_INFO[l].endonym));
    expect(
      switcher.map((l) => attr(l.tag, 'hreflang')),
      'solo estos cinco enlaces llevan hreflang (e2e/i18n.spec.ts espera exactamente 5)',
    ).toEqual(LOCALES.map((l) => LOCALE_INFO[l].htmlLang));
    expect(switcher.filter((l) => attr(l.tag, 'aria-current') === 'true')).toHaveLength(1);
  });

  it('no hay «Iniciar sesión», «Planifica tu viaje», cuentas ni rutas inexistentes', async () => {
    const html = await renderHeader(locale);
    expect(html).not.toMatch(
      /log ?in|sign ?in|iniciar sesi|planifica|plan your|connexion|anmelden|entrar/i,
    );
    for (const l of links(html)) {
      expect(l.href, l.text).toMatch(/^\/(?:$|explore$|destinations$|sources$)|^\/destinations\//);
    }
  });
});

describe('SiteHeader: página actual', () => {
  it.each([
    ['/explore', 'Explorar'],
    ['/destinations', 'Destinos'],
    ['/destinations/[slug]', 'Destinos'],
    ['/sources', 'Fuentes'],
  ])('en %s marca SOLO «%s» con aria-current="page"', async (pathname, label) => {
    const html = await renderHeader('es', pathname);
    const nav = /<nav[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
    // `usePathname` devuelve la ruta INTERNA (con la plantilla `[slug]` en la ficha): sigue siendo hija de /destinations.
    const current = links(nav).filter((l) => attr(l.tag, 'aria-current') === 'page');
    expect(current.map((l) => l.text)).toEqual([label]);
  });

  it('en la portada no marca ninguna página', async () => {
    const html = await renderHeader('es', '/');
    expect(html).not.toMatch(/aria-current="page"/);
  });
});
