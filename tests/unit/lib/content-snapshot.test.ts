import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssertionRecord } from '@/domains/content/assertion';
import { DESTINATION_KEYS } from '@/domains/tourism/destinations';
import { PUBLISHED_CONTENT, contentFor } from '@/lib/content-snapshot';
import { assertion, elevation, evidence } from '../domains/content/fixtures';

describe('contenido publicado (cargador)', () => {
  it('hoy no hay contenido verificado: la instantánea está vacía y nunca se ha exportado', () => {
    expect(PUBLISHED_CONTENT.assertions).toEqual([]);
    expect(PUBLISHED_CONTENT.notices).toEqual([]);
    expect(PUBLISHED_CONTENT.generatedAt).toBeNull();
  });

  it('cada destino devuelve listas vacías: no se inventa nada', () => {
    for (const key of DESTINATION_KEYS) {
      const c = contentFor(key);
      expect(c.assertions).toEqual([]);
      expect(c.notices).toEqual([]);
    }
  });
});

/**
 * El cargador con CONTENIDO. Las pruebas de arriba solo ejercen la instantánea vacía de hoy y dejarán de valer con la
 * primera exportación real; estas prueban lo que importa del cargador con datos: filtra por destino, valida (rompe el
 * build ante un archivo inválido, no publica «vacío» en silencio) y no filtra identidades.
 */
describe('contenido publicado (cargador) con contenido', () => {
  const FILE = '../../../data/content/published.json';
  const exported = (a: AssertionRecord) => ({
    id: a.id,
    destinationKey: a.destinationKey,
    fieldKey: a.fieldKey,
    version: a.version,
    sourceLocale: a.sourceLocale,
    quantity: a.quantity,
    texts: [...a.texts],
    confidence: a.confidence,
    verifiedAt: a.verifiedAt,
    validFrom: a.validFrom,
    validUntil: a.validUntil,
    evidence: [...a.evidence],
  });
  const document = (over: Record<string, unknown> = {}) => ({
    schema: 1,
    generatedAt: '2026-10-21T12:00:00.000Z',
    assertions: [
      exported(assertion()),
      exported(elevation({ id: 'a06b2f85-4d7e-4c9b-9e54-7f2d3b8caf43' })),
    ],
    notices: [
      { destinationKey: 'coiba', fieldKey: 'safety.hazards', state: 'DISPUTED' },
      {
        destinationKey: 'boquete',
        fieldKey: 'restrictions.entry_rules',
        state: 'EXPIRED',
        verifiedAt: '2026-01-01T00:00:00Z',
        validUntil: '2026-06-01',
      },
    ],
    ...over,
  });
  async function load(data: unknown) {
    vi.resetModules();
    vi.doMock(FILE, () => ({ default: data }));
    try {
      return await import('@/lib/content-snapshot');
    } finally {
      vi.doUnmock(FILE);
    }
  }
  afterEach(() => {
    vi.resetModules();
  });

  it('devuelve a cada destino SOLO lo suyo (afirmaciones y avisos), y nada a los demás', async () => {
    const { contentFor } = await load(document());
    expect(contentFor('boquete').assertions.map((a) => a.fieldKey)).toEqual(['overview.summary']);
    expect(contentFor('boquete').notices.map((n) => n.fieldKey)).toEqual([
      'restrictions.entry_rules',
    ]);
    expect(contentFor('volcan-baru').assertions.map((a) => a.fieldKey)).toEqual([
      'facts.elevation_m',
    ]);
    expect(contentFor('volcan-baru').notices).toEqual([]);
    expect(contentFor('coiba').assertions).toEqual([]);
    expect(contentFor('coiba').notices.map((n) => n.state)).toEqual(['DISPUTED']);
    expect(contentFor('bocas-del-toro').assertions).toEqual([]);
    expect(contentFor('bocas-del-toro').notices).toEqual([]);
  });

  it('los registros del cargador no llevan personas (la instantánea no las tiene)', async () => {
    const { contentFor } = await load(document());
    for (const r of contentFor('boquete').assertions) {
      expect(r.authorId).toBeNull();
      expect(r.verifiedById).toBeNull();
      expect(r.status).toBe('verified');
    }
  });

  it.each([
    [
      'un enlace no seguro',
      (d: ReturnType<typeof document>) => ({
        ...d,
        assertions: [{ ...d.assertions[0], evidence: [evidence({ url: 'http://example.org/x' })] }],
      }),
    ],
    ['un campo desconocido', (d: ReturnType<typeof document>) => ({ ...d, extra: 1 })],
    [
      'una exportación con fecha imposible',
      (d: ReturnType<typeof document>) => ({ ...d, generatedAt: 'ayer' }),
    ],
    [
      'un aviso de un campo que no aplica',
      (d: ReturnType<typeof document>) => ({
        ...d,
        notices: [{ destinationKey: 'boquete', fieldKey: 'facts.elevation_m', state: 'DISPUTED' }],
      }),
    ],
  ])(
    'un archivo inválido (%s) hace FALLAR la carga: no se publica «vacío» en silencio',
    async (_name, corrupt) => {
      // Por nombre: tras `resetModules` el módulo se recarga y la clase lanzada no es la importada arriba.
      await expect(load(corrupt(document()))).rejects.toMatchObject({ name: 'SnapshotError' });
    },
  );
});
