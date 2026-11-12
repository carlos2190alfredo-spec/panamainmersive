import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '@/components/StatusBadge';
import { LOCALES, type Locale } from '@/i18n/locales';
import { MESSAGES } from './messages-fixture';

/**
 * La insignia de estado de la cobertura (r0:F-01). Sola, junto al nombre de un destino, «Verificada» se lee como «destino
 * verificado» cuando es el estado de la GEOMETRÍA derivada de OpenStreetMap: en Explorar (carrusel y ficha) lleva su rótulo
 * VISIBLE; en la tabla de la ficha, donde la fila ya dice de qué es, no hace falta.
 */
const render = (locale: Locale, status: 'VERIFIED' | 'PARTIAL', label?: string): string =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={{ Coverage: MESSAGES[locale].Coverage as never }}
    >
      <StatusBadge status={status} {...(label === undefined ? {} : { label })} />
    </NextIntlClientProvider>,
  );

const coverage = (locale: Locale) =>
  MESSAGES[locale].Coverage as {
    geometryLabel: string;
    status: Record<string, string>;
  };

const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('StatusBadge', () => {
  it('sin rótulo es la insignia de siempre (la tabla de la ficha ya dice de qué es el estado)', () => {
    const html = render('es', 'VERIFIED');
    expect(html).toMatch(/^<span class="[^"]*" data-status="VERIFIED">/);
    expect(html).not.toContain('data-status-labelled');
    expect(text(html)).toBe('✓ Verificada');
  });

  it.each(LOCALES)(
    '(%s) con rótulo: «Geometría» va ANTES de la insignia, es texto visible y nombra el estado',
    (locale) => {
      const { geometryLabel, status } = coverage(locale);
      for (const kind of ['VERIFIED', 'PARTIAL'] as const) {
        const html = render(locale, kind, geometryLabel);
        expect(html).toContain('data-status-labelled');
        // el rótulo precede a la insignia en el DOM (= se lee antes y no depende del color)
        expect(html.indexOf(geometryLabel)).toBeLessThan(html.indexOf(`data-status="${kind}"`));
        // y la lectura es «<rótulo> <símbolo> <estado>»
        expect(text(html)).toBe(
          `${geometryLabel} ${kind === 'VERIFIED' ? '✓' : '◐'} ${status[kind]}`,
        );
        // texto VISIBLE: nada de aria-hidden, visually-hidden, sr-only ni display:none en el rótulo
        const labelTag =
          /<span class="([^"]*)">[^<]*<\/span>/.exec(html.replace(/^<span[^>]*>/, ''))?.[0] ?? '';
        expect(labelTag).not.toMatch(/aria-hidden|visually-hidden|sr-only|hidden/);
        expect(html).not.toMatch(/\sstyle=/);
      }
    },
  );

  it('el rótulo existe en los CINCO idiomas, es una sola palabra y no coincide con el nombre del estado', () => {
    const labels = LOCALES.map((l) => coverage(l).geometryLabel);
    expect(new Set(labels).size).toBe(5); // Geometría, Geometry, Geometria, Géométrie, Geometrie
    for (const locale of LOCALES) {
      const { geometryLabel, status } = coverage(locale);
      expect(geometryLabel.trim()).toBe(geometryLabel);
      expect(geometryLabel).not.toMatch(/\s/); // cabe sobre la insignia en el hueco que deja el botón «Ver en el mapa»
      expect(Object.values(status)).not.toContain(geometryLabel);
    }
  });

  it('Explorar pasa el rótulo en el carrusel y en la ficha (UNA sola función `geometryBadge` para los dos)', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/[locale]/explore/page.tsx'), 'utf8');
    const uses = [...page.matchAll(/<StatusBadge\b[^>]*\/>/g)].map((m) => m[0]);
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatch(/label=\{coverage\('geometryLabel'\)\}/);
    // el carrusel y la ficha usan esa función (no una insignia suelta)
    expect(page).toMatch(/renderMeta=\{\(entry\) => geometryBadge\(entry\.key\)\}/);
    expect(page).toMatch(/badge: geometryBadge\(d\.key\)/);
  });

  it('la ficha de un destino usa la insignia SIN rótulo solo dentro de la tabla (la fila ya la nombra)', () => {
    const ficha = readFileSync(
      join(process.cwd(), 'src/app/[locale]/destinations/[slug]/page.tsx'),
      'utf8',
    );
    const uses = [...ficha.matchAll(/<StatusBadge\b[^>]*\/>/g)];
    expect(uses).toHaveLength(1);
    const before = ficha.slice(0, uses[0]?.index ?? 0);
    expect(before.lastIndexOf('<th scope="row">')).toBeGreaterThan(before.lastIndexOf('</tr>'));
  });
});
