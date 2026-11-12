import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES, type Locale } from '@/i18n/locales';

/**
 * El registro de «claves de interfaz pendientes de revisión humana» de `docs/progress.md` (entrega 5j · X4) es la lista
 * que debe consultar quien revise las traducciones. Antes de la revisión independiente citaba 2 de las 38 claves nuevas
 * y apuntaba a subsecciones que no existían (r0:F-08). Esta prueba no puede saber QUÉ claves cambió una persona (eso lo
 * calculó X4 contra los JSON de `6193226` y de cada commit, y no se puede repetir en un clon superficial), pero sí
 * impide el fallo que lo permitió: una clave del registro que ya no existe (renombrada o borrada) en alguno de los cinco
 * idiomas, un registro vacío o cuyo marcador desapareció, y unas cuentas («39 claves», «(4)») que no coinciden con la
 * lista que las acompaña. Si cambias o añades un texto de interfaz, añade su clave al registro y corrige las cuentas; si
 * una persona revisa una, quítala (la prueba sigue valiendo).
 */
type Tree = { [key: string]: string | Tree };

const START = '<!-- pending-review-keys:start -->';
const END = '<!-- pending-review-keys:end -->';
const KEY = /`([A-Z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)`/g;

function load(locale: Locale): Tree {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
  ) as Tree;
}

function lookup(tree: Tree, key: string): unknown {
  let node: string | Tree | undefined = tree;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return node;
}

function registryBlock(markdown: string): string {
  const from = markdown.indexOf(START);
  const to = markdown.indexOf(END);
  if (from < 0 || to < 0 || to < from) {
    throw new Error('docs/progress.md: faltan los marcadores del registro de claves pendientes');
  }
  return markdown.slice(from + START.length, to);
}

/** Las claves de un texto: un espacio de nombres y 1+ segmentos entre comillas invertidas, p. ej. `Map.search.clear`. */
function keysIn(text: string): string[] {
  return [...text.matchAll(KEY)].map((m) => m[1] as string);
}

/**
 * Las claves del registro que DEBEN existir hoy. La «Eliminada» se nombra para decir que ya no está, así que no cuenta.
 */
function registryKeys(markdown: string): string[] {
  const lines = registryBlock(markdown)
    .split('\n')
    .filter((line) => !/^\*\*Eliminadas?:?\*\*/.test(line.trim()));
  return [...new Set(keysIn(lines.join('\n')))];
}

/** Sin lo que va entre paréntesis: son anotaciones (el commit de origen, qué se reescribió), no entradas de la lista. */
const withoutNotes = (text: string): string => text.replace(/\([^()]*\)/g, '');

interface Tally {
  readonly declared: number;
  readonly keys: readonly string[];
}

/** Cada viñeta de «Nuevas» dice cuántas claves lista al final: «… (4).». */
function bulletTallies(markdown: string): Tally[] {
  return registryBlock(markdown)
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => {
      const declared = /\((\d+)\)\.?\s*$/.exec(line)?.[1];
      if (declared === undefined)
        throw new Error(`viñeta sin su cuenta «(N)»: ${line.slice(0, 60)}`);
      // las claves de la viñeta, sin las anotaciones ni la cuenta final
      return { declared: Number(declared), keys: [...new Set(keysIn(withoutNotes(line)))] };
    });
}

/** «**Nuevas (39 claves × 5 idiomas = 195 textos).**» y «**Cambiadas en los cinco idiomas (5 claves …):** a, b, c.» */
function headlineTallies(markdown: string): { newDeclared: number; changed: Tally } {
  const block = registryBlock(markdown);
  const newDeclared = /\*\*Nuevas \((\d+) claves/.exec(block)?.[1];
  const changedLine = block.split('\n').find((l) => l.startsWith('**Cambiadas en los cinco'));
  const changedDeclared = /\((\d+) claves/.exec(changedLine ?? '')?.[1];
  if (newDeclared === undefined || changedLine === undefined || changedDeclared === undefined) {
    throw new Error(
      'docs/progress.md: faltan las cuentas «Nuevas (N claves» o «Cambiadas … (M claves»',
    );
  }
  // la lista de claves es la primera frase tras los dos puntos; lo que sigue explica cada una
  const list = (changedLine.split(':**')[1] ?? '').split(/\.\s/)[0] ?? '';
  return {
    newDeclared: Number(newDeclared),
    changed: { declared: Number(changedDeclared), keys: [...new Set(keysIn(list))] },
  };
}

describe('registro de claves pendientes de revisión humana (docs/progress.md)', () => {
  const markdown = readFileSync(join(process.cwd(), 'docs', 'progress.md'), 'utf8');
  const keys = registryKeys(markdown);

  it('no está vacío', () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it.each(LOCALES)('cada clave del registro existe en %s y es un texto', (locale) => {
    const tree = load(locale);
    const missing = keys.filter((key) => typeof lookup(tree, key) !== 'string');
    expect(missing).toEqual([]);
  });

  it('las cuentas del registro coinciden con las claves que lista (cada viñeta, el total de nuevas y las cambiadas)', () => {
    const bullets = bulletTallies(markdown);
    expect(bullets.length).toBeGreaterThan(0);
    for (const bullet of bullets) expect(bullet.keys).toHaveLength(bullet.declared);
    const { newDeclared, changed } = headlineTallies(markdown);
    // ninguna clave nueva se lista en dos viñetas
    const listed = bullets.flatMap((bullet) => bullet.keys);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed).toHaveLength(newDeclared);
    expect(changed.keys).toHaveLength(changed.declared);
    // y una clave nueva no es a la vez «cambiada»
    expect(changed.keys.filter((key) => listed.includes(key))).toEqual([]);
  });

  it('control: una clave inventada se detecta como ausente', () => {
    expect(typeof lookup(load('es'), 'Map.search.noExiste')).not.toBe('string');
    expect(typeof lookup(load('es'), 'Map.search.clear')).toBe('string');
  });

  it('control: sin marcadores el registro es un error, no «cero claves»', () => {
    expect(() => registryKeys('# sin marcadores')).toThrow(/marcadores/);
  });

  it('control: la clave «Eliminada» no se exige, las anotaciones entre paréntesis no cuentan en la viñeta y una cuenta que no cuadra se ve', () => {
    const doc = [
      START,
      '**Nuevas (2 claves × 5 idiomas = 10 textos).**',
      '- Uno (`abc`; `Map.search.clear` reescrita): `Map.search.label`, `Map.search.clear` (2).',
      '**Cambiadas en los cinco idiomas (1 claves × 5 = 5 textos):** `Home.lead`. `Home.lead` explica.',
      '**Eliminada:** `Map.hud.toolsLabel` (ya no existe).',
      END,
    ].join('\n');
    // (la anotación entre paréntesis nombra `Map.search.clear` antes que la lista: el orden es el de aparición)
    expect(registryKeys(doc)).toEqual(['Map.search.clear', 'Map.search.label', 'Home.lead']);
    const [bullet] = bulletTallies(doc);
    expect(bullet).toEqual({ declared: 2, keys: ['Map.search.label', 'Map.search.clear'] });
    expect(headlineTallies(doc)).toEqual({
      newDeclared: 2,
      changed: { declared: 1, keys: ['Home.lead'] },
    });
    // control del control: con una cuenta equivocada la comparación FALLA
    const wrong = doc.replace('(2).', '(3).');
    const [bad] = bulletTallies(wrong);
    expect(bad?.keys.length).not.toBe(bad?.declared);
  });
});
