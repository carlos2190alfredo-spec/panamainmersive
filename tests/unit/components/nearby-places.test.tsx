// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HudPanel } from '@/components/map/HudPanel';
import { NearbyPlacesSection } from '@/components/map/NearbyPlacesSection';
import { SelectedDestinationCard } from '@/components/map/SelectedDestinationCard';
import { publishMapStatus, resetHudStore } from '@/components/map/hud-store';
import type { SelectedItem } from '@/components/map/map-data';
import { resetPlacesStore, usePlacesStore } from '@/components/map/places-store';
import { isSheetOpen, resetSheetStore, setSheetOpen } from '@/components/map/sheet-store';
import { MESSAGES } from './messages-fixture';

vi.mock('next/navigation', async () => await import('./search-params-mock'));
vi.mock('@/i18n/navigation', async () => (await import('./nav-mock')).navigationMock);

/**
 * Lugares cercanos sin verificar en Explorar (ADR-0027 A2), renderizados de verdad en jsdom con los mensajes REALES: la ficha
 * del destino los pide, el panel los enseña en tres pestañas y publica en el almacén lo que el mapa debe pintar. La API se
 * simula (`fetch`); el validador es el de verdad. El mapa (puntos y encuadre) lo prueba la E2E.
 */
const ITEMS: SelectedItem[] = [
  { key: 'boquete', name: 'Boquete', kindLabel: 'Localidad', slug: 'boquete', badge: null },
  { key: 'coiba', name: 'Coiba', kindLabel: 'Isla', slug: 'coiba', badge: null },
];
const PLACE_ITEMS = ITEMS.map(({ key, name }) => ({ key, name }));

const place = (n: number, kind: string, extra: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  name: `Lugar sintético ${String(n)}`,
  kind,
  lon: -82.43482,
  lat: 8.77637 + n * 0.0009,
  distanceM: n * 100,
  sourceUpdated: '2026-08-01',
  sources: [
    { dataset: 'Overture', license: 'CDLA-Permissive-2.0' },
    { dataset: 'meta', license: 'CDLA-Permissive-2.0' },
  ],
  ...extra,
});

const RESPONSE = {
  status: 'unverified',
  destination: 'boquete',
  release: '2026-09-23.1',
  radiusKm: 3,
  groups: {
    activities: { total: 2, places: [place(1, 'tour'), place(2, 'nature')] },
    food: { total: 0, places: [] },
    lodging: { total: 40, places: [place(3, 'hotel'), place(4, 'hostel')] },
  },
};

function stubFetch(body: unknown = RESPONSE, status = 200) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** `matchMedia` de jsdom no existe: solo la presentación (`(min-width: 56rem)`); escritorio por defecto. */
function stubLayout(layout: 'desktop' | 'mobile'): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width: 56rem') ? layout === 'desktop' : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

/** Lo que el lienzo lee del almacén, volcado al DOM. */
function Probe() {
  const { view, highlight, showRequest, open } = usePlacesStore();
  return (
    <output
      data-testid="places"
      data-open={String(open)}
      data-group={view?.group ?? 'none'}
      data-points={view?.points.length ?? 0}
      data-highlight={highlight ?? ''}
      data-show={showRequest ? `${String(showRequest.lon)},${String(showRequest.lat)}` : ''}
    />
  );
}
const probe = () => screen.getByTestId('places').dataset;

function setup({
  allowed = true,
  url = '/es/explorar?d=boquete',
  status = 'ready',
}: { allowed?: boolean; url?: string; status?: 'ready' | 'loading' | 'unavailable' } = {}) {
  window.history.replaceState(null, '', url);
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider locale="es" messages={{ Map: MESSAGES.es.Map as never }}>
      <SelectedDestinationCard items={ITEMS} terrainAllowed placesAllowed={allowed} />
      <HudPanel label="Información del mapa" title="Información del mapa">
        <NearbyPlacesSection items={PLACE_ITEMS} allowed={allowed} />
      </HudPanel>
      <button type="button" data-sheet-handle>
        asa
      </button>
      <Probe />
    </NextIntlClientProvider>,
  );
  act(() => {
    publishMapStatus(status);
  });
  return { user };
}

