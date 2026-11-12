// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import type * as NextIntl from 'next-intl';
import type * as EnvModule from '@/config/env';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SITE } from '@/config/site';
import { destinationName, destinationSlug } from '@/domains/tourism/destinations';
import { ISTHMUS_PROVENANCE, travesiaStops } from '@/domains/tourism/travesia';
import { LOCALES, type Locale } from '@/i18n/locales';
import { THEME_COLORS } from '@/lib/seo';
import { MESSAGES } from '../components/messages-fixture';

const state = vi.hoisted(() => ({
  locale: 'es',
  siteEnv: 'development',
}));

// El istmo pasa por la puerta de derechos según el entorno (ADR-0026, r:D-01): el resto de la configuración, la real.
vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return { ...actual, getEnv: () => ({ ...actual.getEnv(), SITE_ENV: state.siteEnv }) };
});

vi.mock('@/i18n/navigation', async () => (await import('../components/nav-mock')).navigationMock);

// En el servidor `NextIntlClientProvider` infiere el idioma de la petición; en este entorno (build de cliente) hay que
// dárselo: el sustituto lo toma de `state.locale` cuando la página no lo pasa, como hace la aplicación real.
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof NextIntl>();
  const { createElement } = await import('react');
  return {
    ...actual,
    NextIntlClientProvider: ({ locale, ...rest }: { locale?: string; [key: string]: unknown }) =>
      createElement(actual.NextIntlClientProvider, {
        ...rest,
        locale: locale ?? state.locale,
      } as never),
  };
});

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
    getMessages: () => Promise.resolve(all[state.locale as Locale]),
  };
});

const { default: HomePage, viewport } = await import('@/app/[locale]/page');

async function renderHome(locale: Locale): Promise<Document> {
  state.locale = locale;
  const element = await HomePage({ params: Promise.resolve({ locale }) });
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {element}
    </NextIntlClientProvider>,
  );
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

const tr = (locale: Locale, namespace: string) =>
  createTranslator({
    locale,
    messages: MESSAGES[locale] as never,
    namespace,
  } as never) as unknown as (key: string, values?: Record<string, unknown>) => string;
