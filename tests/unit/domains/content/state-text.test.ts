import { describe, expect, it } from 'vitest';
import { fieldState } from '@/domains/content/state';
import { resolveText } from '@/domains/content/text';
import { buildContentView, hasRequiredFields } from '@/domains/content/completeness';
import { CONTENT_FIELDS, getField, type ContentField } from '@/domains/content/fields';
import type { AssertionRecord, FieldNotice } from '@/domains/content/assertion';
import { LOCALES } from '@/i18n/locales';
import {
  TODAY,
  assertion,
  elevation,
  entryRules,
  evidence,
  original,
  translation,
} from './fixtures';

const summary = getField('overview.summary') as ContentField;
const rules = getField('restrictions.entry_rules') as ContentField;
const state = (a: AssertionRecord[], n: FieldNotice[] = [], f = summary, today = TODAY) =>
  fieldState(a, n, f, 'locality', today);

describe('estado derivado de un campo', () => {
  it('sin nada: desconocido por no investigado (ausencia de verificación, no de existencia)', () => {
    expect(state([])).toEqual({ status: 'UNKNOWN', reason: 'not_investigated' });
  });

  it('borradores, revisiones y rechazadas NO cambian el estado público', () => {
    for (const status of ['draft', 'in_review', 'rejected', 'retracted'] as const) {
      expect(state([assertion({ status })]).status).toBe('UNKNOWN');
    }
  });

  it('una afirmación que no supera las puertas no se muestra aunque diga «verified»', () => {
    expect(state([assertion({ evidence: [] })]).status).toBe('UNKNOWN');
    expect(state([assertion({ evidence: [evidence({ sourceClass: 'commercial' })] })]).status).toBe(
      'UNKNOWN',
    );
  });

  it('verificada y vigente', () => {
    const s = state([assertion()]);
    expect(s.status).toBe('VERIFIED');
    if (s.status === 'VERIFIED') expect(s.validUntil).toBeNull();
  });

  it('sin vigencia (hecho estable) nunca caduca, ni con una fecha de referencia lejana', () => {
    expect(state([assertion()], [], summary, '2099-12-31').status).toBe('VERIFIED');
  });

  it('el último día de vigencia sigue vigente; al día siguiente vence', () => {
    const a = entryRules({ validUntil: '2026-10-21' });
    expect(state([a], [], rules, '2026-10-21').status).toBe('VERIFIED');
    expect(state([a], [], rules, '2026-10-22')).toEqual({
      status: 'EXPIRED',
      verifiedAt: a.verifiedAt,
      validUntil: '2026-10-21',
    });
  });

  it('lo vencido no entrega el contenido', () => {
    const s = state([entryRules({ validUntil: '2026-10-01' })], [], rules);
    expect(s.status).toBe('EXPIRED');
    expect(JSON.stringify(s)).not.toContain('[prueba]');
  });

  it('gana la versión más nueva; una reemplazada se ignora', () => {
    const v1 = assertion({
      version: 1,
      texts: [original({ text: '[prueba] v1' })],
      supersededAt: '2026-10-10T00:00:00Z',
    });
    const v2 = assertion({
      version: 2,
      id: '8e4f0d63-2b5c-4a7f-9c32-5d0b1f6a8e21',
      texts: [original({ text: '[prueba] v2' })],
    });
    const s = state([v1, v2]);
    expect(s.status === 'VERIFIED' && s.assertion.version).toBe(2);
    expect(state([v1]).status).toBe('UNKNOWN');
  });

  it('si por error hubiera dos vigentes, gana la versión más nueva (no el orden de llegada)', () => {
    const v1 = assertion({ version: 1, texts: [original({ text: '[prueba] v1' })] });
    const v2 = assertion({
      version: 2,
      id: '8e4f0d63-2b5c-4a7f-9c32-5d0b1f6a8e21',
      texts: [original({ text: '[prueba] v2' })],
    });
    for (const order of [
      [v1, v2],
      [v2, v1],
    ]) {
      const s = state(order);
      expect(s.status === 'VERIFIED' && s.assertion.version).toBe(2);
    }
  });

  it('una disputa más nueva que lo vigente oculta el contenido', () => {
    const v1 = assertion({ version: 1 });
    const v2 = assertion({
      version: 2,
      id: '8e4f0d63-2b5c-4a7f-9c32-5d0b1f6a8e21',
      status: 'disputed',
    });
    expect(state([v1, v2])).toEqual({ status: 'DISPUTED' });
  });

  it('una disputa más vieja que lo vigente no lo oculta', () => {
    const old = assertion({ version: 1, status: 'disputed' });
    const now = assertion({ version: 2, id: '8e4f0d63-2b5c-4a7f-9c32-5d0b1f6a8e21' });
    expect(state([old, now]).status).toBe('VERIFIED');
  });

  it('los avisos públicos: EXPIRED y DISPUTED sin contenido', () => {
    const expired: FieldNotice = {
      destinationKey: 'boquete',
      fieldKey: 'restrictions.entry_rules',
      state: 'EXPIRED',
      verifiedAt: '2026-01-01T00:00:00Z',
      validUntil: '2026-06-01',
    };
    const disputed: FieldNotice = {
      destinationKey: 'boquete',
      fieldKey: 'restrictions.entry_rules',
      state: 'DISPUTED',
    };
    expect(state([], [expired], rules)).toEqual({
      status: 'EXPIRED',
      verifiedAt: expired.verifiedAt,
      validUntil: '2026-06-01',
    });
    expect(state([], [disputed], rules)).toEqual({ status: 'DISPUTED' });
    expect(state([], [expired, disputed], rules)).toEqual({ status: 'DISPUTED' });
  });

  it('un aviso de OTRO campo no contamina este', () => {
    const other: FieldNotice = {
      destinationKey: 'boquete',
      fieldKey: 'safety.hazards',
      state: 'DISPUTED',
    };
    expect(state([], [other]).status).toBe('UNKNOWN');
  });

  it('campo no aplicable al tipo de destino', () => {
    const f = getField('facts.elevation_m') as ContentField;
    expect(fieldState([elevation()], [], f, 'island', TODAY)).toEqual({
      status: 'UNKNOWN',
      reason: 'not_applicable',
    });
    expect(fieldState([elevation()], [], f, 'volcano', TODAY).status).toBe('VERIFIED');
  });

  it('una fecha de referencia inválida lanza: nunca se adivina «hoy»', () => {
    expect(() => state([], [], summary, 'hoy')).toThrow(RangeError);
    expect(() => state([], [], summary, '2026-02-31')).toThrow(RangeError);
  });

  it('propiedad: VERIFIED nunca aparece sin pasar las puertas (fuzz determinista)', () => {
    let seed = 20261021;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
    for (let i = 0; i < 400; i++) {
      const a = entryRules({
        status: pick([
          'draft',
          'in_review',
          'verified',
          'disputed',
          'rejected',
          'retracted',
        ] as const),
        validUntil: pick([
          '2026-09-01',
          '2026-10-21',
          '2027-03-01',
          '2028-01-01',
          null,
          '2026-02-31',
        ]),
        confidence: pick(['low', 'medium', 'high', null] as const),
        supersededAt: pick([null, '2026-10-10T00:00:00Z']),
        verifiedAt: pick(['2026-10-01T15:00:00Z', null, 'basura']),
        evidence: pick([
          [],
          [evidence()],
          [evidence({ sourceClass: 'community' })],
          [evidence({ stance: 'contradicts' })],
        ]),
      });
      const s = state([a], [], rules);
      if (s.status === 'VERIFIED') {
        expect(a.status).toBe('verified');
        expect(a.supersededAt).toBeNull();
        expect(a.evidence.some((e) => e.stance === 'contradicts')).toBe(false);
        expect(a.confidence).not.toBeNull();
        expect(s.validUntil === null || s.validUntil >= TODAY).toBe(true);
      }
    }
  });
});

