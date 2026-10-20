import { describe, expect, it } from 'vitest';
import {
  DESTINATIONS,
  DESTINATION_KEYS,
  DESTINATION_KINDS,
  destinationSlug,
  getDestination,
  resolveDestinationSlug,
} from '@/domains/tourism/destinations';
import { SLUG_PATTERN, findSlugConflicts, slugify } from '@/domains/tourism/slugs';
import { LOCALES } from '@/i18n/locales';

describe('registro de los nueve destinos', () => {
  it('hay nueve destinos con claves únicas e inmutables del documento rector', () => {
    expect(DESTINATIONS).toHaveLength(9);
    expect(new Set(DESTINATIONS.map((d) => d.key)).size).toBe(9);
    expect(DESTINATIONS.map((d) => d.key)).toEqual([...DESTINATION_KEYS]);
  });

  it('cada destino tiene nombre y slug en los cinco idiomas', () => {
    for (const d of DESTINATIONS) {
      expect(DESTINATION_KINDS).toContain(d.kind);
      for (const l of LOCALES) {
        expect(d.names[l].name.trim(), `${d.key}/${l}`).not.toBe('');
        expect(d.slugs[l].current, `${d.key}/${l}`).toMatch(SLUG_PATTERN);
      }
    }
  });

  it('los slugs son únicos por idioma y coherentes con el nombre (guarda contra erratas)', () => {
    expect(findSlugConflicts(DESTINATIONS)).toEqual([]);
    for (const d of DESTINATIONS) {
      for (const l of LOCALES) {
        expect(d.slugs[l].current, `${d.key}/${l}`).toBe(slugify(d.names[l].name));
      }
    }
  });

  it('una máquina nunca figura como revisora: ningún nombre está reviewed ni published', () => {
    for (const d of DESTINATIONS) {
      for (const l of LOCALES) {
        const n = d.names[l];
        expect(['draft', 'machine_translated']).toContain(n.status);
        if (n.status === 'machine_translated') expect(n.provenance).toBe('ai_translation_2026-10-20');
        if (l === 'es') expect(n.provenance).toBe('toponym_original');
      }
    }
  });

  it('un nombre conservado del original no se declara traducido', () => {
    const casco = getDestination('casco-antiguo');
    expect(casco?.names.de).toMatchObject({ name: 'Casco Antiguo', provenance: 'toponym_original' });
  });

  it('los destinos con homonimia conocida llevan su aviso', () => {
    expect(getDestination('volcan-baru')?.noteKeys).toContain('homonymBaru');
    expect(getDestination('santa-catalina')?.noteKeys).toContain('homonymSantaCatalina');
    expect(getDestination('bocas-del-toro')?.noteKeys).toContain('bocasAmbiguous');
  });

  it('el slug es la ÚNICA vía: el nombre de otro idioma redirige al canónico', () => {
    expect(resolveDestinationSlug('en', 'ciudad-de-panama')).toMatchObject({
      kind: 'redirect',
      key: 'panama-city',
      slug: 'panama-city',
      reason: 'other_locale',
    });
    expect(resolveDestinationSlug('de', 'panama-canal')).toMatchObject({ kind: 'redirect', slug: 'panamakanal' });
    expect(resolveDestinationSlug('es', 'volcan-baru')).toEqual({ kind: 'found', key: 'volcan-baru' });
  });

  it('un slug idéntico en varios idiomas se resuelve directamente en cada uno (sin redirecciones)', () => {
    for (const l of LOCALES) {
      expect(resolveDestinationSlug(l, 'boquete')).toEqual({ kind: 'found', key: 'boquete' });
    }
  });

  it('«Barú» y «Volcán Barú» no se confunden (homonimia)', () => {
    expect(resolveDestinationSlug('es', 'baru')).toEqual({ kind: 'not_found' });
    const entry = getDestination('volcan-baru');
    expect(entry && destinationSlug(entry, 'en')).toBe('baru-volcano');
  });
});
