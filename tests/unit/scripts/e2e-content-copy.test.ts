import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `pnpm test:e2e:content` construye una COPIA de la aplicación (`.e2e-content-app/`) con solo lo que `next build` necesita. Si
 * un archivo de `src/` importa por ruta relativa algo que vive FUERA de `src/` (hoy `vendor/maplibre-gl.trimmed.css`, desde
 * `MapStage.tsx`), la copia tiene que llevarlo o el build falla con «Module not found». Lo vio el CI en `bfdbea2`: `ca34997`
 * introdujo el import y nadie volvió a ejecutar esa suite (necesita PostgreSQL con PostGIS y no corre en local sin ellos).
 */
const ROOT = process.cwd();
const SOURCE_EXT = /\.(tsx?|mjs|css)$/;
const RELATIVE_IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : SOURCE_EXT.test(name) ? [path] : [];
  });
}

/** Directorios de primer nivel (fuera de `src/`) a los que apuntan importaciones relativas de estos archivos. */
function escapingTopLevelDirs(files: readonly { path: string; text: string }[]): string[] {
  const found = new Set<string>();
  for (const file of files) {
    for (const match of file.text.matchAll(RELATIVE_IMPORT)) {
      const target = relative(ROOT, resolve(dirname(file.path), match[1] ?? ''));
      if (target.startsWith('..') || target.startsWith(`src${sep}`) || target === 'src') continue;
      const [top, second] = target.split(sep);
      // `data/` se copia subdirectorio a subdirectorio (no entero: lleva los datos del mapa, que pesan)
      if (top === 'data' && second) found.add(`data/${second}`);
      else if (top) found.add(top);
    }
  }
  return [...found].sort();
}

/**
 * Lo que `prepareApp` copia: `cpSync(join(ROOT, '<dir>'), …)`, cada `data/<sub>` del bucle `for (const dir of [...])` y
 * `data/content` (donde escribe la instantánea). Los archivos sueltos de la raíz no cuentan aquí.
 */
function copiedDirs(script: string): string[] {
  const dirs = [...script.matchAll(/cpSync\(\s*join\(ROOT,\s*'([^']+)'\)/g)].map((m) => m[1] ?? '');
  for (const loop of script.matchAll(
    /for \(const dir of \[([^\]]*)\]\)\s*\{\s*cpSync\(\s*join\(ROOT,\s*'data',\s*dir\)/g,
  )) {
    for (const name of (loop[1] ?? '').matchAll(/'([^']+)'/g)) dirs.push(`data/${name[1] ?? ''}`);
  }
  if (script.includes("join(APP, 'data/content/published.json')")) dirs.push('data/content');
  return dirs.sort();
}

describe('la copia de la aplicación de `test:e2e:content` lleva todo lo que `src/` importa de fuera', () => {
  const script = readFileSync(join(ROOT, 'scripts/e2e-content.ts'), 'utf8');
  const files = filesUnder(join(ROOT, 'src')).map((path) => ({
    path,
    text: readFileSync(path, 'utf8'),
  }));

  it('cada directorio de primer nivel que importa `src/` está en la lista de copia', () => {
    const needed = escapingTopLevelDirs(files);
    // No es una prueba vacía: hoy hay al menos uno (`vendor`)
    expect(needed).toContain('vendor');
    const copied = copiedDirs(script);
    expect(
      needed.filter((dir) => !copied.includes(dir)),
      'directorios que `src/` importa y la copia no lleva',
    ).toEqual([]);
  });

  it('control: el detector ve una importación que sale de `src/`, aunque suba varios niveles, y no confunde las internas', () => {
    const synthetic = [
      { path: join(ROOT, 'src/a/b/c.tsx'), text: "import '../../../lo-nuevo/hoja.css';" },
      { path: join(ROOT, 'src/a/d.ts'), text: "import { x } from '../b/c';\nimport y from './z';" },
      { path: join(ROOT, 'src/e.ts'), text: "export { q } from '../otro/mod';" },
    ];
    expect(escapingTopLevelDirs(synthetic)).toEqual(['lo-nuevo', 'otro']);
    // …y la lista de copia que no los tiene lo delata
    expect(copiedDirs("cpSync(join(ROOT, 'src'), join(APP, 'src'))")).toEqual(['src']);
  });

  it('control: sin la copia de `vendor` en el guion, la comprobación falla', () => {
    const without = script.replace(/cpSync\(join\(ROOT, 'vendor'\)[^;]*;/, '');
    expect(without).not.toBe(script);
    expect(copiedDirs(without)).not.toContain('vendor');
  });
});
