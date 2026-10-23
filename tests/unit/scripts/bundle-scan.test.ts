import { describe, expect, it } from 'vitest';
import {
  CLIENT_TEXT_FILES,
  SERVER_ONLY_NAMES,
  assetPath,
  assetsOfHtml,
  findForbidden,
  measureAssets,
  pageProblems,
  parseBudget,
} from '../../../scripts/lib/bundle-scan';

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

/**
 * Guardas de `check:bundle`. Una revisión independiente demostró que podía dar «OK» sin medir nada: una página cuyas
 * etiquetas `<script src>` llevan `?dpl=…` medía 0 KB; un recurso referenciado que no existe contaba como 0; los seis
 * `.mjs` de MapLibre no se escaneaban en busca de secretos; y un presupuesto no numérico (`JS_BUDGET_KB=2l0`) daba
 * `NaN`, con lo que `js > NaN` es siempre falso. Hoy ninguna ocurre; lo que faltaba eran las guardas.
 */
describe('presupuestos', () => {
  it('sin valor (o vacío) usa el de por defecto; con un número positivo, ese', () => {
    expect(parseBudget('JS_BUDGET_KB', undefined, 210)).toBe(210);
    expect(parseBudget('JS_BUDGET_KB', '', 210)).toBe(210);
    expect(parseBudget('JS_BUDGET_KB', '150.5', 210)).toBe(150.5);
  });

  it.each(['2l0', 'veinte', 'NaN', '0', '-5', 'Infinity', '1e999'])(
    'un presupuesto no válido («%s») FALLA en lugar de convertirse en NaN y no comparar nada',
    (raw) => {
      expect(() => parseBudget('JS_BUDGET_KB', raw, 210)).toThrow(/JS_BUDGET_KB/);
    },
  );
});

describe('recursos de una página', () => {
  it('assetPath quita `?consulta` y `#fragmento` y el prefijo /_next/', () => {
    expect(assetPath('/b', '/_next/static/chunks/a.js?dpl=abc123')).toBe('/b/static/chunks/a.js');
    expect(assetPath('/b', '/_next/static/css/x.css#frag')).toBe('/b/static/css/x.css');
    expect(assetPath('/b', '/_next/static/chunks/plain.js')).toBe('/b/static/chunks/plain.js');
  });

  it('measureAssets suma los que existen y DEVUELVE los que faltan (no los cuenta como 0)', () => {
    const present = new Set(['/b/static/a.js', '/b/static/b.js']);
    const result = measureAssets(
      '/b',
      ['/_next/static/a.js?dpl=1', '/_next/static/b.js', '/_next/static/falta.js'],
      (p) => present.has(p),
      () => 1024,
    );
    expect(result.bytes).toBe(2048);
    expect(result.missing).toEqual(['/_next/static/falta.js']);
  });
});

describe('problemas de una medición de página', () => {
  const ok = { js: ['/_next/a.js'], css: ['/_next/a.css'], fonts: [] as string[] };

  it('una medición sana no tiene problemas', () => {
    expect(
      pageProblems('ficha', ok, { bytes: 190 * 1024, missing: [] }, { bytes: 4096, missing: [] }),
    ).toEqual([]);
  });

  it('una página sin etiquetas <script src> es un problema (¿cambió el HTML?), no «0 KB dentro del presupuesto»', () => {
    const problems = pageProblems(
      'ficha',
      { ...ok, js: [] },
      { bytes: 0, missing: [] },
      { bytes: 4096, missing: [] },
    );
    expect(problems.join('\n')).toMatch(/script/);
  });

  it('un JS o un CSS medido en 0 bytes es un problema', () => {
    expect(
      pageProblems('ficha', ok, { bytes: 0, missing: [] }, { bytes: 4096, missing: [] }).join('\n'),
    ).toMatch(/JS.*0/);
    expect(
      pageProblems('ficha', ok, { bytes: 190 * 1024, missing: [] }, { bytes: 0, missing: [] }).join(
        '\n',
      ),
    ).toMatch(/CSS.*0/);
  });

  it('un recurso referenciado que no existe en el build es un problema que lo nombra', () => {
    const problems = pageProblems(
      'ficha',
      ok,
      { bytes: 190 * 1024, missing: ['/_next/static/falta.js'] },
      { bytes: 4096, missing: [] },
    );
    expect(problems.join('\n')).toContain('/_next/static/falta.js');
  });
});

describe('qué archivos de cliente se escanean en busca de secretos', () => {
  it.each(['a.js', 'maplibre-gl.abc123.mjs', 'x.css', 'x.js.map', 'x.html', 'x.json'])(
    '%s sí',
    (f) => {
      expect(CLIENT_TEXT_FILES.test(f)).toBe(true);
    },
  );
  it.each(['font.woff2', 'logo.svg', 'a.png'])('%s no (binario o imagen)', (f) => {
    expect(CLIENT_TEXT_FILES.test(f)).toBe(false);
  });
});
