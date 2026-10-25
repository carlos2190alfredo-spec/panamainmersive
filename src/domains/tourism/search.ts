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
 *  - Orden: prefijo del nombre → inicio de una palabra → subcadena; a igual rango, el orden del registro (estable).
 *  - Consulta vacía (o que no deja ningún carácter tras normalizar) → sin resultados: no se lista todo.
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

/** Normaliza una consulta con la misma función que los nombres. `''` si no queda ningún carácter útil. */
export function normalizeSearchQuery(raw: string): string {
  return slugify(raw);
}

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

/** 0 = el nombre empieza por la consulta · 1 = una palabra del nombre empieza por ella · 2 = la contiene. */
function rankOf(terms: readonly string[], query: string): 0 | 1 | 2 | null {
  let best: 0 | 1 | 2 | null = null;
  for (const term of terms) {
    if (term.startsWith(query)) return 0;
    if (term.includes(`-${query}`)) best = 1;
    else if (best === null && term.includes(query)) best = 2;
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
  const q = normalizeSearchQuery(query);
  if (q === '') return [];
  const hits: { entry: SearchIndexEntry; rank: number; position: number }[] = [];
  index.forEach((entry, position) => {
    const rank = rankOf(entry.terms, q);
    if (rank !== null) hits.push({ entry, rank, position });
  });
  hits.sort((a, b) => a.rank - b.rank || a.position - b.position);
  return hits.slice(0, Math.max(0, limit)).map((hit) => hit.entry);
}
