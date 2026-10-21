import { describe, expect, it } from 'vitest';
import {
  GATE_CODES,
  evidenceIssues,
  passesGates,
  verificationIssues,
  type GateCode,
  type GateOptions,
} from '@/domains/content/gates';
import type { DestinationKind } from '@/domains/tourism/destinations';
import { MAX_TEXT_LENGTH } from '@/domains/content/assertion';
import { CONTENT_FIELDS, type ContentField } from '@/domains/content/fields';
import { assertion, elevation, entryRules, evidence, original, translation } from './fixtures';

const DB = { people: 'required' } as const;
const SNAPSHOT = { people: 'unavailable' } as const;

const issues = (
  r = assertion(),
  kind: DestinationKind = 'locality',
  o: GateOptions = DB,
): GateCode[] => verificationIssues(r, kind, o);

describe('puertas de verificación: lo válido', () => {
  it('una afirmación bien formada las supera todas', () => {
    expect(issues()).toEqual([]);
    expect(passesGates(assertion(), 'locality', DB)).toBe(true);
  });

  it('un campo con vigencia y uno de cantidad también', () => {
    expect(issues(entryRules())).toEqual([]);
    expect(verificationIssues(elevation(), 'volcano', DB)).toEqual([]);
  });

  it('una traducción humana publicada no impide verificar', () => {
    expect(issues(assertion({ texts: [original(), translation()] }))).toEqual([]);
  });
});

describe('puertas de verificación: cada una se activa sola', () => {
  const cases: [GateCode, () => ReturnType<typeof assertion>][] = [
    ['status_not_verified', () => assertion({ status: 'in_review' })],
    ['superseded', () => assertion({ supersededAt: '2026-10-10T00:00:00Z' })],
    ['verifier_missing', () => assertion({ verifiedById: null })],
    [
      'verifier_is_author',
      () =>
        assertion({
          authorId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          verifiedById: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        }),
    ],
    ['verified_at_invalid', () => assertion({ verifiedAt: null })],
    ['confidence_missing', () => assertion({ confidence: null })],
    ['evidence_none', () => assertion({ evidence: [] })],
    [
      'evidence_class_insufficient',
      () => assertion({ evidence: [evidence({ sourceClass: 'community' })] }),
    ],
    [
      'evidence_stale',
      () => assertion({ evidence: [evidence({ retrievedAt: '2023-01-01T00:00:00Z' })] }),
    ],
    [
      'evidence_after_verification',
      () => assertion({ evidence: [evidence({ retrievedAt: '2026-10-05T00:00:00Z' })] }),
    ],
    [
      'evidence_contradicts',
      () =>
        assertion({
          evidence: [
            evidence(),
            evidence({ id: '5b0c2a1e-8f0d-4c1b-9a53-0d6a3f2e1b02', stance: 'contradicts' }),
          ],
        }),
    ],
    [
      'evidence_insecure_url',
      () => assertion({ evidence: [evidence({ url: 'http://example.org/doc' })] }),
    ],
    [
      'evidence_date_invalid',
      () => assertion({ evidence: [evidence({ publishedOn: '2026-02-31' })] }),
    ],
    ['validity_missing', () => entryRules({ validUntil: null })],
    ['validity_invalid', () => entryRules({ validFrom: '2027-04-01', validUntil: '2027-03-01' })],
    [
      'validity_before_verification',
      () => entryRules({ validUntil: '2026-09-01', validFrom: null }),
    ],
    ['validity_too_long', () => entryRules({ validUntil: '2028-01-01' })],
    ['original_text_missing', () => assertion({ texts: [translation()] })],
    [
      'text_invalid',
      () => assertion({ texts: [original({ text: 'x'.repeat(MAX_TEXT_LENGTH + 1) })] }),
    ],
    ['quantity_missing', () => elevation({ quantity: null })],
    ['quantity_invalid', () => elevation({ quantity: { value: 3475, unit: 'km' } })],
  ];

  it.each(cases)('«%s»', (code, make) => {
    const kind = make().fieldKey === 'facts.elevation_m' ? 'volcano' : 'locality';
    expect(verificationIssues(make(), kind, DB)).toContain(code);
    expect(passesGates(make(), kind, DB)).toBe(false);
  });

  it('el catálogo de códigos está completo: cada código tiene un caso y viceversa', () => {
    const covered = new Set<GateCode>(cases.map(([c]) => c));
    // `unknown_field` y `field_not_applicable` se prueban abajo (necesitan otro tipo o clave)
    covered.add('unknown_field');
    covered.add('field_not_applicable');
    expect([...covered].sort()).toEqual([...GATE_CODES].sort());
  });

  it('campo desconocido o no aplicable al tipo', () => {
    // @ts-expect-error clave fuera del registro a propósito
    expect(issues(assertion({ fieldKey: 'overview.invented' }))).toEqual(['unknown_field']);
    expect(verificationIssues(elevation(), 'island', DB)).toContain('field_not_applicable');
  });
});

