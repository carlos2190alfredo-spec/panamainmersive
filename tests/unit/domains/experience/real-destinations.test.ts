import { describe, expect, it } from 'vitest';
import {
  INTENTS,
  TEXT_ONLY,
  resolveExperience,
  type Chosen,
  type ExperienceInput,
  type ExperienceManifest,
  type ProviderState,
  type Representation,
} from '@/domains/experience/resolver';
import { resolveMapExperience } from '@/domains/geography/rights';
import {
  COVERAGE,
  COVERAGE_EXPIRES_AT,
  COVERAGE_OBSERVED_AT,
} from '@/domains/tourism/coverage-evidence';
import { DESTINATIONS, type DestinationEntry } from '@/domains/tourism/destinations';
import { RIGHTS_POLICIES } from '@/lib/rights-policies';

/**
 * Qué decide el Experience Resolver HOY con los datos REALES del proyecto: las nueve fichas, su evidencia de cobertura
 * (docs/coverage.md) y las políticas de derechos (`data/rights/policies.json`). No es una simulación: es lo que ocurriría
 * si se cableara. Los proveedores externos (Google 3D, Street View, Mapillary, KartaView) se declaran como lo que son:
 * previstos, **sin configurar**, sin política de derechos y con cobertura `UNKNOWN`.
 */
const PLANNED: readonly ProviderState[] = [
  {
    id: 'google-3d',
    capability: 'google3d',
    configured: false,
    health: 'unknown',
    budgetRemaining: null,
  },
  {
    id: 'street-view',
    capability: 'streetView',
    configured: false,
    health: 'unknown',
    budgetRemaining: null,
  },
  {
    id: 'mapillary',
    capability: 'streetImagery',
    configured: false,
    health: 'unknown',
    budgetRemaining: null,
  },
  {
    id: 'kartaview',
    capability: 'streetImagery',
    configured: false,
    health: 'unknown',
    budgetRemaining: null,
  },
];

function real(destination: DestinationEntry, over: Partial<ExperienceInput> = {}): ExperienceInput {
  return {
    env: 'development',
    today: COVERAGE_OBSERVED_AT,
    destination: { key: destination.key, kind: destination.kind },
    intent: 'explore',
    coverage: COVERAGE[destination.key],
    rights: RIGHTS_POLICIES,
    providers: PLANNED,
    content: { stories: 0, licensedMedia: 0 },
    device: {
      webgl: true,
      saveData: false,
      frameTimeP75Ms: null,
      glContextLosses: 0,
      tileErrorRate: null,
    },
    locale: 'es',
    camera: null,
    areaId: null,
    ...over,
  };
}

const EXPECTED_TODAY: Readonly<Record<string, Representation>> = {
  'panama-city': 'MAP_2D', // ciudad: MAP_2D (la 3D no está disponible)
  'casco-antiguo': 'MAP_2D',
  'panama-canal': 'MAP_2D',
  'el-valle-de-anton': 'TOPOGRAPHIC_TERRAIN', // tipo `locality`: terreno (burdo: Santa Catalina es costera, F5-1)
  boquete: 'TOPOGRAPHIC_TERRAIN',
  'volcan-baru': 'TOPOGRAPHIC_TERRAIN',
  'santa-catalina': 'TOPOGRAPHIC_TERRAIN',
  'bocas-del-toro': 'MAP_2D', // archipiélago: sin batimetría, el relieve no se promociona
  coiba: 'MAP_2D',
};

