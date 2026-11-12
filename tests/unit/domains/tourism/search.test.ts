import { describe, expect, it } from 'vitest';
import {
  DESTINATIONS,
  DESTINATION_KEYS,
  destinationName,
  destinationSlug,
  type DestinationEntry,
  type DestinationKey,
} from '@/domains/tourism/destinations';
import {
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_STOP_WORDS,
  buildSearchIndex,
  matchDestinations,
  normalizeSearchQuery,
  type SearchIndexEntry,
} from '@/domains/tourism/search';
import { LOCALES, type Locale } from '@/i18n/locales';

/**
 * Búsqueda de destinos (lógica pura). Las reglas que se vigilan: por CLAVE y nunca por nombre, sin acentos ni
 * mayúsculas, los cinco idiomas con independencia del idioma activo, prefijo antes que subcadena, orden estable del
 * registro y consulta vacía → nada.
 */
const keys = (index: readonly SearchIndexEntry[], query: string): DestinationKey[] =>
  matchDestinations(index, query).map((hit) => hit.key);

/** Un destino sintético del registro: misma forma, nombres a medida (la clave debe ser una real del registro). */
function synthetic(
  key: DestinationKey,
  name: string,
  aliases: readonly string[] = [],
): DestinationEntry {
  const base = DESTINATIONS.find((d) => d.key === key);
  if (!base) throw new Error(`clave desconocida ${key}`);
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-');
  return {
    ...base,
    names: Object.fromEntries(
      LOCALES.map((l) => [l, { name, status: 'draft', provenance: 'toponym_original' }]),
    ) as DestinationEntry['names'],
    slugs: Object.fromEntries(
      LOCALES.map((l) => [l, { current: slug, aliases }]),
    ) as DestinationEntry['slugs'],
  };
}

describe('normalizeSearchQuery', () => {
  it('quita acentos, mayúsculas y puntuación, y traduce ß', () => {
    expect(normalizeSearchQuery('  Barú ')).toBe('baru');
    expect(normalizeSearchQuery('Canal de Panamá')).toBe('canal-de-panama');
    expect(normalizeSearchQuery('Straße')).toBe('strasse');
    expect(normalizeSearchQuery('¿¡…?!')).toBe('');
  });
});

describe('buildSearchIndex', () => {
  it('una entrada por destino, en el orden del registro, con nombre y slug del idioma activo', () => {
    for (const locale of LOCALES) {
      const index = buildSearchIndex(DESTINATIONS, locale);
      expect(index.map((e) => e.key)).toEqual(DESTINATION_KEYS);
      DESTINATIONS.forEach((d, i) => {
        expect(index[i]?.name).toBe(destinationName(d, locale));
        expect(index[i]?.slug).toBe(destinationSlug(d, locale));
        expect(index[i]?.kind).toBe(d.kind);
      });
    }
  });

  it('los términos son de los cinco idiomas, normalizados y sin repetir', () => {
    const index = buildSearchIndex(DESTINATIONS, 'es');
    const canal = index.find((e) => e.key === 'panama-canal');
    expect(canal?.terms).toEqual(
      expect.arrayContaining(['canal-de-panama', 'panama-canal', 'canal-do-panama', 'panamakanal']),
    );
    for (const entry of index) {
      expect(new Set(entry.terms).size, entry.key).toBe(entry.terms.length);
      expect(entry.terms.every((t) => t === normalizeSearchQuery(t) && t !== '')).toBe(true);
    }
  });

  it('es un objeto plano y pequeño (viaja al navegador como prop)', () => {
    const index = buildSearchIndex(DESTINATIONS, 'de');
    expect(JSON.parse(JSON.stringify(index))).toEqual(index);
    expect(JSON.stringify(index).length).toBeLessThan(3000);
  });

  it('incluye los slugs anteriores (alias) como nombres con los que se conoció el destino', () => {
    const index = buildSearchIndex([synthetic('coiba', 'Isla Coiba', ['coiba-vieja'])], 'es');
    expect(keys(index, 'coiba vieja')).toEqual(['coiba']);
  });
});

