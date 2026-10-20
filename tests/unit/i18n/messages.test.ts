import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/i18n/locales';

type Tree = { [key: string]: string | Tree };

function load(locale: Locale): Tree {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
  ) as Tree;
}

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(path, v);
    else for (const [p, s] of flatten(v, path)) out.set(p, s);
  }
  return out;
}

// Tipos del AST de ICU (intl-messageformat): 0 literal, 1 argumento, 2 número, 3 fecha,
// 4 hora, 5 select, 6 plural, 7 almohadilla, 8 etiqueta.
interface AstNode {
  type: number;
  value?: string;
  options?: Record<string, { value: AstNode[] }>;
  children?: AstNode[];
}

function argumentNames(nodes: AstNode[], into = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.type >= 1 && n.type <= 6 && typeof n.value === 'string') into.add(n.value);
    if (n.options) for (const o of Object.values(o_(n))) argumentNames(o.value, into);
    if (n.children) argumentNames(n.children, into);
  }
  return into;
}
const o_ = (n: AstNode) => n.options ?? {};

const source = flatten(load(DEFAULT_LOCALE));

describe('mensajes de interfaz en los cinco idiomas', () => {
  it('hay un archivo por idioma registrado', () => {
    expect(LOCALES).toEqual(['es', 'en', 'pt', 'fr', 'de']);
    for (const l of LOCALES) expect(() => load(l)).not.toThrow();
  });

  it.each(LOCALES.filter((l) => l !== DEFAULT_LOCALE))(
    '%s tiene exactamente las mismas claves que es (ni faltan ni sobran)',
    (locale) => {
      const keys = new Set(flatten(load(locale)).keys());
      const expected = new Set(source.keys());
      expect([...expected].filter((k) => !keys.has(k))).toEqual([]);
      expect([...keys].filter((k) => !expected.has(k))).toEqual([]);
    },
  );

  it.each(LOCALES)('%s: ningún mensaje vacío ni con espacios sobrantes', (locale) => {
    for (const [path, text] of flatten(load(locale))) {
      expect(text.trim(), path).not.toBe('');
      expect(text, path).toBe(text.trim());
    }
  });

  it.each(LOCALES)('%s: todos los mensajes son ICU válidos', (locale) => {
    for (const [path, text] of flatten(load(locale))) {
      expect(() => new IntlMessageFormat(text, locale), `${locale}:${path}`).not.toThrow();
    }
  });

  it.each(LOCALES.filter((l) => l !== DEFAULT_LOCALE))(
    '%s: los marcadores ({name}, {count}…) coinciden con es en cada mensaje',
    (locale) => {
      const messages = flatten(load(locale));
      for (const [path, text] of messages) {
        const base = source.get(path);
        if (base === undefined) continue;
        const a = [...argumentNames(new IntlMessageFormat(base, 'es').getAst())].sort();
        const b = [...argumentNames(new IntlMessageFormat(text, locale).getAst())].sort();
        expect(b, `${locale}:${path}`).toEqual(a);
      }
    },
  );

  // Coincidencias legítimas con el español (cada excepción se justifica; no se relaja el umbral).
  const IDENTICAL_TO_SPANISH_ALLOWED: Partial<Record<Locale, readonly string[]>> = {
    // «destino/destinos» se escribe igual en portugués y en español.
    pt: ['Explore.count'],
  };

  it.each(LOCALES.filter((l) => l !== DEFAULT_LOCALE))(
    '%s: no hay textos largos sin traducir (idénticos al español)',
    (locale) => {
      const messages = flatten(load(locale));
      const allowed = IDENTICAL_TO_SPANISH_ALLOWED[locale] ?? [];
      const untranslated = [...messages]
        .filter(
          ([path, text]) =>
            source.get(path) === text && text.length > 24 && !allowed.includes(path),
        )
        .map(([path]) => path);
      expect(untranslated).toEqual([]);
    },
  );

  it('el plural de «count» responde correctamente en cada idioma', () => {
    for (const locale of LOCALES) {
      const text = flatten(load(locale)).get('Explore.count');
      expect(text).toBeDefined();
      const f = new IntlMessageFormat(text ?? '', locale);
      expect(String(f.format({ count: 1 }))).toMatch(/1/);
      expect(String(f.format({ count: 9 }))).toMatch(/9/);
      expect(f.format({ count: 1 })).not.toEqual(f.format({ count: 9 }));
    }
  });
});