describe('el resolver con los nueve destinos reales (fuera de producción)', () => {
  it('hay una expectativa por cada destino del registro (si se añade uno, esta prueba lo exige)', () => {
    expect(DESTINATIONS.map((d) => d.key).sort()).toEqual(Object.keys(EXPECTED_TODAY).sort());
  });

  it.each(DESTINATIONS.map((d) => [d.key, d] as const))(
    '%s: la representación de hoy y por qué',
    (_key, d) => {
      const m = resolveExperience(real(d));
      expect(m.representation).toBe(EXPECTED_TODAY[d.key]);
      // la 3D es la primera preferencia de los nueve y hoy está excluida: toda elección actual es un fallback
      expect(m.why).toBe('fallback');
      // lo que se ofrece DEBAJO nunca es nada que hoy no tenga derechos, credencial ni cobertura
      for (const r of [m.representation, ...m.fallbacks]) {
        expect(['MAP_2D', 'TOPOGRAPHIC_TERRAIN']).toContain(r);
      }
      expect(m.providers).toEqual({});
    },
  );

  it.each(DESTINATIONS.map((d) => [d.key, d] as const))(
    '%s: la 3D fotorrealista queda excluida por TRES motivos independientes, y se dicen',
    (_key, d) => {
      const m = resolveExperience(real(d));
      const reasons =
        m.excluded.find((e) => e.representation === 'PHOTOREALISTIC_3D')?.reasons ?? [];
      expect(reasons).toContainEqual({ code: 'not-configured', provider: 'google-3d' });
      expect(reasons).toContainEqual({ code: 'rights', subject: 'google-3d', detail: 'no-policy' });
      expect(reasons).toContainEqual({
        code: 'coverage-unknown',
        capability: 'google3d',
        cause: 'unknown',
      });
    },
  );

  it.each(DESTINATIONS.map((d) => [d.key, d] as const))(
    '%s: pedir la calle se degrada y dice, proveedor por proveedor, por qué no',
    (_key, d) => {
      const m = resolveExperience(real(d, { intent: 'street' }));
      expect(['MAP_2D', 'TOPOGRAPHIC_TERRAIN']).toContain(m.representation);
      expect(m.why).toBe('fallback');
      const reasons = m.excluded.find((e) => e.representation === 'STREET_EXPLORER')?.reasons ?? [];
      for (const id of ['street-view', 'mapillary', 'kartaview']) {
        expect(reasons).toContainEqual({ code: 'not-configured', provider: id });
        expect(reasons).toContainEqual({ code: 'rights', subject: id, detail: 'no-policy' });
      }
      // Street View depende de `streetView` (sin credencial) y las imágenes abiertas, de `streetImagery` (host bloqueado)
      expect(reasons).toContainEqual({
        code: 'coverage-unknown',
        capability: 'streetView',
        cause: 'unknown',
      });
      expect(reasons).toContainEqual({
        code: 'coverage-unknown',
        capability: 'streetImagery',
        cause: 'unknown',
      });
    },
  );

  it('pedir terreno da terreno en los nueve (su cobertura es VERIFIED o PARTIAL), también en islas', () => {
    for (const d of DESTINATIONS) {
      expect(resolveExperience(real(d, { intent: 'terrain' })).representation).toBe(
        'TOPOGRAPHIC_TERRAIN',
      );
    }
  });

  it('con las políticas y la cobertura de hoy NADA mejor que terreno o mapa es alcanzable, pase lo que pase', () => {
    const reachable = new Set<Chosen>();
    for (const d of DESTINATIONS) {
      for (const intent of INTENTS) {
        for (const env of ['development', 'staging'] as const) {
          for (const webgl of [true, false]) {
            for (const saveData of [true, false]) {
              const m = resolveExperience(
                real(d, { intent, env, device: { ...real(d).device, webgl, saveData } }),
              );
              reachable.add(m.representation);
            }
          }
        }
      }
    }
    expect([...reachable].sort()).toEqual(['MAP_2D', 'TOPOGRAPHIC_TERRAIN', TEXT_ONLY].sort());
  });
});

describe('en producción, con las políticas provisionales de hoy', () => {
  it('ningún destino tiene mapa: texto, y coincide con lo que `resolveMapExperience` ya decide para la página', () => {
    const mapBlocked = !resolveMapExperience('production', RIGHTS_POLICIES).basemap.allowed;
    for (const d of DESTINATIONS) {
      const m = resolveExperience(real(d, { env: 'production' }));
      expect(m.representation === TEXT_ONLY).toBe(mapBlocked);
      expect(m.why).toBe('text-only');
      expect(m.excluded.find((e) => e.representation === 'MAP_2D')?.reasons[0]).toMatchObject({
        code: 'rights',
        detail: 'provisional-in-production',
      });
    }
    // hoy lo está (L-01): si un día no lo estuviera, esta prueba obliga a releer la tabla
    expect(mapBlocked).toBe(true);
  });
});

describe('cuando caduque la evidencia de cobertura (docs/coverage.md: 90 días)', () => {
  const textFor = (m: ExperienceManifest) =>
    m.excluded.find((e) => e.representation === 'TOPOGRAPHIC_TERRAIN')?.reasons;

  it('el día anterior a la caducidad todo sigue igual; el día de la caducidad el terreno pasa a «sin saber», no a «no hay»', () => {
    const before = '2027-01-17';
    expect(COVERAGE_EXPIRES_AT).toBe('2027-01-18');
    for (const d of DESTINATIONS) {
      expect(resolveExperience(real(d, { today: before })).representation).toBe(
        EXPECTED_TODAY[d.key],
      );
    }
    for (const d of DESTINATIONS) {
      const m = resolveExperience(real(d, { today: COVERAGE_EXPIRES_AT }));
      // todas pasan a MAP_2D (el mapa base no depende de esa evidencia)
      expect(m.representation).toBe('MAP_2D');
      if (EXPECTED_TODAY[d.key] === 'TOPOGRAPHIC_TERRAIN') {
        expect(textFor(m)).toEqual([
          { code: 'coverage-unknown', capability: 'terrain', cause: 'expired' },
        ]);
      }
    }
  });

  it('es una consecuencia real y vigilable: sin reobservar la cobertura, el terreno desaparece ese día (T-19)', () => {
    const afterAll = DESTINATIONS.map((d) =>
      resolveExperience(real(d, { today: '2027-02-01', intent: 'terrain' })),
    );
    for (const m of afterAll) {
      expect(m.representation).toBe('MAP_2D');
      expect(textFor(m)?.[0]).toMatchObject({ code: 'coverage-unknown', cause: 'expired' });
    }
  });
});