describe('matchDestinations: cada destino se encuentra por su nombre en cualquiera de los cinco idiomas', () => {
  const idioms = LOCALES;

  it.each(idioms)(
    'con la interfaz en %s, el nombre de CADA idioma devuelve ese destino primero',
    (ui) => {
      const index = buildSearchIndex(DESTINATIONS, ui);
      for (const d of DESTINATIONS) {
        for (const l of LOCALES) {
          const hit = matchDestinations(index, destinationName(d, l))[0];
          expect(hit?.key, `${ui}: «${destinationName(d, l)}» (${l})`).toBe(d.key);
        }
      }
    },
  );

  it('«Panama Canal», «Canal de Panamá», «Panamakanal», «Canal do Panamá» y «canal de panama» son el mismo destino', () => {
    for (const ui of LOCALES) {
      const index = buildSearchIndex(DESTINATIONS, ui);
      for (const query of [
        'Panama Canal',
        'Canal de Panamá',
        'Panamakanal',
        'Canal do Panamá',
        'Canal de Panama',
        'canal de panama',
        'CANAL DE PANAMÁ',
      ]) {
        expect(keys(index, query), `${ui}: ${query}`).toEqual(['panama-canal']);
      }
    }
  });

  it('el idioma activo solo cambia lo que se muestra, no lo que se encuentra', () => {
    const a = matchDestinations(buildSearchIndex(DESTINATIONS, 'es'), 'panama');
    const b = matchDestinations(buildSearchIndex(DESTINATIONS, 'de'), 'panama');
    expect(a.map((e) => e.key)).toEqual(b.map((e) => e.key));
    expect(a[0]?.name).toBe('Ciudad de Panamá');
    expect(b[0]?.name).toBe('Panama-Stadt');
  });

  it('sin acentos ni mayúsculas: «Barú», «BARÚ», «baru» y «bàrú» dan lo mismo', () => {
    const index = buildSearchIndex(DESTINATIONS, 'es');
    for (const q of ['Barú', 'BARÚ', 'baru', 'bàrú', ' baru ']) {
      expect(keys(index, q), q).toEqual(['volcan-baru']);
    }
  });
});

describe('homonimias: se resuelve por clave, nunca por nombre', () => {
  const index = buildSearchIndex(DESTINATIONS, 'es');

  it('«Barú» encuentra solo el volcán (el distrito Barú no está en el registro)', () => {
    expect(keys(index, 'Barú')).toEqual(['volcan-baru']);
    expect(keys(index, 'Volcán Barú')).toEqual(['volcan-baru']);
    expect(keys(index, 'Baru Volcano')).toEqual(['volcan-baru']);
  });

  it('«Santa Catalina» devuelve un único destino', () => {
    expect(keys(index, 'Santa Catalina')).toEqual(['santa-catalina']);
    expect(keys(index, 'santa catalina')).toEqual(['santa-catalina']);
  });

  it('dos destinos con el MISMO nombre siguen siendo dos resultados, cada uno con su clave', () => {
    const twin = buildSearchIndex(
      [synthetic('boquete', 'Santa Catalina'), synthetic('santa-catalina', 'Santa Catalina')],
      'es',
    );
    expect(keys(twin, 'santa catalina')).toEqual(['boquete', 'santa-catalina']);
  });

  it('todo resultado es una clave del registro', () => {
    for (const q of ['a', 'e', 'de', 'panama', 'isla', 'volcan', 'casco', 'zzz', 'bocas']) {
      for (const hit of matchDestinations(index, q)) {
        expect(DESTINATION_KEYS).toContain(hit.key);
      }
    }
  });
});

