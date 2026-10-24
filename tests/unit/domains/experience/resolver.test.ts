import { describe, expect, it } from 'vitest';
import {
  INTENTS,
  MIN_HOLD_MS,
  REPRESENTATIONS,
  TEXT_ONLY,
  advancePrevious,
  preferenceOrder,
  resolveExperience,
  type Chosen,
  type ExperienceInput,
  type ExperienceManifest,
  type ExclusionReason,
  type PreviousExperience,
  type ProviderState,
  type Representation,
} from '@/domains/experience/resolver';
import type { CameraState } from '@/domains/geography/camera';
import { evaluateRights, type RightsPolicy, type SiteEnv } from '@/domains/geography/rights';
import {
  effectiveStatus,
  type Capability,
  type CoverageEvidence,
  type CoverageStatus,
} from '@/domains/tourism/coverage-evidence';
import { DESTINATION_KINDS, type DestinationKind } from '@/domains/tourism/destinations';

// ---------------------------------------------------------------------------------------------------------------------
// Construcción de entradas
// ---------------------------------------------------------------------------------------------------------------------
const TODAY = '2026-11-01';
const EXPIRES = '2027-01-18';
const CAMERA: CameraState = {
  lon: -79.5,
  lat: 8.98,
  altitudeM: 5000,
  headingDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
};

const coverage = (
  capability: Capability,
  status: CoverageStatus,
  expiresAt = EXPIRES,
): CoverageEvidence => ({
  capability,
  status,
  observation: 'reasonNotEvaluated',
  evidence: ['E-00'],
  observedAt: '2026-10-20',
  expiresAt,
});

const policy = (
  subject: string,
  status: 'verified' | 'provisional' = 'verified',
): RightsPolicy => ({
  subject,
  status,
  allowed: ['display', 'transform', 'redistribute'],
});

/** Políticas de lo que el mapa usa HOY, en el estado que se indique. */
const mapPolicies = (status: 'verified' | 'provisional' = 'verified'): RightsPolicy[] => [
  policy('overture', status),
  policy('noto-sans-glyphs', status),
  policy('aws-terrain', status),
];

const provider = (
  over: Partial<ProviderState> & Pick<ProviderState, 'id' | 'capability'>,
): ProviderState => ({
  configured: true,
  health: 'ok',
  budgetRemaining: null,
  ...over,
});

function input(over: Partial<ExperienceInput> = {}): ExperienceInput {
  return {
    env: 'development',
    today: TODAY,
    destination: { key: 'panama-city', kind: 'city' },
    intent: 'explore',
    coverage: [coverage('terrain', 'VERIFIED')],
    rights: mapPolicies(),
    providers: [],
    content: { stories: 0, licensedMedia: 0 },
    device: {
      webgl: true,
      saveData: false,
      frameTimeP75Ms: null,
      glContextLosses: 0,
      tileErrorRate: null,
    },
    locale: 'es',
    camera: CAMERA,
    areaId: null,
    ...over,
  };
}

/** Un mundo en el que TODO está permitido y disponible: sirve para ver que cada exclusión se debe a una causa concreta. */
function everything(over: Partial<ExperienceInput> = {}): ExperienceInput {
  return input({
    coverage: [
      coverage('terrain', 'VERIFIED'),
      coverage('google3d', 'VERIFIED'),
      coverage('openSatellite', 'VERIFIED'),
      coverage('streetView', 'VERIFIED'),
      coverage('streetImagery', 'VERIFIED'),
    ],
    rights: [
      ...mapPolicies(),
      policy('google-3d'),
      policy('open-satellite'),
      policy('street-view'),
      policy('mapillary'),
    ],
    providers: [
      provider({ id: 'google-3d', capability: 'google3d' }),
      provider({ id: 'open-satellite', capability: 'openSatellite' }),
      provider({ id: 'street-view', capability: 'streetView' }),
      provider({ id: 'mapillary', capability: 'streetImagery' }),
    ],
    content: { stories: 2, licensedMedia: 3 },
    ...over,
  });
}

const reasonsOf = (m: ExperienceManifest, r: Representation): readonly ExclusionReason[] =>
  m.excluded.find((e) => e.representation === r)?.reasons ?? [];

