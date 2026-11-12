// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { SelectedDestinationCard } from '@/components/map/SelectedDestinationCard';
import {
  publishMapStatus,
  publishTour,
  requestStopTour,
  requestTour,
  resetHudStore,
  useHudStore,
} from '@/components/map/hud-store';
import {
  RELIEF_LAYER_IDS,
  disableRelief,
  enableRelief,
  forgetReliefMemory,
} from '@/components/map/relief';
import type { SelectedItem } from '@/components/map/map-data';
import { isSheetOpen, resetSheetStore, setSheetOpen } from '@/components/map/sheet-store';
import { usesTerrain } from '@/domains/geography/map-style';
import { MAP_LAYER_IDS } from '@/domains/geography/map-url-state';
import { LOCALES, type Locale } from '@/i18n/locales';
import { MESSAGES } from './messages-fixture';

vi.mock('next/navigation', async () => await import('./search-params-mock'));
vi.mock('@/i18n/navigation', async () => (await import('./nav-mock')).navigationMock);

/**
 * «Recorrido 3D» en la ficha del destino de Explorar (ADR-0027 A1), renderizada de verdad en jsdom con los mensajes REALES, el
 * almacén del HUD y la URL. El vuelo en sí lo ejecuta el lienzo (`MapStage`) y lo prueba la E2E con el mapa; aquí se fija lo que
 * la ficha decide: cuándo se ofrece, qué escribe en la URL (el relieve es opt-in), qué orden da y qué aviso previo enseña.
 */
const msg = (locale: Locale) =>
  createTranslator({
    locale,
    messages: MESSAGES[locale] as never,
    namespace: 'Map',
  } as never) as unknown as (key: string, values?: Record<string, unknown>) => string;

const ITEMS: SelectedItem[] = [
  { key: 'boquete', name: 'Boquete', kindLabel: 'Localidad', slug: 'boquete', badge: null },
  { key: 'coiba', name: 'Coiba', kindLabel: 'Isla', slug: 'coiba', badge: null },
];

/** Lo que ve el lienzo del almacén: la última orden de recorrido, volcada al DOM para leerla. */
function Probe() {
  const { tourRequest } = useHudStore();
  return (
    <output
      data-testid="tour-request"
      data-key={tourRequest === null ? 'none' : (tourRequest.key ?? 'stop')}
      data-nonce={tourRequest?.nonce ?? 0}
    />
  );
}
const tourRequest = () => {
  const el = screen.getByTestId('tour-request');
  return { key: el.dataset.key, nonce: Number(el.dataset.nonce) };
};

function setup(
  options: {
    locale?: Locale;
    terrainAllowed?: boolean;
    status?: 'ready' | 'loading' | 'unavailable';
    url?: string;
  } = {},
) {
  const {
    locale = 'es',
    terrainAllowed = true,
    status = 'ready',
    url = '/es/explorar?d=boquete',
  } = options;
  window.history.replaceState(null, '', url);
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider locale={locale} messages={{ Map: MESSAGES[locale].Map as never }}>
      <SelectedDestinationCard items={ITEMS} terrainAllowed={terrainAllowed} />
      <Probe />
    </NextIntlClientProvider>,
  );
  act(() => {
    publishMapStatus(status);
  });
  return { user, t: msg(locale) };
}
const layersInUrl = () => new URLSearchParams(window.location.search).get('l');
const tourButton = (t: ReturnType<typeof msg>, label: 'start' | 'stop' = 'start') =>
  screen.getByRole('button', { name: t(`tour.${label}`) });
const describedBy = (el: HTMLElement): string[] =>
  (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);

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

beforeEach(() => {
  window.history.replaceState(null, '', '/es/explorar');
  stubLayout('desktop');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetHudStore();
  resetSheetStore();
  forgetReliefMemory();
});

