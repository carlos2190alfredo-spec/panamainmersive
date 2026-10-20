import { describe, expect, it } from 'vitest';
import {
  SLUG_PATTERN,
  findSlugConflicts,
  resolveSlug,
  slugify,
  type SluggedEntry,
} from '@/domains/tourism/slugs';
import { LOCALES, type Locale } from '@/i18n/locales';

function entry(
  key: string,
  per: Partial<Record<Locale, { current: string; aliases?: string[] }>>,
): SluggedEntry {
  const slugs = Object.fromEntries(
    LOCALES.map((l) => [
      l,
      { current: per[l]?.current ?? `${key}-${l}`, aliases: per[l]?.aliases ?? [] },
    ]),
  ) as unknown as SluggedEntry['slugs'];
  return { key, slugs };
}

describe('slugify', () => {
  it('quita acentos, eñes y diéresis; conserva ASCII en minúscula con guiones', () => {
    expect(slugify('El Valle de Antón')).toBe('el-valle-de-anton');
    expect(slugify('Volcán Barú')).toBe('volcan-baru');
    expect(slugify('Cidade do Panamá')).toBe('cidade-do-panama');
    expect(slugify('Île de Coiba')).toBe('ile-de-coiba');
    expect(slugify('Año Nuevo')).toBe('ano-nuevo');
  });

  it('transcribe ß y ligaduras en lugar de perder letras', () => {
    expect(slugify('Straße')).toBe('strasse');
    expect(slugify('Œuvre')).toBe('oeuvre');
  });

  it('colapsa signos y recorta guiones', () => {
    expect(slugify('  Panama (ville) !! ')).toBe('panama-ville');
  });

  it('siempre produce un slug válido', () => {
    for (const s of ['Casco Antiguo', 'Panama-Stadt', 'Bocas del Toro', 'Santa Catalina']) {
      expect(slugify(s)).toMatch(SLUG_PATTERN);
    }
  });
});

describe('resolveSlug (ADR-0003)', () => {
  const entries = [
    entry('a', {
      es: { current: 'nuevo-nombre', aliases: ['viejo-nombre'] },
      en: { current: 'new-name' },
    }),
    entry('b', { es: { current: 'otro' }, en: { current: 'other' } }),
  ];

  it('slug actual del idioma → found', () => {
    expect(resolveSlug(entries, 'es', 'nuevo-nombre')).toEqual({ kind: 'found', key: 'a' });
  });

  it('alias anterior del mismo idioma → redirección al actual (cambiar un slug no rompe enlaces)', () => {
    expect(resolveSlug(entries, 'es', 'viejo-nombre')).toEqual({
      kind: 'redirect',
      key: 'a',
      slug: 'nuevo-nombre',
      reason: 'alias',
    });
  });

  it('slug de otro idioma → redirección al slug del idioma pedido', () => {
    expect(resolveSlug(entries, 'en', 'nuevo-nombre')).toEqual({
      kind: 'redirect',
      key: 'a',
      slug: 'new-name',
      reason: 'other_locale',
    });
    // también vale un alias de otro idioma
    expect(resolveSlug(entries, 'en', 'viejo-nombre')).toEqual({
      kind: 'redirect',
      key: 'a',
      slug: 'new-name',
      reason: 'other_locale',
    });
  });

  it('slug desconocido → not_found', () => {
    expect(resolveSlug(entries, 'es', 'no-existe')).toEqual({ kind: 'not_found' });
  });

  it('el slug del idioma actual gana sobre el de otro idioma (no se redirige lo que ya existe)', () => {
    const e = [entry('x', { es: { current: 'mismo' } }), entry('y', { en: { current: 'mismo' } })];
    expect(resolveSlug(e, 'es', 'mismo')).toEqual({ kind: 'found', key: 'x' });
    expect(resolveSlug(e, 'en', 'mismo')).toEqual({ kind: 'found', key: 'y' });
  });

  it('ante ambigüedad entre otros idiomas NO adivina', () => {
    const e = [entry('x', { es: { current: 'comun' } }), entry('y', { fr: { current: 'comun' } })];
    expect(resolveSlug(e, 'de', 'comun')).toEqual({ kind: 'not_found' });
  });
});

describe('findSlugConflicts', () => {
  it('detecta el mismo (idioma, slug) en dos entidades, también entre actual y alias', () => {
    const e = [
      entry('x', { es: { current: 'repetido' } }),
      entry('y', { es: { current: 'otro', aliases: ['repetido'] } }),
    ];
    expect(findSlugConflicts(e)).toHaveLength(1);
  });

  it('no marca conflicto cuando la misma entidad repite su slug en varios idiomas', () => {
    const e = [entry('x', { es: { current: 'boquete' }, en: { current: 'boquete' } })];
    expect(findSlugConflicts(e)).toEqual([]);
  });
});
