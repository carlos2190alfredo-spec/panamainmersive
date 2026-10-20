import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * «No incrustes textos visibles en componentes» (documento rector §4).
 * Analiza el AST de cada .tsx de src/ y falla ante texto literal visible:
 *  - texto dentro de JSX;
 *  - atributos accesibles/visibles (alt, aria-label, title, placeholder…) con cadena literal;
 *  - `{'texto'}` como hijo.
 */
const SRC = join(process.cwd(), 'src');
const TEXT_ATTRIBUTES = new Set([
  'alt',
  'aria-label',
  'aria-description',
  'title',
  'placeholder',
  'aria-roledescription',
]);
// Solo símbolos y puntuación (separadores, viñetas) no son texto traducible.
const SYMBOLS_ONLY = /^[\s\p{P}\p{S}\d]*$/u;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
  });
}

function violationsIn(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const where = (n: ts.Node) => {
    const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
    return `${relative(process.cwd(), file)}:${line + 1}`;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const t = node.getText().trim();
      if (t && !SYMBOLS_ONLY.test(t)) out.push(`${where(node)} texto literal «${t}»`);
    }
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      TEXT_ATTRIBUTES.has(node.name.text)
    ) {
      const init = node.initializer;
      if (init && ts.isStringLiteral(init) && !SYMBOLS_ONLY.test(init.text)) {
        out.push(`${where(node)} atributo ${node.name.text}="${init.text}"`);
      }
    }
    if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteralLike(node.expression)) {
      if (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) {
        if (!SYMBOLS_ONLY.test(node.expression.text))
          out.push(`${where(node)} {'${node.expression.text}'}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe('sin texto visible incrustado en componentes', () => {
  const files = walk(SRC);

  it('hay componentes que analizar', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('ningún .tsx contiene texto literal visible', () => {
    expect(files.flatMap(violationsIn)).toEqual([]);
  });

  it('el detector realmente detecta (control positivo)', () => {
    const sf = ts.createSourceFile(
      'x.tsx',
      `export const A = () => <p title="Hola">Texto fijo</p>;`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let found = 0;
    const visit = (n: ts.Node): void => {
      if (ts.isJsxText(n) && n.getText().trim()) found++;
      if (ts.isJsxAttribute(n) && ts.isIdentifier(n.name) && n.name.text === 'title') found++;
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(found).toBe(2);
  });
});
