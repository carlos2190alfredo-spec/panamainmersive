import { LOCALES, type Locale } from '@/i18n/locales';
import type { DestinationEntry, DestinationKey, DestinationKind } from './destinations';
import { slugify } from './slugs';

/**
 * Búsqueda de destinos: lógica PURA (sin red, sin UI, sin estado), pensada para que la use cualquier pantalla
 * (la portada hoy; el buscador de Explorar mañana).
 *
 * Reglas (docs/i18n.md §5, AGENTS.md):
 *  - **Por CLAVE, nunca por nombre.** Un resultado es una entrada del registro identificada por su `key`. Dos destinos que
 *    comparten nombre (homonimias: cuatro «Santa Catalina» en el mundo real, distrito Barú ≠ Volcán Barú) siguen siendo
 *    dos resultados distintos: no se agrupan ni se deduplican por texto.
 *  - **Sin acentos, sin mayúsculas, sin puntuación** (`slugify`: «Barú» = «baru», «Straße» = «strasse», «Canal de Panamá» =
 *    «canal-de-panama»). La consulta y los nombres pasan por la MISMA normalización.
 *  - **Los cinco idiomas siempre**: un destino se encuentra por su nombre en cualquiera de ellos («Panama Canal» desde la
 *    interfaz alemana, «Panamakanal» desde la española), con independencia del idioma activo. El idioma activo solo
 *    decide qué nombre y qué slug se MUESTRAN.
 *  - **Por palabras, no por cadena** (r0:F-05): la consulta se parte en palabras y TODAS deben aparecer en el mismo nombre, en
 *    cualquier orden. Los artículos y preposiciones corrientes (`de`, `del`, `el`, `the`, `von`…) NO cuentan: «Valle Antón»
 *    encuentra «El Valle de Antón», «Canal Panamá» el «Canal de Panamá» y «Bocas Toro» «Bocas del Toro». Si la consulta son
 *    SOLO palabras de ese tipo («el», «de») se comparan tal cual (quien está tecleando «El Valle» ve ya «El Valle de Antón»).
 *  - **Solo nombres, nunca apodos**: lo que se encuentra es el nombre (y los slugs anteriores) de cada idioma. Un nombre de uso
 *    corriente que el registro no trae NO se inventa: «Casco Viejo» no encuentra «Casco Antiguo» porque el propio registro
 *    dice (E-41, `homonymCascoViejo`) que existe OTRO «Casco Viejo» en Veraguas y que no es este. Relacionarlos por nombre es
 *    justo lo que este módulo no hace; si algún día se acepta un alias de búsqueda, será un campo propio del registro con su
 *    fuente, no una entrada de `slugs.aliases` (que además redirige URLs).
 *  - Orden (relevancia): nombre exacto → la consulta es el comienzo del nombre → cada palabra empieza una palabra distinta del
 *    nombre (en cualquier orden) → cada palabra está dentro de alguna palabra (subcadena); a igual rango, el orden del
 *    registro (estable).
 *  - Consulta vacía (o que no deja ningún carácter tras normalizar) → sin resultados: no se lista todo.
 *  - La consulta se recorta a `SEARCH_QUERY_MAX_LENGTH` caracteres (los dos buscadores llevan además `maxLength`).
 *
 * El índice es un objeto plano y serializable (viaja del servidor al navegador como prop; ≈ 2 KB para los nueve
 * destinos) y el emparejamiento no hace nada fuera del propio proceso.
 */

export interface SearchIndexEntry {
  /** Identidad estable del destino. Es lo que se enlaza y lo que viaja en `?d=` (nunca el nombre). */
  readonly key: DestinationKey;
  readonly kind: DestinationKind;
  /** Nombre en el idioma de la interfaz (solo para mostrar). */
  readonly name: string;
  /** Slug en el idioma de la interfaz (para enlazar la ficha). */
  readonly slug: string;
  /** Nombres y slugs de los cinco idiomas, normalizados y sin repetir (lo único que se compara). */
  readonly terms: readonly string[];
}

/** Longitud máxima de lo que se escribe en un buscador de destinos (el de la portada y el de Explorar la comparten). */
export const SEARCH_QUERY_MAX_LENGTH = 80;

/** Normaliza una consulta con la misma función que los nombres. `''` si no queda ningún carácter útil. */
export function normalizeSearchQuery(raw: string): string {
  return slugify(raw.slice(0, SEARCH_QUERY_MAX_LENGTH));
}

/**
 * Artículos, preposiciones y conjunciones de los cinco idiomas, ya normalizados (sin acentos). No son palabras del nombre
 * a efectos de la búsqueda: quien teclea «canal panama» busca el «Canal de Panamá». Una prueba comprueba que NINGUNA palabra
 * del registro de destinos está aquí (si un nombre real empezara a usarse así, la lista dejaría de poder esconderla).
 */
