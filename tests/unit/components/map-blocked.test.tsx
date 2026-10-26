import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MapStageLazy } from '@/components/map/MapStageLazy';
import { LOCALES } from '@/i18n/locales';
import { MESSAGES } from './messages-fixture';

/**
 * Con los derechos de los datos sin verificar y el entorno de producción el mapa NO se muestra (`resolveMapExperience`).
 * Ese aviso se pinta en el SERVIDOR (sin JavaScript, sin cargar MapLibre ni el lienzo): lo que ve una persona sin JS es
 * esto, no el mensaje genérico de «el mapa necesita JavaScript». Es la única forma de ver el estado desde pruebas: los E2E
 * corren con `SITE_ENV=development` y la página es estática (se decide al compilar).
 */
const render = (locale: (typeof LOCALES)[number], blocked: boolean): string =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ Map: MESSAGES[locale].Map as never }}>
      <MapStageLazy destinations={[]} blocked={blocked} terrainAllowed={false} />
    </NextIntlClientProvider>,
  );

describe('mapa bloqueado por derechos (MapBlocked)', () => {
  it.each(LOCALES)(
    '(%s) aviso en el servidor: estado «blocked», rol de estado y su motivo',
    (locale) => {
      const html = render(locale, true);
      const map = MESSAGES[locale].Map as { blocked: { title: string; body: string } };
      expect(html).toContain('data-map-status="blocked"');
      expect(html).toContain('role="status"');
      expect(html).toContain(map.blocked.title);
      expect(html).toContain(map.blocked.body);
    },
  );

  it('no lleva lienzo, ni controles, ni marcadores, ni estilos en línea, ni rol de alerta (el mapa no «falló»: está apagado)', () => {
    const html = render('es', true);
    expect(html).not.toMatch(/<canvas|<button|data-testid="map-canvas"|role="alert"|\sstyle=/);
  });

  it('control: sin bloqueo NO se pinta el aviso (el lienzo se carga después, en el cliente)', () => {
    const html = render('es', false);
    const map = MESSAGES.es.Map as { blocked: { title: string } };
    expect(html).not.toContain('data-map-status="blocked"');
    expect(html).not.toContain(map.blocked.title);
  });
});
