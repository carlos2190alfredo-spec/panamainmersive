import type { AssertionRecord, EvidenceItem, TextVariant } from '@/domains/content/assertion';
import type { FieldKey } from '@/domains/content/fields';

/**
 * DATOS SINTÉTICOS de prueba. No son contenido del producto ni afirman nada sobre Panamá: los textos dicen
 * «[prueba]» a propósito y los enlaces usan el dominio reservado `example.org`.
 */
export const TODAY = '2026-10-21';

export const evidence = (over: Partial<EvidenceItem> = {}): EvidenceItem => ({
  id: '5b0c2a1e-8f0d-4c1b-9a53-0d6a3f2e1b01',
  sourceClass: 'official',
  institution: 'Institución de prueba',
  title: 'Documento de prueba',
  url: 'https://example.org/doc',
  publishedOn: '2026-01-15',
  retrievedAt: '2026-09-20T12:00:00Z',
  license: { name: 'Licencia de prueba', url: 'https://example.org/licencia' },
  stance: 'supports',
  locator: 'sección 2',
  excerpt: '[prueba] cita breve',
  ...over,
});

export const original = (over: Partial<TextVariant> = {}): TextVariant => ({
  locale: 'es',
  text: '[prueba] texto original',
  provenance: 'original',
  status: 'published',
  ...over,
});

export const translation = (over: Partial<TextVariant> = {}): TextVariant => ({
  locale: 'en',
  text: '[test] original text',
  provenance: 'human_translation',
  status: 'published',
  ...over,
});

/** Una afirmación que supera todas las puertas para `overview.summary` (sin vigencia). */
export function assertion(over: Partial<AssertionRecord> = {}): AssertionRecord {
  return {
    id: '7d3e9c52-1a4b-4f6e-8b21-4c9a0e5f7d10',
    destinationKey: 'boquete',
    fieldKey: 'overview.summary',
    version: 1,
    status: 'verified',
    sourceLocale: 'es',
    quantity: null,
    texts: [original()],
    confidence: 'medium',
    verifiedAt: '2026-10-01T15:00:00Z',
    validFrom: null,
    validUntil: null,
    supersededAt: null,
    evidence: [evidence()],
    authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    verifiedById: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ...over,
  };
}

/** Una afirmación válida para un campo con vigencia (`restrictions.entry_rules`: 180 días, solo oficial). */
export function entryRules(over: Partial<AssertionRecord> = {}): AssertionRecord {
  return assertion({
    fieldKey: 'restrictions.entry_rules',
    validFrom: '2026-10-01',
    validUntil: '2027-03-01',
    ...over,
  });
}

export function elevation(over: Partial<AssertionRecord> = {}): AssertionRecord {
  return assertion({
    destinationKey: 'volcan-baru',
    fieldKey: 'facts.elevation_m',
    texts: [],
    quantity: { value: 3475, unit: 'm' },
    evidence: [evidence({ sourceClass: 'scientific' })],
    ...over,
  });
}

export const FIELD_KEYS_WITH_VALIDITY: readonly FieldKey[] = [
  'access.how_to_get_there',
  'restrictions.entry_rules',
  'restrictions.legal_status',
  'safety.hazards',
  'visit.best_season',
  'visit.accessibility',
];