describe('orden de los resultados', () => {
  it('prefijo antes que subcadena, aunque la subcadena aparezca antes en el registro', () => {
    const index = buildSearchIndex(
      [synthetic('boquete', 'Xcoiba'), synthetic('coiba', 'Coibana')],
      'es',
    );
    expect(keys(index, 'coiba')).toEqual(['coiba', 'boquete']);
  });

  it('inicio de palabra antes que subcadena', () => {
    const index = buildSearchIndex(
      [synthetic('boquete', 'Zcoiba'), synthetic('coiba', 'Isla Coiba')],
      'es',
    );
    expect(keys(index, 'coiba')).toEqual(['coiba', 'boquete']);
  });

  it('prefijo antes que inicio de palabra', () => {
    const index = buildSearchIndex(
      [synthetic('boquete', 'Isla Coiba'), synthetic('coiba', 'Coiba Norte')],
      'es',
    );
    expect(keys(index, 'coiba')).toEqual(['coiba', 'boquete']);
  });

  it('a igual rango se conserva el orden del registro (estable)', () => {
    const index = buildSearchIndex(DESTINATIONS, 'es');
    expect(keys(index, 'panama')).toEqual(['panama-city', 'panama-canal']);
    expect(keys(index, 'el')).toEqual(['el-valle-de-anton', 'bocas-del-toro']);
  });

  it('el mejor rango de CUALQUIER idioma cuenta: «panama c» prefija «panama-city» y «panama-canal»', () => {
    const index = buildSearchIndex(DESTINATIONS, 'es');
    expect(keys(index, 'panama c')).toEqual(['panama-city', 'panama-canal']);
  });

  it('`limit` acota y no muta el índice', () => {
    const index = buildSearchIndex(DESTINATIONS, 'es');
    const before = JSON.stringify(index);
    expect(matchDestinations(index, 'a', 3)).toHaveLength(3);
    expect(matchDestinations(index, 'a', 0)).toEqual([]);
    expect(JSON.stringify(index)).toBe(before);
  });
});

describe('consultas vacías, sin coincidencia y casos de borde', () => {
  const index = buildSearchIndex(DESTINATIONS, 'es');

  it('vacía, de espacios o solo de puntuación → sin resultados (no se lista todo)', () => {
    for (const q of ['', ' ', '   \t\n', '-', '¿?', '…', '---']) {
      expect(matchDestinations(index, q), JSON.stringify(q)).toEqual([]);
    }
  });

  it('sin coincidencias → vacío', () => {
    expect(matchDestinations(index, 'zzzz')).toEqual([]);
    expect(matchDestinations(index, 'atracciones')).toEqual([]);
    expect(matchDestinations(index, 'hotel')).toEqual([]);
  });

  it('un índice vacío no falla', () => {
    expect(matchDestinations([], 'panama')).toEqual([]);
  });

  it('ß ≡ ss en la consulta y en los nombres', () => {
    const de: Locale = 'de';
    const strasse = buildSearchIndex([synthetic('coiba', 'Große Insel')], de);
    expect(keys(strasse, 'grosse')).toEqual(['coiba']);
    expect(keys(strasse, 'große')).toEqual(['coiba']);
    expect(keys(strasse, 'GROSSE INSEL')).toEqual(['coiba']);
    const reverse = buildSearchIndex([synthetic('coiba', 'Grosse Insel')], de);
    expect(keys(reverse, 'Große')).toEqual(['coiba']);
  });

  it('la consulta con guiones, comas o puntos se entiende igual', () => {
    expect(keys(index, 'Panama-Stadt')).toEqual(['panama-city']);
    expect(keys(index, 'canal, de. panamá')).toEqual(['panama-canal']);
  });
});