// ---------------------------------------------------------------------------------------------------------------------
describe('orden de preferencia', () => {
  it('nunca repite, siempre acaba en MAP_2D y pone primero lo que pide la intención', () => {
    for (const kind of DESTINATION_KINDS) {
      for (const intent of INTENTS) {
        const order = preferenceOrder(kind, intent);
        expect(new Set(order).size).toBe(order.length);
        expect(order.at(-1)).toBe('MAP_2D');
        for (const r of order) expect(REPRESENTATIONS).toContain(r);
      }
    }
    expect(preferenceOrder('city', 'street')[0]).toBe('STREET_EXPLORER');
    expect(preferenceOrder('city', 'story')[0]).toBe('PANORAMA_STORY');
    expect(preferenceOrder('city', 'photos')[0]).toBe('PHOTO_EXPLORER');
    expect(preferenceOrder('island', 'terrain').slice(0, 2)).toEqual([
      'TOPOGRAPHIC_TERRAIN',
      'SATELLITE_TERRAIN',
    ]);
  });

  it('según el tipo de destino (tabla H): una ciudad no promociona el relieve; una montaña, sí', () => {
    expect(preferenceOrder('city', 'explore')).toEqual(['PHOTOREALISTIC_3D', 'MAP_2D']);
    expect(preferenceOrder('volcano', 'explore')).toEqual([
      'PHOTOREALISTIC_3D',
      'SATELLITE_TERRAIN',
      'TOPOGRAPHIC_TERRAIN',
      'MAP_2D',
    ]);
    expect(preferenceOrder('island', 'explore')).not.toContain('TOPOGRAPHIC_TERRAIN');
  });
});

describe('elección con todo disponible', () => {
  it('una ciudad usa la 3D fotorrealista; una montaña, la 3D, y sin ella, el satélite con terreno', () => {
    const city = resolveExperience(everything());
    expect(city).toMatchObject({ representation: 'PHOTOREALISTIC_3D', why: 'preferred' });
    expect(city.providers).toEqual({ google3d: 'google-3d' });

    const mountain = resolveExperience(
      everything({
        destination: { key: 'volcan-baru', kind: 'volcano' },
        providers: [
          provider({ id: 'open-satellite', capability: 'openSatellite' }),
          provider({ id: 'google-3d', capability: 'google3d', health: 'down' }),
        ],
      }),
    );
    expect(mountain).toMatchObject({ representation: 'SATELLITE_TERRAIN', why: 'fallback' });
    expect(reasonsOf(mountain, 'PHOTOREALISTIC_3D')).toEqual([
      { code: 'provider-down', provider: 'google-3d' },
    ]);
  });

  it('la intención gobierna: pedir calle da la calle; si no se puede, se degrada con motivo', () => {
    expect(resolveExperience(everything({ intent: 'street' }))).toMatchObject({
      representation: 'STREET_EXPLORER',
      why: 'preferred',
    });
    expect(resolveExperience(everything({ intent: 'story' })).representation).toBe(
      'PANORAMA_STORY',
    );
    expect(resolveExperience(everything({ intent: 'photos' })).representation).toBe(
      'PHOTO_EXPLORER',
    );
    const degraded = resolveExperience(everything({ intent: 'street', providers: [] }));
    expect(degraded.representation).toBe('MAP_2D');
    expect(degraded.why).toBe('fallback');
    expect(reasonsOf(degraded, 'STREET_EXPLORER')).toEqual([
      { code: 'no-provider', capability: 'streetView' },
    ]);
  });
});

