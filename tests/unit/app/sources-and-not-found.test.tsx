// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BLOCKED_SOURCES, USED_SOURCES } from '@/domains/geography/sources';
import { LOCALES, type Locale } from '@/i18n/locales';
import { MESSAGES } from '../components/messages-fixture';

const state = vi.hoisted(() => ({ locale: 'es' }));

vi.mock('@/i18n/navigation', async () => (await import('../components/nav-mock')).navigationMock);

// `next-intl/server` necesita el contexto de una petición de Next: se sustituye por traductores sobre los mensajes reales.
vi.mock('next-intl/server', async () => {
  const { createTranslator: create } = await import('next-intl');
  const { MESSAGES: all } = await import('../components/messages-fixture');
  type Arg = string | { locale?: string; namespace?: string } | undefined;
  return {
    getTranslations: (arg?: Arg) => {
      const namespace = typeof arg === 'string' ? arg : arg?.namespace;
      const locale = (typeof arg === 'object' ? arg.locale : undefined) ?? state.locale;
      return Promise.resolve(
        create({ locale, messages: all[locale as Locale] as never, namespace } as never),
      );
    },
  };
});

const { default: SourcesPage } = await import('@/app/[locale]/sources/page');
const { default: NotFound, generateMetadata } = await import('@/app/[locale]/not-found');

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

async function renderSources(locale: Locale): Promise<Document> {
  state.locale = locale;
  const html = renderToStaticMarkup(await SourcesPage());
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

describe('/fuentes: la tabla desplazable y su sección no comparten nombre (r2:F1, landmark-unique)', () => {
  it.each(LOCALES)(
    '%s: la región desplazable se nombra con el encabezado y su sección NO es un hito con el mismo nombre',
    async (locale) => {
      const doc = await renderSources(locale);
      const region = doc.querySelector('[role="region"]');
      expect(region).not.toBeNull();
      const labelledBy = region?.getAttribute('aria-labelledby') ?? '';
      expect(doc.getElementById(labelledBy)?.tagName).toBe('H2');
      // La sección que la contiene no lleva `aria-labelledby`: sin nombre no es un hito `region` y no duplica el de la tabla
      const section = region?.closest('section');
      expect(section).not.toBeNull();
      expect(section?.hasAttribute('aria-labelledby')).toBe(false);
      expect(section?.hasAttribute('aria-label')).toBe(false);
      // Ningún nombre de hito se repite en la página
      const names = [...doc.querySelectorAll('[role="region"], section[aria-labelledby]')].map(
        (el) => doc.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent,
      );
      expect(new Set(names).size).toBe(names.length);
    },
  );

  it('la ficha de destino tampoco duplica el nombre de su tabla (misma regla en el código de la página)', () => {
    const source = read('src/app/[locale]/destinations/[slug]/page.tsx');
    expect(source).not.toMatch(/<section[^>]*aria-labelledby="data-title"/);
    expect(source).toMatch(/<ScrollRegion labelledBy="data-title">/);
    expect(source).toMatch(/<h2 id="data-title">/);
  });
});

describe('/fuentes: cada celda marcada `lang="en"` está en inglés (r0:F-14)', () => {
  // Palabras corrientes del español que no pueden aparecer dentro de una celda `lang="en"` (los nombres propios siguen intactos)
  const SPANISH = /\b(datos|derivados|glifos|de la|del|con|para|usando|fuente|vía|sobre)\b/i;

  it('los datos de las fuentes usadas no mezclan español en nombre, licencia ni atribución', () => {
    for (const s of USED_SOURCES) {
      for (const text of [s.name, s.license, s.attribution]) {
        expect(text, `${s.id}: ${text}`).not.toMatch(SPANISH);
      }
    }
  });

  it.each(LOCALES)(
    '%s: en la tabla renderizada, lo que lleva lang="en" es inglés',
    async (locale) => {
      const doc = await renderSources(locale);
      const english = [...doc.querySelectorAll('tbody [lang="en"]')];
      expect(english.length).toBe(USED_SOURCES.length * 3);
      for (const cell of english) expect(cell.textContent ?? '').not.toMatch(SPANISH);
      // La licencia de Overture es el caso que fallaba: «datos derivados de OpenStreetMap» dentro de una celda en inglés
      const overture = doc.querySelector('tr[data-source="overture"]');
      expect(overture?.querySelector('td[lang="en"]')?.textContent).toContain(
        'data derived from OpenStreetMap',
      );
    },
  );

  it('las fuentes sin acceso conservan sus nombres propios (no son celdas lang="en")', () => {
    expect(BLOCKED_SOURCES.length).toBeGreaterThan(0);
  });
});

describe('404: título propio y botones con aire (r0:F-10, r1:V-02)', () => {
  it.each(LOCALES)(
    '%s: el título de la pestaña es el de Meta.notFound.title (no el del sitio)',
    async (locale) => {
      state.locale = locale;
      const meta = await generateMetadata();
      const expected = createTranslator({
        locale,
        messages: MESSAGES[locale] as never,
        namespace: 'Meta',
      } as never) as unknown as (key: string) => string;
      expect(meta.title).toBe(expected('notFound.title'));
      expect(typeof meta.title === 'string' ? meta.title.length : 0).toBeGreaterThan(3);
    },
  );

  it('los dos botones van en un grupo `.actions` (flex con separación), no separados por un espacio de texto', async () => {
    state.locale = 'es';
    const html = renderToStaticMarkup(await NotFound());
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const group = doc.querySelector('.actions');
    expect(group?.querySelectorAll('a')).toHaveLength(2);
    expect(doc.querySelector('p a')).toBeNull(); // antes: <p><a/>{' '}<a/></p>
    expect(doc.querySelector('h1')).not.toBeNull();
  });

  it('el título propio ya no es una clave muerta: la 404 la usa', () => {
    expect(read('src/app/[locale]/not-found.tsx')).toContain("t('notFound.title')");
  });
});
