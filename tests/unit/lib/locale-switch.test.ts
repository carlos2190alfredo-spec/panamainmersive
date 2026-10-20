import { describe, expect, it } from 'vitest';
import { LOCALES } from '@/i18n/locales';
import { queryFromSearchParams, switchTarget } from '@/lib/locale-switch';

describe('selector de idioma: misma vista en otro idioma', () => {
  it('rutas estructurales: conserva la ruta interna y la query', () => {
    expect(
      switchTarget('/explore', {}, 'es', 'de', { cam: '-79.5,8.98,9', layers: ['a', 'b'] }),
    ).toEqual({
      pathname: '/explore',
      query: { cam: '-79.5,8.98,9', layers: ['a', 'b'] },
    });
  });

  it('sin query no añade un objeto vacío', () => {
    expect(switchTarget('/sources', {}, 'es', 'fr')).toEqual({ pathname: '/sources' });
    expect(switchTarget('/sources', {}, 'es', 'fr', {})).toEqual({ pathname: '/sources' });
  });

  it('ficha de destino: traduce el slug a través de la clave estable en cada idioma', () => {
    const expected = {
      es: 'ciudad-de-panama',
      en: 'panama-city',
      pt: 'cidade-do-panama',
      fr: 'ville-de-panama',
      de: 'panama-stadt',
    } as const;
    for (const from of LOCALES) {
      for (const to of LOCALES) {
        const href = switchTarget('/destinations/[slug]', { slug: expected[from] }, from, to);
        expect(href, `${from}→${to}`).toEqual({
          pathname: '/destinations/[slug]',
          params: { slug: expected[to] },
        });
      }
    }
  });

  it('conserva la query de una ficha al cambiar de idioma', () => {
    const href = switchTarget('/destinations/[slug]', { slug: 'panama-city' }, 'en', 'de', {
      d: 'panama-city',
    });
    expect(href).toEqual({
      pathname: '/destinations/[slug]',
      params: { slug: 'panama-stadt' },
      query: { d: 'panama-city' },
    });
  });

  it('un slug desconocido NO se copia ni se inventa: se vuelve al índice', () => {
    expect(switchTarget('/destinations/[slug]', { slug: 'no-existe' }, 'es', 'en')).toEqual({
      pathname: '/destinations',
    });
    expect(switchTarget('/destinations/[slug]', {}, 'es', 'en')).toEqual({
      pathname: '/destinations',
    });
  });

  it('un slug de otro idioma (enlace compartido mal formado) se resuelve por la clave', () => {
    expect(switchTarget('/destinations/[slug]', { slug: 'panama-canal' }, 'de', 'es')).toEqual({
      pathname: '/destinations/[slug]',
      params: { slug: 'canal-de-panama' },
    });
  });
});

describe('queryFromSearchParams', () => {
  it('conserva claves repetidas como lista y valores vacíos', () => {
    const q = queryFromSearchParams(new URLSearchParams('a=1&b=2&b=3&c='));
    expect(q).toEqual({ a: '1', b: ['2', '3'], c: '' });
  });

  it('una query vacía produce un objeto vacío', () => {
    expect(queryFromSearchParams(new URLSearchParams(''))).toEqual({});
  });
});