describe('capas que piden el relieve a AWS', () => {
  it('RELIEF_LAYER_IDS coincide con `usesTerrain` del registro de capas, capa por capa', () => {
    for (const id of MAP_LAYER_IDS) {
      expect(RELIEF_LAYER_IDS.includes(id), id).toBe(usesTerrain([id]));
    }
  });

  it('encender añade el 3D y el sombreado; apagar retira el sombreado SOLO si lo añadió el encendido', () => {
    window.history.replaceState(null, '', '/es/explorar?d=coiba&l=boundaries');
    enableRelief(true);
    expect(layersInUrl()?.split(',')).toEqual(
      expect.arrayContaining(['terrain3d', 'hillshade', 'boundaries']),
    );
    disableRelief(true);
    expect(layersInUrl()).toBe('boundaries');
    expect(new URLSearchParams(window.location.search).get('d')).toBe('coiba');

    window.history.replaceState(null, '', '/es/explorar?l=hillshade');
    enableRelief(true);
    disableRelief(true);
    expect(layersInUrl()).toBe('hillshade'); // la persona ya lo tenía: se conserva
  });

  it('encender con el 3D ya encendido no toca nada (ni la memoria de lo añadido)', () => {
    window.history.replaceState(null, '', '/es/explorar?l=terrain3d,hillshade');
    enableRelief(true);
    expect(layersInUrl()).toBe('terrain3d,hillshade');
    disableRelief(true);
    expect(layersInUrl()).toBe('hillshade'); // no lo añadió este encendido: se conserva
  });
});

describe('órdenes de recorrido en el almacén del HUD', () => {
  it('detener sin recorrido ni orden pendiente no emite nada; con una orden pendiente, la anula', () => {
    render(<Probe />);
    act(() => {
      requestStopTour();
    });
    expect(tourRequest()).toEqual({ key: 'none', nonce: 0 });
    act(() => {
      requestTour('boquete');
    });
    expect(tourRequest()).toEqual({ key: 'boquete', nonce: 1 });
    act(() => {
      requestStopTour();
    });
    expect(tourRequest()).toEqual({ key: 'stop', nonce: 2 });
  });

  it('publicar el mismo paso dos veces no vuelve a notificar', () => {
    const changes = vi.fn();
    function Watcher() {
      const snapshot = useHudStore();
      useEffect(() => {
        changes(snapshot);
      }, [snapshot]);
      return null;
    }
    render(<Watcher />);
    changes.mockClear();
    act(() => {
      publishTour({ key: 'boquete', step: 2, total: 5 });
    });
    act(() => {
      publishTour({ key: 'boquete', step: 2, total: 5 });
    });
    expect(changes).toHaveBeenCalledTimes(1);
  });
});

