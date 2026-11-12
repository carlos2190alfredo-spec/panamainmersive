import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandMark } from '@/components/BrandMark';
import { SITE } from '@/config/site';

/**
 * La marca es un `<img>` nativo (ADR-0025). `next/image` emitiría `style="color:transparent"` y la CSP de producción
 * (`style-src 'self'`) lo bloquea: esta prueba falla si cualquier variante del componente deja un `style=` en el HTML.
 */
const STYLE_ATTRIBUTE = /\sstyle\s*=/i;

/** Dimensiones reales de los archivos de public/brand (leídas con Pillow al escribir la prueba; ver más abajo). */
const FILES = {
  p: { 160: [160, 169], 320: [320, 339], 640: [640, 678] },
  map: { 160: [160, 79], 320: [320, 159], 640: [640, 318] },
} as const;

/** Ancho y alto de un WebP leídos de su cabecera (VP8X/VP8L/VP8): no depende de ninguna librería de imágenes. */
function webpSize(path: string): [number, number] {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`${path}: no es un WebP`);
  }
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  throw new Error(`${path}: formato WebP desconocido «${kind}»`);
}

const attr = (html: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(html)?.[1];

describe('BrandMark', () => {
  const variants = ['p', 'map'] as const;

  it.each(variants)('«%s»: es un <img> nativo y NO deja ningún style= en el HTML', (variant) => {
    for (const props of [
      {},
      { priority: true },
      { size: 'header' as const },
      { size: 'hero' as const, priority: true },
      { loading: 'eager' as const },
      { alt: 'texto', className: 'otra' },
    ]) {
      const html = renderToStaticMarkup(<BrandMark variant={variant} {...props} />);
      // React puede añadir un <link rel="preload"> delante cuando hay fetchPriority="high": lo que importa es UN solo <img>.
      expect(html.match(/<img /g), JSON.stringify(props)).toHaveLength(1);
      expect(html, JSON.stringify(props)).not.toMatch(/<(picture|source|script)/);
      expect(html, JSON.stringify(props)).not.toMatch(STYLE_ATTRIBUTE);
    }
  });

  it('control: el detector SÍ ve un style= (lo que emitiría next/image)', () => {
    expect('<img src="/a.webp" style="color:transparent"/>').toMatch(STYLE_ATTRIBUTE);
    expect('<img src="/a.webp" class="x"/>').not.toMatch(STYLE_ATTRIBUTE);
  });

  it.each(variants)('«%s»: srcSet con 160/320/640 y width/height del archivo de src', (variant) => {
    const html = renderToStaticMarkup(<BrandMark variant={variant} />);
    const file = variant === 'p' ? 'mark-p' : 'mark-map';
    expect(attr(html, 'src')).toBe(`/brand/${file}-320.webp`);
    expect(attr(html, 'srcset')).toBe(
      [160, 320, 640].map((w) => `/brand/${file}-${w}.webp ${w}w`).join(', '),
    );
    expect(attr(html, 'width')).toBe('320');
    expect(attr(html, 'height')).toBe(String(FILES[variant][320][1]));
  });

  it('las dimensiones declaradas coinciden con los archivos REALES de public/brand', () => {
    for (const [variant, widths] of Object.entries(FILES)) {
      for (const [w, size] of Object.entries(widths)) {
        const file = join(process.cwd(), 'public', 'brand', `mark-${variant}-${w}.webp`);
        expect(webpSize(file), file).toEqual(size);
      }
    }
  });

  it('el lector de WebP no es ciego (control con un archivo que no lo es)', () => {
    expect(() => webpSize(join(process.cwd(), 'package.json'))).toThrow(/no es un WebP/);
  });

  it('alt es vacío por defecto (decorativa junto al rótulo) y se puede dar uno', () => {
    expect(attr(renderToStaticMarkup(<BrandMark />), 'alt')).toBe('');
    expect(renderToStaticMarkup(<BrandMark />)).toContain(' alt=""');
    expect(attr(renderToStaticMarkup(<BrandMark alt="Marca" />), 'alt')).toBe('Marca');
  });

  it('por defecto carga perezosa; con priority, inmediata y con prioridad alta', () => {
    const lazy = renderToStaticMarkup(<BrandMark />);
    expect(attr(lazy, 'loading')).toBe('lazy');
    expect(lazy).not.toMatch(/fetchpriority/i);
    const hero = renderToStaticMarkup(<BrandMark priority />);
    expect(attr(hero, 'loading')).toBe('eager');
    expect(attr(hero, 'fetchpriority')).toBe('high');
    // La cabecera: inmediata pero SIN prioridad alta (el LCP es texto).
    const header = renderToStaticMarkup(<BrandMark size="header" loading="eager" />);
    expect(attr(header, 'loading')).toBe('eager');
    expect(header).not.toMatch(/fetchpriority/i);
  });

  it('el tamaño del sistema y la clase del llamador llegan al <img>', () => {
    const html = renderToStaticMarkup(<BrandMark size="header" className="mia" />);
    const classes = (attr(html, 'class') ?? '').split(' ');
    expect(classes).toContain('mia');
    expect(classes.length).toBe(3); // mark + header + mia
    expect(attr(html, 'sizes')).toBeTruthy();
  });
});

describe('SITE.wordmark', () => {
  it('compone el nombre propio (texto vivo, no una imagen)', () => {
    expect(SITE.wordmark).toEqual({ primary: 'Panamá', secondary: 'Immersive' });
    expect(`${SITE.wordmark.primary} ${SITE.wordmark.secondary}`).toBe(SITE.name);
  });
});