describe('consultas de varias palabras (r0:F-05): por palabras, sin artículos ni preposiciones', () => {
  const index = buildSearchIndex(DESTINATIONS, 'es');

  it('«Valle Antón», «Canal Panamá» y «Bocas Toro» encuentran el nombre aunque falten «de» y «del»', () => {
    expect(keys(index, 'Valle Antón')).toEqual(['el-valle-de-anton']);
    expect(keys(index, 'valle anton')).toEqual(['el-valle-de-anton']);
    expect(keys(index, 'Canal Panamá')).toEqual(['panama-canal']);
    expect(keys(index, 'Bocas Toro')).toEqual(['bocas-del-toro']);
    expect(keys(index, 'Ciudad Panamá')).toEqual(['panama-city']);
  });

  it('el artículo o la preposición sobrantes tampoco estorban: «el boquete», «de coiba», «the canal»', () => {
    expect(keys(index, 'el Boquete')).toEqual(['boquete']);
    expect(keys(index, 'de Coiba')).toEqual(['coiba']);
    expect(keys(index, 'del volcan baru')).toEqual(['volcan-baru']);
    expect(keys(index, 'the Panama Canal')).toEqual(['panama-canal']);
  });

  it('el orden de las palabras no importa: «Panamá Canal», «Baru Volcan», «Toro Bocas»', () => {
    expect(keys(index, 'Panamá Canal')).toEqual(['panama-canal']);
    expect(keys(index, 'Baru Volcan')).toEqual(['volcan-baru']);
    expect(keys(index, 'Toro Bocas')).toEqual(['bocas-del-toro']);
  });

  it('mientras se teclea: cada palabra puede estar a medias («val ant», «bocas d», «bocas del t»)', () => {
    expect(keys(index, 'val ant')).toEqual(['el-valle-de-anton']);
    expect(keys(index, 'bocas d')).toEqual(['bocas-del-toro']);
    expect(keys(index, 'bocas del t')).toEqual(['bocas-del-toro']);
    expect(keys(index, 'el val')).toEqual(['el-valle-de-anton']);
  });

  it('si TODAS las palabras son artículos se comparan tal cual (quien teclea «El» ve ya «El Valle de Antón»)', () => {
    expect(keys(index, 'el')[0]).toBe('el-valle-de-anton');
    expect(keys(index, 'de').length).toBeGreaterThan(0);
  });

  it.each(LOCALES)(
    'con la interfaz en %s: el nombre de CADA idioma, sin sus artículos ni preposiciones, devuelve ese destino primero',
    (ui) => {
      const ix = buildSearchIndex(DESTINATIONS, ui);
      for (const d of DESTINATIONS) {
        for (const l of LOCALES) {
          const name = destinationName(d, l);
          const bare = name
            .split(/[\s-]+/)
            .map((w) => normalizeSearchQuery(w))
            .filter((w) => w !== '' && !SEARCH_STOP_WORDS.has(w))
            .join(' ');
          expect(bare, `${d.key}/${l}`).not.toBe('');
          expect(keys(ix, bare)[0], `${ui}: «${bare}» (${d.key}/${l})`).toBe(d.key);
        }
      }
    },
  );

  it('ninguna palabra de ningún nombre ni slug del registro es un artículo (la lista no puede esconder un nombre real)', () => {
    for (const d of DESTINATIONS) {
      for (const l of LOCALES) {
        for (const text of [destinationName(d, l), destinationSlug(d, l), ...d.slugs[l].aliases]) {
          const kept = normalizeSearchQuery(text)
            .split('-')
            .filter((w) => !SEARCH_STOP_WORDS.has(w));
          expect(kept.length, `${d.key}/${l}: «${text}»`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('HOMONIMIAS: «Barú» y «Santa Catalina» siguen resolviéndose por clave, con o sin artículos', () => {
    expect(keys(index, 'Barú')).toEqual(['volcan-baru']);
    expect(keys(index, 'el Barú')).toEqual(['volcan-baru']);
    expect(keys(index, 'Volcán de Barú')).toEqual(['volcan-baru']);
    expect(keys(index, 'Vulkan Baru')).toEqual(['volcan-baru']);
    expect(keys(index, 'Catalina')).toEqual(['santa-catalina']);
    expect(keys(index, 'Santa Catalina')).toEqual(['santa-catalina']);
    expect(keys(index, 'Santa-Catalina')).toEqual(['santa-catalina']);
    // «Santa» nunca arrastra a otro destino por parecerse a «Catalina»
    expect(keys(index, 'Santa Cruz')).toEqual([]);
    // dos destinos con el mismo nombre siguen siendo DOS resultados aunque la consulta lleve un artículo
    const twin = buildSearchIndex(
      [synthetic('boquete', 'Santa Catalina'), synthetic('santa-catalina', 'Santa Catalina')],
      'es',
    );
    expect(keys(twin, 'la santa catalina')).toEqual(['boquete', 'santa-catalina']);
    expect(keys(twin, 'catalina santa')).toEqual(['boquete', 'santa-catalina']);
  });

  it('una palabra que no está en ese nombre descarta el destino aunque las demás sí estén', () => {
    expect(keys(index, 'Canal Boquete')).toEqual([]);
    expect(keys(index, 'Valle Panamá')).toEqual([]);
    expect(keys(index, 'Bocas Coiba')).toEqual([]);
  });

  it('«Casco Viejo» NO encuentra «Casco Antiguo» (el registro dice que ese «Casco Viejo» es OTRO lugar, en Veraguas)', () => {
    // E-41 / `homonymCascoViejo`: relacionar los dos por nombre es lo que este módulo se niega a hacer. Si algún día se
    // acepta un alias de búsqueda, será un campo propio con su fuente y esta prueba cambiará a propósito.
    expect(keys(index, 'Casco Viejo')).toEqual([]);
    expect(keys(index, 'viejo')).toEqual([]);
    expect(keys(index, 'Casco Antiguo')).toEqual(['casco-antiguo']);
    expect(keys(index, 'casco')).toEqual(['casco-antiguo']);
    expect(keys(index, 'antiguo')).toEqual(['casco-antiguo']);
    const casco = DESTINATIONS.find((d) => d.key === 'casco-antiguo');
    expect(casco?.noteKeys).toContain('homonymCascoViejo');
    for (const l of LOCALES) expect(casco?.slugs[l].aliases).not.toContain('casco-viejo');
  });
});

describe('orden de relevancia con varias palabras', () => {
  it('nombre exacto antes que comienzo del nombre antes que palabras sueltas antes que subcadena', () => {
    const index = buildSearchIndex(
      [
        synthetic('boquete', 'Playa Isla Coiba Norte'), // palabras sueltas (en otro orden)
        synthetic('bocas-del-toro', 'Xisla Coiba'), // subcadena
        synthetic('santa-catalina', 'Isla Coiba Norte'), // comienzo del nombre
        synthetic('coiba', 'Isla Coiba'), // exacto
      ],
      'es',
    );
    expect(keys(index, 'isla coiba')).toEqual([
      'coiba',
      'santa-catalina',
      'boquete',
      'bocas-del-toro',
    ]);
  });

  it('un artículo en el nombre cuenta como el nombre exacto: «valle anton» antes que «valle de anton norte»', () => {
    const index = buildSearchIndex(
      [
        synthetic('boquete', 'Valle de Antón Norte'),
        synthetic('el-valle-de-anton', 'El Valle de Antón'),
      ],
      'es',
    );
    expect(keys(index, 'valle anton')).toEqual(['el-valle-de-anton', 'boquete']);
  });
});

describe('longitud de la consulta', () => {
  it('se recorta a SEARCH_QUERY_MAX_LENGTH: lo que pasa de ahí no cambia el resultado ni alarga el trabajo', () => {
    expect(SEARCH_QUERY_MAX_LENGTH).toBe(80);
    const index = buildSearchIndex(DESTINATIONS, 'es');
    const padded = `canal de panama${' '.repeat(65)}zzzzzz`;
    expect(padded.length).toBeGreaterThan(SEARCH_QUERY_MAX_LENGTH);
    expect(keys(index, padded)).toEqual(['panama-canal']);
    const huge = `canal ${'x'.repeat(100_000)}`;
    expect(normalizeSearchQuery(huge).length).toBeLessThanOrEqual(SEARCH_QUERY_MAX_LENGTH);
    expect(keys(index, huge)).toEqual([]);
  });
});
