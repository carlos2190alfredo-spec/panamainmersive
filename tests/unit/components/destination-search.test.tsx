// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DestinationSearch, submitTarget } from '@/components/DestinationSearch';
import {
  DESTINATIONS,
  DESTINATION_KINDS,
  destinationName,
  destinationSlug,
  type DestinationKind,
} from '@/domains/tourism/destinations';
import { buildSearchIndex, matchDestinations } from '@/domains/tourism/search';
import { LOCALES, type Locale } from '@/i18n/locales';
import { MESSAGES } from './messages-fixture';

const push = vi.hoisted(() => vi.fn());

vi.mock('@/i18n/navigation', async () => ({
  ...(await import('./nav-mock')).navigationMock,
  useRouter: () => ({ push }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.restoreAllMocks();
});

const msg = (locale: Locale, namespace: string) =>
  createTranslator({
    locale,
    messages: MESSAGES[locale] as never,
    namespace,
  } as never) as unknown as (key: string, values?: Record<string, unknown>) => string;

function setup(locale: Locale = 'es') {
  const index = buildSearchIndex(DESTINATIONS, locale);
  const kinds = msg(locale, 'DestinationKind');
  const kindLabels = Object.fromEntries(DESTINATION_KINDS.map((k) => [k, kinds(k)])) as Record<
    DestinationKind,
    string
  >;
  const search = msg(locale, 'Search');
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider locale={locale} messages={{ Search: MESSAGES[locale].Search as never }}>
      <DestinationSearch index={index} kindLabels={kindLabels} />
    </NextIntlClientProvider>,
  );
  const input = screen.getByRole('searchbox', { name: search('label') });
  return { user, input, search, kinds };
}

describe('submitTarget', () => {
  const index = buildSearchIndex(DESTINATIONS, 'es');

  it('Enter abre Explorar con la CLAVE del primer resultado (nunca el nombre ni el slug)', () => {
    expect(submitTarget(matchDestinations(index, 'baru'))).toEqual({
      pathname: '/explore',
      query: { d: 'volcan-baru' },
    });
    expect(submitTarget(matchDestinations(index, 'panama'))?.query.d).toBe('panama-city');
  });

  it('sin resultados no hay a dónde ir', () => {
    expect(submitTarget([])).toBeNull();
    expect(submitTarget(matchDestinations(index, 'zzzz'))).toBeNull();
  });
});

describe('DestinationSearch: estructura (respaldo sin JavaScript)', () => {
  it.each(LOCALES)(
    '%s: un formulario role=search que lleva a la ruta localizada de Explorar',
    (locale) => {
      setup(locale);
      const form = screen.getByRole('search');
      expect(screen.getAllByRole('search')).toHaveLength(1);
      expect(form.tagName).toBe('FORM');
      expect(form.getAttribute('method')).toBe('get');
      const expected = {
        es: '/es/explorar',
        en: '/en/explore',
        pt: '/pt/explorar',
        fr: '/fr/explorer',
        de: '/de/entdecken',
      }[locale];
      expect(form.getAttribute('action')).toBe(expected);
      expect(form.getAttribute('aria-label')).toBe(msg(locale, 'Search')('label'));
    },
  );

  it('campo con etiqueta VISIBLE, nombre `q`, sin autocompletar y con el alcance como descripción', () => {
    const { input, search } = setup('es');
    expect(input.getAttribute('type')).toBe('search');
    expect(input.getAttribute('name')).toBe('q');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('maxlength')).toBe('80');
    expect(input.getAttribute('placeholder')).toBe(search('placeholder', { count: 9 }));
    const label = document.querySelector(`label[for="${input.id}"]`);
    expect(label?.textContent).toBe(search('label'));
    // La etiqueta es VISIBLE (no solo para lectores de pantalla): el placeholder no es una etiqueta.
    expect(label?.className ?? '').not.toMatch(/visually-hidden|sr-only/);
    expect(label?.hasAttribute('hidden')).toBe(false);
    const described = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe(search('scope'));
    expect(screen.getByRole('button', { name: search('submit') }).getAttribute('type')).toBe(
      'submit',
    );
  });

  it('el alcance es honesto: solo los nueve destinos, y no promete atracciones ni alojamientos', () => {
    for (const locale of LOCALES) {
      const scope = msg(locale, 'Search')('scope');
      expect(scope.length).toBeGreaterThan(40);
    }
    const es = msg('es', 'Search')('scope');
    expect(es).toContain('nueve destinos');
    expect(es).toMatch(/No incluye atracciones, alojamientos ni actividades/);
  });

  it('empieza sin resultados y con la región viva ya presente (vacía)', () => {
    setup('es');
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('DestinationSearch: comportamiento', () => {
  it('«baru» → un resultado (el volcán): ficha en el slug del idioma, «Ver en el mapa» con la clave y recuento anunciado', async () => {
    const { user, input, search, kinds } = setup('es');
    await user.type(input, 'baru');
    expect(screen.getByRole('status').textContent).toBe(
      search('results', { count: 1, query: 'baru' }),
    );
    const list = screen.getByRole('list', { name: search('resultsLabel') });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]?.getAttribute('data-search-result')).toBe('volcan-baru');
    const [file, map] = within(items[0] as HTMLElement).getAllByRole('link');
    const baru = DESTINATIONS.find((d) => d.key === 'volcan-baru');
    expect(baru).toBeDefined();
    expect(file?.getAttribute('data-href')).toBe(
      JSON.stringify({
        pathname: '/destinations/[slug]',
        params: { slug: destinationSlug(baru!, 'es') },
      }),
    );
    expect(file?.textContent).toContain(destinationName(baru!, 'es'));
    expect(file?.textContent).toContain(kinds('volcano'));
    expect(map?.getAttribute('data-href')).toBe(
      JSON.stringify({ pathname: '/explore', query: { d: 'volcan-baru' } }),
    );
    expect(map?.textContent).toBe(search('viewOnMap'));
    expect((map?.getAttribute('aria-label') ?? '').startsWith(search('viewOnMap'))).toBe(true);
  });

  it('«Santa Catalina» → un único resultado', async () => {
    const { user, input } = setup('es');
    await user.type(input, 'Santa Catalina');
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-search-result'))).toEqual(['santa-catalina']);
  });

  it('sin coincidencias lo dice con palabras en la región viva y no pinta ninguna lista', async () => {
    const { user, input, search } = setup('es');
    await user.type(input, 'zzzz');
    expect(screen.getByRole('status').textContent).toBe(
      search('results', { count: 0, query: 'zzzz' }),
    );
    expect(screen.getByRole('status').textContent).toContain('Ningún destino');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('Enter con resultados navega a Explorar con el PRIMERO (por clave); sin resultados no navega', async () => {
    const { user, input } = setup('es');
    await user.type(input, 'panama{Enter}');
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({ pathname: '/explore', query: { d: 'panama-city' } });
    push.mockClear();
    await user.clear(input);
    await user.type(input, 'zzzz{Enter}');
    expect(push).not.toHaveBeenCalled();
  });

  it('Enter con la consulta vacía no navega y el botón «Buscar» hace lo mismo que Enter', async () => {
    const { user, input, search } = setup('es');
    await user.type(input, '{Enter}');
    expect(push).not.toHaveBeenCalled();
    await user.type(input, 'coiba');
    await user.click(screen.getByRole('button', { name: search('submit') }));
    expect(push).toHaveBeenCalledWith({ pathname: '/explore', query: { d: 'coiba' } });
  });

  it('Escape borra la consulta y los resultados', async () => {
    const { user, input } = setup('es');
    await user.type(input, 'boquete');
    expect(screen.getByRole('list')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('con JavaScript el envío NO recarga la página (se cancela el envío nativo); sin resultados tampoco', async () => {
    const { user, input } = setup('es');
    const form = screen.getByRole('search');
    expect(fireEvent.submit(form), 'consulta vacía').toBe(false);
    await user.type(input, 'zzzz');
    expect(fireEvent.submit(form), 'sin resultados').toBe(false);
    await user.clear(input);
    await user.type(input, 'coiba');
    expect(fireEvent.submit(form), 'con resultados').toBe(false);
    expect(push).toHaveBeenCalledWith({ pathname: '/explore', query: { d: 'coiba' } });
  });

  it('no usa la red: ni al escribir ni al enviar', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { user, input } = setup('es');
    await user.type(input, 'canal{Enter}');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it.each(LOCALES)(
    '%s: «Panama Canal» encuentra el canal con el nombre de ese idioma y el recuento traducido',
    async (locale) => {
      const { user, input, search } = setup(locale);
      await user.type(input, 'Panama Canal');
      const items = within(screen.getByRole('list')).getAllByRole('listitem');
      expect(items.map((li) => li.getAttribute('data-search-result'))).toEqual(['panama-canal']);
      const canal = DESTINATIONS.find((d) => d.key === 'panama-canal');
      expect(items[0]?.textContent).toContain(destinationName(canal!, locale));
      expect(screen.getByRole('status').textContent).toBe(
        search('results', { count: 1, query: 'Panama Canal' }),
      );
    },
  );

  it('la consulta del usuario se muestra como TEXTO (no se interpreta como HTML)', async () => {
    const { user, input } = setup('es');
    await user.type(input, '<b>x</b>');
    const status = screen.getByRole('status');
    expect(status.querySelector('b')).toBeNull();
    expect(status.textContent).toContain('<b>x</b>');
  });
});
