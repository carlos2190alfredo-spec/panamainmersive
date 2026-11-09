// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { MESSAGES } from './messages-fixture';

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/i18n/navigation', async () => ({
  ...(await import('./nav-mock')).navigationMock,
  usePathname: () => '/destinations',
}));

afterEach(cleanup);

function setup() {
  const { container } = render(
    <div>
      <a id="before" href="#x">
        antes
      </a>
      <NextIntlClientProvider locale="es" messages={{ Language: MESSAGES.es.Language as never }}>
        <LocaleSwitcher />
      </NextIntlClientProvider>
      <a id="after" href="#y">
        después
      </a>
    </div>,
  );
  const details = container.querySelector('details') as HTMLDetailsElement;
  const links = [...details.querySelectorAll('a')];
  return {
    details,
    summary: details.querySelector('summary') as HTMLElement,
    first: links[0] as HTMLElement,
    last: links[links.length - 1] as HTMLElement,
    after: container.querySelector('#after') as HTMLElement,
  };
}

describe('LocaleSwitcher: cierre del selector abierto (r2:F2, WCAG 2.4.11)', () => {
  it('el foco sale con Tab de la última opción a algo de FUERA: se cierra', () => {
    const { details, last, after } = setup();
    details.open = true;
    fireEvent.focusOut(last, { relatedTarget: after });
    expect(details.open).toBe(false);
  });

  it('Mayús+Tab desde el resumen hasta lo que lo precede también lo cierra', () => {
    const { details, summary } = setup();
    details.open = true;
    fireEvent.focusOut(summary, {
      relatedTarget: document.getElementById('before') as HTMLElement,
    });
    expect(details.open).toBe(false);
  });

  it('el foco entre el resumen y las opciones, o entre las opciones, NO lo cierra', () => {
    const { details, summary, first, last } = setup();
    details.open = true;
    fireEvent.focusOut(summary, { relatedTarget: first });
    fireEvent.focusOut(first, { relatedTarget: last });
    fireEvent.focusOut(last, { relatedTarget: summary });
    expect(details.open).toBe(true);
  });

  it('un foco que se pierde sin destino (otra pestaña) no lo cierra', () => {
    const { details, last } = setup();
    details.open = true;
    fireEvent.focusOut(last, { relatedTarget: null });
    expect(details.open).toBe(true);
  });

  it('Escape sigue cerrándolo y devuelve el foco al resumen; un clic fuera también', () => {
    const { details, summary, first } = setup();
    details.open = true;
    first.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    details.open = true;
    fireEvent.pointerDown(document.body);
    expect(details.open).toBe(false);
  });
});