describe('texto por idioma sin fingir traducción', () => {
  const en = (over = {}) => translation(over);

  it('en el idioma de origen se muestra el original, sin marca de traducción', () => {
    expect(resolveText(assertion(), 'es')).toMatchObject({
      kind: 'exact',
      locale: 'es',
      translated: false,
    });
  });

  it('una traducción humana publicada se muestra y se marca como traducida', () => {
    const r = resolveText(assertion({ texts: [original(), en()] }), 'en');
    expect(r).toMatchObject({
      kind: 'exact',
      locale: 'en',
      translated: true,
      text: '[test] original text',
    });
  });

  it.each([
    ['sin traducción', [] as ReturnType<typeof en>[], 'no_translation'],
    ['en borrador', [en({ status: 'draft' })], 'translation_not_published'],
    [
      'traducción automática sin revisar',
      [en({ status: 'machine_translated', provenance: 'ai_translation' })],
      'translation_not_published',
    ],
    ['revisada pero no publicada', [en({ status: 'reviewed' })], 'translation_not_published'],
    ['desactualizada', [en({ status: 'outdated' })], 'translation_outdated'],
  ] as const)('%s → se muestra el original en español y se dice por qué', (_n, extra, reason) => {
    const r = resolveText(assertion({ texts: [original(), ...extra] }), 'en');
    expect(r).toEqual({
      kind: 'original_fallback',
      locale: 'es',
      text: '[prueba] texto original',
      reason,
    });
  });

  it('una traducción automática marcada «published» por error de datos NO se muestra', () => {
    const r = resolveText(
      assertion({ texts: [original(), en({ provenance: 'ai_translation', status: 'published' })] }),
      'en',
    );
    expect(r.kind).toBe('original_fallback');
  });

  it('sin original no hay nada que mostrar, ni siquiera una traducción', () => {
    expect(resolveText(assertion({ texts: [en()] }), 'en')).toEqual({ kind: 'none' });
  });

  it('cada idioma resuelve sin lanzar y nunca devuelve el texto de otro idioma distinto del original', () => {
    const a = assertion({ texts: [original(), en()] });
    for (const l of LOCALES) {
      const r = resolveText(a, l);
      if (r.kind === 'exact' && l !== 'es') expect(r.text).toBe(en().text);
      if (r.kind === 'original_fallback') expect(r.text).toBe(original().text);
    }
  });
});