describe('puertas de verificación: bordes exactos', () => {
  it('la vigencia máxima es inclusiva: 180 días sí, 181 no (entry_rules)', () => {
    // verificada el 2026-10-01 → +180 días = 2027-03-30
    expect(issues(entryRules({ validUntil: '2027-03-30' }))).toEqual([]);
    expect(issues(entryRules({ validUntil: '2027-03-31' }))).toContain('validity_too_long');
  });

  it('vigente hasta el mismo día de la verificación es válido; el día anterior no', () => {
    expect(issues(entryRules({ validUntil: '2026-10-01', validFrom: null }))).toEqual([]);
    expect(issues(entryRules({ validUntil: '2026-09-30', validFrom: null }))).toContain(
      'validity_before_verification',
    );
  });

  it('la antigüedad máxima de la fuente es inclusiva (safety.hazards: 90 días)', () => {
    const hazards = (retrievedAt: string, validUntil = '2026-12-30') =>
      assertion({
        fieldKey: 'safety.hazards',
        validUntil,
        evidence: [evidence({ retrievedAt })],
      });
    // verificada 2026-10-01: 90 días antes = 2026-07-03
    expect(issues(hazards('2026-07-03T00:00:00Z'))).toEqual([]);
    expect(issues(hazards('2026-07-02T23:59:59Z'))).toContain('evidence_stale');
  });

  it('una fuente consultada el mismo día de la verificación sirve; un día después no', () => {
    expect(
      issues(assertion({ evidence: [evidence({ retrievedAt: '2026-10-01T23:00:00Z' })] })),
    ).toEqual([]);
    expect(
      issues(assertion({ evidence: [evidence({ retrievedAt: '2026-10-02T00:00:00Z' })] })),
    ).toContain('evidence_after_verification');
  });

  it('las cantidades deben ser finitas, positivas y con la unidad del campo', () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        verificationIssues(elevation({ quantity: { value, unit: 'm' } }), 'volcano', DB),
      ).toContain('quantity_invalid');
    }
  });
});

describe('puertas de verificación: evidencia', () => {
  it('una fuente comercial o comunitaria nunca basta, aunque haya muchas', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      evidence({
        id: `5b0c2a1e-8f0d-4c1b-9a53-0d6a3f2e1b1${String(i)}`,
        sourceClass: i % 2 ? 'commercial' : 'community',
      }),
    );
    expect(issues(assertion({ evidence: many }))).toContain('evidence_class_insufficient');
  });

  it('lo oficial basta para todo; una reseña editorial no basta para restricciones', () => {
    expect(
      issues(entryRules({ evidence: [evidence({ sourceClass: 'editorial_review' })] })),
    ).toContain('evidence_class_insufficient');
    expect(issues(entryRules({ evidence: [evidence({ sourceClass: 'official' })] }))).toEqual([]);
  });

  it('la fuente que contradice no cuenta como respaldo y bloquea la verificación', () => {
    const r = assertion({ evidence: [evidence({ stance: 'contradicts' })] });
    const found = issues(r);
    expect(found).toContain('evidence_none');
    expect(found).toContain('evidence_contradicts');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'file:///etc/passwd',
    '//example.org',
    'example.org',
    '',
    'http://example.org',
  ])('rechaza el enlace «%s»', (url) => {
    expect(issues(assertion({ evidence: [evidence({ url })] }))).toContain('evidence_insecure_url');
  });
});

