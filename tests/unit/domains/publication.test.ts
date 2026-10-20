import { describe, expect, it } from 'vitest';
import {
  TRANSLATION_STATUSES,
  decideIndexing,
  isHumanReviewed,
  requiresHumanReview,
  type IndexingInput,
} from '@/domains/editorial/publication';

const ok: IndexingInput = {
  status: 'published',
  sensitivity: 'general',
  siteEnv: 'production',
  hasRequiredFields: true,
};

describe('política de publicación (docs/i18n.md §6)', () => {
  it('solo un contenido publicado, completo y en producción es indexable', () => {
    expect(decideIndexing(ok)).toEqual({ indexable: true, reason: 'ok' });
  });

  it('fuera de producción NADA es indexable, ni siquiera lo publicado', () => {
    for (const siteEnv of ['development', 'staging'] as const) {
      expect(decideIndexing({ ...ok, siteEnv })).toEqual({ indexable: false, reason: 'not_production' });
    }
  });

  it('no se indexan páginas vacías', () => {
    expect(decideIndexing({ ...ok, hasRequiredFields: false }).reason).toBe('missing_required_fields');
  });

  it('una traducción automática no es indexable por defecto', () => {
    expect(decideIndexing({ ...ok, status: 'machine_translated' })).toEqual({
      indexable: false,
      reason: 'machine_translated_not_allowed',
    });
  });

  it('la excepción para traducción automática solo vale para contenido NO sensible', () => {
    expect(
      decideIndexing({ ...ok, status: 'machine_translated', allowMachineTranslatedGeneral: true }).indexable,
    ).toBe(true);
    for (const sensitivity of ['safety', 'restrictions', 'legal'] as const) {
      const d = decideIndexing({
        ...ok,
        status: 'machine_translated',
        sensitivity,
        allowMachineTranslatedGeneral: true,
      });
      expect(d, sensitivity).toEqual({ indexable: false, reason: 'sensitive_requires_human_review' });
    }
  });

  it('seguridad, restricciones y legal exigen revisión humana: ninguna bandera lo anula', () => {
    for (const sensitivity of ['safety', 'restrictions', 'legal'] as const) {
      expect(requiresHumanReview(sensitivity)).toBe(true);
      for (const status of ['draft', 'machine_translated', 'outdated'] as const) {
        expect(
          decideIndexing({ ...ok, status, sensitivity, allowMachineTranslatedGeneral: true }).indexable,
          `${sensitivity}/${status}`,
        ).toBe(false);
      }
      expect(decideIndexing({ ...ok, status: 'published', sensitivity }).indexable).toBe(true);
    }
  });

  it('borrador y desactualizado no son publicables', () => {
    expect(decideIndexing({ ...ok, status: 'draft' }).reason).toBe('status_not_publishable');
    expect(decideIndexing({ ...ok, status: 'outdated' }).reason).toBe('status_not_publishable');
  });

  it('`reviewed` solo se indexa si la política del sitio lo declara', () => {
    expect(decideIndexing({ ...ok, status: 'reviewed' }).reason).toBe('reviewed_not_indexed_by_policy');
    expect(decideIndexing({ ...ok, status: 'reviewed', indexReviewed: true }).indexable).toBe(true);
  });

  it('solo reviewed y published cuentan como revisión humana', () => {
    const reviewed = TRANSLATION_STATUSES.filter(isHumanReviewed);
    expect(reviewed).toEqual(['reviewed', 'published']);
  });
});
