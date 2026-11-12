/**
 * Lectura de `src/styles/tokens.css` POR ÁMBITO para las pruebas de diseño (no es `*.test.ts`: vitest no lo recoge).
 *
 * Por qué existe (ADR-0025, E-93): las pruebas partían el CSS en el índice de la primera
 * `@media (prefers-color-scheme: dark)`. Con un tercer ámbito (`:root:has([data-immersive])`) eso FUSIONA el bloque
 * inmersivo en «claro» o en «oscuro» y tapa un fallo real: un acento oscuro roto pasa en verde si el bloque
 * inmersivo, correcto, va después. Aquí cada ámbito se localiza por su selector EXACTO a nivel superior, las llaves se
 * emparejan y todo lo que falte, se repita o no cierre LANZA («un verde que no midió nada es peor que un rojo»).
 */

export type Tokens = Record<string, string>;

export interface Rule {
  /** Lo que precede a `{`, sin espacios sobrantes: `:root`, `@media (prefers-color-scheme: dark)`… */
  prelude: string;
  /** Lo que hay entre llaves (sin ellas). */
  body: string;
}

/** Quita los comentarios: dentro de ellos puede haber `{` o `}` que descuadrarían el emparejado. */
export function stripComments(source: string): string {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  if (stripped.includes('/*')) throw new Error('comentario CSS sin cerrar');
  return stripped;
}

/** Reglas del nivel superior de `source` (cada una con su cuerpo). Lanza ante llaves sin emparejar. */
export function parseRules(source: string): Rule[] {
  const text = stripComments(source);
  const rules: Rule[] = [];
  let prelude = '';
  let depth = 0;
  let bodyStart = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) bodyStart = i + 1;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth < 0) throw new Error(`llave de cierre sobrante (posición ${i})`);
      if (depth === 0) {
        rules.push({
          prelude: prelude.replace(/\s+/g, ' ').trim(),
          body: text.slice(bodyStart, i),
        });
        prelude = '';
      }
    } else if (depth === 0) {
      if (ch === ';')
        prelude = ''; // regla de una línea (`@import …;`): no tiene cuerpo
      else prelude += ch;
    }
  }
  if (depth !== 0) throw new Error('llave de apertura sin cerrar');
  return rules;
}

/** La ÚNICA regla con ese preludio exacto; lanza si no existe o aparece más de una vez. */
export function onlyRule(rules: readonly Rule[], prelude: string): Rule {
  const found = rules.filter((r) => r.prelude === prelude);
  if (found.length === 0) throw new Error(`falta el bloque «${prelude}»`);
  if (found.length > 1) throw new Error(`el bloque «${prelude}» aparece ${found.length} veces`);
  return found[0] as Rule;
}

/** Tokens `--color-NOMBRE: #rrggbb;` de un cuerpo (la clave omite el prefijo: `--color-ink` → `ink`). */
export function colorTokens(body: string): Tokens {
  const out: Tokens = {};
  for (const m of body.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1] ?? ''] = (m[2] ?? '').toLowerCase();
  }
  return out;
}

/** Valor de un token que NO es de color (`--glass-alpha: 0.88;` → `0.88`) en un cuerpo; `undefined` si no está. */
export function rawToken(body: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`).exec(body);
  return m?.[1]?.trim();
}

export const SCOPE_SELECTORS = {
  light: ':root',
  darkMedia: '@media (prefers-color-scheme: dark)',
  immersive: ':root:has([data-immersive])',
} as const;

export interface Themes {
  /** Tokens EFECTIVOS en cada ámbito (lo que ve un componente). */
  light: Tokens;
  dark: Tokens;
  immersive: Tokens;
  /** Solo lo que declara cada bloque (para comprobar completitud e igualdad sin que el claro lo disimule). */
  own: { light: Tokens; dark: Tokens; immersive: Tokens };
  /** Cuerpos en bruto, para los tokens que no son de color. */
  bodies: { light: string; dark: string; immersive: string };
}

/**
 * Tres ámbitos de `tokens.css`: claro (`:root`), oscuro (`@media (prefers-color-scheme: dark) { :root {…} }`) e
 * inmersivo (`:root:has([data-immersive]) {…}`, siempre oscuro). El inmersivo se mide como «claro + lo que redefine»:
 * una prueba exige que redefina TODO lo que cambia, para que no se filtre un valor claro.
 */
export function parseThemes(css: string): Themes {
  const top = parseRules(css);
  const lightBody = onlyRule(top, SCOPE_SELECTORS.light).body;
  const darkBody = onlyRule(
    parseRules(onlyRule(top, SCOPE_SELECTORS.darkMedia).body),
    ':root',
  ).body;
  const immersiveBody = onlyRule(top, SCOPE_SELECTORS.immersive).body;
  const own = {
    light: colorTokens(lightBody),
    dark: colorTokens(darkBody),
    immersive: colorTokens(immersiveBody),
  };
  if (Object.keys(own.light).length === 0)
    throw new Error('el bloque claro no declara ningún color');
  if (Object.keys(own.dark).length === 0)
    throw new Error('el bloque oscuro no declara ningún color');
  if (Object.keys(own.immersive).length === 0) {
    throw new Error('el bloque inmersivo no declara ningún color');
  }
  return {
    light: own.light,
    dark: { ...own.light, ...own.dark },
    immersive: { ...own.light, ...own.immersive },
    own,
    bodies: { light: lightBody, dark: darkBody, immersive: immersiveBody },
  };
}

/** Sustituye la PRIMERA aparición de `from` posterior a `marker` y comprueba que la mutación se aplicó. */
export function mutateAfter(css: string, marker: string, from: string, to: string): string {
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`mutación: no existe «${marker}»`);
  const at = css.indexOf(from, start);
  if (at < 0) throw new Error(`mutación: no hay «${from}» después de «${marker}»`);
  const out = css.slice(0, at) + to + css.slice(at + from.length);
  if (out === css) throw new Error('mutación: no cambió nada');
  return out;
}
