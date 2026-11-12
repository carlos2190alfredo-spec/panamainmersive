import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getExploreFilter,
  resetExploreFilter,
  setKindFilter,
  setSearchQuery,
  subscribeExploreFilter,
  useExploreFilter,
} from '@/components/map/explore-filter-store';
import { DESTINATIONS } from '@/domains/tourism/destinations';
import { buildSearchIndex } from '@/domains/tourism/search';

/**
 * Almacén del filtro y la búsqueda de Explorar (estado LOCAL de la visita, no va en la URL). Lo que se vigila: cada
 * cambio real da una foto NUEVA y avisa; repetir lo mismo NO (sin renders de más); `lastChange` dice qué control se
 * tocó (decide el mensaje que se anuncia); y salir de la pantalla lo borra.
 */
const index = buildSearchIndex(DESTINATIONS, 'es');

afterEach(() => {
  resetExploreFilter();
});

describe('explore-filter-store', () => {
  it('empieza sin filtro: «todos», sin búsqueda y sin cambio previo', () => {
    expect(getExploreFilter()).toMatchObject({
      kind: 'all',
      query: '',
      matches: null,
      lastChange: null,
    });
  });

  it('elegir un tipo cambia la foto y marca «kind»; repetirlo NO crea otra foto', () => {
    const before = getExploreFilter();
    setKindFilter('volcano');
    const after = getExploreFilter();
    expect(after).not.toBe(before);
    expect(after).toMatchObject({ kind: 'volcano', lastChange: 'kind' });
    setKindFilter('volcano');
    expect(getExploreFilter()).toBe(after);
  });

  it('la búsqueda calcula las claves (por clave) y marca «search»; el tipo se conserva (intersección)', () => {
    setKindFilter('locality');
    setSearchQuery('boq', index);
    const filter = getExploreFilter();
    expect(filter).toMatchObject({ kind: 'locality', query: 'boq', lastChange: 'search' });
    expect(filter.matches).toEqual(['boquete']);
    setSearchQuery('boq', index);
    expect(getExploreFilter()).toBe(filter);
  });

  it('vaciar la búsqueda vuelve a «sin búsqueda» (null), no a «ningún resultado»', () => {
    setSearchQuery('zzzz', index);
    expect(getExploreFilter().matches).toEqual([]);
    setSearchQuery('', index);
    expect(getExploreFilter()).toMatchObject({ query: '', matches: null, lastChange: 'search' });
  });

  it('resetExploreFilter borra TODO (también lastChange) y es idempotente', () => {
    setKindFilter('island');
    setSearchQuery('coi', index);
    resetExploreFilter();
    const initial = getExploreFilter();
    expect(initial).toMatchObject({ kind: 'all', query: '', matches: null, lastChange: null });
    resetExploreFilter();
    expect(getExploreFilter()).toBe(initial);
  });

  it('avisa a los suscriptores en cada cambio real, no en un repetido y no tras darse de baja', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeExploreFilter(listener);
    setKindFilter('city');
    setKindFilter('city'); // repetido: nada
    setSearchQuery('ca', index);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setKindFilter('island');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('en el SERVIDOR (y al hidratar) el hook ve siempre el estado inicial, aunque el almacén ya tenga filtro', () => {
    setKindFilter('city');
    function Probe() {
      return createElement('span', null, useExploreFilter().kind);
    }
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<span>all</span>');
  });
});