describe('cada motivo de exclusión, observable y exacto', () => {
  const three = (m: ExperienceManifest) => reasonsOf(m, 'PHOTOREALISTIC_3D');
  const one3d = (over: Partial<ExperienceInput>) => resolveExperience(everything(over));
  const only3d = (p: Partial<ProviderState>) =>
    one3d({ providers: [provider({ id: 'google-3d', capability: 'google3d', ...p })] });

  it('sin política de derechos: denegado por defecto', () => {
    const m = one3d({ rights: mapPolicies() });
    expect(three(m)).toEqual([{ code: 'rights', subject: 'google-3d', detail: 'no-policy' }]);
  });

  it('política provisional en producción: denegado; fuera de producción, permitido', () => {
    const rights = [...mapPolicies('verified'), policy('google-3d', 'provisional')];
    expect(three(one3d({ env: 'production', rights }))).toEqual([
      { code: 'rights', subject: 'google-3d', detail: 'provisional-in-production' },
    ]);
    expect(resolveExperience(everything({ env: 'staging', rights })).representation).toBe(
      'PHOTOREALISTIC_3D',
    );
  });

  it('una acción no listada en la política: denegado', () => {
    const rights = [
      ...mapPolicies(),
      { subject: 'google-3d', status: 'verified', allowed: ['cache'] } as RightsPolicy,
    ];
    expect(three(one3d({ rights }))).toEqual([
      { code: 'rights', subject: 'google-3d', detail: 'action-not-allowed' },
    ]);
  });

  it('sin configuración, proveedor caído y cuota agotada', () => {
    expect(three(only3d({ configured: false }))).toEqual([
      { code: 'not-configured', provider: 'google-3d' },
    ]);
    expect(three(only3d({ health: 'down' }))).toEqual([
      { code: 'provider-down', provider: 'google-3d' },
    ]);
    expect(three(only3d({ budgetRemaining: 0 }))).toEqual([
      { code: 'over-budget', provider: 'google-3d' },
    ]);
    expect(three(only3d({ budgetRemaining: -5 }))).toEqual([
      { code: 'over-budget', provider: 'google-3d' },
    ]);
  });

  it('degradado, sin medir o con cuota restante: NO excluye', () => {
    for (const p of [
      { health: 'degraded' },
      { health: 'unknown' },
      { budgetRemaining: 1 },
      { budgetRemaining: null },
    ] as const) {
      expect(only3d(p).representation).toBe('PHOTOREALISTIC_3D');
    }
  });

  it('varios motivos a la vez se dicen todos, no solo el primero', () => {
    const m = one3d({
      rights: mapPolicies(),
      providers: [
        provider({ id: 'google-3d', capability: 'google3d', configured: false, health: 'down' }),
      ],
    });
    expect(
      three(m)
        .map((r) => r.code)
        .sort(),
    ).toEqual(['not-configured', 'provider-down', 'rights']);
  });

  it('cobertura: ausente ≠ caducada ≠ sin medir ≠ error ≠ no disponible', () => {
    const cov = (rows: CoverageEvidence[]) => three(one3d({ coverage: rows }));
    expect(cov([])).toEqual([
      { code: 'coverage-unknown', capability: 'google3d', cause: 'no-evidence' },
    ]);
    expect(cov([coverage('google3d', 'UNKNOWN')])).toEqual([
      { code: 'coverage-unknown', capability: 'google3d', cause: 'unknown' },
    ]);
    expect(cov([coverage('google3d', 'ERROR')])).toEqual([
      { code: 'coverage-unknown', capability: 'google3d', cause: 'error' },
    ]);
    expect(cov([coverage('google3d', 'UNAVAILABLE')])).toEqual([
      { code: 'coverage-unavailable', capability: 'google3d' },
    ]);
    // Una evidencia VERIFIED caducada pasa a «sin saber», nunca a «no disponible» (ADR-0007).
    expect(cov([coverage('google3d', 'VERIFIED', '2026-10-31')])).toEqual([
      { code: 'coverage-unknown', capability: 'google3d', cause: 'expired' },
    ]);
    expect(cov([coverage('google3d', 'VERIFIED', TODAY)])).toEqual([
      { code: 'coverage-unknown', capability: 'google3d', cause: 'expired' },
    ]);
    expect(cov([coverage('google3d', 'VERIFIED', '2026-11-02')])).toEqual([]);
    expect(cov([coverage('google3d', 'PARTIAL')])).toEqual([]);
  });
});

describe('WebGL, ahorro de datos y contenido', () => {
  const dev = (over: Partial<ExperienceInput['device']>) => ({ ...input().device, ...over });

  it('sin WebGL no hay mapa; solo sobrevive lo que no lo necesita (fotos con licencia)', () => {
    const none = resolveExperience(input({ device: dev({ webgl: false }) }));
    expect(none).toMatchObject({ representation: TEXT_ONLY, why: 'text-only', quality: 'LITE' });
    expect(reasonsOf(none, 'MAP_2D')).toEqual([{ code: 'no-webgl' }]);

    const photos = resolveExperience(
      everything({ intent: 'photos', device: dev({ webgl: false }) }),
    );
    expect(photos.representation).toBe('PHOTO_EXPLORER');
    expect(reasonsOf(photos, 'MAP_2D')).toEqual([{ code: 'no-webgl' }]);
  });

  it('el ahorro de datos manual deja solo MAP_2D y baja la calidad a LITE', () => {
    const m = resolveExperience(everything({ device: dev({ saveData: true }) }));
    expect(m).toMatchObject({ representation: 'MAP_2D', quality: 'LITE', why: 'fallback' });
    expect(reasonsOf(m, 'PHOTOREALISTIC_3D')).toContainEqual({ code: 'data-saver' });
    // lo que no está en el orden de preferencia de ese destino e intención no se «considera»: no figura
    expect(reasonsOf(m, 'PHOTO_EXPLORER')).toEqual([]);
    const photos = resolveExperience(
      everything({ intent: 'photos', device: dev({ saveData: true }) }),
    );
    expect(reasonsOf(photos, 'PHOTO_EXPLORER')).toEqual([{ code: 'data-saver' }]);
  });

  it('sin historias ni fotos con licencia no hay PANORAMA_STORY ni PHOTO_EXPLORER, y se dice', () => {
    const m = resolveExperience(
      everything({ intent: 'story', content: { stories: 0, licensedMedia: 0 } }),
    );
    expect(reasonsOf(m, 'PANORAMA_STORY')).toEqual([{ code: 'no-content', kind: 'stories' }]);
    const p = resolveExperience(
      everything({ intent: 'photos', content: { stories: 0, licensedMedia: 0 } }),
    );
    expect(reasonsOf(p, 'PHOTO_EXPLORER')).toEqual([{ code: 'no-content', kind: 'media' }]);
  });

  it('sin derechos sobre el mapa base (producción con política provisional), nada visual: texto', () => {
    const m = resolveExperience(input({ env: 'production', rights: mapPolicies('provisional') }));
    expect(m.representation).toBe(TEXT_ONLY);
    expect(reasonsOf(m, 'MAP_2D')[0]).toMatchObject({
      code: 'rights',
      detail: 'provisional-in-production',
    });
  });
});