describe('vista de contenido de un destino', () => {
  it('sin afirmaciones: nada verificado y todos los campos aplicables como desconocidos, en el orden del registro', () => {
    const v = buildContentView([], [], 'locality', 'es', TODAY);
    expect(v.verified).toEqual([]);
    expect(v.unknown.map((f) => f.key)).toEqual(
      CONTENT_FIELDS.filter((f) => f.appliesTo === 'all').map((f) => f.key),
    );
    expect(hasRequiredFields(v)).toBe(false);
  });

  it('un volcán incluye la elevación entre lo desconocido; una localidad no', () => {
    expect(buildContentView([], [], 'volcano', 'es', TODAY).unknown.map((f) => f.key)).toContain(
      'facts.elevation_m',
    );
    expect(
      buildContentView([], [], 'locality', 'es', TODAY).unknown.map((f) => f.key),
    ).not.toContain('facts.elevation_m');
  });

  it('separa verificado, vencido y en disputa, y cada campo cae en un solo grupo', () => {
    const v = buildContentView(
      [assertion(), entryRules({ validUntil: '2026-10-01' })],
      [{ destinationKey: 'boquete', fieldKey: 'safety.hazards', state: 'DISPUTED' }],
      'locality',
      'es',
      TODAY,
    );
    expect(v.verified.map((x) => x.field.key)).toEqual(['overview.summary']);
    expect(v.expired.map((x) => x.field.key)).toEqual(['restrictions.entry_rules']);
    expect(v.disputed.map((x) => x.key)).toEqual(['safety.hazards']);
    const all = [
      ...v.verified.map((x) => x.field.key),
      ...v.expired.map((x) => x.field.key),
      ...v.disputed.map((x) => x.key),
      ...v.unknown.map((x) => x.key),
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(CONTENT_FIELDS.filter((f) => f.appliesTo === 'all').length);
  });

  it('los elementos verificados traen solo las fuentes que respaldan y su confianza', () => {
    const v = buildContentView([assertion({ confidence: 'high' })], [], 'locality', 'es', TODAY);
    expect(v.verified[0]).toMatchObject({
      confidence: 'high',
      sources: [expect.objectContaining({ stance: 'supports' })],
    });
  });

  it('indexable solo con resumen verificado EN ESE idioma: el original en otro idioma no cuenta', () => {
    const a = [assertion({ texts: [original(), translation()] })];
    expect(hasRequiredFields(buildContentView(a, [], 'locality', 'es', TODAY))).toBe(true);
    expect(hasRequiredFields(buildContentView(a, [], 'locality', 'en', TODAY))).toBe(true);
    expect(hasRequiredFields(buildContentView(a, [], 'locality', 'pt', TODAY))).toBe(false);
    const onlyOriginal = [assertion()];
    expect(hasRequiredFields(buildContentView(onlyOriginal, [], 'locality', 'fr', TODAY))).toBe(
      false,
    );
  });

  it('un resumen vencido o en disputa no hace indexable la página', () => {
    const disputed: FieldNotice = {
      destinationKey: 'boquete',
      fieldKey: 'overview.summary',
      state: 'DISPUTED',
    };
    expect(hasRequiredFields(buildContentView([], [disputed], 'locality', 'es', TODAY))).toBe(
      false,
    );
  });

  it('una cantidad verificada se entrega con su unidad y sin texto', () => {
    const v = buildContentView([elevation()], [], 'volcano', 'es', TODAY);
    expect(v.verified[0]).toMatchObject({ text: null, quantity: { value: 3475, unit: 'm' } });
  });
});

describe('ciclo editorial', () => {
  it('lo verificado nunca vuelve atrás y lo terminal no sale', async () => {
    const { ASSERTION_STATUSES, ASSERTION_TRANSITIONS, canTransition } =
      await import('@/domains/content/assertion');
    for (const to of ASSERTION_STATUSES) {
      expect(canTransition('verified', to)).toBe(to === 'disputed' || to === 'retracted');
      expect(canTransition('rejected', to)).toBe(false);
      expect(canTransition('retracted', to)).toBe(false);
    }
    // nadie llega a «verified» sin pasar por revisión, y una disputa no se «resuelve» volviendo a verificada
    expect(
      Object.entries(ASSERTION_TRANSITIONS)
        .filter(([, t]) => t.includes('verified'))
        .map(([f]) => f),
    ).toEqual(['in_review']);
    expect(canTransition('disputed', 'verified')).toBe(false);
    expect(canTransition('draft', 'verified')).toBe(false);
  });
});

describe('estado y sensibilidad de la página', () => {
  it('weakestStatus elige el menos revisado; contentStatusFor es published solo con resumen exacto', async () => {
    const { weakestStatus, contentStatusFor, pageSensitivity } =
      await import('@/domains/content/completeness');
    expect(weakestStatus('published', 'machine_translated')).toBe('machine_translated');
    expect(weakestStatus('machine_translated', 'published')).toBe('machine_translated');
    expect(weakestStatus('reviewed', 'published')).toBe('reviewed');
    expect(weakestStatus('outdated', 'draft')).toBe('outdated');
    expect(weakestStatus('published', 'published')).toBe('published');

    const exact = buildContentView([assertion()], [], 'locality', 'es', TODAY);
    const fallback = buildContentView([assertion()], [], 'locality', 'en', TODAY);
    expect(contentStatusFor(exact)).toBe('published');
    expect(contentStatusFor(fallback)).toBe('draft');
    expect(contentStatusFor(buildContentView([], [], 'locality', 'es', TODAY))).toBe('draft');

    const safety = assertion({ fieldKey: 'safety.hazards', validUntil: '2026-12-01' });
    expect(pageSensitivity([exact])).toBe('general');
    expect(pageSensitivity([exact, buildContentView([safety], [], 'locality', 'es', TODAY)])).toBe(
      'safety',
    );
  });
});
