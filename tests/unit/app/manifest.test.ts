import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MetadataRoute } from 'next';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SITE } from '@/config/site';

/**
 * Manifiesto de la aplicación (`src/app/manifest.ts`): instalable como acceso directo, SIN service worker y sin
 * prometer modo sin conexión (la política de derechos del mapa base no incluye `offline`).
 */
vi.mock('@/config/env', () => ({
  getEnv: () => ({ SITE_ENV: 'staging', NEXT_PUBLIC_SITE_URL: 'https://example.org' }),
}));
vi.mock('@/i18n/navigation', () => ({ getPathname: () => '/' }));

let manifest: MetadataRoute.Manifest;
let THEME_COLORS: { readonly light: string; readonly dark: string };
beforeAll(async () => {
  manifest = (await import('@/app/manifest')).default();
  ({ THEME_COLORS } = await import('@/lib/seo'));
});

/** Ancho y alto de un PNG leídos de su cabecera IHDR. */
function pngSize(path: string): [number, number] {
  const b = readFileSync(path);
  if (b.toString('latin1', 1, 4) !== 'PNG') throw new Error(`${path}: no es un PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

/** Archivo que sirve una URL del manifiesto: `/icon.png` es la convención de Next (src/app), el resto va en public/. */
const fileOf = (src: string): string =>
  src === '/icon.png' ? join('src', 'app', 'icon.png') : join('public', src);

describe('manifest', () => {
  it('nombre propio del sitio, raíz del sitio y modo independiente', () => {
    expect(manifest.name).toBe(SITE.name);
    expect(manifest.short_name).toBe(SITE.name);
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.id).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('los colores salen de la constante única (la misma del <meta theme-color>)', () => {
    expect(manifest.theme_color).toBe(THEME_COLORS.dark);
    expect(manifest.background_color).toBe(THEME_COLORS.dark);
    expect(Object.values(THEME_COLORS)).toContain(manifest.theme_color);
  });

  it('iconos de 192 y 512 px que EXISTEN y miden lo que declaran', () => {
    const sizes = (manifest.icons ?? []).map((i) => i.sizes);
    expect(sizes).toEqual(['192x192', '512x512']);
    for (const icon of manifest.icons ?? []) {
      const file = join(process.cwd(), fileOf(icon.src));
      expect(existsSync(file), icon.src).toBe(true);
      const [w, h] = pngSize(file);
      expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
      expect(icon.type).toBe('image/png');
      // Esquinas redondeadas y transparentes: NO es maskable (la máscara del sistema recortaría la P).
      expect(icon.purpose).toBe('any');
    }
  });

  it('sin service worker ni descripción propia (no es por idioma) ni promesas de modo sin conexión', () => {
    const keys = Object.keys(manifest);
    expect(keys).not.toContain('serviceworker');
    expect(keys).not.toContain('description');
    expect(keys).not.toContain('lang');
    expect(existsSync(join(process.cwd(), 'public', 'sw.js'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'src', 'app', 'sw.ts'))).toBe(false);
  });

  it('control: el lector de PNG no es ciego', () => {
    expect(() => pngSize(join(process.cwd(), 'package.json'))).toThrow(/no es un PNG/);
  });
});
