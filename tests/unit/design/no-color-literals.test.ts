import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * «Colores solo en src/styles/tokens.css» (CLAUDE.md, ADR-0025). Sin esta guarda, un `#fff` o un `rgb()` en un módulo
 * CSS se salta la prueba de contraste (que solo mide los tokens) y no sigue el tema claro/oscuro/inmersivo.
 * Se buscan en el VALOR de cada declaración: hexadecimales, funciones de color y nombres de color en las propiedades
 * que aceptan un color. `transparent`, `currentColor`, los colores de sistema y `var(--token)` son legítimos.
 */
const ROOT = join(process.cwd(), 'src');
const TOKENS = join(ROOT, 'styles', 'tokens.css');

const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod ' +
    'darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon ' +
    'darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray ' +
    'dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green ' +
    'greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon ' +
    'lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon ' +
    'lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen ' +
    'magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue ' +
    'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy ' +
    'oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip ' +
    'peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal ' +
    'thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);

/** Propiedades cuyo valor puede ser un color (para no confundir `animation-name: red` con un color). */
const COLOR_PROPERTY =
  /^(?:--[\w-]+|color|fill|stroke|background(?:-[\w-]+)?|border(?:-[\w-]+)?|outline(?:-[\w-]+)?|box-shadow|text-shadow|text-decoration(?:-[\w-]+)?|caret-color|accent-color|column-rule(?:-[\w-]+)?|scrollbar-color|text-emphasis(?:-[\w-]+)?|stop-color|flood-color|lighting-color|mask(?:-[\w-]+)?|filter|drop-shadow)$/i;

/** Declaraciones `propiedad: valor` de un CSS (sin comentarios ni cadenas ni `url()`); descarta selectores y preludios. */
function declarations(css: string): { prop: string; value: string }[] {
  const text = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/url\([^)]*\)/gi, 'url()')
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""');
  const out: { prop: string; value: string }[] = [];
  let current = '';
  for (const ch of text) {
    if (ch === '{') {
      current = ''; // lo anterior era un selector o un preludio de @media
    } else if (ch === ';' || ch === '}') {
      const at = current.indexOf(':');
      if (at > 0)
        out.push({ prop: current.slice(0, at).trim(), value: current.slice(at + 1).trim() });
      current = '';
    } else {
      current += ch;
    }
  }
  return out;
}

/** Literales de color de un CSS (vacío = ninguno). */
function colorLiterals(css: string): string[] {
  const found: string[] = [];
  for (const { prop, value } of declarations(css)) {
    const hex =
      value.match(/(?<![\w-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi) ?? [];
    const fn = value.match(/(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi) ?? [];
    const named = COLOR_PROPERTY.test(prop)
      ? (
          value
            .replace(/--[\w-]+/g, ' ')
            .toLowerCase()
            .match(/[a-z]+/g) ?? []
        ).filter((w) => NAMED_COLORS.has(w))
      : [];
    for (const literal of [...hex, ...fn, ...named]) found.push(`${prop}: ${literal}`);
  }
  return found;
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return path.endsWith('.css') ? [path] : [];
  });
}

describe('colores solo en tokens.css', () => {
  const files = cssFiles(ROOT);
  const others = files.filter((f) => f !== TOKENS);

  it('hay CSS que revisar y tokens.css es el único exento', () => {
    expect(files).toContain(TOKENS);
    expect(others.length).toBeGreaterThan(10);
  });

  it('ningún otro CSS de src/ contiene un literal de color', () => {
    const offenders = others.flatMap((file) =>
      colorLiterals(readFileSync(file, 'utf8')).map((l) => `${file.slice(ROOT.length + 1)} → ${l}`),
    );
    expect(offenders).toEqual([]);
  });

  it('tokens.css SÍ los contiene (el detector no es ciego)', () => {
    expect(colorLiterals(readFileSync(TOKENS, 'utf8')).length).toBeGreaterThan(50);
  });
});

describe('control: el detector ve cada forma de literal y respeta lo legítimo', () => {
  it.each([
    ['hexadecimal de 3', '.a { color: #fff; }', 'color: #fff'],
    ['hexadecimal de 6', '.a { background: #0033a0; }', 'background: #0033a0'],
    ['hexadecimal con alfa', '.a { border-color: #0033a0cc; }', 'border-color: #0033a0cc'],
    ['rgb()', '.a { box-shadow: 0 0 4px rgb(0 0 0 / 40%); }', 'box-shadow: rgb('],
    ['rgba()', '.a { color: rgba(0, 0, 0, 0.5); }', 'color: rgba('],
    ['hsl()', '.a { color: hsl(200 50% 50%); }', 'color: hsl('],
    ['oklch()', '.a { color: oklch(0.5 0.2 200); }', 'color: oklch('],
    ['color()', '.a { color: color(display-p3 1 0 0); }', 'color: color('],
    ['un nombre de color', '.a { border: 1px solid red; }', 'border: red'],
    [
      'un literal dentro del valor de reserva de var()',
      '.a { color: var(--x, #fff); }',
      'color: #fff',
    ],
    ['dentro de @media', '@media (min-width: 40rem) { .a { fill: white; } }', 'fill: white'],
    ['una propiedad personalizada', '.a { --mi-color: #123456; }', '--mi-color: #123456'],
  ])('%s', (_name, css, expected) => {
    expect(colorLiterals(css)).toContain(expected);
  });

  it.each([
    ['var(--token)', '.a { color: var(--color-ink); background: var(--surface-glass); }'],
    [
      'transparent, currentColor y colores de sistema',
      '.a { color: currentColor; background: transparent; outline-color: Highlight; border-color: CanvasText; }',
    ],
    ['un selector con id', '#main-content:focus { outline: none; }'],
    ['white-space no es un color', '.a { white-space: nowrap; }'],
    [
      'un token con nombre de color',
      '.a { color: var(--color-red); border-color: var(--color-brand-green); }',
    ],
    [
      'color-mix sin literales',
      '.a { background: color-mix(in srgb, var(--color-glass-base) 88%, transparent); }',
    ],
    [
      'un #hex dentro de un comentario o de una cadena',
      '/* #fff */ .a::after { content: "#fff red"; }',
    ],
    ['url() con fragmento', '.a { background: url(sprite.svg#icon); }'],
    ['un nombre de animación', '.a { animation-name: red; }'],
  ])('no se confunde con: %s', (_name, css) => {
    expect(colorLiterals(css)).toEqual([]);
  });
});
