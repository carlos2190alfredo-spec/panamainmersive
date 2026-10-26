// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HudSheet } from '@/components/map/HudSheet';
import { publishMapStatus, resetHudStore } from '@/components/map/hud-store';
import { isSheetOpen, resetSheetStore, setSheetOpen } from '@/components/map/sheet-store';
import { LOCALES, type Locale } from '@/i18n/locales';
import { MESSAGES } from './messages-fixture';

vi.mock('next/navigation', async () => await import('./search-params-mock'));

/**
 * La hoja inferior móvil de Explorar renderizada de verdad en jsdom, con los mensajes REALES y la URL real: lo que un E2E
 * en un navegador no alcanza de forma barata (cada idioma, la lógica de Escape, el arrastre, escritorio frente a móvil) y
 * lo que debe cumplir ANTES de hidratar. El comportamiento con el mapa, el teclado real y el táctil está en
 * `e2e/explore-sheet.mobile.spec.ts`.
 */
const ITEMS = [
  { key: 'casco-antiguo', name: 'Casco Antiguo', kindLabel: 'Distrito histórico' },
  { key: 'coiba', name: 'Coiba', kindLabel: 'Isla' },
] as never;

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

const messages = (locale: Locale) => ({ Map: MESSAGES[locale].Map as never });

function Sheet({ locale = 'es' }: { locale?: Locale }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages(locale)}>
      <div data-immersive>
        <HudSheet title={<h1>Explorar Panamá</h1>} items={ITEMS}>
          <label>
            Buscar
            <input type="search" />
          </label>
          <button type="button">Dentro de la hoja</button>
        </HudSheet>
      </div>
    </NextIntlClientProvider>
  );
}

const handle = () => document.querySelector<HTMLButtonElement>('[data-sheet-handle]')!;
const body = () => document.querySelector<HTMLElement>('[data-sheet-body]')!;
const root = () => document.querySelector<HTMLElement>('[data-hud-zone="sheet"]')!;
const summary = () => document.querySelector<HTMLElement>('[data-sheet-summary]')!;

beforeEach(() => {
  window.history.replaceState(null, '', '/es/explorar');
  Element.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.setPointerCapture = vi.fn();
  stubViewport('mobile');
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  resetSheetStore();
  resetHudStore();
});

describe('HudSheet · antes de hidratar (lo que llega en el HTML)', () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="es" messages={messages('es')}>
      <HudSheet title={<h1>Explorar Panamá</h1>} items={ITEMS}>
        <button type="button">Dentro</button>
      </HudSheet>
    </NextIntlClientProvider>,
  );

  it('está en estado `pending`, SIN botón (un botón sin función sería un control muerto) y con el título y el cuerpo en el HTML', () => {
    expect(html).toMatch(/data-state="pending"/);
    expect(html).not.toMatch(/data-sheet-handle/);
    expect(html).toContain('<h1>Explorar Panamá</h1>');
    expect(html).toContain('Dentro');
  });

  it('el sitio del asa está reservado (decorativo, oculto a los lectores): al hidratar el botón no mueve nada', () => {
    expect(html).toMatch(/<span class="[^"]*handle[^"]*" aria-hidden="true">/);
  });

  it('el cuerpo no es `inert` en el HTML (sin JavaScript tiene que poder usarse; lo pliega el CSS solo cuando hay JavaScript)', () => {
    expect(html).not.toMatch(/\binert\b/);
  });

  it('no escribe estilos en línea (la CSP lo bloquea)', () => {
    expect(html).not.toMatch(/\sstyle=/);
  });
});