describe('varios proveedores de la misma capacidad', () => {
  it('manda el orden de entrada; si el primero falla, se usa el siguiente y se dice cuál', () => {
    const rights = [...everything().rights, policy('kartaview')];
    const base = {
      rights,
      intent: 'street' as const,
      coverage: everything().coverage,
    };
    const ok = resolveExperience(
      everything({
        ...base,
        providers: [
          provider({ id: 'mapillary', capability: 'streetImagery' }),
          provider({ id: 'kartaview', capability: 'streetImagery' }),
        ],
      }),
    );
    expect(ok.providers).toEqual({ streetImagery: 'mapillary' });
    const fallThrough = resolveExperience(
      everything({
        ...base,
        providers: [
          provider({ id: 'mapillary', capability: 'streetImagery', health: 'down' }),
          provider({ id: 'kartaview', capability: 'streetImagery' }),
        ],
      }),
    );
    expect(fallThrough).toMatchObject({ representation: 'STREET_EXPLORER' });
    expect(fallThrough.providers).toEqual({ streetImagery: 'kartaview' });
  });

  it('STREET_EXPLORER acepta Street View o imágenes abiertas; PANORAMA_STORY solo imágenes abiertas', () => {
    const sv = resolveExperience(
      everything({
        intent: 'street',
        providers: [provider({ id: 'street-view', capability: 'streetView' })],
      }),
    );
    expect(sv.representation).toBe('STREET_EXPLORER');
    const story = resolveExperience(
      everything({
        intent: 'story',
        providers: [provider({ id: 'street-view', capability: 'streetView' })],
      }),
    );
    expect(story.representation).not.toBe('PANORAMA_STORY');
    expect(reasonsOf(story, 'PANORAMA_STORY')).toEqual([
      { code: 'no-provider', capability: 'streetImagery' },
    ]);
  });
});

describe('se conserva siempre lo que la persona tiene', () => {
  const scenarios: [string, ExperienceInput][] = [
    ['todo disponible', everything()],
    ['solo mapa', input()],
    ['sin WebGL', input({ device: { ...input().device, webgl: false } })],
    ['producción bloqueada', input({ env: 'production', rights: mapPolicies('provisional') })],
    ['ahorro de datos', everything({ device: { ...input().device, saveData: true } })],
    ['con área seleccionada', everything({ areaId: 'overture-123', intent: 'street' })],
  ];

  it.each(scenarios)('%s: idioma, cámara y selección salen idénticos', (_name, scenario) => {
    const m = resolveExperience(scenario);
    expect(m.locale).toBe(scenario.locale);
    expect(m.camera).toBe(scenario.camera);
    expect(m.selection).toEqual({
      destinationKey: scenario.destination.key,
      areaId: scenario.areaId,
    });
  });

  it('también sin cámara (null) y en cualquiera de los cinco idiomas', () => {
    for (const locale of ['es', 'en', 'pt', 'fr', 'de'] as const) {
      const m = resolveExperience(input({ locale, camera: null }));
      expect(m.locale).toBe(locale);
      expect(m.camera).toBeNull();
    }
  });
});

