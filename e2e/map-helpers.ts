import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { expect, type Locator, type Page, type Request } from '@playwright/test';
import { applyCss } from './a11y-probes';

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
  // `screenshot()` del contenedor captura TODO lo que se pinta encima (paneles de vidrio del HUD, viñeta decorativa):
  // se miden los colores del MAPA, no los del HUD, así que se ocultan (con una hoja construida: la CSP prohíbe `<style>`).
  const restore = await hideHud(page);
  let png: string;
  try {
    png = (await mapCanvas(page).screenshot()).toString('base64');
  } finally {
    await restore();
  }
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

/**
 * Oculta el HUD de Explorar y la viñeta decorativa del lienzo (`visibility: hidden`: conservan su sitio y no recolocan
 * nada) y devuelve la función que lo restaura. Para medir el color real del MAPA (`paintedFractions`).
 */
export async function hideHud(page: Page): Promise<() => Promise<void>> {
  const before = await page.evaluate(() => document.adoptedStyleSheets.length);
  await applyCss(page, '[data-hud], [data-atmosphere] { visibility: hidden !important; }');
  return async () => {
    await page.evaluate((count) => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.slice(0, count);
    }, before);
  };
}

/**
 * Despliega los grupos «Capas» y «Leyenda» del carril (están PLEGADOS por defecto: el filtro por tipo ocupa el carril y
 * «Capas y leyenda», en las herramientas, los abre). Se abren con sus propios `<summary>` nativos, que no dependen de la isla
 * de herramientas (llega tras hidratar); los identifica su `id`, no el idioma de su título.
 */
export async function openLayers(page: Page): Promise<void> {
  await openSheet(page); // en móvil los grupos están DENTRO de la hoja inferior (cerrada es inerte); en escritorio no hace nada
  for (const id of ['hud-group-layers', 'hud-group-legend']) {
    const group = page.locator(`#${id}`);
    if ((await group.getAttribute('open')) === null) await group.locator('> summary').click();
    await expect(group).toHaveAttribute('open', '');
  }
}

/** El asa de la hoja inferior móvil (en escritorio existe en el DOM pero no se pinta: la hoja no es una caja). */
export const sheetHandle = (page: Page): Locator => page.locator('[data-sheet-handle]');

/** El cuerpo de la hoja inferior móvil (lo que se pliega: buscador, filtro, capas, carrusel, información del mapa). */
export const sheetBody = (page: Page): Locator => page.locator('[data-sheet-body]');

/** Espera a que una caja deje de moverse (la hoja se abre y se cierra con una transición de 240 ms). */
export async function settled(locator: Locator): Promise<void> {
  let last = '';
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await locator.boundingBox());
        const same = now === last;
        last = now;
        return same;
      },
      { timeout: 10_000, intervals: [120, 120, 120, 250, 250, 500] },
    )
    .toBe(true);
}

/**
 * Abre la hoja inferior si estamos en móvil y está cerrada; en escritorio (el asa no se pinta) no hace nada. Devuelve cuando
 * su cuerpo ya está visible y quieto.
 */
export async function openSheet(page: Page): Promise<void> {
  const handle = sheetHandle(page);
  // El asa existe solo tras hidratar (antes la hoja está en `pending`): sin esperar, «no se ve» podría ser «aún no hay».
  await expect(page.locator('[data-hud-zone="sheet"]')).not.toHaveAttribute(
    'data-state',
    'pending',
  );
  if (!(await handle.isVisible())) return;
  // Sin mapa la hoja se abre SOLA (una vez) y puede hacerlo entre la lectura y el clic: un clic sobre una hoja que acaba
  // de abrirse la cerraría. Se reintenta leyendo antes de cada clic hasta que queda abierta.
  await expect(async () => {
    if ((await handle.getAttribute('aria-expanded')) === 'false') await handle.click();
    await expect(handle).toHaveAttribute('aria-expanded', 'true', { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await expect(sheetBody(page)).toBeVisible();
  await settled(sheetBody(page));
}

/** Cierra la hoja inferior si está abierta (solo móvil). */
export async function closeSheet(page: Page): Promise<void> {
  const handle = sheetHandle(page);
  await expect(page.locator('[data-hud-zone="sheet"]')).not.toHaveAttribute(
    'data-state',
    'pending',
  );
  if (!(await handle.isVisible())) return;
  if ((await handle.getAttribute('aria-expanded')) === 'true') await handle.click();
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
  await expect(sheetBody(page)).toBeHidden();
}

/** Botón que pliega o despliega el panel derecho (`<aside>`). Solo existe en escritorio, tras hidratar. */
export const panelToggle = (page: Page): Locator => page.locator('aside button[aria-expanded]');

/** Abre el panel derecho si está plegado (por defecto lo está en escritorio: el mapa manda). */
export async function openAreasPanel(page: Page): Promise<void> {
  const toggle = panelToggle(page);
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

/** Caja del hueco que el HUD deja libre (`[data-hud-safe]`), en coordenadas de la página. */
export async function safeBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('[data-hud-safe]').boundingBox();
  if (!box)
    throw new Error('No hay hueco libre de HUD (`[data-hud-safe]`): ¿el HUD no llegó a pintarse?');
  return box;
}

/**
 * ¿El marcador del destino está DENTRO del hueco que el HUD deja libre? Es lo que garantiza el encuadre consciente del
 * HUD: un destino a la vista, no tapado por un panel. Mide el centro del botón del marcador.
 */
export async function markerInSafeArea(page: Page, key: string): Promise<boolean> {
  const marker = page.locator(`button[data-destination="${key}"]`);
  const box = await marker.boundingBox();
  if (!box) return false;
  const safe = await safeBox(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return cx >= safe.x && cx <= safe.x + safe.width && cy >= safe.y && cy <= safe.y + safe.height;
}
