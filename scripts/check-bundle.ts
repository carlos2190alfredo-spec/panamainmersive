/**
 * Comprobación posterior al build (`pnpm check:bundle`, requiere `pnpm build`):
 *  1. ningún secreto ni nombre de variable solo-servidor en el bundle de cliente (`.next/static`);
 *  2. presupuesto de JS/CSS que carga cada página pública (medición real, gzip).
 * Los presupuestos son objetivos iniciales (docs/performance.md): se ajustan con evidencia.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVER_ONLY_NAMES, assetsOfHtml, findForbidden, gzipBytes, walk } from './lib/bundle-scan';

const ROOT = process.cwd();
const NEXT = join(ROOT, '.next');
if (!existsSync(join(NEXT, 'static'))) {
  console.error('No hay build: ejecuta `pnpm build` antes de `pnpm check:bundle`.');
  process.exit(2);
}

// 1) Secretos en el bundle de cliente ------------------------------------------------------------
const clientFiles = walk(join(NEXT, 'static'), /\.(js|css|map|html|json)$/);
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
const JS_BUDGET_KB = Number(process.env.JS_BUDGET_KB ?? 210); // gzip. Línea base medida 2026-10-20: 190,5 KB (React+Next+next-intl); margen ≈ 10 %
const CSS_BUDGET_KB = Number(process.env.CSS_BUDGET_KB ?? 20); // gzip

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
  const size = (urls: readonly string[]) =>
    urls.reduce((sum, u) => {
      const p = join(NEXT, u.replace(/^\/_next\//, ''));
      return existsSync(p) ? sum + gzipBytes(p) : sum;
    }, 0);
  const js = size(a.js) / 1024;
  const css = size(a.css) / 1024;
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
if (failed) process.exit(1);