describe('pureza y determinismo', () => {
  const deepFreeze = <T>(value: T): T => {
    if (value && typeof value === 'object') {
      for (const v of Object.values(value)) deepFreeze(v);
      Object.freeze(value);
    }
    return value;
  };

  it('la misma entrada da exactamente la misma salida, y la entrada no se modifica', () => {
    const frozen = deepFreeze(everything({ areaId: 'a' }));
    const first = resolveExperience(frozen);
    const second = resolveExperience(frozen);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Propiedades con un generador determinista (sin dependencias; misma semilla, mismos casos)
// ---------------------------------------------------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAPABILITY_POOL: Capability[] = [
  'terrain',
  'google3d',
  'openSatellite',
  'streetView',
  'streetImagery',
];
const STATUSES: CoverageStatus[] = ['UNKNOWN', 'VERIFIED', 'PARTIAL', 'UNAVAILABLE', 'ERROR'];
const PROVIDER_POOL: { id: string; capability: Capability }[] = [
  { id: 'google-3d', capability: 'google3d' },
  { id: 'open-satellite', capability: 'openSatellite' },
  { id: 'street-view', capability: 'streetView' },
  { id: 'mapillary', capability: 'streetImagery' },
  { id: 'kartaview', capability: 'streetImagery' },
];
const SUBJECTS = ['overture', 'noto-sans-glyphs', 'aws-terrain', ...PROVIDER_POOL.map((p) => p.id)];

function randomInput(rand: () => number): ExperienceInput {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const chance = (p: number) => rand() < p;
  const kind: DestinationKind = pick(DESTINATION_KINDS);
  const coverageRows: CoverageEvidence[] = [];
  for (const capability of CAPABILITY_POOL) {
    if (chance(0.85))
      coverageRows.push(coverage(capability, pick(STATUSES), pick(['2026-10-30', EXPIRES])));
  }
  const rights: RightsPolicy[] = [];
  for (const subject of SUBJECTS) {
    if (chance(0.75)) {
      rights.push({
        subject,
        status: pick(['verified', 'provisional'] as const),
        allowed: chance(0.9) ? ['display', 'transform', 'redistribute'] : ['cache'],
      });
    }
  }
  const providers: ProviderState[] = PROVIDER_POOL.filter(() => chance(0.8)).map((p) => ({
    ...p,
    configured: chance(0.8),
    health: pick(['ok', 'degraded', 'down', 'unknown'] as const),
    budgetRemaining: pick([null, 0, 5, -1]),
  }));
  return {
    env: pick(['development', 'staging', 'production'] as SiteEnv[]),
    today: TODAY,
    destination: { key: 'panama-city', kind },
    intent: pick(INTENTS),
    coverage: coverageRows,
    rights,
    providers,
    content: { stories: pick([0, 3]), licensedMedia: pick([0, 3]) },
    device: {
      webgl: chance(0.85),
      saveData: chance(0.2),
      frameTimeP75Ms: pick([null, 10, 20, 40]),
      glContextLosses: pick([0, 0, 0, 1]),
      tileErrorRate: pick([null, 0, 0.5]),
    },
    locale: pick(['es', 'en', 'pt', 'fr', 'de'] as const),
    camera: chance(0.5) ? CAMERA : null,
    areaId: chance(0.3) ? 'overture-1' : null,
  };
}

/** Posición en el orden de preferencia; TEXT_ONLY es lo peor. */
const rank = (m: ExperienceManifest, i: ExperienceInput): number =>
  m.representation === TEXT_ONLY
    ? Number.MAX_SAFE_INTEGER
    : preferenceOrder(i.destination.kind, i.intent).indexOf(m.representation);

describe('propiedades sobre 3 000 entradas aleatorias (semilla fija)', () => {
  const rand = mulberry32(20261024);
  const cases = Array.from({ length: 3000 }, () => randomInput(rand));

  it('lo elegido nunca está excluido y lo excluido siempre dice por qué', () => {
    for (const c of cases) {
      const m = resolveExperience(c);
      const order = preferenceOrder(c.destination.kind, c.intent);
      expect(m.excluded.map((e) => e.representation)).not.toContain(m.representation);
      for (const e of m.excluded) {
        expect(e.reasons.length).toBeGreaterThan(0);
        expect(order).toContain(e.representation);
      }
      if (m.representation !== TEXT_ONLY) expect(order).toContain(m.representation);
    }
  });

  it('sin historia previa se elige lo primero elegible y los fallbacks son lo que queda por debajo, en orden', () => {
    for (const c of cases) {
      const m = resolveExperience(c);
      const order = preferenceOrder(c.destination.kind, c.intent);
      const excludedSet = new Set(m.excluded.map((e) => e.representation));
      const eligible = order.filter((r) => !excludedSet.has(r));
      if (eligible.length === 0) {
        expect(m.representation).toBe(TEXT_ONLY);
        expect(m.fallbacks).toEqual([]);
        expect(m.why).toBe('text-only');
        continue;
      }
      expect(m.representation).toBe(eligible[0]);
      expect(m.fallbacks).toEqual(eligible.slice(1));
      expect(m.why).toBe(eligible[0] === order[0] ? 'preferred' : 'fallback');
      if (eligible.includes('MAP_2D') && m.representation !== 'MAP_2D')
        expect(m.fallbacks.at(-1)).toBe('MAP_2D');
    }
  });

  it('SOLIDEZ: un proveedor externo elegido cumple, con un cálculo independiente, todo lo que se le exige', () => {
    for (const c of cases) {
      const m = resolveExperience(c);
      for (const [capability, id] of Object.entries(m.providers) as [Capability, string][]) {
        const p = c.providers.find((x) => x.id === id);
        expect(p, `${id} no está en la entrada`).toBeDefined();
        if (!p) continue;
        expect(p.capability).toBe(capability);
        expect(p.configured).toBe(true);
        expect(p.health).not.toBe('down');
        expect(p.budgetRemaining === null || p.budgetRemaining > 0).toBe(true);
        expect(evaluateRights(c.rights, id, 'display', c.env).allowed).toBe(true);
        const row = c.coverage.find((x) => x.capability === capability);
        expect(row).toBeDefined();
        if (row) expect(['VERIFIED', 'PARTIAL']).toContain(effectiveStatus(row, c.today));
      }
      // y lo que se elige que necesita WebGL, lo tiene; lo pesado no sale con ahorro de datos
      if (m.representation !== TEXT_ONLY && m.representation !== 'PHOTO_EXPLORER')
        expect(c.device.webgl).toBe(true);
      if (m.representation !== TEXT_ONLY && m.representation !== 'MAP_2D')
        expect(c.device.saveData).toBe(false);
    }
  });

  it('MONOTONÍA: restringir algo nunca MEJORA lo elegido', () => {
    const restrictions: [string, (c: ExperienceInput) => ExperienceInput][] = [
      [
        'quitar todas las políticas externas',
        (c) => ({
          ...c,
          rights: c.rights.filter((p) =>
            ['overture', 'noto-sans-glyphs', 'aws-terrain'].includes(p.subject),
          ),
        }),
      ],
      [
        'proveedores caídos',
        (c) => ({ ...c, providers: c.providers.map((p) => ({ ...p, health: 'down' as const })) }),
      ],
      [
        'cuotas agotadas',
        (c) => ({ ...c, providers: c.providers.map((p) => ({ ...p, budgetRemaining: 0 })) }),
      ],
      [
        'sin configurar',
        (c) => ({ ...c, providers: c.providers.map((p) => ({ ...p, configured: false })) }),
      ],
      ['ahorro de datos', (c) => ({ ...c, device: { ...c.device, saveData: true } })],
      ['sin WebGL', (c) => ({ ...c, device: { ...c.device, webgl: false } })],
      ['cobertura caducada', (c) => ({ ...c, today: '2030-01-01' })],
      ['sin contenido', (c) => ({ ...c, content: { stories: 0, licensedMedia: 0 } })],
      ['producción', (c) => ({ ...c, env: 'production' as const })],
    ];
    for (const c of cases) {
      const before = rank(resolveExperience(c), c);
      for (const [name, restrict] of restrictions) {
        const after = rank(resolveExperience(restrict(c)), c);
        expect(after, name).toBeGreaterThanOrEqual(before);
      }
    }
  });

  it('en producción, con las políticas del mapa provisionales, nunca se elige un mapa', () => {
    const mapBased: Chosen[] = ['MAP_2D', 'TOPOGRAPHIC_TERRAIN', 'SATELLITE_TERRAIN'];
    for (const c of cases) {
      const prod: ExperienceInput = {
        ...c,
        env: 'production',
        rights: [
          ...c.rights.filter(
            (p) => !['overture', 'noto-sans-glyphs', 'aws-terrain'].includes(p.subject),
          ),
          ...mapPolicies('provisional'),
        ],
      };
      expect(mapBased).not.toContain(resolveExperience(prod).representation);
    }
  });

  it('idioma, cámara y selección se conservan en todos los casos', () => {
    for (const c of cases) {
      const m = resolveExperience(c);
      expect(m.locale).toBe(c.locale);
      expect(m.camera).toBe(c.camera);
      expect(m.selection).toEqual({ destinationKey: c.destination.key, areaId: c.areaId });
    }
  });

  it('el generador cubre de verdad el espacio (no pasa por no mirar)', () => {
    const chosen = new Set<Chosen>(cases.map((c) => resolveExperience(c).representation));
    // al menos: texto, mapa, y varias de las demás
    expect(chosen.has(TEXT_ONLY)).toBe(true);
    expect(chosen.has('MAP_2D')).toBe(true);
    expect(chosen.size).toBeGreaterThanOrEqual(5);
    const codes = new Set(
      cases.flatMap((c) =>
        resolveExperience(c).excluded.flatMap((e) => e.reasons.map((r) => r.code)),
      ),
    );
    for (const code of [
      'rights',
      'not-configured',
      'no-provider',
      'coverage-unavailable',
      'coverage-unknown',
      'provider-down',
      'over-budget',
      'no-webgl',
      'data-saver',
      'no-content',
    ]) {
      expect(codes.has(code as ExclusionReason['code']), code).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('histéresis de la representación', () => {
  const noGoogle = (): ExperienceInput =>
    everything({ providers: everything().providers.filter((p) => p.id !== 'google-3d') });

  /** Una resolución y el avance de la memoria, como lo haría quien llame. */
  const step = (
    scenario: ExperienceInput,
    previous: PreviousExperience | undefined,
    elapsedMs: number,
  ) => {
    const withPrev = previous ? { ...scenario, previous } : scenario;
    const manifest = resolveExperience(withPrev);
    return { manifest, next: advancePrevious(manifest, withPrev, elapsedMs) };
  };
  const settled = (representation: Chosen): PreviousExperience => ({
    representation,
    quality: 'STANDARD',
    intent: 'explore',
    destinationKey: 'panama-city',
    heldMs: 60_000,
    qualityHeldMs: 60_000,
    eligibleForMs: { MAP_2D: 60_000 },
  });

  it('una mejora espera a que la mejor lleve `MIN_HOLD_MS` elegible sin interrupción', () => {
    let previous: PreviousExperience | undefined = settled('MAP_2D');
    let switchedAtSecond = -1;
    for (let second = 0; second < 40 && switchedAtSecond < 0; second += 1) {
      const { manifest, next } = step(everything(), previous, 1000);
      if (manifest.representation === 'PHOTOREALISTIC_3D') switchedAtSecond = second;
      else expect(manifest).toMatchObject({ representation: 'MAP_2D', why: 'hysteresis-hold' });
      previous = next;
    }
    // La primera vez que se ve elegible cuenta 0; a los 15 s de estabilidad se promueve.
    expect(switchedAtSecond).toBe(1 + MIN_HOLD_MS / 1000);
  });

  it('lo pospuesto no se ofrece como fallback (un fallback es a lo que se degrada)', () => {
    const { manifest } = step(everything(), settled('MAP_2D'), 1000);
    expect(manifest.why).toBe('hysteresis-hold');
    expect(manifest.fallbacks).toEqual([]);
    expect(manifest.eligible).toContain('PHOTOREALISTIC_3D');
  });

  it('tampoco se sube si la mejor es estable pero la actual aún no aguantó', () => {
    const previous: PreviousExperience = {
      ...settled('MAP_2D'),
      heldMs: MIN_HOLD_MS - 1,
      eligibleForMs: { MAP_2D: 60_000, PHOTOREALISTIC_3D: 60_000 },
    };
    expect(resolveExperience({ ...everything(), previous })).toMatchObject({
      representation: 'MAP_2D',
      why: 'hysteresis-hold',
    });
    expect(
      resolveExperience({ ...everything(), previous: { ...previous, heldMs: MIN_HOLD_MS } })
        .representation,
    ).toBe('PHOTOREALISTIC_3D');
  });

  it('empeorar es INMEDIATO: si lo actual deja de ser elegible, se degrada sin esperar', () => {
    const current = resolveExperience(everything());
    expect(current.representation).toBe('PHOTOREALISTIC_3D');
    const { manifest } = step(noGoogle(), { ...settled('PHOTOREALISTIC_3D'), heldMs: 0 }, 1000);
    expect(manifest).toMatchObject({ representation: 'MAP_2D', why: 'fallback' });
  });

  it('un cambio de intención o de destino es una orden de la persona: no se retrasa', () => {
    const prev = { ...settled('MAP_2D'), heldMs: 0 };
    expect(
      resolveExperience({ ...everything(), previous: { ...prev, intent: 'street' } })
        .representation,
    ).toBe('PHOTOREALISTIC_3D');
    expect(
      resolveExperience({ ...everything(), previous: { ...prev, destinationKey: 'boquete' } })
        .representation,
    ).toBe('PHOTOREALISTIC_3D');
  });

  it('un proveedor que parpadea cada segundo NO hace oscilar la representación', () => {
    let previous: PreviousExperience | undefined;
    let last: Chosen | null = null;
    let switches = 0;
    for (let second = 0; second < 600; second += 1) {
      const up = second % 2 === 0;
      const providers = everything().providers.map((p) =>
        p.id === 'google-3d' ? { ...p, health: up ? ('ok' as const) : ('down' as const) } : p,
      );
      const { manifest, next } = step(everything({ providers }), previous, 1000);
      if (last !== null && manifest.representation !== last) switches += 1;
      last = manifest.representation;
      previous = next;
    }
    // Sin histéresis serían 599 cambios. Solo hay uno: en el primer segundo, sin historia, se elige 3D y se degrada al caer.
    expect(switches).toBe(1);
  });

  it('con un parpadeo lento, cada subida llega SOLO tras 15 s de estabilidad y cada bajada es inmediata', () => {
    let previous: PreviousExperience | undefined;
    let last: Chosen | null = null;
    let upSince = -1;
    const switchesUp: number[] = [];
    for (let second = 0; second < 600; second += 1) {
      const up = Math.floor(second / 40) % 2 === 0; // 40 s arriba, 40 s abajo
      if (up && upSince < 0) upSince = second;
      if (!up) upSince = -1;
      const providers = everything().providers.map((p) =>
        p.id === 'google-3d' ? { ...p, health: up ? ('ok' as const) : ('down' as const) } : p,
      );
      const { manifest, next } = step(everything({ providers }), previous, 1000);
      if (last !== null && manifest.representation !== last) {
        if (manifest.representation === 'PHOTOREALISTIC_3D') {
          switchesUp.push(second - upSince);
        } else {
          // bajada: el mismo segundo en que cayó el proveedor
          expect(up).toBe(false);
          expect(Math.floor(second / 40) % 2).toBe(1);
          expect(second % 40).toBe(0);
        }
      }
      last = manifest.representation;
      previous = next;
    }
    expect(switchesUp.length).toBeGreaterThan(2);
    for (const stableFor of switchesUp)
      expect(stableFor).toBeGreaterThanOrEqual(MIN_HOLD_MS / 1000);
  });

  it('`advancePrevious` reinicia contadores al cambiar y no arrastra lo que dejó de ser elegible', () => {
    const scenario = everything({ providers: everything().providers });
    const m1 = resolveExperience(scenario);
    const p1 = advancePrevious(m1, scenario, 1000);
    expect(p1).toMatchObject({ representation: 'PHOTOREALISTIC_3D', heldMs: 0 });
    expect(p1.eligibleForMs.PHOTOREALISTIC_3D).toBe(0);
    const s2: ExperienceInput = { ...scenario, previous: p1 };
    const p2 = advancePrevious(resolveExperience(s2), s2, 4000);
    expect(p2.heldMs).toBe(4000);
    expect(p2.eligibleForMs.PHOTOREALISTIC_3D).toBe(4000);
    // cae el proveedor: la representación cambia y lo que ya no es elegible desaparece
    const s3: ExperienceInput = { ...noGoogle(), previous: p2 };
    const m3 = resolveExperience(s3);
    const p3 = advancePrevious(m3, s3, 1000);
    expect(p3.representation).toBe('MAP_2D');
    expect(p3.heldMs).toBe(0);
    expect(p3.eligibleForMs.PHOTOREALISTIC_3D).toBeUndefined();
    // otro destino o intención: se parte de cero
    const s4: ExperienceInput = { ...noGoogle(), intent: 'terrain', previous: p3 };
    const p4 = advancePrevious(resolveExperience(s4), s4, 5000);
    expect(p4.heldMs).toBe(0);
    expect(p4.qualityHeldMs).toBe(0);
  });

  it('`advancePrevious` cuenta el tiempo en la calidad ACTUAL: al cambiar de calidad vuelve a cero', () => {
    const base = everything({ device: { ...input().device, frameTimeP75Ms: 8 } });
    const previous: PreviousExperience = {
      ...settled('PHOTOREALISTIC_3D'),
      quality: 'STANDARD',
      heldMs: 40_000,
      qualityHeldMs: MIN_HOLD_MS,
      eligibleForMs: { PHOTOREALISTIC_3D: 60_000 },
    };
    const scenario: ExperienceInput = { ...base, previous };
    const manifest = resolveExperience(scenario);
    expect(manifest.quality).toBe('HIGH'); // subió (aguantó lo bastante)
    const next = advancePrevious(manifest, scenario, 1000);
    expect(next.heldMs).toBe(41_000); // la representación sigue siendo la misma
    expect(next.qualityHeldMs).toBe(0); // pero la calidad es nueva: empieza a contar
    // y si no cambia, sigue acumulando
    const again = advancePrevious(manifest, { ...scenario, previous: next }, 1000);
    expect(again.qualityHeldMs).toBe(1000);
  });

  it('la calidad con histéresis solo se aplica si la representación no cambió', () => {
    const base = everything({ device: { ...input().device, frameTimeP75Ms: 8 } });
    expect(resolveExperience(base).quality).toBe('HIGH');
    const same = (over: Partial<PreviousExperience>): PreviousExperience => ({
      ...settled('PHOTOREALISTIC_3D'),
      eligibleForMs: { PHOTOREALISTIC_3D: 60_000 },
      ...over,
    });
    // aún no aguantó en STANDARD lo bastante para subir
    expect(resolveExperience({ ...base, previous: same({ qualityHeldMs: 100 }) }).quality).toBe(
      'STANDARD',
    );
    expect(
      resolveExperience({ ...base, previous: same({ qualityHeldMs: MIN_HOLD_MS }) }).quality,
    ).toBe('HIGH');
    // otra representación anterior: se parte de cero
    expect(
      resolveExperience({
        ...base,
        previous: { ...same({ qualityHeldMs: 100 }), representation: 'MAP_2D' },
      }).quality,
    ).toBe('HIGH');
  });
});
