/**
 * Recorte DETERMINISTA de `maplibre-gl/dist/maplibre-gl.css` (docs/performance.md M-08).
 *
 * La hoja completa pesa 71,6 KB (≈ 10,3 KB gzip) y es lo que más pesa del CSS de Explorar. Casi todo es de controles y
 * clases que esta aplicación NO usa: el logotipo de MapLibre (tres variantes de 13 KB: la página no lo muestra), los
 * controles de globo, de terreno, de ubicación y de pantalla completa (ADR-0025 §9: no hay ubicación ni pantalla
 * completa), las ventanas emergentes (`Popup`) y el punto de ubicación del usuario. Se quita eso y NADA más: lo que no se
 * reconoce se conserva, de modo que una regla nueva de una versión posterior no se pierde en silencio.
 *
 * El resultado se versiona en `vendor/maplibre-gl.trimmed.css` (fuera de `src/`: es CSS de un tercero, con colores
 * propios que la prueba de «colores solo en tokens» no debe revisar) y una prueba lo regenera en memoria y lo compara:
 * actualizar `maplibre-gl` sin volver a generarlo la hace fallar. `pnpm map:css` lo regenera.
 *
 * Funciones puras (sin disco): las usa el script y las prueba `tests/unit/scripts/maplibre-css.test.ts`.
 */

/** Fragmentos que, si aparecen en el selector (o en el nombre de una animación), hacen que la regla se quite. */
export const UNUSED_FRAGMENTS = [
  'maplibregl-ctrl-logo',
  'maplibregl-ctrl-globe',
  'maplibregl-ctrl-terrain',
  'maplibregl-ctrl-geolocate',
  'maplibregl-ctrl-fullscreen',
  'maplibregl-ctrl-shrink',
  'maplibregl-pseudo-fullscreen',
  'maplibregl-map:fullscreen',
  'maplibregl-popup',
  'maplibregl-user-location',
  'maplibregl-spin',
] as const;

export interface CssBlock {
  /** Lo que precede a `{` (selector o preludio de un at-rule), sin espacios sobrantes. */
  readonly prelude: string;
  /** Lo que hay entre las llaves; vacío en una regla de una sola línea (`@import …;`). */
  readonly body: string;
}

/**
 * Divide una hoja en sus bloques de nivel superior respetando cadenas y paréntesis (las URL `data:` llevan comillas, `;`
 * y `,`). Lanza si quedan llaves sin cerrar: un CSS truncado NO debe dar un recorte «válido».
 */
export function parseBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    let depth = 0;
    let paren = 0;
    let quote: string | null = null;
    let prelude = '';
    let bodyStart = -1;
    let j = i;
    let closed = false;
    for (; j < n; j++) {
      const c = css[j] as string;
      if (quote) {
        if (c === '\\') j++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '(') paren++;
      else if (c === ')') paren--;
      else if (paren === 0 && c === '{') {
        if (depth === 0) {
          prelude = css.slice(i, j).trim();
          bodyStart = j + 1;
        }
        depth++;
      } else if (paren === 0 && c === '}') {
        depth--;
        if (depth < 0) throw new Error(`llave de cierre sobrante (posición ${String(j)})`);
        if (depth === 0) {
          blocks.push({ prelude, body: css.slice(bodyStart, j) });
          closed = true;
          j++;
          break;
        }
      } else if (paren === 0 && depth === 0 && c === ';') {
        const text = css.slice(i, j).trim();
        if (text) blocks.push({ prelude: text, body: '' });
        closed = true;
        j++;
        break;
      }
    }
    if (!closed) {
      if (css.slice(i).trim() === '') break;
      throw new Error('hoja truncada: llave sin cerrar');
    }
    i = j;
  }
  return blocks;
}

const isUnused = (text: string): boolean => UNUSED_FRAGMENTS.some((f) => text.includes(f));

/** Un bloque, ya recortado: `null` si no queda nada de él. */
function trimBlock(block: CssBlock): string | null {
  const { prelude, body } = block;
  if (prelude.startsWith('@keyframes')) return isUnused(prelude) ? null : `${prelude}{${body}}`;
  if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
    const kept = parseBlocks(body)
      .map(trimBlock)
      .filter((b): b is string => b !== null);
    return kept.length === 0 ? null : `${prelude}{${kept.join('')}}`;
  }
  if (body === '' && !prelude.startsWith('@')) return null;
  if (body === '') return `${prelude};`;
  return isUnused(prelude) ? null : `${prelude}{${body}}`;
}

/** Hoja recortada: un bloque por línea (diferencias legibles) y una cabecera con el origen y la licencia. */
export function trimMaplibreCss(source: string, version: string): string {
  const kept = parseBlocks(source)
    .map(trimBlock)
    .filter((b): b is string => b !== null);
  if (kept.length === 0) throw new Error('el recorte no dejó ninguna regla');
  return [
    `/* Derivada de maplibre-gl@${version} (BSD-3-Clause, © MapLibre contributors) por scripts/trim-maplibre-css.ts.`,
    ' * NO se edita a mano: `pnpm map:css` la regenera. Quita solo lo que la aplicación no usa (logotipo, globo, terreno,',
    ' * ubicación, pantalla completa, ventanas emergentes); ver docs/performance.md M-08. */',
    ...kept,
    '',
  ].join('\n');
}