const openList = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Ver lugares cercanos' }));
  return screen.findByRole('tablist', { name: 'Tipo de lugar' });
};

beforeEach(() => {
  stubLayout('desktop');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetHudStore();
  resetSheetStore();
  resetPlacesStore();
});

describe('cuándo se ofrece', () => {
  it('sin derechos no hay botón en la ficha ni sección en el panel (y no se pide nada)', () => {
    const fetchMock = stubFetch();
    setup({ allowed: false });
    expect(screen.queryByRole('button', { name: 'Lugares cercanos' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Lugares cerca de Boquete' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin destino elegido no hay sección', () => {
    stubFetch();
    setup({ url: '/es/explorar' });
    expect(screen.queryByRole('heading', { name: /Lugares cerca de/ })).toBeNull();
  });

  it('con destino: encabezado, aviso «Sin verificar» y un botón plegado; nada se pide hasta pulsarlo', () => {
    const fetchMock = stubFetch();
    setup();
    expect(screen.getByRole('heading', { name: 'Lugares cerca de Boquete' })).toBeTruthy();
    expect(screen.getByText(/nadie ha comprobado/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Ver lugares cercanos' }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(probe().points).toBe('0');
  });
});

describe('la lista', () => {
  it('pide los lugares del destino POR CLAVE y abre «Qué hacer» con su recuento, su resumen y sus puntos en el mapa', async () => {
    const fetchMock = stubFetch();
    const { user } = setup();
    const tablist = await openList(user);
    expect(fetchMock).toHaveBeenCalledWith('/api/places/boquete', expect.anything());
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Qué hacer (2)',
      'Dónde comer (0)',
      'Dónde dormir (40)',
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0]?.id);
    expect(
      within(panel).getByText(/2 lugares a menos de 3 km del punto de referencia/),
    ).toBeTruthy();
    const items = within(panel).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText('Lugar sintético 1')).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText('Tour u operador turístico')).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText('a 100 m en línea recta')).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText('Sin verificar')).toBeTruthy();
    expect(
      within(items[0] as HTMLElement).getByText(
        'Fuente: Overture Maps y Meta (CDLA-Permissive-2.0)',
      ),
    ).toBeTruthy();
    expect(probe()).toMatchObject({ group: 'activities', points: '2' });
  });

  it('pestañas con el teclado: flechas (con vuelta), Inicio y Fin; el mapa sigue a la pestaña', async () => {
    stubFetch();
    const { user } = setup();
    const tablist = await openList(user);
    const tabs = within(tablist).getAllByRole('tab');
    (tabs[0] as HTMLElement).focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('tabindex')).toBe('-1');
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(tabs[2]);
    expect(probe()).toMatchObject({ group: 'lodging', points: '2' });
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tabs[0]);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(tabs[2]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('sin lugares de un tipo lo DICE (no rellena) y el mapa no pinta nada', async () => {
    stubFetch();
    const { user } = setup();
    const tablist = await openList(user);
    await user.click(within(tablist).getByRole('tab', { name: 'Dónde comer (0)' }));
    expect(
      screen.getByText(
        'La fuente no tiene lugares de este tipo a menos de 3 km del punto de referencia.',
      ),
    ).toBeTruthy();
    expect(within(screen.getByRole('tabpanel')).queryByRole('list')).toBeNull();
    expect(probe().points).toBe('0');
  });

  it('con más lugares que el tope dice cuántos se enseñan de cuántos', async () => {
    stubFetch();
    const { user } = setup();
    const tablist = await openList(user);
    await user.click(within(tablist).getByRole('tab', { name: 'Dónde dormir (40)' }));
    expect(
      screen.getByText('Los 2 más cercanos de 40 a menos de 3 km del punto de referencia.'),
    ).toBeTruthy();
  });

  it('ocultarla retira los puntos del mapa', async () => {
    stubFetch();
    const { user } = setup();
    await openList(user);
    expect(probe().points).toBe('2');
    await user.click(screen.getByRole('button', { name: 'Ocultar los lugares cercanos' }));
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(probe()).toMatchObject({ open: 'false', points: '0' });
  });
});

describe('«Ver en el mapa»', () => {
  it('desactivado mientras el mapa carga; listo, resalta el lugar y pide encuadrarlo', async () => {
    stubFetch();
    const { user } = setup({ status: 'loading' });
    await openList(user);
    const button = screen.getByRole('button', { name: 'Ver en el mapa: Lugar sintético 2' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      publishMapStatus('ready');
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await user.click(button);
    expect(probe()).toMatchObject({
      highlight: '00000000-0000-4000-8000-000000000002',
      show: `-82.43482,${String(8.77637 + 2 * 0.0009)}`,
    });
    expect(button.closest('li')?.hasAttribute('data-highlighted')).toBe(true);
  });

  it('sin mapa (no habrá), sigue desactivado y dice por qué', async () => {
    stubFetch();
    const { user } = setup({ status: 'unavailable' });
    await openList(user);
    const button = screen.getByRole('button', { name: 'Ver en el mapa: Lugar sintético 1' });
    const reason = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe(
      (MESSAGES.es.Map as { hud: { mapUnavailable: string } }).hud.mapUnavailable,
    );
  });

  it('en móvil pliega la hoja y el foco pasa al asa (el botón queda inerte)', async () => {
    stubLayout('mobile');
    stubFetch();
    const { user } = setup();
    await openList(user);
    act(() => {
      setSheetOpen(true);
    });
    await user.click(screen.getByRole('button', { name: 'Ver en el mapa: Lugar sintético 1' }));
    expect(isSheetOpen()).toBe(false);
    expect(document.activeElement).toBe(screen.getByText('asa'));
  });
});

describe('respuestas que no se usan', () => {
  it.each([
    ['403 (derechos)', RESPONSE, 403, 'Los lugares cercanos aún no se pueden mostrar aquí'],
    ['500', RESPONSE, 500, 'No se pudieron cargar los lugares cercanos.'],
    [
      'mal formada (dice «verified»)',
      { ...RESPONSE, status: 'verified' },
      200,
      'No se pudieron cargar',
    ],
    ['de otro destino', { ...RESPONSE, destination: 'coiba' }, 200, 'No se pudieron cargar'],
  ])('%s: lo dice y no pinta nada', async (_why, body, status, text) => {
    stubFetch(body, status);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Ver lugares cercanos' }));
    expect(await screen.findByText(new RegExp(text))).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(probe().points).toBe('0');
  });
});

describe('desde la ficha del destino', () => {
  it('«Lugares cercanos» abre el panel y la lista, y el foco llega a su encabezado', async () => {
    const fetchMock = stubFetch();
    const { user } = setup();
    const panel = screen.getByRole('complementary', { name: 'Información del mapa' });
    expect(panel.dataset.state).toBe('closed');
    await user.click(screen.getByRole('button', { name: 'Lugares cercanos' }));
    await screen.findByRole('tablist');
    expect(panel.dataset.state).toBe('open');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Lugares cerca de Boquete' }),
      );
    });
  });

  it('cambiar de destino vuelve a pedir, por la clave nueva, y empieza por «Qué hacer»', async () => {
    const fetchMock = stubFetch();
    const { user } = setup();
    const tablist = await openList(user);
    await user.click(within(tablist).getByRole('tab', { name: 'Dónde dormir (40)' }));
    stubFetch({ ...RESPONSE, destination: 'coiba' });
    act(() => {
      window.history.pushState(null, '', '/es/explorar?d=coiba');
    });
    expect(await screen.findByRole('heading', { name: 'Lugares cerca de Coiba' })).toBeTruthy();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
