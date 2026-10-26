import { describe, expect, it } from 'vitest';
import { DESTINATIONS, type DestinationKey } from '@/domains/tourism/destinations';
import {
  NO_FILTER,
  isFiltering,
  kindOptions,
  matchingKeys,
  visibleKeys,
  withQuery,
  type ExploreFilter,
} from '@/domains/tourism/explore-filter';
import { buildSearchIndex, type SearchIndexEntry } from '@/domains/tourism/search';
import type { Locale } from '@/i18n/locales';

/**
 * Filtro por tipo y búsqueda de Explorar (lógica pura). Reglas que se vigilan: por CLAVE y nunca por nombre, intersección
 * de tipo y búsqueda, el destino SELECCIONADO nunca se oculta (y no cuenta como coincidencia), sin filtro se ven los
 * nueve en el orden del registro, y una consulta sin caracteres útiles es «sin búsqueda», no «ningún resultado».
 */
const ALL = DESTINATIONS.map((d) => d.key);
const index = (locale: Locale = 'es'): SearchIndexEntry[] => buildSearchIndex(DESTINATIONS, locale);
const query = (
  text: string,
  kind: ExploreFilter['kind'] = 'all',
  locale?: 'es' | 'de',
): ExploreFilter => withQuery({ ...NO_FILTER, kind }, text, index(locale));

describe('sin filtro', () => {
  it('se ven los nueve destinos, en el orden del registro, y no hay filtro activo', () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(matchingKeys(NO_FILTER, index())).toEqual(ALL);
    expect(visibleKeys(NO_FILTER, index())).toEqual(ALL);
    expect(ALL).toHaveLength(9);
  });

  it('una consulta sin caracteres útiles («  », «¡!») es «sin búsqueda», no «ningún resultado»', () => {
    for (const text of ['', '   ', '¡!', '…?']) {
      const filter = query(text);
      expect(filter.matches, JSON.stringify(text)).toBeNull();
      expect(isFiltering(filter)).toBe(false);
      expect(visibleKeys(filter, index())).toEqual(ALL);
    }
  });
});

describe('por tipo', () => {
  it('«localidad» deja las tres localidades y solo ellas', () => {
    const filter: ExploreFilter = { ...NO_FILTER, kind: 'locality' };
    expect(isFiltering(filter)).toBe(true);
    expect(matchingKeys(filter, index())).toEqual([
      'el-valle-de-anton',
      'boquete',
      'santa-catalina',
    ]);
  });

  it('kindOptions: los tipos que EXISTEN, en el orden de aparición, con su recuento (suman los nueve)', () => {
    const options = kindOptions(index());
    expect(options.map((o) => o.kind)).toEqual([
      'city',
      'historic_district',
      'infrastructure',
      'locality',
      'volcano',
      'archipelago',
      'island',
    ]);
    expect(options.find((o) => o.kind === 'locality')?.count).toBe(3);
    expect(options.reduce((sum, o) => sum + o.count, 0)).toBe(9);
    expect(kindOptions([])).toEqual([]);
  });
});

describe('por búsqueda (por CLAVE, sin acentos y en los cinco idiomas)', () => {
  it('«baru» encuentra el volcán por clave (sin acento ni mayúsculas)', () => {
    expect(matchingKeys(query('BARU'), index())).toEqual(['volcan-baru']);
    expect(matchingKeys(query('Barú'), index())).toEqual(['volcan-baru']);
  });

  it('se encuentra por el nombre en OTRO idioma que el de la interfaz', () => {
    // «Panamakanal» (alemán) desde la interfaz en español; «Casco Viejo» (inglés) también
    expect(matchingKeys(query('panamakanal', 'all', 'es'), index('es'))).toEqual(['panama-canal']);
    expect(matchingKeys(query('canal', 'all', 'de'), index('de'))).toContain('panama-canal');
  });

  it('el resultado sale en el orden del registro entre los que coinciden', () => {
    const filter = query('a');
    const found = matchingKeys(filter, index());
    expect(found.length).toBeGreaterThan(1);
    expect(found).toEqual(ALL.filter((key) => found.includes(key)));
  });

  it('dos destinos con el MISMO nombre siguen siendo dos resultados (nunca se deduplica por nombre)', () => {
    const twin: SearchIndexEntry[] = [
      {
        key: 'boquete',
        kind: 'locality',
        name: 'Santa Catalina',
        slug: 'santa-catalina',
        terms: ['santa-catalina'],
      },
      {
        key: 'santa-catalina',
        kind: 'locality',
        name: 'Santa Catalina',
        slug: 'santa-catalina',
        terms: ['santa-catalina'],
      },
    ];
    const filter = withQuery(NO_FILTER, 'santa catalina', twin);
    expect(filter.matches).toEqual(['boquete', 'santa-catalina']);
    expect(matchingKeys(filter, twin)).toEqual(['boquete', 'santa-catalina']);
  });

  it('ninguna coincidencia es una lista VACÍA (distinto de «sin búsqueda», que es null)', () => {
    const filter = query('zzzz');
    expect(filter.matches).toEqual([]);
    expect(isFiltering(filter)).toBe(true);
    expect(matchingKeys(filter, index())).toEqual([]);
    expect(visibleKeys(filter, index())).toEqual([]);
  });
});

describe('tipo Y búsqueda: intersección', () => {
  it('solo lo que cumple las dos cosas', () => {
    // «a» coincide con varias localidades y con otros tipos; el tipo recorta
    const both = matchingKeys(query('a', 'locality'), index());
    const justKind = matchingKeys({ ...NO_FILTER, kind: 'locality' }, index());
    const justQuery = matchingKeys(query('a'), index());
    expect(both).toEqual(justKind.filter((key) => justQuery.includes(key)));
    expect(both.length).toBeGreaterThan(0);
  });

  it('tipo y búsqueda incompatibles no dejan nada', () => {
    expect(matchingKeys(query('boquete', 'volcano'), index())).toEqual([]);
  });
});

describe('el destino seleccionado nunca se oculta', () => {
  it('se ve aunque no coincida, pero no cuenta como coincidencia', () => {
    const filter: ExploreFilter = { ...NO_FILTER, kind: 'volcano' };
    const selected: DestinationKey = 'boquete';
    expect(matchingKeys(filter, index())).toEqual(['volcan-baru']);
    expect(visibleKeys(filter, index(), selected)).toEqual(['boquete', 'volcan-baru']);
  });

  it('también con una búsqueda sin resultados: queda solo el seleccionado', () => {
    expect(visibleKeys(query('zzzz'), index(), 'coiba')).toEqual(['coiba']);
  });

  it('seleccionado que ya coincide: no se repite', () => {
    const filter: ExploreFilter = { ...NO_FILTER, kind: 'locality' };
    expect(visibleKeys(filter, index(), 'boquete')).toEqual([
      'el-valle-de-anton',
      'boquete',
      'santa-catalina',
    ]);
  });

  it('sin filtro y con seleccionado se ven los nueve (el seleccionado no cambia nada)', () => {
    expect(visibleKeys(NO_FILTER, index(), 'coiba')).toEqual(ALL);
  });
});
