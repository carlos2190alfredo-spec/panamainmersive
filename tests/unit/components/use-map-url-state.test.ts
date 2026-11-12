// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { currentUrlLayers, writeLayers } from '@/components/map/use-map-url-state';
import { DEFAULT_MAP_LAYERS } from '@/domains/geography/map-url-state';

/**
 * `currentUrlLayers` es lo que usan el botón «Relieve en 3D» y el mapa para saber qué capas pide la persona AHORA. Se lee de
 * `window.location`, no del render: `useSearchParams` llega a React con retraso y un render viejo con el relieve encendido se
 * aplicaba después de apagarlo (r3:F-02).
 */
afterEach(() => {
  window.history.replaceState(null, '', '/es/explorar');
});

describe('currentUrlLayers · las capas de la URL en este instante', () => {
  it('sin `l` son las capas por defecto (ninguna de terceros)', () => {
    window.history.replaceState(null, '', '/es/explorar');
    expect(currentUrlLayers(true)).toEqual(DEFAULT_MAP_LAYERS);
    expect(currentUrlLayers(true)).not.toContain('terrain3d');
  });

  it('refleja AL MOMENTO lo que se escribió, sin esperar a ningún render (encender y apagar seguidos)', () => {
    window.history.replaceState(null, '', '/es/explorar?d=boquete');
    writeLayers(['boundaries', 'terrain3d', 'hillshade']);
    expect(currentUrlLayers(true)).toContain('terrain3d');
    expect(currentUrlLayers(true)).toContain('hillshade');
    writeLayers(['boundaries']);
    expect(currentUrlLayers(true)).toEqual(['boundaries']);
    expect(window.location.search).toContain('d=boquete'); // el resto del estado no se toca
  });

  it('sin derechos para terceros descarta el relieve aunque la URL lo pida (la URL no manda sobre los derechos)', () => {
    window.history.replaceState(null, '', '/es/explorar?l=boundaries,terrain3d,hillshade');
    expect(currentUrlLayers(true)).toEqual(expect.arrayContaining(['terrain3d', 'hillshade']));
    const blocked = currentUrlLayers(false);
    expect(blocked).not.toContain('terrain3d');
    expect(blocked).not.toContain('hillshade');
    expect(blocked).toContain('boundaries');
  });

  it('una `l` mal formada no rompe: vale lo que valga el analizador (capas desconocidas fuera)', () => {
    window.history.replaceState(null, '', '/es/explorar?l=nope,terrain3d');
    expect(currentUrlLayers(true)).not.toContain('nope');
  });
});