describe('puertas de verificación: texto', () => {
  it('el original debe existir en el idioma de origen y no estar vacío', () => {
    expect(issues(assertion({ texts: [] }))).toContain('original_text_missing');
    expect(issues(assertion({ texts: [original({ text: '   \n' })] }))).toContain(
      'original_text_missing',
    );
    // el original está en otro idioma que el declarado como origen
    expect(issues(assertion({ sourceLocale: 'en', texts: [original()] }))).toContain(
      'original_text_missing',
    );
  });

  it('una traducción vacía invalida la afirmación', () => {
    expect(issues(assertion({ texts: [original(), translation({ text: '' })] }))).toContain(
      'text_invalid',
    );
  });
});

describe('puertas de verificación: identidades', () => {
  it('sin personas (instantánea) no se exige verificador ni se rechaza por ello', () => {
    expect(issues(assertion({ verifiedById: null, authorId: null }), 'locality', SNAPSHOT)).toEqual(
      [],
    );
  });

  it('con datos de BD el verificador debe ser distinto del autor', () => {
    const same = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    expect(issues(assertion({ authorId: same, verifiedById: same }))).toContain(
      'verifier_is_author',
    );
    expect(issues(assertion({ authorId: null }))).toEqual([]);
  });
});

describe('puertas de verificación: propiedades', () => {
  it('cada campo del registro tiene al menos una afirmación válida construible (el registro es satisfacible)', () => {
    for (const f of CONTENT_FIELDS) {
      const kind = f.appliesTo === 'all' ? 'locality' : f.appliesTo[0];
      const cls = f.evidence.classes[0];
      const base = assertion({
        destinationKey: kind === 'volcano' ? 'volcan-baru' : 'boquete',
        fieldKey: f.key,
        evidence: [evidence({ sourceClass: cls })],
        validUntil: f.maxValidityDays === null ? null : '2026-12-01',
        ...(f.valueKind === 'quantity' ? { texts: [], quantity: { value: 10, unit: 'm' } } : {}),
      });
      expect(verificationIssues(base, kind, DB), f.key).toEqual([]);
    }
  });

  it('es determinista y no muta su entrada', () => {
    const r = entryRules();
    const before = JSON.stringify(r);
    expect(issues(r)).toEqual(issues(r));
    expect(JSON.stringify(r)).toBe(before);
  });

  it('con entradas hostiles no lanza: devuelve códigos', () => {
    const hostile = assertion({
      verifiedAt: 'no-es-fecha',
      validFrom: '9999-99-99',
      validUntil: '',
      evidence: [evidence({ retrievedAt: '???', url: '\u0000', publishedOn: 'x' })],
      texts: [original({ text: '‮<script>' })],
    });
    expect(() => issues(hostile)).not.toThrow();
    expect(issues(hostile).length).toBeGreaterThan(0);
  });
});

describe('puertas de verificación: umbrales de varias fuentes', () => {
  // El registro actual pide 1 fuente en todo; el mecanismo «al menos N» se prueba con un campo sintético.
  const two: ContentField = {
    key: 'overview.summary',
    group: 'overview',
    valueKind: 'text',
    sensitivity: 'general',
    evidence: { classes: ['official', 'scientific'], minCount: 2, maxAgeDays: 100 },
    maxValidityDays: null,
    appliesTo: 'all',
  };
  const ev = (n: number, over = {}) =>
    evidence({ id: `5b0c2a1e-8f0d-4c1b-9a53-0d6a3f2e1c0${String(n)}`, ...over });

  it('una sola fuente no basta si se piden dos', () => {
    expect(evidenceIssues(assertion({ evidence: [ev(1)] }), two)).toContain(
      'evidence_class_insufficient',
    );
  });

  it('dos fuentes de clases admitidas bastan', () => {
    expect(
      evidenceIssues(assertion({ evidence: [ev(1), ev(2, { sourceClass: 'scientific' })] }), two),
    ).toEqual([]);
  });

  it('una oficial y otra comercial NO suman dos', () => {
    const r = assertion({ evidence: [ev(1), ev(2, { sourceClass: 'commercial' })] });
    expect(evidenceIssues(r, two)).toContain('evidence_class_insufficient');
  });

  it('con dos fuentes, las dos deben estar dentro de la antigüedad máxima', () => {
    const old = ev(2, { retrievedAt: '2025-01-01T00:00:00Z' });
    expect(evidenceIssues(assertion({ evidence: [ev(1), old] }), two)).toContain('evidence_stale');
  });
});
