import { describe, expect, it } from 'vitest';
import {
  EMPTY_SNAPSHOT,
  SnapshotError,
  parseSnapshot,
  snapshotAgeDays,
  snapshotIssues,
  snapshotToRecords,
  type PublishedSnapshot,
} from '@/domains/content/snapshot';
import rawPublished from '../../../../data/content/published.json';
import { elevation, entryRules, assertion, evidence, original, translation } from './fixtures';
import type { AssertionRecord } from '@/domains/content/assertion';

/** Lo que el exportador escribe de una afirmación: sin estado de flujo ni identidades de personas. */
function exported(a: AssertionRecord): PublishedSnapshot['assertions'][number] {
  return {
    id: a.id,
    destinationKey: a.destinationKey,
    fieldKey: a.fieldKey,
    version: a.version,
    sourceLocale: a.sourceLocale,
    quantity: a.quantity,
    texts: [...a.texts],
    confidence: a.confidence ?? 'low',
    verifiedAt: a.verifiedAt ?? '',
    validFrom: a.validFrom,
    validUntil: a.validUntil,
    evidence: [...a.evidence],
  };
}
const snap = (
  assertions: AssertionRecord[] = [],
  notices: PublishedSnapshot['notices'] = [],
): PublishedSnapshot => ({
  schema: 1,
  generatedAt: '2026-10-21T12:00:00Z',
  assertions: assertions.map(exported),
  notices,
});

