import { describe, expect, it } from 'vitest';
import { SERVER_ONLY_NAMES, assetsOfHtml, findForbidden } from '../../../scripts/lib/bundle-scan';

describe('escaneo de secretos en el bundle', () => {
  it('control positivo: detecta un nombre de variable solo-servidor', () => {
    const f = findForbidden(
      'a.js',
      'const k = process.env.GOOGLE_MAPS_API_KEY;',
      SERVER_ONLY_NAMES,
    );
    expect(f).toEqual([{ file: 'a.js', name: 'GOOGLE_MAPS_API_KEY' }]);
  });

  it('control negativo: código de cliente normal no produce hallazgos', () => {
    expect(
      findForbidden('a.js', 'const url = process.env.NEXT_PUBLIC_SITE_URL;', SERVER_ONLY_NAMES),
    ).toEqual([]);
  });

  it('la lista cubre las credenciales de las integraciones documentadas', () => {
    for (const n of [
      'GOOGLE_MAPS_API_KEY',
      'CESIUM_ION_TOKEN',
      'MAPILLARY_ACCESS_TOKEN',
      'DATABASE_URL',
    ]) {
      expect(SERVER_ONLY_NAMES).toContain(n);
    }
  });
});

describe('recursos de una página prerrenderizada', () => {
  it('extrae scripts, hojas de estilo y fuentes sin duplicados', () => {
    const html = `
      <link rel="preload" as="font" href="/_next/static/media/a.woff2"/>
      <link rel="stylesheet" href="/_next/static/chunks/a.css"/>
      <script src="/_next/static/chunks/a.js" async=""></script>
      <script src="/_next/static/chunks/a.js" async=""></script>
      <script>inline()</script>`;
    expect(assetsOfHtml(html)).toEqual({
      js: ['/_next/static/chunks/a.js'],
      css: ['/_next/static/chunks/a.css'],
      fonts: ['/_next/static/media/a.woff2'],
    });
  });
});
