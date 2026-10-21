import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { expect, type Page, type Request } from '@playwright/test';

/**
 * El mapa base real (`public/data/panama-basemap.pmtiles`) no se versiona: lo produce `pnpm data:build` (Python,
 * tippecanoe y red hacia Overture; docs/setup.md §6). Sin él, las pruebas que necesitan el mapa dibujado se OMITEN
 * diciéndolo (un fallo por falta de datos no es un fallo del código, y un «pasó» tampoco sería cierto).
 */
export const MAP_DATA_PRESENT = existsSync(
  join(process.cwd(), 'public/data/panama-basemap.pmtiles'),
);
export const MAP_DATA_SKIP_REASON =
  'Falta public/data/panama-basemap.pmtiles (genera el mapa con `pnpm data:build`): prueba OMITIDA, no «pasó».';

export const TERRAIN_HOST = 'elevation-tiles-prod.s3.amazonaws.com';

/**
 * FIXTURE DE PRUEBA (no es un dato del producto): una tesela Terrarium de 256×256 con elevación constante de 0 m
 * (R=128, G=0, B=0 ⇒ (128·256 + 0 + 0/256) − 32768 = 0). Sirve para ejercitar la ruta de relieve sin llamar a AWS.
 */
export function flatTerrainTile(): Buffer {
  const size = 256;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) row[1 + x * 3] = 128;
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8); // profundidad de bits
  ihdr.writeUInt8(2, 9); // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Intercepta el relieve: sirve el fixture (`ok`) o lo hace fallar (`fail`) y registra cada petición. */
export async function routeTerrain(
  page: Page,
  mode: 'ok' | 'fail',
): Promise<{ requests: string[] }> {
  const requests: string[] = [];
  const tile = flatTerrainTile();
  await page.route(`https://${TERRAIN_HOST}/**`, async (route) => {
    requests.push(route.request().url());
    if (mode === 'fail') await route.abort('failed');
    else
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
        body: tile,
      });
  });
  return { requests };
}

export const mapCanvas = (page: Page) => page.getByTestId('map-canvas');

/** Abre una ruta y espera a que el mapa esté listo (estilo cargado y primer dibujo hecho). */
export async function openMap(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('[data-map-status="ready"]')).toBeVisible({ timeout: 60_000 });
  // `idle` rellena zoom/centro: se espera a que el mapa termine de dibujar.
  await expect
    .poll(async () => (await mapState(page)).zoom, { timeout: 30_000 })
    .toBeGreaterThan(0);
}

export interface MapState {
  zoom: number;
  center: [number, number];
  pitch: number;
}

export async function mapState(page: Page): Promise<MapState> {
  const data = await mapCanvas(page).evaluate((el) => ({
    zoom: el.dataset.zoom ?? '',
    center: el.dataset.center ?? '',
    pitch: el.dataset.pitch ?? '',
  }));
  const [lon = Number.NaN, lat = Number.NaN] = data.center.split(',').map(Number);
  return { zoom: Number(data.zoom), center: [lon, lat], pitch: Number(data.pitch) };
}

/** Hosts a los que ha ido el navegador (para comprobar que no hay terceros no solicitados). */
export function trackRequests(page: Page): { hosts: () => string[]; urls: () => string[] } {
  const urls: string[] = [];
  page.on('request', (r: Request) => {
    if (/^https?:/.test(r.url())) urls.push(r.url());
  });
  return {
    urls: () => [...urls],
    hosts: () => [...new Set(urls.map((u) => new URL(u).host))],
  };
}

/** Fracción de píxeles del lienzo cercanos a un color y nº de colores distintos (cuantizados): «¿se dibujó algo?». */
export async function paintedFractions(
  page: Page,
  colors: Record<string, string>,
): Promise<{ fractions: Record<string, number>; distinct: number }> {
  const png = (await mapCanvas(page).screenshot()).toString('base64');
  return page.evaluate(
    async ({ png: b64, colors: wanted }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('sin contexto 2D');
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const css = getComputedStyle(document.documentElement);
      const rgb = (token: string): [number, number, number] => {
        const hex = css.getPropertyValue(token).trim();
        return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
      };
      const targets = Object.entries(wanted).map(([name, token]) => [name, rgb(token)] as const);
      const counts: Record<string, number> = Object.fromEntries(targets.map(([n]) => [n, 0]));
      const seen = new Set<number>();
      const total = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        seen.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
        for (const [name, [tr, tg, tb]] of targets) {
          if (Math.abs(r - tr) + Math.abs(g - tg) + Math.abs(b - tb) < 24) {
            counts[name] = (counts[name] ?? 0) + 1;
          }
        }
      }
      return {
        fractions: Object.fromEntries(Object.entries(counts).map(([n, c]) => [n, c / total])),
        distinct: seen.size,
      };
    },
    { png, colors },
  );
}