describe('instantánea publicada', () => {
  it('el archivo versionado es válido y hoy está vacío: no hay contenido verificado', () => {
    const parsed = parseSnapshot(rawPublished);
    expect(parsed.assertions).toEqual([]);
    expect(parsed.notices).toEqual([]);
    expect(parsed.generatedAt).toBeNull();
    expect(parsed).toEqual(EMPTY_SNAPSHOT);
  });

  it('una instantánea con afirmaciones válidas se acepta y se convierte en registros sin personas', () => {
    const s = parseSnapshot(
      snap([
        assertion(),
        entryRules({ id: '9f5a1e74-3c6d-4b8a-8d43-6e1c2a7b9f32' }),
        elevation({ id: 'a06b2f85-4d7e-4c9b-9e54-7f2d3b8caf43' }),
      ]),
    );
    const records = snapshotToRecords(s);
    expect(records).toHaveLength(3);
    for (const r of records) {
      expect(r.authorId).toBeNull();
      expect(r.verifiedById).toBeNull();
      expect(r.status).toBe('verified');
      expect(r.supersededAt).toBeNull();
    }
  });

  it('no filtra identidades aunque el origen las llevara', () => {
    const json = JSON.stringify(snap([assertion()]));
    expect(json).not.toContain('aaaaaaaa-aaaa');
    expect(json).not.toContain('bbbbbbbb-bbbb');
    expect(json).not.toMatch(/authorId|verifiedById/);
  });

  it('rechaza campos desconocidos (estricta): nadie cuela datos por la forma', () => {
    const bad = { ...snap([assertion()]), extra: 1 };
    expect(() => parseSnapshot(bad)).toThrow(SnapshotError);
    const nested = snap([assertion()]);
    (nested.assertions[0] as Record<string, unknown>).authorId = 'x';
    expect(() => parseSnapshot(nested)).toThrow(SnapshotError);
  });

  it.each([
    null,
    undefined,
    0,
    'texto',
    [],
    {},
    { schema: 2, generatedAt: null, assertions: [], notices: [] },
    { schema: 1 },
  ])('rechaza una forma inválida: %j', (raw) => {
    expect(() => parseSnapshot(raw)).toThrow(SnapshotError);
  });

  it('rechaza destino o campo fuera de los registros', () => {
    const a = snap([assertion()]);
    expect(() =>
      parseSnapshot({ ...a, assertions: [{ ...a.assertions[0], destinationKey: 'atlantida' }] }),
    ).toThrow(SnapshotError);
    expect(() =>
      parseSnapshot({ ...a, assertions: [{ ...a.assertions[0], fieldKey: 'overview.invented' }] }),
    ).toThrow(SnapshotError);
  });

  it('un error nunca devuelve una instantánea parcial y lista los motivos', () => {
    try {
      parseSnapshot(snap([assertion({ evidence: [evidence({ sourceClass: 'commercial' })] })]));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SnapshotError);
      expect((e as SnapshotError).issues.join(' ')).toContain('evidence_class_insufficient');
    }
  });

  describe('semántica', () => {
    it('una afirmación que no supera las puertas hace fallar TODA la instantánea', () => {
      const s = snap([
        assertion(),
        entryRules({ id: '9f5a1e74-3c6d-4b8a-8d43-6e1c2a7b9f32', validUntil: null }),
      ]);
      expect(snapshotIssues(s).join(' ')).toContain('validity_missing');
      expect(() => parseSnapshot(s)).toThrow(SnapshotError);
    });

    it('rechaza dos vigentes para el mismo destino y campo', () => {
      const s = snap([
        assertion(),
        assertion({ id: '9f5a1e74-3c6d-4b8a-8d43-6e1c2a7b9f32', version: 2 }),
      ]);
      expect(snapshotIssues(s)).toContain(
        'boquete/overview.summary: más de una afirmación vigente',
      );
    });

    it('rechaza ids repetidos', () => {
      expect(snapshotIssues(snap([assertion(), assertion({ version: 2 })])).join(' ')).toContain(
        'id duplicado',
      );
    });

    it('rechaza traducciones no publicadas o automáticas, aunque el resto sea válido', () => {
      const draft = snap([assertion({ texts: [original(), translation({ status: 'draft' })] })]);
      expect(snapshotIssues(draft).join(' ')).toContain('no publicado');
      const ai = snap([
        assertion({ texts: [original(), translation({ provenance: 'ai_translation' })] }),
      ]);
      expect(snapshotIssues(ai).join(' ')).toContain('traducción automática');
    });

    it('rechaza un idioma repetido en los textos', () => {
      const s = snap([
        assertion({ texts: [original(), translation(), translation({ text: '[test] otra' })] }),
      ]);
      expect(snapshotIssues(s).join(' ')).toContain('idioma repetido');
    });

    it('rechaza un aviso junto a una afirmación vigente del mismo campo, y avisos repetidos', () => {
      const n = {
        destinationKey: 'boquete',
        fieldKey: 'overview.summary',
        state: 'DISPUTED',
      } as const;
      expect(snapshotIssues(snap([assertion()], [n])).join(' ')).toContain(
        'junto a una afirmación vigente',
      );
      expect(snapshotIssues(snap([], [n, n])).join(' ')).toContain('avisos repetidos');
    });

    it('un campo no aplicable al tipo de destino no se acepta', () => {
      const s = snap([elevation({ destinationKey: 'coiba' })]);
      expect(snapshotIssues(s).join(' ')).toContain('field_not_applicable');
    });

    it('acepta avisos válidos de campos sin afirmación', () => {
      const s = snap(
        [],
        [
          { destinationKey: 'boquete', fieldKey: 'safety.hazards', state: 'DISPUTED' },
          {
            destinationKey: 'boquete',
            fieldKey: 'restrictions.entry_rules',
            state: 'EXPIRED',
            verifiedAt: '2026-01-01T00:00:00Z',
            validUntil: '2026-06-01',
          },
        ],
      );
      expect(() => parseSnapshot(s)).not.toThrow();
    });
  });

  it('límites: textos y listas desmesurados se rechazan', () => {
    const big = snap([assertion({ texts: [original({ text: 'x'.repeat(4001) })] })]);
    expect(() => parseSnapshot(big)).toThrow(SnapshotError);
    const many = {
      ...EMPTY_SNAPSHOT,
      assertions: Array.from({ length: 5001 }, () => exported(assertion())),
    };
    expect(() => parseSnapshot(many)).toThrow(SnapshotError);
  });
});

