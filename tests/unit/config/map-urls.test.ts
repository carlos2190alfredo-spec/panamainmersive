import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERRAIN_TILES_URL,
  hasTileTemplate,
  joinUrl,
  mapConnectOrigins,
  originOf,
} from '@/config/map-urls';
import { TERRAIN_ORIGIN, buildCsp } from '@/config/security-headers';

describe('direcciones del mapa', () => {
  it('el relieve por defecto cuelga EXACTAMENTE del origen que autoriza la CSP', () => {
    expect(DEFAULT_TERRAIN_TILES_URL.startsWith(`${TERRAIN_ORIGIN}/`)).toBe(true);
    expect(originOf(DEFAULT_TERRAIN_TILES_URL)).toBe(TERRAIN_ORIGIN);
    expect(hasTileTemplate(DEFAULT_TERRAIN_TILES_URL)).toBe(true);
  });

  it('originOf: solo http(s) absolutas; rutas y esquemas peligrosos devuelven null', () => {
    expect(originOf('https://cdn.example.org:8443/a/b')).toBe('https://cdn.example.org:8443');
    expect(originOf('/data')).toBeNull();
    expect(originOf('javascript:alert(1)')).toBeNull();
    expect(originOf('data:text/html,hola')).toBeNull();
    expect(originOf('no es una url')).toBeNull();
  });

  it('mapConnectOrigins: añade a connect-src solo los orígenes externos y sin duplicados', () => {
    expect(mapConnectOrigins({})).toEqual([TERRAIN_ORIGIN]);
    expect(
      mapConnectOrigins({
        tilesBaseUrl: 'https://cdn.example.org/tiles',
        terrainTilesUrl: '/terreno/{z}/{x}/{y}.png',
      }),
    ).toEqual(['https://cdn.example.org']);
    expect(
      mapConnectOrigins({
        tilesBaseUrl: 'https://cdn.example.org/a',
        terrainTilesUrl: 'https://cdn.example.org/{z}/{x}/{y}',
      }),
    ).toEqual(['https://cdn.example.org']);
  });

  it('el origen configurado llega a connect-src de la CSP', () => {
    const csp = buildCsp({
      production: true,
      development: false,
      connectOrigins: mapConnectOrigins({ tilesBaseUrl: 'https://cdn.example.org/tiles' }),
    });
    const connect = csp.split('; ').find((d) => d.startsWith('connect-src '));
    expect(connect).toBe(`connect-src 'self' ${TERRAIN_ORIGIN} https://cdn.example.org`);
  });

  it('joinUrl no duplica barras', () => {
    expect(joinUrl('/data/', 'a.pmtiles')).toBe('/data/a.pmtiles');
    expect(joinUrl('https://x.example/d', 'a.pmtiles')).toBe('https://x.example/d/a.pmtiles');
  });
});
