import type { Locale } from '@/i18n/locales';
import { LOCALES } from '@/i18n/locales';

/** Slug ASCII en minúsculas con guiones. Los nombres con acento se conservan en `name`, no en el slug. */
const TRANSLITERATIONS: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ł: 'l',
};

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ßæœøđł]/g, (c) => TRANSLITERATIONS[c] ?? c)
    .normalize('NFD')
    .replace(/\p{Mn}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface SluggedEntry {
  readonly key: string;
  readonly slugs: Readonly<
    Record<Locale, { readonly current: string; readonly aliases: readonly string[] }>
  >;
}

export type SlugResolution =
  | { readonly kind: 'found'; readonly key: string }
  | {
      readonly kind: 'redirect';
      readonly key: string;
      /** Slug canónico en el idioma de la URL solicitada. */
      readonly slug: string;
      readonly reason: 'alias' | 'other_locale';
    }
  | { readonly kind: 'not_found' };

/**
 * Resuelve un slug por (idioma, slug) → clave estable (ADR-0003):
 *  1. slug actual del idioma → found;
 *  2. alias anterior del mismo idioma → redirect (308) al actual;
 *  3. slug de OTRO idioma, sin ambigüedad → redirect (308) al slug del idioma pedido;
 *  4. si no, not_found. Nunca se adivina entre candidatos ambiguos.
 */
export function resolveSlug(
  entries: readonly SluggedEntry[],
  locale: Locale,
  slug: string,
): SlugResolution {
  const here = entries.find((e) => e.slugs[locale].current === slug);
  if (here) return { kind: 'found', key: here.key };

  const alias = entries.find((e) => e.slugs[locale].aliases.includes(slug));
  if (alias) {
    return { kind: 'redirect', key: alias.key, slug: alias.slugs[locale].current, reason: 'alias' };
  }

  const keys = new Set<string>();
  for (const other of LOCALES) {
    if (other === locale) continue;
    for (const e of entries) {
      if (e.slugs[other].current === slug || e.slugs[other].aliases.includes(slug)) keys.add(e.key);
    }
  }
  if (keys.size === 1) {
    const [key] = [...keys];
    const target = entries.find((e) => e.key === key);
    if (target) {
      return {
        kind: 'redirect',
        key: target.key,
        slug: target.slugs[locale].current,
        reason: 'other_locale',
      };
    }
  }
  return { kind: 'not_found' };
}

/** Comprueba la unicidad (idioma, slug) entre entradas (actuales y alias). Devuelve los conflictos. */
export function findSlugConflicts(entries: readonly SluggedEntry[]): string[] {
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  for (const e of entries) {
    for (const locale of LOCALES) {
      const { current, aliases } = e.slugs[locale];
      for (const s of [current, ...aliases]) {
        const id = `${locale}:${s}`;
        const owner = seen.get(id);
        if (owner !== undefined && owner !== e.key) conflicts.push(`${id} (${owner} y ${e.key})`);
        else seen.set(id, e.key);
      }
    }
  }
  return conflicts;
}