describe('serialización y edad de la instantánea', () => {
  it('el archivo versionado está en el formato canónico (lo que escribiría el exportador)', async () => {
    const { readFileSync } = await import('node:fs');
    const { serializeSnapshot } = await import('@/domains/content/snapshot');
    const onDisk = readFileSync('data/content/published.json', 'utf8');
    expect(onDisk).toBe(serializeSnapshot(EMPTY_SNAPSHOT));
  });

  it('serializar es determinista, termina en salto de línea y se lee de vuelta idéntico', async () => {
    const { serializeSnapshot } = await import('@/domains/content/snapshot');
    const s = snap([assertion(), entryRules({ id: '9f5a1e74-3c6d-4b8a-8d43-6e1c2a7b9f32' })]);
    const text = serializeSnapshot(s);
    expect(text.endsWith('}\n')).toBe(true);
    expect(serializeSnapshot(s)).toBe(text);
    expect(parseSnapshot(JSON.parse(text))).toEqual(s);
  });

  it('serializar rechaza lo que no cumple el esquema (no escribe basura)', async () => {
    const { serializeSnapshot } = await import('@/domains/content/snapshot');
    const bad = { ...EMPTY_SNAPSHOT, schema: 2 } as unknown as PublishedSnapshot;
    expect(() => serializeSnapshot(bad)).toThrow();
  });

  it('sameSnapshotContent ignora solo la hora de exportación', async () => {
    const { sameSnapshotContent } = await import('@/domains/content/snapshot');
    const a = snap([assertion()]);
    expect(sameSnapshotContent(a, { ...a, generatedAt: '2030-01-01T00:00:00Z' })).toBe(true);
    expect(sameSnapshotContent(a, snap([]))).toBe(false);
    const changed = snap([assertion({ texts: [original({ text: '[prueba] otro' })] })]);
    expect(sameSnapshotContent(a, changed)).toBe(false);
    expect(
      sameSnapshotContent(
        a,
        snap(
          [assertion()],
          [{ destinationKey: 'boquete', fieldKey: 'safety.hazards', state: 'DISPUTED' }],
        ),
      ),
    ).toBe(false);
  });

  it('snapshotAgeDays: nula si nunca se exportó; días de calendario si sí', async () => {
    const { snapshotAgeDays } = await import('@/domains/content/snapshot');
    expect(snapshotAgeDays(EMPTY_SNAPSHOT, '2026-10-21')).toBeNull();
    const s = snap([]); // generatedAt 2026-10-21T12:00:00Z
    expect(snapshotAgeDays(s, '2026-10-21')).toBe(0);
    expect(snapshotAgeDays(s, '2026-11-04')).toBe(14);
    expect(snapshotAgeDays(s, 'mal')).toBeNull();
  });
});

/**
 * Revisión independiente (2.ª tanda): `generatedAt` y los avisos no pasan por ninguna puerta, y el cargador los
 * aceptaba con cualquier cadena. Un `generatedAt` basura rompía el render de cada ficha (`RangeError`), y un aviso con
 * `validUntil: '2026-13-45'` se mostraba como otra fecha. Un archivo editado a mano debe romper AL CARGAR.
 */
