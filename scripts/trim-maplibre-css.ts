/**
 * `pnpm map:css` regenera `vendor/maplibre-gl.trimmed.css` (la hoja de MapLibre sin lo que no se usa).
 * `pnpm map:css -- --check` solo comprueba que el archivo versionado coincide con lo que saldría hoy (salida 1 si no).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { trimMaplibreCss } from './lib/maplibre-css';

const ROOT = process.cwd();
const SOURCE = join(ROOT, 'node_modules/maplibre-gl/dist/maplibre-gl.css');
const PACKAGE = join(ROOT, 'node_modules/maplibre-gl/package.json');
const TARGET = join(ROOT, 'vendor/maplibre-gl.trimmed.css');

const version = (JSON.parse(readFileSync(PACKAGE, 'utf8')) as { version: string }).version;
const next = trimMaplibreCss(readFileSync(SOURCE, 'utf8'), version);

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(TARGET, 'utf8');
  } catch {
    // ausente: se trata como desactualizado
  }
  if (current !== next) {
    console.error(
      'FALLO: vendor/maplibre-gl.trimmed.css está desactualizado. Ejecuta `pnpm map:css`.',
    );
    process.exit(1);
  }
  console.log(`OK: vendor/maplibre-gl.trimmed.css coincide con maplibre-gl@${version}.`);
} else {
  writeFileSync(TARGET, next);
  console.log(
    `Escrito vendor/maplibre-gl.trimmed.css (${String(next.length)} bytes) desde maplibre-gl@${version}.`,
  );
}
