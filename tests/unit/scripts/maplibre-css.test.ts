import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UNUSED_FRAGMENTS, parseBlocks, trimMaplibreCss } from '../../../scripts/lib/maplibre-css';

/**
 * El CSS de MapLibre se recorta a lo que la aplicación usa (docs/performance.md M-08). Hay dos riesgos y esta prueba
 * vigila los dos: (1) que el archivo versionado quede DESACTUALIZADO respecto del paquete (actualizar `maplibre-gl` sin
 * volver a generarlo), y (2) que el recorte se lleve algo que SÍ se usa (un control, el marcador, los gestos cooperativos).
 */
const ROOT = process.cwd();
const SOURCE = readFileSync(join(ROOT, 'node_modules/maplibre-gl/dist/maplibre-gl.css'), 'utf8');
const VERSION = (
  JSON.parse(readFileSync(join(ROOT, 'node_modules/maplibre-gl/package.json'), 'utf8')) as {
    version: string;
  }
).version;
const COMMITTED = readFileSync(join(ROOT, 'vendor/maplibre-gl.trimmed.css'), 'utf8');

describe('vendor/maplibre-gl.trimmed.css', () => {
  it('coincide EXACTAMENTE con lo que saldría hoy del paquete instalado (si no: `pnpm map:css`)', () => {
    expect(COMMITTED).toBe(trimMaplibreCss(SOURCE, VERSION));
  });

  it('declara su origen: versión del paquete, licencia y cómo regenerarla', () => {
    expect(COMMITTED).toContain(`maplibre-gl@${VERSION}`);
    expect(COMMITTED).toContain('BSD-3-Clause');
    expect(COMMITTED).toContain('pnpm map:css');
  });

  it('pesa una fracción de la hoja completa (el motivo de existir) y sigue siendo CSS balanceado', () => {
    expect(COMMITTED.length).toBeLessThan(SOURCE.length * 0.25);
    expect(() => parseBlocks(COMMITTED.replace(/\/\*[\s\S]*?\*\//g, ''))).not.toThrow();
  });

  it('NO conserva nada de lo que la aplicación no usa', () => {
    for (const fragment of UNUSED_FRAGMENTS) expect(COMMITTED, fragment).not.toContain(fragment);
  });

  it.each([
    // lienzo, contenedores y esquinas de controles
    '.maplibregl-map{',
    '.maplibregl-canvas{',
    '.maplibregl-ctrl-top-right{',
    '.maplibregl-ctrl-bottom-left{',
    // zoom y brújula (NavigationControl con `visualizePitch`) y sus iconos
    '.maplibregl-ctrl-group{',
    'maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon{',
    'maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon{',
    'maplibregl-ctrl-compass .maplibregl-ctrl-icon{',
    // créditos (obligatorios por la licencia ODbL) y escala
    '.maplibregl-ctrl-attrib.maplibregl-compact',
    '.maplibregl-ctrl-attrib-button',
    '.maplibregl-ctrl-scale{',
    // marcadores HTML, gestos cooperativos (móvil) y el rectángulo del zoom por caja
    '.maplibregl-marker{',
    '.maplibregl-cooperative-gesture-screen{',
    '.maplibregl-touch-drag-pan.maplibregl-cooperative-gestures',
    '.maplibregl-boxzoom{',
  ])('conserva lo que SÍ se usa: %s', (selector) => {
    expect(COMMITTED).toContain(selector);
  });

  it('control: la hoja completa SÍ trae lo que se quita (el recorte no es un filtro vacío)', () => {
    for (const fragment of UNUSED_FRAGMENTS) expect(SOURCE, fragment).toContain(fragment);
  });
});

describe('trimMaplibreCss (sobre hojas sintéticas)', () => {
  const css =
    '.maplibregl-map{a:b}.maplibregl-popup{c:d}' +
    '@media(forced-colors:active){.maplibregl-ctrl-globe .x{e:f}.maplibregl-ctrl-icon{g:h}}' +
    '@media(hover:none){.maplibregl-ctrl-fullscreen{i:j}}' +
    '@keyframes maplibregl-spin{from{k:l}to{k:m}}@keyframes maplibregl-keep{from{n:o}}' +
    '.maplibregl-x{background-image:url("data:image/svg+xml,%3Csvg%3E{;}%3C/svg%3E")}';

  it('quita las reglas y las animaciones sin uso y conserva el resto, también dentro de @media', () => {
    const out = trimMaplibreCss(css, '9.9.9');
    expect(out).toContain('.maplibregl-map{a:b}');
    expect(out).toContain('@media(forced-colors:active){.maplibregl-ctrl-icon{g:h}}');
    expect(out).toContain('@keyframes maplibregl-keep{from{n:o}}');
    expect(out).not.toContain('popup');
    expect(out).not.toContain('globe');
    expect(out).not.toContain('fullscreen'); // el @media que quedó vacío desaparece entero
    expect(out).not.toContain('maplibregl-spin');
  });

  it('una URL con llaves y punto y coma dentro de comillas no descuadra el análisis', () => {
    const out = trimMaplibreCss(css, '9.9.9');
    expect(out).toContain('url("data:image/svg+xml,%3Csvg%3E{;}%3C/svg%3E")');
  });

  it('lanza ante una hoja truncada (un recorte de un CSS roto no debe parecer válido)', () => {
    expect(() => trimMaplibreCss('.a{b:c', '1.0.0')).toThrow(/truncada/);
    expect(() => trimMaplibreCss('.a{b:c}}', '1.0.0')).toThrow(/sobrante/);
  });

  it('lanza si no queda ninguna regla', () => {
    expect(() => trimMaplibreCss('.maplibregl-popup{a:b}', '1.0.0')).toThrow(/ninguna regla/);
  });
});
