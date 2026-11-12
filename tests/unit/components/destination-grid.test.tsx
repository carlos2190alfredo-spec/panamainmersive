// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DestinationGrid } from '@/components/DestinationGrid';
import {
  DESTINATIONS,
  DESTINATION_KEYS,
  destinationName,
  destinationSlug,
} from '@/domains/tourism/destinations';
import { LOCALES, type Locale } from '@/i18n/locales';
import { MESSAGES } from './messages-fixture';

vi.mock('@/i18n/navigation', async () => (await import('./nav-mock')).navigationMock);

/** Dos enlaces hermanos por tarjeta (ficha + «Ver en el mapa»), pictograma decorativo, sin fotos ni textos inventados. */
function render(
  locale: Locale,
  entries?: Parameters<typeof DestinationGrid>[0]['entries'],
): Document {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      <DestinationGrid {...(entries ? { entries } : {})} />
    </NextIntlClientProvider>,
  );
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

const t = (locale: Locale, path: string): string =>
  path
    .split('.')
    .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], MESSAGES[locale]) as string;

describe.each(LOCALES)('DestinationGrid (%s)', (locale) => {
  const doc = render(locale);
  const items = [...doc.querySelectorAll<HTMLElement>('ul > li[data-destination]')];

  it('nueve tarjetas, una por destino y en el orden del registro, con su clave y su tipo', () => {
    expect(items.map((li) => li.dataset.destination)).toEqual(DESTINATION_KEYS);
    expect(items.map((li) => li.dataset.kind)).toEqual(DESTINATIONS.map((d) => d.kind));
    expect(doc.querySelectorAll('ul')).toHaveLength(1);
  });

  it('el PRIMER enlace de cada tarjeta es el de la ficha (nombre + tipo) en el slug de ESTE idioma', () => {
    DESTINATIONS.forEach((d, i) => {
      const main = items[i]?.querySelector('a');
      expect(main?.getAttribute('data-href'), d.key).toBe(
        JSON.stringify({
          pathname: '/destinations/[slug]',
          params: { slug: destinationSlug(d, locale) },
        }),
      );
      expect(main?.textContent, d.key).toContain(destinationName(d, locale));
      expect(main?.textContent, d.key).toContain(t(locale, `DestinationKind.${d.kind}`));
    });
  });

  it('el enlace «Ver en el mapa» es HERMANO del principal (nunca anidado), lleva la CLAVE y empieza por su texto visible', () => {
    DESTINATIONS.forEach((d, i) => {
      const links = [...(items[i]?.querySelectorAll('a') ?? [])];
      expect(links, d.key).toHaveLength(2);
      const [main, map] = links;
      expect(main?.contains(map ?? null), `${d.key}: anidado`).toBe(false);
      expect(map?.parentElement, d.key).toBe(main?.parentElement);
      expect(map?.getAttribute('data-href'), d.key).toBe(
        JSON.stringify({ pathname: '/explore', query: { d: d.key } }),
      );
      const visible = map?.textContent ?? '';
      expect(visible).toBe(t(locale, 'Map.showOnMap'));
      // WCAG 2.5.3: el nombre accesible EMPIEZA por el texto visible y añade el destino.
      const label = map?.getAttribute('aria-label') ?? '';
      expect(label.startsWith(visible), d.key).toBe(true);
      expect(label, d.key).toContain(destinationName(d, locale));
    });
  });

  it('un pictograma decorativo por tarjeta, en un hueco `.media`, sin fotos ni encabezados ni estilos en línea', () => {
    for (const li of items) {
      const glyph = li.querySelector('svg');
      expect(glyph?.getAttribute('aria-hidden')).toBe('true');
      expect(glyph?.getAttribute('data-glyph')).toBe(li.dataset.kind);
      expect(li.querySelector('[class*="media"] > svg')).not.toBeNull();
      expect(li.querySelector('a svg'), 'el pictograma va fuera del enlace').toBeNull();
    }
    expect(doc.querySelector('img, picture, h1, h2, h3, h4, h5, h6, [style]')).toBeNull();
  });

  it('solo texto del registro y de los mensajes: nombre, tipo y «Ver en el mapa» (nada inventado)', () => {
    for (const li of items) {
      const words = li.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const d = DESTINATIONS.find((x) => x.key === li.dataset.destination);
      expect(d).toBeDefined();
      expect(words).toBe(
        `${destinationName(d!, locale)} ${t(locale, `DestinationKind.${d!.kind}`)}${t(locale, 'Map.showOnMap')}`,
      );
    }
  });
});

describe('DestinationGrid: contrato', () => {
  it('acepta un subconjunto de destinos (lo reutilizará otra pantalla)', () => {
    const doc = render('es', DESTINATIONS.slice(0, 2));
    expect(doc.querySelectorAll('li[data-destination]')).toHaveLength(2);
  });

  it('es estática: no depende del día ni de la cobertura (sin insignias que caduquen) ni es de cliente', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/DestinationGrid.tsx'), 'utf8');
    expect(source).not.toMatch(/'use client'/);
    expect(source).not.toMatch(/lib\/today|coverage-evidence|StatusBadge|Date\.now|new Date/);
  });
});