export const SEARCH_STOP_WORDS: ReadonlySet<string> = new Set([
  // es
  'el',
  'la',
  'los',
  'las',
  'de',
  'del',
  'y',
  // pt
  'o',
  'a',
  'os',
  'as',
  'do',
  'da',
  'dos',
  'das',
  'e',
  // fr
  'le',
  'les',
  'l',
  'du',
  'des',
  'd',
  'et',
  // en
  'the',
  'of',
  'and',
  // de
  'der',
  'die',
  'das',
  'von',
  'zu',
  'und',
]);

export function buildSearchIndex(
  entries: readonly DestinationEntry[],
  locale: Locale,
): SearchIndexEntry[] {
  return entries.map((entry) => {
    const terms = new Set<string>();
    const add = (text: string): void => {
      const term = normalizeSearchQuery(text);
      if (term !== '') terms.add(term);
    };
    for (const l of LOCALES) {
      add(entry.names[l].name);
      add(entry.slugs[l].current);
      // Los slugs anteriores siguen siendo nombres con los que alguien pudo conocer el destino.
      for (const alias of entry.slugs[l].aliases) add(alias);
    }
    return {
      key: entry.key,
      kind: entry.kind,
      name: entry.names[locale].name,
      slug: entry.slugs[locale].current,
      terms: [...terms],
    };
  });
}

type Rank = 0 | 1 | 2 | 3;

const wordsOf = (term: string): string[] => term.split('-');
const significant = (words: readonly string[]): string[] => {
  const kept = words.filter((w) => !SEARCH_STOP_WORDS.has(w));
  return kept.length > 0 ? kept : [...words];
};

/** Las palabras de la consulta que cuentan (sin artículos) y si ya son «tal cual» (la consulta era SOLO artículos). */
interface ParsedQuery {
  /** La consulta entera, normalizada: `canal-de-pa`. */
  readonly text: string;
  readonly tokens: readonly string[];
  /** `true` cuando todas las palabras eran artículos: se comparan con TODAS las palabras del nombre, sin saltarse ninguna. */
  readonly literal: boolean;
}

function parseQuery(raw: string): ParsedQuery | null {
  const text = normalizeSearchQuery(raw);
  if (text === '') return null;
  const all = wordsOf(text);
  const kept = all.filter((w) => !SEARCH_STOP_WORDS.has(w));
  return kept.length > 0
    ? { text, tokens: kept, literal: false }
    : { text, tokens: all, literal: true };
}

/** ¿Cada palabra de la consulta empieza una palabra DISTINTA de `words`? (cualquier orden; con vuelta atrás: son 2–6 palabras) */
function eachStartsADistinctWord(tokens: readonly string[], words: readonly string[]): boolean {
  const used = new Set<number>();
  const assign = (i: number): boolean => {
    const token = tokens[i];
    if (token === undefined) return true;
    for (let w = 0; w < words.length; w++) {
      if (used.has(w) || !words[w]?.startsWith(token)) continue;
      used.add(w);
      if (assign(i + 1)) return true;
      used.delete(w);
    }
    return false;
  };
  return assign(0);
}

/**
 * 0 = nombre exacto · 1 = la consulta es el comienzo del nombre · 2 = cada palabra empieza una palabra distinta del nombre ·
 * 3 = cada palabra está dentro de alguna palabra del nombre (o la consulta entera dentro del texto). `null` = no coincide.
 * Se compara con un NOMBRE (o slug) cada vez; el mejor rango entre los nombres de los cinco idiomas es el del destino.
 */
function rankOfTerm(term: string, query: ParsedQuery): Rank | null {
  const words = wordsOf(term);
  // Las palabras del nombre que cuentan: «el-valle-de-anton» → [valle, anton] (salvo que la consulta fuera solo artículos)
  const counted = query.literal ? words : significant(words);
  const { tokens } = query;
  if (term === query.text || counted.join('-') === tokens.join('-')) return 0;
  if (
    term.startsWith(query.text) ||
    (tokens.length <= counted.length && tokens.every((token, i) => counted[i]?.startsWith(token)))
  ) {
    return 1;
  }
  if (eachStartsADistinctWord(tokens, words)) return 2;
  if (tokens.every((token) => words.some((word) => word.includes(token)))) return 3;
  return term.includes(query.text) ? 3 : null;
}

function rankOf(terms: readonly string[], query: ParsedQuery): Rank | null {
  let best: Rank | null = null;
  for (const term of terms) {
    const rank = rankOfTerm(term, query);
    if (rank === 0) return 0;
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

/**
 * Destinos que coinciden con `query`, mejores primero. No muta el índice. `limit` acota el número de resultados
 * (por defecto, todos los que coinciden).
 */
export function matchDestinations(
  index: readonly SearchIndexEntry[],
  query: string,
  limit: number = Number.POSITIVE_INFINITY,
): SearchIndexEntry[] {
  const parsed = parseQuery(query);
  if (parsed === null) return [];
  const hits: { entry: SearchIndexEntry; rank: number; position: number }[] = [];
  index.forEach((entry, position) => {
    const rank = rankOf(entry.terms, parsed);
    if (rank !== null) hits.push({ entry, rank, position });
  });
  hits.sort((a, b) => a.rank - b.rank || a.position - b.position);
  return hits.slice(0, Math.max(0, limit)).map((hit) => hit.entry);
}