describe('«Recorrido 3D» en la ficha del destino', () => {
  it.each(LOCALES)(
    '(%s) el botón, su descripción y el aviso previo salen de los mensajes (nunca la clave)',
    (locale) => {
      const { t } = setup({ locale, url: `/${locale}/explorar?d=boquete` });
      const button = tourButton(t);
      expect(button).toBeEnabled();
      const texts = describedBy(button).map((id) => document.getElementById(id)?.textContent ?? '');
      expect(texts).toEqual([t('tour.description'), t('tour.notice')]);
      for (const text of [button.textContent ?? '', ...texts])
        expect(text).not.toMatch(/^Map\.|tour\./);
    },
  );

  it('es OPT-IN: sin pulsar no toca la URL ni da orden; al pulsar escribe el relieve en `l` y pide el recorrido del destino', async () => {
    const { user, t } = setup();
    expect(layersInUrl()).toBeNull();
    expect(tourRequest()).toEqual({ key: 'none', nonce: 0 });
    await user.click(tourButton(t));
    expect(layersInUrl()?.split(',')).toEqual(expect.arrayContaining(['terrain3d', 'hillshade']));
    expect(tourRequest()).toEqual({ key: 'boquete', nonce: 1 });
    expect(new URLSearchParams(window.location.search).get('d')).toBe('boquete');
  });

  it('con el relieve ya en uso (3D o solo «Sombreado») no enseña el aviso previo: ya lo dice el aviso de estado del mapa', () => {
    const { t } = setup({ url: '/es/explorar?d=boquete&l=hillshade' });
    expect(screen.queryByText(t('tour.notice'))).toBeNull();
    expect(describedBy(tourButton(t))).toHaveLength(1); // solo la descripción
  });

  it('control: sin relieve en uso el aviso previo se VE y describe al botón', () => {
    const { t } = setup();
    expect(screen.getByText(t('tour.notice'))).toBeVisible();
    expect(describedBy(tourButton(t))).toHaveLength(2);
  });

  it('mientras dura, el mismo botón lo DETIENE (y solo el del destino que recorre)', async () => {
    const { user, t } = setup();
    act(() => {
      publishTour({ key: 'boquete', step: 2, total: 5 });
    });
    await user.click(tourButton(t, 'stop'));
    expect(tourRequest().key).toBe('stop');
    act(() => {
      publishTour({ key: 'coiba', step: 1, total: 5 });
    });
    expect(tourButton(t)).toBeEnabled(); // el recorrido en curso es de otro destino: este botón lo empieza
  });

  it('detenerse lo puede pedir aunque el mapa haya dejado de estar listo', () => {
    const { t } = setup();
    act(() => {
      publishTour({ key: 'boquete', step: 1, total: 5 });
      publishMapStatus('loading');
    });
    expect(tourButton(t, 'stop')).toBeEnabled();
  });

  it('apagado con su MOTIVO si el mapa no está listo, no estará o los derechos del relieve no lo permiten (sin aviso previo ni escritura)', async () => {
    const loading = setup({ status: 'loading' });
    expect(tourButton(loading.t)).toBeDisabled();
    expect(describedBy(tourButton(loading.t))).toHaveLength(1); // desactivado no envía nada: sin el aviso previo
    cleanup();

    const unavailable = setup({ status: 'unavailable' });
    const button = tourButton(unavailable.t);
    expect(button).toBeDisabled();
    expect(describedBy(button).map((id) => document.getElementById(id)?.textContent)).toContain(
      unavailable.t('hud.mapUnavailable'),
    );
    expect(screen.queryByText(unavailable.t('tour.notice'))).toBeNull();
    cleanup();

    const blocked = setup({ terrainAllowed: false });
    const rights = tourButton(blocked.t);
    expect(rights).toBeDisabled();
    expect(describedBy(rights).map((id) => document.getElementById(id)?.textContent)).toContain(
      blocked.t('tour.rightsPending'),
    );
    expect(screen.queryByText(blocked.t('tour.notice'))).toBeNull();
    await blocked.user.click(rights);
    expect(layersInUrl()).toBeNull();
    expect(tourRequest().key).toBe('none');
  });

  it('en móvil pliega la hoja (que tapaba el vuelo) y lleva el foco al asa: el botón queda inerte con la hoja plegada', async () => {
    stubLayout('mobile');
    const handle = document.createElement('button');
    handle.setAttribute('data-sheet-handle', '');
    document.body.append(handle);
    act(() => {
      setSheetOpen(true);
    });
    const { user, t } = setup();
    await user.click(tourButton(t));
    expect(tourRequest().key).toBe('boquete');
    expect(isSheetOpen()).toBe(false);
    expect(document.activeElement).toBe(handle);
    handle.remove();
  });

  it('control: en escritorio no toca la hoja ni el foco', async () => {
    act(() => {
      setSheetOpen(true);
    });
    const { user, t } = setup();
    await user.click(tourButton(t));
    expect(isSheetOpen()).toBe(true);
    expect(document.activeElement).toBe(tourButton(t, 'start'));
  });

  it('sin destino elegido no hay ficha ni botón', () => {
    const { t } = setup({ url: '/es/explorar' });
    expect(screen.queryByRole('button', { name: t('tour.start') })).toBeNull();
  });
});