const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
/** Fuente sin comentarios: los comentarios pueden NOMBRAR lo que el código evita. */
const code = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe.each(LOCALES)('portada (%s)', (locale) => {
  let doc: Document;
  const home = tr(locale, 'Home');

  it('se renderiza', async () => {
    doc = await renderHome(locale);
    // React 19 puede anteponer un <link rel="preload"> de la imagen prioritaria: lo que importa es UN solo contenedor.
    expect(doc.querySelectorAll('body > :not(link)')).toHaveLength(1);
  });

  it('va envuelta en `data-immersive` (activa el ámbito oscuro de marca para TODA la página)', () => {
    const root = doc.querySelector('body > :not(link)');
    expect(root?.tagName).toBe('DIV');
    expect(root?.hasAttribute('data-immersive')).toBe(true);
    expect(doc.querySelectorAll('[data-immersive]')).toHaveLength(1);
  });

  it('el héroe lleva dos capas decorativas aria-hidden, vacías y antes del contenido', () => {
    const hero = doc.querySelector('section[aria-labelledby="home-title"]');
    const layers = [...(hero?.children ?? [])].slice(0, 2);
    expect(layers.map((el) => el.tagName)).toEqual(['DIV', 'DIV']);
    for (const layer of layers) {
      expect(layer.getAttribute('aria-hidden')).toBe('true');
      expect(layer.textContent).toBe('');
      expect(layer.children).toHaveLength(0);
    }
    expect(hero?.children).toHaveLength(3); // decor, contours, contenido
  });

  it('un solo <h1> (el título de siempre) y un solo role=search', () => {
    const h1s = doc.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe(home('title'));
    expect(h1s[0]?.id).toBe('home-title');
    expect(doc.querySelector('section[aria-labelledby="home-title"]')).not.toBeNull();
    expect(doc.querySelectorAll('[role="search"], search')).toHaveLength(1);
  });

  it('jerarquía de encabezados sin saltos: h1 › h2 › 3×h3 › h2 (travesía) › 9×h3 (paradas) › h2', () => {
    const levels = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) =>
      Number(h.tagName.slice(1)),
    );
    expect(levels).toEqual([1, 2, 3, 3, 3, 2, ...Array<number>(9).fill(3), 2]);
  });

  it('héroe: eyebrow, lema, título, lead, los dos botones y DESPUÉS el buscador, en ese orden', () => {
    const copy = doc.querySelector('h1')?.parentElement;
    const texts = [...(copy?.children ?? [])].map(
      (el) => el.tagName + ':' + (el.getAttribute('role') ?? ''),
    );
    expect(texts[0]).toBe('P:');
    expect(texts[1]).toBe('P:');
    expect(copy?.children[0]?.textContent).toBe(home('eyebrow'));
    expect(copy?.children[1]?.textContent).toBe(tr(locale, 'Brand')('tagline'));
    expect(copy?.children[2]?.tagName).toBe('H1');
    expect(copy?.children[3]?.textContent).toBe(home('lead'));
    // Los botones van ANTES del buscador: la llamada principal tiene que verse sin desplazarse en un teléfono (r1:V-04)
    expect(copy?.children[5]?.getAttribute('role')).toBe('search');
    expect(copy?.children).toHaveLength(6); // la entrada escalonada de page.module.css cuenta con seis hijos
    const actions = [...(copy?.children[4]?.querySelectorAll('a') ?? [])];
    expect(actions.map((a) => a.getAttribute('data-href'))).toEqual([
      '"/explore"',
      '"/destinations"',
    ]);
    expect(actions.map((a) => a.textContent)).toEqual([
      home('ctaExplore'),
      home('ctaDestinations'),
    ]);
    expect(actions[0]?.className).toMatch(/cta/);
    expect(actions[1]?.className).toMatch(/onBrand/);
  });

  it('no promete lo que no existe: el texto de apoyo y la descripción no hablan de organizar ni planificar viajes (r0:F-06)', () => {
    const meta = tr(locale, 'Meta');
    const PROMISE =
      /organizar|planificar|planear|plan\b|plan trips|planen|planejar|organiser|planifier|organis[ae]/i;
    expect(home('lead')).not.toMatch(PROMISE);
    expect(meta('home.description', { siteName: SITE.name })).not.toMatch(PROMISE);
    expect(home('lead')).not.toMatch(/\b(trip|viaje|viagem|voyage|reise)/i);
    // El lema es del propietario y se conserva tal cual, sin afirmaciones nuevas a su lado
    expect(doc.body.textContent).toContain(tr(locale, 'Brand')('tagline'));
  });

  it('el istmo del héroe: un SVG decorativo con el contorno y los nueve destinos, y su crédito de datos como texto', () => {
    expect(doc.querySelectorAll('img')).toHaveLength(0); // la marca ya está en la cabecera
    const figure = doc.querySelector('section[aria-labelledby="home-title"] figure');
    const svg = figure?.querySelector('svg[data-isthmus="hero"]');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.querySelectorAll('[data-stop]')).toHaveLength(9);
    const travesia = tr(locale, 'Home.travesia');
    expect(svg?.textContent).toContain(travesia('caribbean'));
    expect(svg?.textContent).toContain(travesia('pacific'));
    // Sin línea entre las paradas: se leería como un itinerario (r:D-03)
    expect(svg?.querySelectorAll('path, polyline, line')).toHaveLength(0);
    // La atribución de ODbL es visible y en su idioma (es un nombre propio en inglés), con la versión y el aviso de que
    // el contorno NO es un límite oficial (r:D-04)
    const credit = figure?.querySelector('figcaption');
    expect(credit?.querySelector('span[lang="en"]')?.textContent).toBe(
      '© OpenStreetMap contributors, Overture Maps Foundation',
    );
    const raw = (MESSAGES[locale] as unknown as { Home: { travesia: { credit: string } } }).Home
      .travesia.credit;
    expect(credit?.textContent).toBe(
      raw.replace(/<\/?en>/g, '').replace('{release}', ISTHMUS_PROVENANCE.release),
    );
    expect(credit?.textContent).toContain(ISTHMUS_PROVENANCE.release);
  });

  it('la ruta del contorno va UNA sola vez y los diez istmos la reutilizan con <use> (r:JS-3)', () => {
    const defs = doc.querySelectorAll('svg[data-isthmus-defs] path[id="isthmus-land"]');
    expect(defs).toHaveLength(1);
    expect(defs[0]?.getAttribute('d')?.startsWith('M')).toBe(true);
    expect(doc.querySelectorAll('svg[data-isthmus] path')).toHaveLength(0);
    const uses = [...doc.querySelectorAll('svg[data-isthmus] use')];
    expect(uses).toHaveLength(10);
    for (const u of uses) expect(u.getAttribute('href')).toBe('#isthmus-land');
  });

  it('tres entradas con los textos de siempre y enlaces REALES solo a Explorar y a Fuentes', () => {
    const list = doc.querySelector('#principles-title')?.parentElement?.querySelector('ul');
    const items = [...(list?.children ?? [])];
    expect(items).toHaveLength(3);
    const keys = ['map', 'provenance', 'languages'] as const;
    items.forEach((li, i) => {
      expect(li.querySelector('h3')?.textContent).toBe(home(`principles.${keys[i]}.title`));
      expect(li.querySelector('p')?.textContent).toBe(home(`principles.${keys[i]}.body`));
    });
    expect(
      [...(items[0]?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('data-href')),
    ).toEqual(['"/explore"']);
    expect(
      [...(items[1]?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('data-href')),
    ).toEqual(['"/sources"']);
    expect(items[2]?.querySelectorAll('a')).toHaveLength(0);
  });

  it('la travesía: nueve paradas de OESTE a ESTE, cada una con su ficha y su «Ver en el mapa», y una barra con un enlace por parada', () => {
    const stops = travesiaStops();
    const scenes = [...doc.querySelectorAll('li[data-destination]')];
    expect(scenes.map((c) => c.getAttribute('data-destination'))).toEqual(
      stops.map((s) => s.entry.key),
    );
    scenes.forEach((scene, i) => {
      const d = stops[i]!.entry;
      expect(scene.id).toBe(`parada-${d.key}`);
      expect(scene.getAttribute('data-kind')).toBe(d.kind);
      expect(scene.querySelector('h3')?.textContent).toBe(destinationName(d, locale));
      const links = [...scene.querySelectorAll('a')];
      expect(links).toHaveLength(2);
      expect(JSON.parse(links[0]?.getAttribute('data-href') ?? 'null')).toEqual({
        pathname: '/destinations/[slug]',
        params: { slug: destinationSlug(d, locale) },
      });
      expect(JSON.parse(links[1]?.getAttribute('data-href') ?? 'null')).toEqual({
        pathname: '/explore',
        query: { d: d.key },
      });
      // El localizador es decorativo: la posición se dice en texto (coordenadas)
      expect(
        scene.querySelector('svg[data-isthmus="mini"]')?.closest('[aria-hidden="true"]'),
      ).not.toBeNull();
      // El panel va al lado contrario del punto (r:F1) y «Parada N de 9» va DESPUÉS del h3 (r:A11Y-7)
      expect(scene.getAttribute('data-panel-side')).toBe(stops[i]!.panelSide);
      const panel = scene.querySelector('h3')?.parentElement;
      expect(panel?.children[1]?.textContent).toBe(
        tr(locale, 'Home.travesia')('stop', { number: i + 1, total: stops.length }),
      );
      // El resaltado del localizador es el ÚLTIMO punto pintado (encima de sus vecinos de la ciudad)
      const marks = [...(scene.querySelectorAll('svg[data-isthmus="mini"] [data-stop]') ?? [])];
      expect(marks.at(-1)?.getAttribute('data-stop')).toBe(d.key);
    });
    const travesia = tr(locale, 'Home.travesia');
    expect(doc.querySelector('#travesia-title')?.textContent).toBe(travesia('heading'));
    const rail = doc.querySelector(`nav[aria-label="${travesia('navLabel')}"]`);
    expect([...(rail?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'))).toEqual(
      stops.map((s) => `#parada-${s.entry.key}`),
    );
    // Sin JavaScript ninguna parada está marcada: lo hace TravesiaProgress al desplazarse
    expect(rail?.querySelector('[aria-current]')).toBeNull();
  });

  it('aviso de estado honesto, tal cual', () => {
    expect(doc.querySelector('#status-title')?.textContent).toBe(home('statusHeading'));
    expect(doc.body.textContent).toContain(home('statusBody'));
  });

  it('nada inventado: sin valoraciones, clima, cuentas ni planificador; sin estilos en línea; pictogramas decorativos', () => {
    const text = doc.body.textContent ?? '';
    expect(text).not.toMatch(
      /4[.,]8|1[.,]240|°C|Iniciar sesión|Sign in|Log in|Planifica|Plan your trip|Próximamente|Coming soon/i,
    );
    expect(doc.querySelector('[style]')).toBeNull();
    expect(doc.querySelector('title, aside, [role="complementary"], dialog, [popover]')).toBeNull();
    for (const svg of doc.querySelectorAll('svg'))
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    // Enlaces a rutas reales del sitio, o anclas a las paradas de la propia página
    for (const a of doc.querySelectorAll('a')) {
      expect(a.getAttribute('href') ?? '', a.outerHTML).toMatch(/^(\/|#parada-)/);
    }
  });
});

describe('portada en producción con el contorno en derechos PROVISIONALES (r:D-01)', () => {
  it('sin istmo en el héroe ni localizadores en las escenas; la travesía sigue entera, en texto', async () => {
    state.siteEnv = 'production';
    try {
      const doc = await renderHome('es');
      expect(doc.querySelectorAll('svg[data-isthmus], svg[data-isthmus-defs], use')).toHaveLength(
        0,
      );
      expect(doc.querySelector('section[aria-labelledby="home-title"] figure')).toBeNull();
      const scenes = [...doc.querySelectorAll('li[data-destination]')];
      expect(scenes).toHaveLength(9);
      for (const scene of scenes) {
        expect(scene.hasAttribute('data-panel-side')).toBe(false);
        expect(scene.querySelectorAll('a')).toHaveLength(2);
      }
      // Las coordenadas (dos decimales) siguen: Explorar ya publica las anclas en producción con más precisión
      expect(scenes[0]?.textContent).toContain('8,81° N · 82,54° O');
    } finally {
      state.siteEnv = 'development';
    }
  });

  it('control: en staging (donde se despliega hoy) el istmo sí se pinta', async () => {
    state.siteEnv = 'staging';
    try {
      const doc = await renderHome('es');
      expect(doc.querySelectorAll('svg[data-isthmus]')).toHaveLength(10);
    } finally {
      state.siteEnv = 'development';
    }
  });
});

describe('portada: contrato de la página', () => {
  const source = code('src/app/[locale]/page.tsx');

  it('es estática: no depende del día ni fuerza renderizado dinámico', () => {
    expect(source).not.toMatch(
      /lib\/today|getTodayIsoDate|coverage-evidence|StatusBadge|Date\.now|new Date/,
    );
    expect(source).not.toMatch(/export const (revalidate|dynamic|fetchCache)\b/);
    expect(source).not.toMatch(/headers\(|cookies\(|connection\(/);
  });

  it('solo el espacio `Search` viaja al cliente (no se amplía CLIENT_NAMESPACES de la maquetación)', () => {
    expect(source).toMatch(/<NextIntlClientProvider messages=\{\{ Search: messages\.Search \}\}>/);
    expect(source.match(/<NextIntlClientProvider/g)).toHaveLength(1);
    expect(source).not.toMatch(/'use client'/);
  });

  it('anticipa el ámbito oscuro en el navegador (barra del móvil y esquema de color)', () => {
    expect(viewport).toEqual({ colorScheme: 'dark', themeColor: THEME_COLORS.dark });
  });

  it('JS de cliente de la portada: el buscador y el escenario de profundidad (más el progreso de la travesía, dentro de Travesia)', () => {
    const imports = [...source.matchAll(/from '(@\/components\/[A-Za-z]+)'/g)].map(
      (m) => m[1] ?? '',
    );
    const clients = imports.filter((path) =>
      /'use client'/.test(code(`src/components/${path.split('/').pop() ?? ''}.tsx`)),
    );
    expect(clients).toEqual(['@/components/DepthStage', '@/components/DestinationSearch']);
    const travesia = code('src/components/Travesia.tsx');
    expect(travesia).not.toMatch(/'use client'/);
    expect(travesia).toMatch(/<TravesiaProgress \/>/);
  });
});
