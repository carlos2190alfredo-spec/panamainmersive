import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Nombres de variables que JAMÁS deben aparecer en el bundle de cliente (docs/security.md). */
export const SERVER_ONLY_NAMES = [
  'GOOGLE_MAPS_API_KEY',
  'CESIUM_ION_TOKEN',
  'MAPILLARY_ACCESS_TOKEN',
  'DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE',
  'AI_API_KEY',
] as const;

export interface Finding {
  readonly file: string;
  readonly name: string;
}

export function findForbidden(file: string, contents: string, names: readonly string[]): Finding[] {
  return names.filter((n) => contents.includes(n)).map((name) => ({ file, name }));
}

/**
 * Archivos de texto del cliente que se escanean en busca de nombres solo-servidor. Incluye `.mjs`: MapLibre 6 se emite
 * como `static/media/maplibre-gl.<hash>.mjs` (y su worker) y la expresión anterior no los cubría.
 */
export const CLIENT_TEXT_FILES = /\.(js|mjs|css|map|html|json)$/;

export function walk(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full, ext) : ext.test(full) ? [full] : [];
  });
}

export interface PageAssets {
  readonly js: readonly string[];
  readonly css: readonly string[];
  readonly fonts: readonly string[];
}

/** Recursos que una página prerrenderizada pide al cargar (scripts, hojas de estilo, fuentes precargadas). */
export function assetsOfHtml(html: string): PageAssets {
  const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]+)"`).exec(tag)?.[1];
  const js = [...html.matchAll(/<script\b[^>]*>/g)]
    .map((m) => attr(m[0], 'src'))
    .filter((s): s is string => !!s);
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
  const css = links
    .filter((l) => /rel="stylesheet"/.test(l))
    .map((l) => attr(l, 'href'))
    .filter((s): s is string => !!s);
  const fonts = links
    .filter((l) => /as="font"/.test(l))
    .map((l) => attr(l, 'href'))
    .filter((s): s is string => !!s);
  return { js: [...new Set(js)], css: [...new Set(css)], fonts: [...new Set(fonts)] };
}

export function gzipBytes(path: string): number {
  return gzipSync(readFileSync(path)).length;
}

/**
 * Presupuesto en KB desde el entorno. Un valor presente pero no válido FALLA: `Number('2l0')` es `NaN` y `js > NaN` es
 * siempre falso, con lo que la puerta daba «OK» sin comparar nada.
 */
export function parseBudget(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `${name}="${raw}" no es un presupuesto válido (se espera un número de KB positivo y finito).`,
    );
  }
  return value;
}

/** Ruta en disco de un recurso que una página pide como `/_next/…?dpl=…#…` (sin consulta ni fragmento). */
export function assetPath(nextDir: string, url: string): string {
  const clean = url.replace(/[?#].*$/, '').replace(/^\/_next\//, '');
  return join(nextDir, clean);
}

export interface Measured {
  readonly bytes: number;
  /** Recursos que la página pide y que NO existen en el build: no se cuentan como 0, se informan. */
  readonly missing: readonly string[];
}

export function measureAssets(
  nextDir: string,
  urls: readonly string[],
  exists: (path: string) => boolean,
  size: (path: string) => number,
): Measured {
  let bytes = 0;
  const missing: string[] = [];
  for (const url of urls) {
    const path = assetPath(nextDir, url);
    if (exists(path)) bytes += size(path);
    else missing.push(url);
  }
  return { bytes, missing };
}

/**
 * Lo que hace dudar de que una medición de página signifique algo. Una página sin `<script src>`, un recurso que falta
 * o un total de 0 bytes darían «dentro del presupuesto» sin haber medido nada.
 */
export function pageProblems(
  label: string,
  assets: PageAssets,
  js: Measured,
  css: Measured,
): string[] {
  const problems: string[] = [];
  if (assets.js.length === 0) {
    problems.push(
      `${label}: el HTML no tiene ninguna etiqueta <script src> (¿cambió la forma del HTML?).`,
    );
  }
  if (assets.css.length === 0) {
    problems.push(
      `${label}: el HTML no tiene ninguna hoja de estilo enlazada (¿cambió la forma del HTML?).`,
    );
  }
  for (const url of [...js.missing, ...css.missing]) {
    problems.push(`${label}: el recurso ${url} está referenciado pero no existe en el build.`);
  }
  if (js.bytes === 0) problems.push(`${label}: el JS medido es 0 bytes (no se midió nada).`);
  if (css.bytes === 0) problems.push(`${label}: el CSS medido es 0 bytes (no se midió nada).`);
  return problems;
}
