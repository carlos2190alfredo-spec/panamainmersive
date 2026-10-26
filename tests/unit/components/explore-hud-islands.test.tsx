// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CarouselFilterStatus } from '@/components/map/CarouselFilterStatus';
import { FilterChips } from '@/components/map/FilterChips';
import { MapTools } from '@/components/map/MapTools';
import { SearchBox } from '@/components/map/SearchBox';
import { getExploreFilter, resetExploreFilter } from '@/components/map/explore-filter-store';
import { LAYERS_GROUP_ID, LEGEND_GROUP_ID } from '@/components/map/hud-ids';
import { publishMapStatus, resetHudStore, useHudStore } from '@/components/map/hud-store';
import { isSheetOpen, resetSheetStore, setSheetOpen } from '@/components/map/sheet-store';
import { DESTINATIONS } from '@/domains/tourism/destinations';
import { kindOptions } from '@/domains/tourism/explore-filter';
import { buildSearchIndex } from '@/domains/tourism/search';
import { LOCALES, type Locale } from '@/i18n/locales';
import { MESSAGES } from './messages-fixture';

vi.mock('next/navigation', async () => await import('./search-params-mock'));

/**
 * Las islas del HUD de Explorar (buscador, filtro por tipo, herramientas y recuento del carrusel) renderizadas de verdad en
 * jsdom, con los mensajes REALES y con el almacén y la URL reales. Los E2E las prueban en un navegador con el mapa; aquí
 * se fija su LÓGICA sin navegador (y lo que un E2E no alcanza: derechos de terceros bloqueados, cada idioma, repeticiones
 * rápidas).
 */
const msg = (locale: Locale, namespace = 'Map') =>
  createTranslator({
    locale,
    messages: MESSAGES[locale] as never,
    namespace,
  } as never) as unknown as (key: string, values?: Record<string, unknown>) => string;

function Provider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={{ Map: MESSAGES[locale].Map as never }}>
      {children}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/es/explorar');
  // jsdom no implementa estas APIs de maquetación (los componentes las llaman para desplazar y respetar el movimiento)
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  stubViewport('desktop');
});

/**
 * `matchMedia` de jsdom no existe: se simula SOLO lo que miran los componentes. La presentación (`(min-width: 56rem)`) es
 * la de escritorio por defecto; `'mobile'` simula un teléfono (hoja inferior). El movimiento reducido no se pide nunca.
 */
function stubViewport(layout: 'desktop' | 'mobile'): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width: 56rem') ? layout === 'desktop' : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  resetExploreFilter();
  resetHudStore();
  resetSheetStore();
});

const searchParams = () => new URLSearchParams(window.location.search);