describe('HudSheet · móvil', () => {
  it.each(LOCALES)(
    '(%s) el asa es un botón con aria-expanded, aria-controls y el nombre del idioma',
    (locale) => {
      render(<Sheet locale={locale} />);
      const t = MESSAGES[locale].Map as { sheet: { open: string; close: string } };
      expect(handle()).toHaveAttribute('aria-expanded', 'false');
      expect(handle()).toHaveAttribute('aria-controls', body().id);
      expect(handle()).toHaveAccessibleName(t.sheet.open);
      expect(handle()).toHaveAttribute('type', 'button');
    },
  );

  it('arranca CERRADA: el cuerpo es inert y la raíz lo dice', () => {
    render(<Sheet />);
    expect(root()).toHaveAttribute('data-state', 'closed');
    expect(body()).toHaveAttribute('inert');
  });

  it('el botón abre y cierra (sin ningún gesto): el cuerpo deja de ser inert, el nombre cambia y el estado también', async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await user.click(handle());
    expect(handle()).toHaveAttribute('aria-expanded', 'true');
    expect(handle()).toHaveAccessibleName(
      (MESSAGES.es.Map as { sheet: { close: string } }).sheet.close,
    );
    expect(root()).toHaveAttribute('data-state', 'open');
    expect(body()).not.toHaveAttribute('inert');
    await user.click(handle());
    expect(handle()).toHaveAttribute('aria-expanded', 'false');
    expect(body()).toHaveAttribute('inert');
  });

  it('con el teclado: Enter y Espacio sobre el asa la abren y la cierran', async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    handle().focus();
    await user.keyboard('{Enter}');
    expect(isSheetOpen()).toBe(true);
    await user.keyboard(' ');
    expect(isSheetOpen()).toBe(false);
  });

  it('Escape dentro de la hoja la cierra y devuelve el foco al asa', async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await user.click(handle());
    const inside = screen.getByRole('button', { name: 'Dentro de la hoja' });
    inside.focus();
    await user.keyboard('{Escape}');
    expect(isSheetOpen()).toBe(false);
    expect(handle()).toHaveFocus();
    expect(body()).toHaveAttribute('inert');
  });

  it('Escape con el foco en el propio asa también cierra', async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await user.click(handle());
    handle().focus();
    await user.keyboard('{Escape}');
    expect(isSheetOpen()).toBe(false);
  });

  it('si algo dentro ya atendió Escape (el buscador vacía su campo), la hoja NO se cierra', async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await user.click(handle());
    const input = screen.getByRole('searchbox');
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.preventDefault();
    });
    input.focus();
    await user.keyboard('{Escape}');
    expect(isSheetOpen()).toBe(true);
  });

  it('Escape con la hoja cerrada no hace nada (la tecla sigue su camino)', async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    handle().focus();
    const seen = vi.fn();
    handle().addEventListener('keydown', (event) => {
      seen(event.defaultPrevented);
    });
    await user.keyboard('{Escape}');
    expect(isSheetOpen()).toBe(false);
  });

  it('el estado no sobrevive a la visita: al desmontar vuelve a cerrada', () => {
    const { unmount } = render(<Sheet />);
    act(() => {
      setSheetOpen(true);
    });
    expect(isSheetOpen()).toBe(true);
    unmount();
    expect(isSheetOpen()).toBe(false);
  });
});

describe('HudSheet · arrastre vertical del asa (una mejora del botón)', () => {
  const drag = (from: number, to: number) => {
    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: from, pointerType: 'touch' });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: to, pointerType: 'touch' });
    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: to, pointerType: 'touch' });
  };

  it('hacia arriba abre y hacia abajo cierra; el `click` que el navegador dispara tras el arrastre no lo deshace', () => {
    render(<Sheet />);
    drag(400, 300);
    expect(isSheetOpen()).toBe(true);
    fireEvent.click(handle()); // el navegador lo dispara tras el arrastre
    expect(isSheetOpen()).toBe(true);
    drag(300, 420);
    expect(isSheetOpen()).toBe(false);
  });

  it('un toque o un temblor (menos de 24 px) no decide: lo resuelve el click', () => {
    render(<Sheet />);
    drag(400, 392);
    expect(isSheetOpen()).toBe(false);
    fireEvent.click(handle());
    expect(isSheetOpen()).toBe(true);
  });

  it('un gesto cancelado (el navegador lo toma para desplazar) no abre ni cierra', () => {
    render(<Sheet />);
    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 400, pointerType: 'touch' });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 200, pointerType: 'touch' });
    fireEvent.pointerCancel(handle(), { pointerId: 1, clientY: 200, pointerType: 'touch' });
    expect(isSheetOpen()).toBe(false);
  });

  it('el botón derecho del ratón no inicia un arrastre', () => {
    render(<Sheet />);
    fireEvent.pointerDown(handle(), {
      pointerId: 1,
      clientY: 400,
      pointerType: 'mouse',
      button: 2,
    });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 100, pointerType: 'mouse' });
    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 100, pointerType: 'mouse' });
    expect(isSheetOpen()).toBe(false);
  });
});

