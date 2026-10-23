/**
 * Comprobación posterior al build (`pnpm check:bundle`, requiere `pnpm build`):
 *  1. ningún secreto ni nombre de variable solo-servidor en el bundle de cliente (`.next/static`);
 *  2. presupuesto de JS/CSS que carga cada página pública (medición real, gzip);
 *  3. presupuesto del mapa, que se carga DIFERIDO (MapLibre + su worker + PMTiles) solo en /explorar;
 *  4. la ficha y el sitemap se regeneran (`revalidate`): la caducidad del contenido se evalúa por día.
 * Los presupuestos son objetivos iniciales (docs/performance.md): se ajustan con evidencia.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLIENT_TEXT_FILES,
  SERVER_ONLY_NAMES,
  assetsOfHtml,
  findForbidden,
  gzipBytes,
  measureAssets,
  pageProblems,
  parseBudget,
  walk,
} from './lib/bundle-scan';
import { REVALIDATE_SECONDS, revalidationProblems, type PrerenderEntry } from './lib/isr-scan';

const ROOT = process.cwd();
const NEXT = join(ROOT, '.next');
if (!existsSync(join(NEXT, 'static'))) {
  console.error('No hay build: ejecuta `pnpm build` antes de `pnpm check:bundle`.');
  process.exit(2);
}

// 1) Secretos en el bundle de cliente ------------------------------------------------------------
const clientFiles = walk(join(NEXT, 'static'), CLIENT_TEXT_FILES);
if (clientFiles.length === 0) {
  console.error(
    'FALLO: no hay ningún fichero de cliente que escanear (¿cambió la forma del build?).',
  );
  process.exit(1);
}
const leaks = clientFiles.flatMap((f) =>
  findForbidden(f.replace(ROOT, ''), readFileSync(f, 'utf8'), SERVER_ONLY_NAMES),
);
if (leaks.length > 0) {
  console.error('FALLO: nombres de variables solo-servidor en el bundle de cliente:');
  for (const l of leaks) console.error(`  ${l.name} en ${l.file}`);
  process.exit(1);
}
console.log(
  `OK: ${clientFiles.length} ficheros de cliente sin nombres de variables solo-servidor.`,
);

// 2) Presupuesto de JS/CSS por página -------------------------------------------------------------
// Un presupuesto no válido (`JS_BUDGET_KB=2l0`) detiene la puerta: no se compara contra NaN.
const budget = (name: string, fallback: number): number => {
  try {
    return parseBudget(name, process.env[name], fallback);
  } catch (error) {
    console.error(`FALLO: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
};
const JS_BUDGET_KB = budget('JS_BUDGET_KB', 210); // gzip. Línea base medida 2026-10-20: 190,5 KB (React+Next+next-intl); margen ≈ 10 %
const CSS_BUDGET_KB = budget('CSS_BUDGET_KB', 20); // gzip

const pages: [string, string][] = [
  ['home', 'es.html'],
  ['explorar', 'es/explore.html'],
  ['destinos', 'es/destinations.html'],
  ['ficha', 'es/destinations/ciudad-de-panama.html'],
  ['fuentes', 'es/sources.html'],
  ['home (de)', 'de.html'],
];

let failed = false;
const rows: string[] = [
  'página'.padEnd(12) +
    'JS gzip'.padStart(10) +
    'CSS gzip'.padStart(10) +
    'fuentes'.padStart(9) +
    '  ficheros JS',
];
for (const [label, file] of pages) {
  const htmlPath = join(NEXT, 'server/app', file);
  if (!existsSync(htmlPath)) {
    console.error(`FALLO: falta ${file} en el build.`);
    failed = true;
    continue;
  }
  const a = assetsOfHtml(readFileSync(htmlPath, 'utf8'));
  const measuredJs = measureAssets(NEXT, a.js, existsSync, gzipBytes);
  const measuredCss = measureAssets(NEXT, a.css, existsSync, gzipBytes);
  const js = measuredJs.bytes / 1024;
  const css = measuredCss.bytes / 1024;
  const problems = pageProblems(label, a, measuredJs, measuredCss);
  for (const problem of problems) console.error(`FALLO: ${problem}`);
  if (problems.length > 0) failed = true;
  rows.push(
    label.padEnd(12) +
      `${js.toFixed(1)} KB`.padStart(10) +
      `${css.toFixed(1)} KB`.padStart(10) +
      String(a.fonts.length).padStart(9) +
      `  ${a.js.length}`,
  );
  if (js > JS_BUDGET_KB) {
    console.error(`FALLO: ${label}: JS ${js.toFixed(1)} KB > presupuesto ${JS_BUDGET_KB} KB`);
    failed = true;
  }
  if (css > CSS_BUDGET_KB) {
    console.error(`FALLO: ${label}: CSS ${css.toFixed(1)} KB > presupuesto ${CSS_BUDGET_KB} KB`);
    failed = true;
  }
}
console.log(
  `\nMedición (gzip, build de producción; sin red ni caché; presupuestos JS ${JS_BUDGET_KB} KB / CSS ${CSS_BUDGET_KB} KB)`,
);
console.log(rows.join('\n'));

// 3) Mapa (carga diferida) ------------------------------------------------------------------------
// MapLibre 6 se emite como activo estático (`static/media/maplibre-gl.<hash>.mjs`) junto a su worker; PMTiles y el
// código del lienzo viven en chunks normales. Los `-dev` y `shared` no se piden en producción.
const MAP_LAZY_BUDGET_KB = budget('MAP_LAZY_BUDGET_KB', 500); // gzip. Medido 2026-10-20: ≈ 451 KB
const mediaDir = join(NEXT, 'static/media');
const lazyFiles = [
  ...(existsSync(mediaDir) ? readdirSync(mediaDir) : [])
    .filter((f) => /^maplibre-gl(-worker)?\.[\w-]+\.mjs$/.test(f))
    .map((f) => join(mediaDir, f)),
  ...walk(join(NEXT, 'static/chunks'), /\.js$/).filter((f) => {
    const src = readFileSync(f);
    return src.includes('Wrong magic number') || src.includes('data-map-status');
  }),
];
const lazyKb = lazyFiles.reduce((sum, f) => sum + gzipBytes(f), 0) / 1024;
console.log(
  `\nMapa (carga diferida, solo en /explorar): ${lazyKb.toFixed(1)} KB gzip en ${lazyFiles.length} ficheros (presupuesto ${MAP_LAZY_BUDGET_KB} KB)`,
);
if (lazyFiles.length < 3) {
  console.error('FALLO: no se encontraron los activos del mapa (¿cambió la forma de emitirlos?).');
  failed = true;
}
if (lazyKb > MAP_LAZY_BUDGET_KB) {
  console.error(
    `FALLO: el mapa pesa ${lazyKb.toFixed(1)} KB > presupuesto ${MAP_LAZY_BUDGET_KB} KB`,
  );
  failed = true;
}
// 4) Regeneración de lo que depende del día --------------------------------------------------------------
// La caducidad del contenido verificado se evalúa por día al regenerar: la ficha y el sitemap deben tener revalidate.
const manifestPath = join(NEXT, 'prerender-manifest.json');
if (!existsSync(manifestPath)) {
  console.error('FALLO: falta .next/prerender-manifest.json (¿cambió la forma del build?).');
  failed = true;
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    routes?: Record<string, PrerenderEntry>;
  };
  const isrProblems = revalidationProblems(manifest.routes ?? {});
  for (const p of isrProblems) console.error(`FALLO: ${p}`);
  if (isrProblems.length > 0) failed = true;
  else
    console.log(`\nOK: la ficha y el sitemap se regeneran cada ${String(REVALIDATE_SECONDS)} s.`);
}
if (failed) process.exit(1);