describe('SearchBox', () => {
  const index = buildSearchIndex(DESTINATIONS, 'es');
  const setup = (locale: Locale = 'es') => {
    const user = userEvent.setup();
    render(
      <Provider locale={locale}>
        <SearchBox index={buildSearchIndex(DESTINATIONS, locale)} />
      </Provider>,
    );
    return { user, input: screen.getByRole('searchbox') };
  };

  it.each(LOCALES)(
    '(%s) es un role=search con nombre propio y su campo, con etiqueta REAL y marcador de posición',
    (locale) => {
      const { input } = setup(locale);
      const t = msg(locale);
      expect(screen.getByRole('search', { name: t('hud.searchRegionLabel') })).toBeInTheDocument();
      expect(screen.getByLabelText(t('search.label'))).toBe(input);
      expect(input).toHaveAttribute('type', 'search');
      expect(input).toHaveAttribute('placeholder', t('search.placeholder'));
      expect(screen.queryByRole('button')).toBeNull(); // sin texto no hay botón de borrar
    },
  );

  it('escribir calcula las coincidencias POR CLAVE (sin acentos ni mayúsculas) y no toca la URL', async () => {
    const { user, input } = setup();
    await user.type(input, 'BARÚ');
    expect(getExploreFilter()).toMatchObject({ query: 'BARÚ', matches: ['volcan-baru'] });
    expect(window.location.search).toBe('');
    expect(index).toHaveLength(9);
  });

  it('Enter con UN resultado lo selecciona (`?d=`); con varios o ninguno no escribe nada', async () => {
    const { user, input } = setup();
    await user.type(input, 'ca{Enter}');
    expect(searchParams().get('d')).toBeNull();
    await user.clear(input);
    await user.type(input, 'zzz{Enter}');
    expect(searchParams().get('d')).toBeNull();
    await user.clear(input);
    await user.type(input, 'volcan{Enter}');
    expect(searchParams().get('d')).toBe('volcan-baru');
  });

  it('Enter respeta el tipo elegido (intersección): un resultado que el tipo excluye no se selecciona', async () => {
    const { user, input } = setup();
    const { setKindFilter } = await import('@/components/map/explore-filter-store');
    act(() => {
      setKindFilter('island');
    });
    await user.type(input, 'volcan{Enter}');
    expect(searchParams().get('d')).toBeNull();
  });

  it('Escape vacía el campo; el botón de borrar (con nombre en el idioma) también y devuelve el foco', async () => {
    const { user, input } = setup('de');
    await user.type(input, 'kanal');
    expect(getExploreFilter().matches).toEqual(['panama-canal']);
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    expect(getExploreFilter()).toMatchObject({ query: '', matches: null });

    await user.type(input, 'kanal');
    const clear = screen.getByRole('button', { name: msg('de')('search.clear') });
    await user.click(clear);
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Escape con el campo vacío NO se traga la tecla (sigue su camino)', async () => {
    const { user, input } = setup();
    const onKeyDown = vi.fn((event: KeyboardEvent) => event.defaultPrevented);
    document.addEventListener('keydown', onKeyDown);
    input.focus();
    await user.keyboard('{Escape}');
    document.removeEventListener('keydown', onKeyDown);
    expect(onKeyDown).toHaveBeenCalled();
    expect(onKeyDown.mock.results[0]?.value).toBe(false);
  });
});

describe('FilterChips', () => {
  const options = kindOptions(DESTINATIONS).map((o) => ({ ...o, label: o.kind }));
  const setup = (locale: Locale = 'es') => {
    const user = userEvent.setup();
    render(
      <Provider locale={locale}>
        <FilterChips options={options} total={DESTINATIONS.length} />
      </Provider>,
    );
    return { user };
  };

  it.each(LOCALES)(
    '(%s) «Todos» más un botón por tipo REAL, con su recuento hablado en el nombre',
    (locale) => {
      setup(locale);
      const t = msg(locale);
      const list = screen.getByRole('list', { name: t('filter.heading') });
      const buttons = within(list).getAllByRole('button');
      expect(buttons).toHaveLength(8);
      expect(buttons[0]).toHaveAccessibleName(
        `${t('filter.all')} ${t('filter.count', { count: 9 })}`,
      );
      expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
      // El recuento de «localidad» (3) usa el plural del idioma
      const locality = buttons.find((b) => b.getAttribute('data-kind-filter') === 'locality');
      expect(locality).toHaveAccessibleName(`locality ${t('filter.count', { count: 3 })}`);
    },
  );

  it('pulsar elige el tipo (reemplaza al anterior), volver a pulsarlo lo quita y «Todos» lo deshace', async () => {
    const { user } = setup();
    const press = (kind: string) =>
      screen
        .getAllByRole('button')
        .find((b) => b.getAttribute('data-kind-filter') === kind) as HTMLElement;
    await user.click(press('volcano'));
    expect(getExploreFilter()).toMatchObject({ kind: 'volcano', lastChange: 'kind' });
    expect(press('volcano')).toHaveAttribute('aria-pressed', 'true');
    expect(press('all')).toHaveAttribute('aria-pressed', 'false');
    await user.click(press('island'));
    expect(getExploreFilter().kind).toBe('island');
    expect(press('volcano')).toHaveAttribute('aria-pressed', 'false');
    await user.click(press('island'));
    expect(getExploreFilter().kind).toBe('all');
    await user.click(press('city'));
    await user.click(press('all'));
    expect(getExploreFilter().kind).toBe('all');
    expect(window.location.search).toBe('');
  });
});