describe('instantánea: lo que no pasa por las puertas', () => {
  type Notice = PublishedSnapshot['notices'][number];
  const expired = (over: Partial<Extract<Notice, { state: 'EXPIRED' }>> = {}): Notice => ({
    destinationKey: 'boquete',
    fieldKey: 'overview.summary',
    state: 'EXPIRED',
    verifiedAt: '2026-06-01T12:00:00Z',
    validUntil: '2026-09-01',
    ...over,
  });
  const withNotices = (notices: Notice[]): PublishedSnapshot => snap([], notices);

  it('un aviso coherente se acepta (control positivo)', () => {
    expect(() => parseSnapshot(withNotices([expired()]))).not.toThrow();
    expect(() =>
      parseSnapshot(
        withNotices([{ destinationKey: 'boquete', fieldKey: 'safety.hazards', state: 'DISPUTED' }]),
      ),
    ).not.toThrow();
  });

  it.each(['ayer por la tarde', '2026-02-31T00:00:00Z', '2026-10-21', ''])(
    'generatedAt que no es un instante real se rechaza al cargar: «%s»',
    (generatedAt) => {
      expect(() => parseSnapshot({ ...snap([assertion()]), generatedAt })).toThrow(SnapshotError);
    },
  );

  it('generatedAt nulo solo es válido en la instantánea vacía (nunca exportada)', () => {
    expect(() => parseSnapshot(EMPTY_SNAPSHOT)).not.toThrow();
    expect(() => parseSnapshot({ ...snap([assertion()]), generatedAt: null })).toThrow(
      SnapshotError,
    );
    expect(() => parseSnapshot({ ...withNotices([expired()]), generatedAt: null })).toThrow(
      SnapshotError,
    );
  });

  it.each([
    ['verifiedAt que no es un instante', { verifiedAt: 'nunca' }],
    ['verifiedAt imposible', { verifiedAt: '2026-02-31T12:00:00Z' }],
    ['verifiedAt posterior a la exportación', { verifiedAt: '2026-10-22T00:00:00Z' }],
    ['validUntil que no existe en el calendario', { validUntil: '2026-13-45' }],
    ['validUntil que no existe (31 de febrero)', { validUntil: '2026-02-31' }],
    ['EXPIRED con vigencia que aún no ha vencido', { validUntil: '2099-01-01' }],
    ['EXPIRED con vigencia hasta el día de la exportación', { validUntil: '2026-10-21' }],
  ] as const)('aviso EXPIRED inválido: %s', (_name, over) => {
    expect(() => parseSnapshot(withNotices([expired({ ...over })]))).toThrow(SnapshotError);
  });

  it('un aviso de un campo que no aplica al destino se rechaza (también DISPUTED)', () => {
    // `facts.elevation_m` solo aplica a volcanes; Boquete es una localidad.
    for (const notice of [
      expired({ fieldKey: 'facts.elevation_m' }),
      { destinationKey: 'boquete', fieldKey: 'facts.elevation_m', state: 'DISPUTED' } as Notice,
    ]) {
      expect(() => parseSnapshot(withNotices([notice]))).toThrow(SnapshotError);
    }
  });

  it('una afirmación verificada «después» de la exportación se rechaza', () => {
    const a = assertion({ verifiedAt: '2026-10-22T00:00:00Z' });
    expect(() => parseSnapshot(snap([a]))).toThrow(SnapshotError);
  });

  it('un campo de texto con cantidad se rechaza (la BD lo impide con assertion_one_value_kind)', () => {
    const a = assertion({ quantity: { value: 5, unit: 'm' } });
    expect(() => parseSnapshot(snap([a]))).toThrow(SnapshotError);
  });

  it('una cantidad fuera del rango de la BD (< 1e12) se rechaza', () => {
    expect(() =>
      parseSnapshot(snap([elevation({ quantity: { value: 1e12, unit: 'm' } })])),
    ).toThrow(SnapshotError);
    expect(() =>
      parseSnapshot(snap([elevation({ quantity: { value: 999_999_999_999, unit: 'm' } })])),
    ).not.toThrow();
  });

  it('snapshotAgeDays cuenta el día de PANAMÁ de la exportación, no el día UTC escrito', () => {
    // 21:00 en Panamá del 21 de octubre = 02:00Z del 22: hoy (Panamá) es el 21 → edad 0, no −1.
    const late = { ...snap([]), generatedAt: '2026-10-22T02:00:00Z' };
    expect(snapshotAgeDays(late, '2026-10-21')).toBe(0);
    // Medianoche de Panamá (05:00Z) ya es el día siguiente.
    const midnight = { ...snap([]), generatedAt: '2026-10-22T05:00:00Z' };
    expect(snapshotAgeDays(midnight, '2026-10-22')).toBe(0);
    expect(snapshotAgeDays(midnight, '2026-10-21')).toBe(-1);
  });

  it('snapshotAgeDays no inventa una edad para un instante inválido', () => {
    expect(snapshotAgeDays({ ...snap([]), generatedAt: 'ayer' }, '2026-10-21')).toBeNull();
  });
});
