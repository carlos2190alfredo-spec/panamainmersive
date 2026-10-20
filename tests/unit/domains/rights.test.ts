import { describe, expect, it } from 'vitest';
import {
  evaluateRights,
  parsePolicies,
  policiesMatchSources,
  resolveMapExperience,
  type RightsPolicy,
} from '@/domains/geography/rights';
import { USED_SOURCES } from '@/domains/geography/sources';
import { RIGHTS_POLICIES as MAP_RIGHTS } from '@/lib/rights-policies';
import { allowedLayers } from '@/domains/geography/map-url-state';

const verified: RightsPolicy = { subject: 'x', status: 'verified', allowed: ['display'] };
const provisional: RightsPolicy = { subject: 'y', status: 'provisional', allowed: ['display'] };

describe('evaluador de derechos (deny-by-default)', () => {
  it('sin política → deniega', () => {
    expect(evaluateRights([], 'x', 'display', 'development')).toEqual({
      allowed: false,
      reason: 'no-policy',
      subject: 'x',
    });
  });

  it('una acción que la política no lista → deniega aunque sea verified', () => {
    expect(evaluateRights([verified], 'x', 'download', 'production')).toMatchObject({
      allowed: false,
      reason: 'action-not-allowed',
    });
  });

  it('verified → permite en cualquier entorno', () => {
    for (const env of ['development', 'staging', 'production'] as const) {
      expect(evaluateRights([verified], 'x', 'display', env)).toEqual({
        allowed: true,
        reason: 'verified',
      });
    }
  });

  it('provisional → permite fuera de producción y BLOQUEA en producción', () => {
    expect(evaluateRights([provisional], 'y', 'display', 'development').allowed).toBe(true);
    expect(evaluateRights([provisional], 'y', 'display', 'staging').allowed).toBe(true);
    expect(evaluateRights([provisional], 'y', 'display', 'production')).toMatchObject({
      allowed: false,
      reason: 'provisional-in-production',
    });
  });
});

describe('Experience Resolver v1 (mapa)', () => {
  it('hoy NINGUNA política es verified: en producción no se ofrece ni el mapa base ni el relieve', () => {
    expect(MAP_RIGHTS.every((p) => p.status === 'provisional')).toBe(true);
    const experience = resolveMapExperience('production', MAP_RIGHTS);
    expect(experience.basemap.allowed).toBe(false);
    expect(experience.terrain.allowed).toBe(false);
  });

  it('fuera de producción todo se ofrece (desarrollo local y staging)', () => {
    for (const env of ['development', 'staging'] as const) {
      const experience = resolveMapExperience(env, MAP_RIGHTS);
      expect(experience.basemap.allowed).toBe(true);
      expect(experience.terrain.allowed).toBe(true);
    }
  });

  it('el mapa base exige TODAS sus fuentes: si falta una política, se deniega', () => {
    const withoutGlyphs = MAP_RIGHTS.filter((p) => p.subject !== 'noto-sans-glyphs');
    expect(resolveMapExperience('development', withoutGlyphs).basemap).toMatchObject({
      allowed: false,
      reason: 'no-policy',
      subject: 'noto-sans-glyphs',
    });
  });

  it('con políticas verificadas se ofrece también en producción', () => {
    const allVerified = MAP_RIGHTS.map((p) => ({ ...p, status: 'verified' as const }));
    const experience = resolveMapExperience('production', allVerified);
    expect(experience.basemap.allowed).toBe(true);
    expect(experience.terrain.allowed).toBe(true);
  });

  it('las políticas y el registro de fuentes en uso son coherentes (sin fuentes huérfanas)', () => {
    expect(policiesMatchSources(MAP_RIGHTS)).toEqual([]);
    expect(policiesMatchSources(MAP_RIGHTS.filter((p) => p.subject !== 'overture'))).toEqual([
      'overture: en uso pero sin política de derechos',
    ]);
    expect(USED_SOURCES.map((s) => s.id).sort()).toEqual([
      'aws-terrain',
      'noto-sans-glyphs',
      'overture',
    ]);
  });

  it('Natural Earth ya no figura como fuente en uso (el basemap es solo Overture)', () => {
    expect(USED_SOURCES.some((s) => s.id === 'natural-earth')).toBe(false);
  });
});

describe('capas permitidas por derechos', () => {
  it('sin permiso para terceros, el relieve se descarta aunque venga en el enlace', () => {
    expect(allowedLayers(['protectedAreas', 'hillshade', 'terrain3d'], false)).toEqual([
      'protectedAreas',
    ]);
    expect(allowedLayers(['protectedAreas', 'hillshade'], true)).toEqual([
      'protectedAreas',
      'hillshade',
    ]);
  });
});

describe('documento de políticas compartido (TypeScript + Python)', () => {
  it('rechaza sujetos repetidos, acciones desconocidas y estados inválidos', () => {
    const base = {
      schema: 1,
      reviewedOn: '2026-10-20',
      note: 'x',
      policies: [{ subject: 'a', status: 'verified', allowed: ['display'], evidence: 'e' }],
    };
    expect(parsePolicies(base)).toHaveLength(1);
    expect(() =>
      parsePolicies({ ...base, policies: [...base.policies, ...base.policies] }),
    ).toThrow(/repetida/);
    expect(() =>
      parsePolicies({ ...base, policies: [{ ...base.policies[0], allowed: ['robar'] }] }),
    ).toThrow();
    expect(() =>
      parsePolicies({ ...base, policies: [{ ...base.policies[0], status: 'verified?' }] }),
    ).toThrow();
    expect(() => parsePolicies({ ...base, policies: [] })).toThrow();
  });
});