describe('CarouselFilterStatus', () => {
  const items = DESTINATIONS.map(({ key, kind }) => ({ key, kind }));
  const index = buildSearchIndex(DESTINATIONS, 'es');

  /** El carrusel real en miniatura: la sección con su zona y una `li[data-destination]` por destino. */
  function Carousel({ locale = 'es' }: { locale?: Locale }) {
    return (
      <Provider locale={locale}>
        <section data-hud-zone="carousel">
          <div>
            <CarouselFilterStatus items={items} />
          </div>
          <div>
            <ul>
              {DESTINATIONS.map((d) => (
                <li key={d.key} data-destination={d.key}>
                  {d.key}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </Provider>
    );
  }
  const shown = (): string[] =>
    [...document.querySelectorAll<HTMLElement>('li[data-destination]')]
      .filter((li) => !li.hidden)
      .map((li) => li.dataset.destination ?? '');
  const announcer = () => screen.getByRole('status');
  const act2 = async (fn: () => void) => {
    await act(async () => {
      fn();
      await Promise.resolve();
    });
  };

  it('sin filtro no toca nada: nueve tarjetas, ninguna oculta, anuncio vacío y sin eco', () => {
    render(<Carousel />);
    expect(shown()).toHaveLength(9);
    expect(document.querySelectorAll('li[hidden]')).toHaveLength(0);
    expect(announcer()).toHaveTextContent('');
    expect(document.querySelector('[data-filter-echo]')).toBeNull();
  });

  it('el tipo oculta las que no coinciden, anuncia el recuento y lo repite visible (eco aria-hidden)', async () => {
    const { setKindFilter } = await import('@/components/map/explore-filter-store');
    render(<Carousel />);
    await act2(() => {
      setKindFilter('locality');
    });
    expect(shown()).toEqual(['el-valle-de-anton', 'boquete', 'santa-catalina']);
    expect(announcer()).toHaveTextContent('Se muestran 3 destinos.');
    const echo = document.querySelector('[data-filter-echo]');
    expect(echo).toHaveTextContent('Se muestran 3 destinos.');
    expect(echo).toHaveAttribute('aria-hidden', 'true'); // un solo anuncio para lectores de pantalla
    await act2(() => {
      setKindFilter('all');
    });
    expect(shown()).toHaveLength(9);
    expect(announcer()).toHaveTextContent('Se muestran 9 destinos.'); // también se anuncia al quitarlo
    expect(document.querySelector('[data-filter-echo]')).toBeNull();
  });

  it('el destino de la URL nunca se oculta, y al elegir otro que no coincide aparece', async () => {
    const { setKindFilter } = await import('@/components/map/explore-filter-store');
    window.history.replaceState(null, '', '/es/explorar?d=coiba');
    render(<Carousel />);
    await act2(() => {
      setKindFilter('volcano');
    });
    expect(shown()).toEqual(['volcan-baru', 'coiba']);
    expect(announcer()).toHaveTextContent('Se muestra 1 destino.'); // cuenta lo que COINCIDE, no lo que se ve
    await act2(() => {
      window.history.pushState(null, '', '/es/explorar?d=boquete');
    });
    expect(shown()).toEqual(['boquete', 'volcan-baru']);
  });

  it('la búsqueda usa sus propios mensajes (uno, varios, ninguno) y «sin caracteres útiles» no cuenta como búsqueda', async () => {
    const { setSearchQuery } = await import('@/components/map/explore-filter-store');
    render(<Carousel />);
    await act2(() => {
      setSearchQuery('baru', index);
    });
    expect(announcer()).toHaveTextContent('1 destino coincide con la búsqueda.');
    await act2(() => {
      setSearchQuery('zzz', index);
    });
    expect(shown()).toEqual([]);
    expect(announcer()).toHaveTextContent('Ningún destino coincide con la búsqueda.');
    await act2(() => {
      setSearchQuery('¡¡', index);
    });
    expect(shown()).toHaveLength(9);
    expect(document.querySelector('[data-filter-echo]')).toBeNull();
  });

  it('en cada idioma el anuncio sale de los mensajes (nunca la clave)', async () => {
    const { setKindFilter } = await import('@/components/map/explore-filter-store');
    for (const locale of LOCALES) {
      const view = render(<Carousel locale={locale} />);
      await act2(() => {
        setKindFilter('locality');
      });
      expect(announcer()).toHaveTextContent(msg(locale)('filter.announce', { count: 3 }));
      expect(announcer().textContent).not.toMatch(/filter\./);
      await act2(() => {
        setKindFilter('all');
      });
      view.unmount();
    }
  });

  it('al salir de la pantalla borra el filtro (es estado local de la visita, no un ajuste guardado)', async () => {
    const { setKindFilter, setSearchQuery } = await import('@/components/map/explore-filter-store');
    const view = render(<Carousel />);
    await act2(() => {
      setKindFilter('island');
      setSearchQuery('coi', index);
    });
    expect(getExploreFilter().kind).toBe('island');
    view.unmount();
    expect(getExploreFilter()).toMatchObject({
      kind: 'all',
      query: '',
      matches: null,
      lastChange: null,
    });
  });
});

describe('MapTools', () => {
  const GROUPS = (
    <>
      <details id={LAYERS_GROUP_ID}>
        <summary>Capas</summary>
        <p>contenido</p>
      </details>
      <details id={LEGEND_GROUP_ID}>
        <summary>Leyenda</summary>
        <p>contenido</p>
      </details>
    </>
  );
  /** Lo que ve el lienzo del almacén del HUD: la última orden de inclinar, volcada al DOM para leerla. */
  function Probe() {
    const { pitchRequest } = useHudStore();
    return (
      <output
        data-testid="pitch-request"
        data-pitch={pitchRequest?.pitch ?? ''}
        data-nonce={pitchRequest?.nonce ?? 0}
      />
    );
  }
  const pitchRequest = () => {
    const el = screen.getByTestId('pitch-request');
    return {
      pitch: el.dataset.pitch === '' ? null : Number(el.dataset.pitch),
      nonce: Number(el.dataset.nonce),
    };
  };
  function setup(
    options: {
      terrainAllowed?: boolean;
      locale?: Locale;
      status?: 'ready' | 'loading' | 'unavailable';
    } = {},
  ) {
    const { terrainAllowed = true, locale = 'es', status = 'ready' } = options;
    const user = userEvent.setup();
    render(
      <Provider locale={locale}>
        {GROUPS}
        <MapTools terrainAllowed={terrainAllowed} />
        <Probe />
      </Provider>,
    );
    act(() => {
      publishMapStatus(status);
    });
    return { user, t: msg(locale) };
  }
  const threeD = (t: ReturnType<typeof msg>) =>
    screen.getByRole('button', { name: t('tools.threeD') });
  const layers = (t: ReturnType<typeof msg>) =>
    screen.getByRole('button', { name: t('tools.layersOpen') });

  it.each(LOCALES)(
    '(%s) el nombre accesible del 3D CONTIENE su texto visible (2.5.3) y el grupo tiene nombre',
    (locale) => {
      const { t } = setup({ locale });
      const label = threeD(t).getAttribute('aria-label') ?? '';
      expect(label).toContain(t('tools.threeDShort'));
      expect(screen.getByRole('group', { name: t('tools.label') })).toBeInTheDocument();
      expect(layers(t)).toHaveAttribute('aria-expanded', 'false');
      expect(layers(t)).toHaveAttribute('aria-controls', `${LAYERS_GROUP_ID} ${LEGEND_GROUP_ID}`);
    },
  );

  it('es OPT-IN: sin pulsar la URL no cambia y no hay orden de inclinar; al pulsar escribe `l` con el sombreado y pide 55°', async () => {
    const { user, t } = setup();
    expect(window.location.search).toBe('');
    expect(pitchRequest()).toEqual({ pitch: null, nonce: 0 });
    expect(threeD(t)).toHaveAttribute('aria-pressed', 'false');
    await user.click(threeD(t));
    expect(searchParams().get('l')).toBe(
      'protectedAreas,boundaries,places,waterways,landcover,hillshade,terrain3d',
    );
    expect(pitchRequest()).toEqual({ pitch: 55, nonce: 1 });
    expect(threeD(t)).toHaveAttribute('aria-pressed', 'true');
  });

  it('apagar vuelve a las capas de antes (retira el sombreado que añadió el botón) y endereza la cámara', async () => {
    const { user, t } = setup();
    await user.click(threeD(t));
    await user.click(threeD(t));
    expect(searchParams().get('l')).toBe('protectedAreas,boundaries,places,waterways,landcover');
    expect(pitchRequest()).toEqual({ pitch: 0, nonce: 2 });
    expect(threeD(t)).toHaveAttribute('aria-pressed', 'false');
  });

  it('si la persona ya tenía el sombreado, apagar el 3D lo CONSERVA y conserva el resto del enlace (destino)', async () => {
    window.history.replaceState(null, '', '/es/explorar?d=boquete&l=protectedAreas,hillshade');
    const { user, t } = setup();
    await user.click(threeD(t));
    expect(searchParams().get('l')).toBe('protectedAreas,hillshade,terrain3d');
    await user.click(threeD(t));
    expect(searchParams().get('l')).toBe('protectedAreas,hillshade');
    expect(searchParams().get('d')).toBe('boquete');
  });

  it('dos pulsaciones SEGUIDAS usan la URL de verdad, no un render viejo (ida y vuelta)', async () => {
    const { t } = setup();
    const button = threeD(t);
    await act(async () => {
      button.click();
      button.click();
      await Promise.resolve();
    });
    expect(searchParams().get('l')).toBe('protectedAreas,boundaries,places,waterways,landcover');
  });

  it('apagado con su MOTIVO si el mapa carga, no está o los derechos no lo permiten (y nunca escribe en la URL)', async () => {
    const user = userEvent.setup();
    for (const [status, terrainAllowed] of [
      ['loading', true],
      ['unavailable', true],
      ['ready', false],
    ] as const) {
      const { t } = setup({ status, terrainAllowed });
      const button = threeD(t);
      expect(button, `${status} ${String(terrainAllowed)}`).toBeDisabled();
      if (!terrainAllowed) {
        expect(button).toHaveAttribute('title', t('layers.rightsPending'));
        expect(button).toHaveAttribute('aria-describedby', 'layer-hint-terrain3d');
      }
      if (status === 'unavailable') {
        expect(button).toHaveAttribute('title', t('hud.mapUnavailable'));
        expect(button).toHaveAttribute('aria-describedby', 'destinations-map-unavailable');
      }
      await user.click(button);
      expect(window.location.search).toBe('');
      cleanup();
      resetHudStore();
    }
  });

  it('con los derechos sin verificar un enlace con terrain3d se ve SIN él (el botón no lo da por activo)', () => {
    window.history.replaceState(null, '', '/es/explorar?l=protectedAreas,terrain3d');
    const { t } = setup({ terrainAllowed: false });
    expect(threeD(t)).toHaveAttribute('aria-pressed', 'false');
  });

  it('«Capas y leyenda» abre y cierra los dos grupos, sigue a los resúmenes y dos pulsaciones seguidas no se pisan', async () => {
    const { user, t } = setup();
    const details = [LAYERS_GROUP_ID, LEGEND_GROUP_ID].map(
      (id) => document.getElementById(id) as HTMLDetailsElement,
    );
    await user.click(layers(t));
    expect(details.map((d) => d.open)).toEqual([true, true]);
    expect(layers(t)).toHaveAttribute('aria-expanded', 'true');
    await user.click(layers(t));
    expect(details.map((d) => d.open)).toEqual([false, false]);
    expect(layers(t)).toHaveAttribute('aria-expanded', 'false');
    // La persona abre «Capas» con su propio resumen: el botón lo refleja
    await act(async () => {
      details[0]!.open = true;
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(layers(t)).toHaveAttribute('aria-expanded', 'true');
    });
    // Dos pulsaciones seguidas: abrir y cerrar (leen el DOM, no el render)
    const button = layers(t);
    await act(async () => {
      button.click();
      button.click();
      await Promise.resolve();
    });
    expect(details.map((d) => d.open)).toEqual([true, true]);
  });

  describe('en móvil (las capas y la leyenda viven DENTRO de la hoja inferior)', () => {
    beforeEach(() => {
      stubViewport('mobile');
    });

    it('con la hoja CERRADA «Capas y leyenda» la abre y despliega los dos grupos (no está «abierto» hasta que la hoja lo está)', async () => {
      const { user, t } = setup();
      const details = [LAYERS_GROUP_ID, LEGEND_GROUP_ID].map(
        (id) => document.getElementById(id) as HTMLDetailsElement,
      );
      expect(isSheetOpen()).toBe(false);
      await user.click(layers(t));
      expect(isSheetOpen()).toBe(true);
      expect(details.map((d) => d.open)).toEqual([true, true]);
      expect(layers(t)).toHaveAttribute('aria-expanded', 'true');
    });

    it('con los grupos YA desplegados pero la hoja cerrada, el botón dice «cerrado» y pulsarlo abre la hoja (no pliega nada que no se ve)', async () => {
      const { user, t } = setup();
      const details = [LAYERS_GROUP_ID, LEGEND_GROUP_ID].map(
        (id) => document.getElementById(id) as HTMLDetailsElement,
      );
      await act(async () => {
        for (const d of details) d.open = true;
        await Promise.resolve();
      });
      expect(isSheetOpen()).toBe(false);
      await vi.waitFor(() => {
        expect(layers(t)).toHaveAttribute('aria-expanded', 'false');
      });
      await user.click(layers(t));
      expect(isSheetOpen()).toBe(true);
      expect(details.map((d) => d.open)).toEqual([true, true]);
      expect(layers(t)).toHaveAttribute('aria-expanded', 'true');
    });

    it('con la hoja ABIERTA vuelve a ser un interruptor de los grupos y no cierra la hoja', async () => {
      const { user, t } = setup();
      act(() => {
        setSheetOpen(true);
      });
      await user.click(layers(t)); // despliega
      await user.click(layers(t)); // pliega
      const details = [LAYERS_GROUP_ID, LEGEND_GROUP_ID].map(
        (id) => document.getElementById(id) as HTMLDetailsElement,
      );
      expect(details.map((d) => d.open)).toEqual([false, false]);
      expect(isSheetOpen()).toBe(true);
    });
  });

  it('en escritorio «Capas y leyenda» no toca la hoja (no existe como caja)', async () => {
    const { user, t } = setup();
    await user.click(layers(t));
    expect(isSheetOpen()).toBe(false);
  });

  it('«Capas y leyenda» no depende del mapa (sigue activo aunque no haya mapa)', () => {
    const { t } = setup({ status: 'unavailable' });
    expect(layers(t)).toBeEnabled();
  });

  it('no hay botones de ubicación ni de pantalla completa (ADR-0025 §9) y no hay estilos en línea', () => {
    const { t } = setup();
    expect(screen.getAllByRole('button').filter((b) => b.closest('[role="group"]'))).toHaveLength(
      2,
    );
    expect(document.querySelector('[role="group"]')?.outerHTML).not.toMatch(/\sstyle=/);
    expect(threeD(t)).toBeInTheDocument();
  });
});
