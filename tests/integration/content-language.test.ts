import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LANGUAGE_TAG } from '@/domains/content/language-tag';
import { INVALID_TAGS, VALID_TAGS } from '../unit/domains/content/language-tag-corpus';
import { exportPublished } from '../../scripts/content/export-lib';
import { createSource, makeVerified } from './content-helpers';
import { createTestDb, ids, seedPeople, type TestDb } from './helpers';

/**
 * Idioma de las fuentes (F4-15, WCAG 3.1.2). La BD no puede ser más laxa que el dominio (ADR-0020): se comprueba la
 * restricción REAL de la tabla contra la misma expresión que usan el esquema de la instantánea y el componente, sobre un
 * corpus que incluye los casos en que PostgreSQL y JavaScript podrían diferir (salto de línea final, cifras de ancho
 * completo, mayúsculas fuera de ASCII) y sobre cadenas aleatorias con una semilla fija.
 */
let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await seedPeople(db);
}, 120_000);
afterAll(async () => {
  await db.close();
});

/** ¿Acepta la tabla este valor en `language`? Cada intento se deshace: no deja filas. */
async function dbAccepts(c: Client, language: string): Promise<boolean> {
  await c.query('savepoint candidate');
  try {
    await createSource(c, { language });
    return true;
  } catch (error) {
    // 23514: la restricción lo rechaza · 22021: ni siquiera es texto válido (un NUL). Cualquier otro error es un fallo de la prueba.
    const code = (error as { code?: string }).code;
    if (code === '23514' || code === '22021') return false;
    throw error;
  } finally {
    await c.query('rollback to savepoint candidate');
  }
}

/** Generador pseudoaleatorio determinista (mulberry32): las cadenas del fuzz son las mismas en cada ejecución. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = [
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'0123456789',
  '-',
  '-',
  '-',
  '_',
  ' ',
  '\n',
  '\t',
  'ñ',
  'İ',
  'ı',
  'ｅ',
  'Ｕ',
  '٣',
];

function fuzzCorpus(count: number): string[] {
  const random = prng(20261023);
  const out: string[] = [];
  while (out.length < count) {
    const length = Math.floor(random() * 12);
    let s = '';
    for (let i = 0; i < length; i++) s += ALPHABET[Math.floor(random() * ALPHABET.length)];
    out.push(s);
  }
  // Además, mutaciones de etiquetas válidas (un carácter cambiado o añadido): los vecinos del límite.
  for (const tag of VALID_TAGS) {
    for (const extra of ['\n', ' ', 'x', '-', '1', 'É']) {
      out.push(tag + extra, extra + tag);
    }
    out.push(tag.toUpperCase(), tag.toLowerCase(), tag.slice(0, -1));
  }
  return out;
}

describe('restricción de `source_records.language`', () => {
  it('sin idioma (por defecto) se guarda `null`: no se adivina', async () => {
    const id = await db.asCommit('authenticated', ids.editor, (c) => createSource(c));
    const { rows } = await db.owner.query<{ language: string | null }>(
      'select language from public.source_records where id = $1',
      [id],
    );
    expect(rows[0]?.language).toBeNull();
  });

  it.each([...VALID_TAGS])('acepta la etiqueta canónica «%s»', async (tag) => {
    const id = await db.asCommit('authenticated', ids.editor, (c) =>
      createSource(c, { language: tag }),
    );
    const { rows } = await db.owner.query<{ language: string }>(
      'select language from public.source_records where id = $1',
      [id],
    );
    expect(rows[0]?.language).toBe(tag);
  });

  it('la BD y el dominio dan el MISMO veredicto sobre el corpus y el fuzz (la BD nunca más laxa)', async () => {
    const candidates = [...new Set([...VALID_TAGS, ...INVALID_TAGS, ...fuzzCorpus(400)])];
    expect(candidates.length).toBeGreaterThan(400);
    const disagreements: string[] = [];
    let accepted = 0;
    // `db.as` revierte todo al terminar y fija el usuario (`created_by` es obligatorio): no queda ninguna fila.
    await db.as('authenticated', ids.editor, async (c) => {
      for (const candidate of candidates) {
        const byDb = await dbAccepts(c, candidate);
        const byDomain = LANGUAGE_TAG.test(candidate);
        if (byDb) accepted += 1;
        if (byDb !== byDomain) {
          disagreements.push(
            `${JSON.stringify(candidate)}: BD ${String(byDb)} ≠ dominio ${String(byDomain)}`,
          );
        }
      }
    });
    expect(disagreements).toEqual([]);
    // El corpus ejercita las dos ramas de verdad (no es un barrido en el que todo se rechaza).
    expect(accepted).toBeGreaterThanOrEqual(VALID_TAGS.length);
    expect(accepted).toBeLessThan(candidates.length / 2);
  }, 60_000);

  it('una etiqueta mal escrita llega como violación de la restricción (23514), no como otro error', async () => {
    await expect(
      db.asCommit('authenticated', ids.editor, (c) => createSource(c, { language: 'en_US' })),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('el exportador publica el idioma de la fuente', () => {
  /** Destinos del registro (la instantánea valida contra él), publicados para que `anon` los vea. */
  const registered = (key: string, kind: string) =>
    db.owner
      .query<{ id: string }>(
        "insert into public.destinations (key, kind, status) values ($1, $2, 'published') returning id",
        [key, kind],
      )
      .then((r) => (r.rows[0] as { id: string }).id);

  it('anon lee la columna y la instantánea lleva la etiqueta (y `null` cuando no se sabe)', async () => {
    await makeVerified(db, {
      destinationId: await registered('boquete', 'locality'),
      text: '[prueba] con idioma',
      sourceLanguage: 'en',
    });
    await makeVerified(db, {
      destinationId: await registered('bocas-del-toro', 'locality'),
      text: '[prueba] sin idioma',
    });
    const { snapshot } = await exportPublished(db.owner, new Date());
    const byDestination = Object.fromEntries(
      snapshot.assertions.map((a) => [a.destinationKey, a.evidence.map((e) => e.language)]),
    );
    expect(byDestination).toEqual({ boquete: ['en'], 'bocas-del-toro': [null] });
  });
});
