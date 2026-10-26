/**
 * Lectura plana de un CSS para las pruebas de diseño (no es `*.test.ts`: vitest no lo recoge). Aplana `@media` y
 * `@supports` anidados en reglas con su contexto y separa las declaraciones; lanza ante llaves sin emparejar. Es lo que
 * necesitan las pruebas que miran QUÉ regla declara QUÉ y bajo QUÉ condición (el desenfoque, los recortes, las capas).
 */
import { parseRules, type Rule } from './tokens-css';

export interface Declaration {
  prop: string;
  value: string;
}

export interface FlatRule {
  /** Selector o lista de selectores tal cual (para `@keyframes`, `@keyframes nombre`). */
  selector: string;
  /** Condiciones de las `@media`/`@supports` que la envuelven, de fuera adentro. */
  context: string[];
  declarations: Declaration[];
  keyframes: boolean;
}

export function declarationsOf(body: string): Declaration[] {
  return body
    .split(';')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.includes(':'))
    .map((chunk) => {
      const at = chunk.indexOf(':');
      return { prop: chunk.slice(0, at).trim().toLowerCase(), value: chunk.slice(at + 1).trim() };
    });
}

export function flatten(css: string, context: string[] = []): FlatRule[] {
  return parseRules(css).flatMap((rule: Rule): FlatRule[] => {
    if (/^@(media|supports)\b/.test(rule.prelude)) {
      return flatten(rule.body, [...context, rule.prelude]);
    }
    if (rule.prelude.startsWith('@keyframes')) {
      const inner = parseRules(rule.body).flatMap((step) => declarationsOf(step.body));
      return [{ selector: rule.prelude, context, declarations: inner, keyframes: true }];
    }
    return [
      {
        selector: rule.prelude,
        context,
        declarations: declarationsOf(rule.body),
        keyframes: false,
      },
    ];
  });
}

/**
 * Valor de `prop` en la regla cuyo selector es EXACTAMENTE `selector`: la de nivel superior (sin `@media`/`@supports`)
 * si no se da `within`, o la que está bajo una condición que contiene `within`. La última declaración gana (cascada).
 */
export function valueOf(
  rules: readonly FlatRule[],
  selector: string,
  prop: string,
  within?: string,
): string | undefined {
  const found = rules.filter(
    (r) =>
      r.selector === selector &&
      (within === undefined ? r.context.length === 0 : r.context.join(' ').includes(within)),
  );
  for (const rule of [...found].reverse()) {
    const d = rule.declarations.find((x) => x.prop === prop);
    if (d) return d.value;
  }
  return undefined;
}