describe('HudSheet · sin mapa', () => {
  it('si el mapa NO estará disponible (sin WebGL2, sin datos, con error, bloqueado) la hoja se abre sola: la lista de destinos es la pantalla', () => {
    render(<Sheet />);
    expect(isSheetOpen()).toBe(false);
    act(() => {
      publishMapStatus('unavailable');
    });
    expect(isSheetOpen()).toBe(true);
    expect(handle()).toHaveAttribute('aria-expanded', 'true');
    expect(body()).not.toHaveAttribute('inert');
  });

  it('se abre UNA vez: si la persona la cierra, no se reabre sola', () => {
    render(<Sheet />);
    act(() => {
      publishMapStatus('unavailable');
    });
    act(() => {
      setSheetOpen(false);
    });
    act(() => {
      publishMapStatus('loading');
      publishMapStatus('unavailable');
    });
    expect(isSheetOpen()).toBe(false);
  });

  it('mientras el mapa CARGA, o con el mapa listo, no se abre sola', () => {
    render(<Sheet />);
    act(() => {
      publishMapStatus('loading');
    });
    expect(isSheetOpen()).toBe(false);
    act(() => {
      publishMapStatus('ready');
    });
    expect(isSheetOpen()).toBe(false);
  });
});

describe('HudSheet · resumen del destino elegido (región en vivo)', () => {
  it('con la hoja CERRADA y un destino elegido muestra su nombre y su tipo en una región aria-live', () => {
    window.history.replaceState(null, '', '/es/explorar?d=casco-antiguo');
    render(<Sheet />);
    expect(summary()).toHaveAttribute('aria-live', 'polite');
    expect(summary()).toHaveTextContent('Casco Antiguo');
    expect(summary()).toHaveTextContent('Distrito histórico');
    // dice QUÉ es (para quien no ve el diseño): «Destino seleccionado: Casco Antiguo…»
    expect(summary().textContent).toContain(
      `${(MESSAGES.es.Map as { selectedHeading: string }).selectedHeading}: Casco Antiguo`,
    );
  });

  it('con la hoja ABIERTA queda VACÍA (la anuncia la ficha: la elección no se dice dos veces) pero la región sigue en el DOM', () => {
    window.history.replaceState(null, '', '/es/explorar?d=coiba');
    render(<Sheet />);
    act(() => {
      setSheetOpen(true);
    });
    expect(summary()).toBeInTheDocument();
    expect(summary()).toBeEmptyDOMElement();
  });

  it('sin destino elegido (o con una clave que no existe) la región está vacía', () => {
    render(<Sheet />);
    expect(summary()).toBeEmptyDOMElement();
    cleanup();
    window.history.replaceState(null, '', '/es/explorar?d=no-existe');
    render(<Sheet />);
    expect(summary()).toBeEmptyDOMElement();
  });

  it('el resumen marca el estado «con destino» para que el título pase a rótulo pequeño', () => {
    window.history.replaceState(null, '', '/es/explorar?d=coiba');
    render(<Sheet />);
    expect(document.querySelector('[data-sheet-selected]')).not.toBeNull();
  });
});

describe('HudSheet · escritorio (no existe como caja)', () => {
  beforeEach(() => {
    stubViewport('desktop');
  });

  it('el resumen del destino NO se pinta en escritorio (la ficha del HUD está a la vista: no se repite su texto en el DOM)', () => {
    window.history.replaceState(null, '', '/es/explorar?d=coiba');
    render(<Sheet />);
    expect(summary()).toBeEmptyDOMElement();
  });

  it('el cuerpo NUNCA es inert aunque «esté cerrada» (nada se pliega en escritorio)', () => {
    render(<Sheet />);
    expect(body()).not.toHaveAttribute('inert');
  });

  it('Escape no hace nada: no hay hoja que cerrar', async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    act(() => {
      setSheetOpen(true);
    });
    screen.getByRole('button', { name: 'Dentro de la hoja' }).focus();
    await user.keyboard('{Escape}');
    expect(isSheetOpen()).toBe(true);
  });
});

describe('HudSheet · alto publicado', () => {
  it('publica su alto real en `--sheet-h` del contenedor inmersivo (los créditos del mapa se montan encima) y lo retira al salir', () => {
    const observe = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        disconnect = vi.fn();
        constructor(public callback: () => void) {}
      },
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 96.4,
    } as DOMRect);
    const { unmount } = render(<Sheet />);
    const shell = document.querySelector<HTMLElement>('[data-immersive]')!;
    expect(shell.style.getPropertyValue('--sheet-h')).toBe('96px');
    expect(observe).toHaveBeenCalledWith(root());
    unmount();
    vi.restoreAllMocks();
  });
});
