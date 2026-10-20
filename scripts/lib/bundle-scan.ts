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
