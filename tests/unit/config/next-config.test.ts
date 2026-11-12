import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../../next.config';

/**
 * Cabeceras de `next.config.ts` (la CSP exacta la fija security-headers.test.ts). Aquí, la CACHÉ de los activos
 * estáticos: `public/` sale con `Cache-Control: public, max-age=0` (se revalida en cada visita) y cada familia de
 * archivos necesita su propia regla. Las marcas de la interfaz (/brand) no llevan hash en el nombre: una semana con
 * revalidación en segundo plano, NUNCA `immutable`.
 */
type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<HeaderRule[]> {
  const headers = nextConfig.headers;
  if (!headers) throw new Error('next.config.ts ya no define headers()');
  return headers();
}

function cacheControlFor(all: readonly HeaderRule[], source: string): string | undefined {
  return all
    .filter((r) => r.source === source)
    .flatMap((r) => r.headers)
    .find((h) => h.key.toLowerCase() === 'cache-control')?.value;
}

// Next resuelve `source` con path-to-regexp: se usa el mismo paquete (vendorizado) para comprobar que el patrón casa.
const require = createRequire(import.meta.url);
const { match } = require('next/dist/compiled/path-to-regexp') as {
  match: (pattern: string) => (path: string) => false | { path: string };
};

describe('next.config.ts: caché de /brand', () => {
  it('una semana con revalidación en segundo plano', async () => {
    expect(cacheControlFor(await rules(), '/brand/:file*')).toBe(
      'public, max-age=604800, stale-while-revalidate=86400',
    );
  });

  it('no es «immutable» (los nombres no llevan hash: cambiar un archivo no cambiaría su URL)', async () => {
    expect(cacheControlFor(await rules(), '/brand/:file*')).not.toMatch(/immutable/i);
  });

  it('el patrón casa con CADA archivo de public/brand (y no con otras rutas)', () => {
    const files = readdirSync(join(process.cwd(), 'public', 'brand'));
    expect(files.length).toBeGreaterThanOrEqual(6);
    const matches = match('/brand/:file*');
    for (const file of files) expect(matches(`/brand/${file}`), file).not.toBe(false);
    expect(matches('/data/panama-basemap.pmtiles')).toBe(false);
    expect(matches('/es/brand/mark-p-160.webp')).toBe(false);
  });

  it('control: el detector ve la ausencia de la regla o un valor distinto', async () => {
    const all = await rules();
    expect(
      cacheControlFor(
        all.filter((r) => r.source !== '/brand/:file*'),
        '/brand/:file*',
      ),
    ).toBe(undefined);
    expect(cacheControlFor(all, '/brand/otra-ruta')).toBe(undefined);
  });
});

describe('next.config.ts: el resto de la caché y la CSP siguen donde estaban', () => {
  it('/data (1 h) y /map-assets (7 días) conservan su regla', async () => {
    const all = await rules();
    expect(cacheControlFor(all, '/data/:file*')).toBe('public, max-age=3600');
    expect(cacheControlFor(all, '/map-assets/:path*')).toBe('public, max-age=604800');
  });

  it('la regla global lleva la CSP y es la primera', async () => {
    const [first] = await rules();
    expect(first?.source).toBe('/:path*');
    expect(first?.headers.map((h) => h.key.toLowerCase())).toContain('content-security-policy');
  });
});
