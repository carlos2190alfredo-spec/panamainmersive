import type { Locale } from '@/i18n/locales';
import type { CameraState } from '@/domains/geography/camera';
import {
  evaluateAll,
  resolveMapExperience,
  type RightsDecision,
  type RightsPolicy,
  type SiteEnv,
} from '@/domains/geography/rights';
import {
  effectiveStatus,
  type Capability,
  type CoverageEvidence,
} from '@/domains/tourism/coverage-evidence';
import type { DestinationKind } from '@/domains/tourism/destinations';
import {
  QUALITY_THRESHOLDS,
  resolveQuality,
  type DeviceObservations,
  type Quality,
} from './quality';

/**
 * Experience Resolver (docs/architecture.md §J, PROMPT-MAESTRO §10): función PURA y DETERMINISTA
 * `resolveExperience(input) → ExperienceManifest`. Sin reloj, sin red, sin aleatoriedad: el día y el tiempo transcurrido
 * llegan como parámetros. Separa REPRESENTACIÓN de CALIDAD: un equipo potente no crea cobertura donde no existe.
 *
 *  1. Excluye lo que no tiene derechos, configuración, cobertura vigente, proveedor sano, presupuesto o contenido.
 *  2. Elige la mejor representación restante según el tipo de destino y la intención.
 *  3. Ajusta la calidad con observaciones reales (`quality.ts`).
 *  4. Ordena los fallbacks y deja un MOTIVO observable de cada exclusión.
 *  5. Degrada sin perder selección, idioma ni cámara (se devuelven tal cual).
 *
 * LO QUE NO ES: no está cableado a la interfaz (hoy la única decisión de producto es «mapa permitido o no», que este
 * resolver reutiliza de `resolveMapExperience`); la lista de preferencias por tipo de destino sale de la tabla H de
 * docs/architecture.md, que es una propuesta mía sin validar (F5-1); y con la cobertura y las políticas de hoy no puede
 * devolver nada mejor que `TOPOGRAPHIC_TERRAIN` o `MAP_2D`, porque nada de lo demás tiene derechos, credenciales ni
 * cobertura verificada. Eso es lo correcto, no una limitación a esconder.
 */
export const REPRESENTATIONS = [
  'PHOTOREALISTIC_3D',
  'SATELLITE_TERRAIN',
  'TOPOGRAPHIC_TERRAIN',
  'STREET_EXPLORER',
  'PANORAMA_STORY',
  'PHOTO_EXPLORER',
  'MAP_2D',
] as const;
export type Representation = (typeof REPRESENTATIONS)[number];

/**
 * Terminal: ninguna representación visual es posible (sin derechos para el mapa base, sin WebGL…). NO está en la lista de
 * la especificación: es el estado que la página ya muestra hoy (información turística en texto) y conviene nombrarlo.
 */
export const TEXT_ONLY = 'TEXT_ONLY' as const;
export type Chosen = Representation | typeof TEXT_ONLY;

/** Intención de la persona. Conjunto cerrado PROPUESTO por mí (el documento rector no lo enumera). */
export const INTENTS = ['explore', 'terrain', 'street', 'story', 'photos'] as const;
export type Intent = (typeof INTENTS)[number];

export const MIN_HOLD_MS = QUALITY_THRESHOLDS.minHoldMs;

export type ProviderHealth = 'ok' | 'degraded' | 'down' | 'unknown';

export interface ProviderState {
  /** También es el sujeto de la política de derechos. */
  readonly id: string;
  /** De qué evidencia de cobertura depende. */
  readonly capability: Capability;
  /** ¿Hay credencial/configuración? Sin ella, el proveedor no existe a efectos prácticos. */
  readonly configured: boolean;
  readonly health: ProviderHealth;
  /** Cuota restante; `null` = sin medir ni limitar; `0` o menos = agotada. */
  readonly budgetRemaining: number | null;
}

export interface ExperienceInput {
  readonly env: SiteEnv;
  /** Día calendario ISO (AAAA-MM-DD) para caducar la evidencia de cobertura. */
  readonly today: string;
  readonly destination: { readonly key: string; readonly kind: DestinationKind };
  readonly intent: Intent;
  readonly coverage: readonly CoverageEvidence[];
  readonly rights: readonly RightsPolicy[];
  /** El ORDEN es la prioridad entre proveedores de la misma capacidad. */
  readonly providers: readonly ProviderState[];
  readonly content: { readonly stories: number; readonly licensedMedia: number };
  readonly device: DeviceObservations & { readonly webgl: boolean };
  /** Lo que la persona ya tiene: se conserva siempre, sea cual sea la degradación. */
  readonly locale: Locale;
  readonly camera: CameraState | null;
  readonly areaId: string | null;
  /** Para la histéresis; ausente en la primera resolución. Se avanza con `advancePrevious`, no a mano. */
  readonly previous?: PreviousExperience;
}

/** Lo que el resolver necesita recordar de la resolución anterior para no oscilar. */
export interface PreviousExperience {
  readonly representation: Chosen;
  readonly quality: Quality;
  readonly intent: Intent;
  readonly destinationKey: string;
  /** Cuánto lleva mostrándose esta representación (ms). */
  readonly heldMs: number;
  /** Cuánto lleva mostrándose esta calidad (ms). */
  readonly qualityHeldMs: number;
  /** Cuánto lleva CADA representación siendo elegible sin interrupción (ms). Las que no lo son ahora, no figuran. */
  readonly eligibleForMs: Readonly<Partial<Record<Representation, number>>>;
}

export type ExclusionReason =
  | { readonly code: 'rights'; readonly subject: string; readonly detail: string }
  | { readonly code: 'not-configured'; readonly provider: string }
  | { readonly code: 'no-provider'; readonly capability: Capability }
  | { readonly code: 'coverage-unavailable'; readonly capability: Capability }
  | {
      readonly code: 'coverage-unknown';
      readonly capability: Capability;
      readonly cause: 'unknown' | 'expired' | 'error' | 'no-evidence';
    }
  | { readonly code: 'provider-down'; readonly provider: string }
  | { readonly code: 'over-budget'; readonly provider: string }
  | { readonly code: 'no-webgl' }
  | { readonly code: 'data-saver' }
  | { readonly code: 'no-content'; readonly kind: 'stories' | 'media' };

export interface ExperienceManifest {
  readonly representation: Chosen;
  readonly quality: Quality;
  /** Por qué es ésta: la preferida, un fallback porque la preferida quedó excluida, o la histéresis la mantuvo. */
  readonly why: 'preferred' | 'fallback' | 'hysteresis-hold' | 'text-only';
  /** Todo lo elegible, por orden de preferencia (lo que `advancePrevious` usa para medir la estabilidad de cada una). */
  readonly eligible: readonly Representation[];
  /**
   * Elegibles que quedan POR DEBAJO de la elegida, por orden de preferencia: a lo que se degrada, en este orden. Si
   * `MAP_2D` es elegible y no es la elegida, es siempre la última.
   */
  readonly fallbacks: readonly Representation[];
  /** Todo lo que se consideró y NO es elegible, en orden de preferencia, con sus motivos. */
  readonly excluded: readonly {
    readonly representation: Representation;
    readonly reasons: readonly ExclusionReason[];
  }[];
  /** Proveedor que sirve cada capacidad externa de la representación elegida. */
  readonly providers: Readonly<Partial<Record<Capability, string>>>;
  readonly locale: Locale;
  readonly camera: CameraState | null;
  readonly selection: { readonly destinationKey: string; readonly areaId: string | null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Qué necesita cada representación
// ---------------------------------------------------------------------------------------------------------------------
interface Needs {
  readonly basemap: boolean;
  readonly terrain: boolean;
  /** Capacidades externas: se cubre cada una con algún proveedor (cada elemento es «una de estas»). */
  readonly external: readonly (readonly Capability[])[];
  readonly webgl: boolean;
  /** Descarga pesada: el ahorro de datos manual la excluye. */
  readonly heavy: boolean;
  readonly content?: 'stories' | 'media';
}

const NEEDS: Readonly<Record<Representation, Needs>> = {
  MAP_2D: { basemap: true, terrain: false, external: [], webgl: true, heavy: false },
  TOPOGRAPHIC_TERRAIN: { basemap: true, terrain: true, external: [], webgl: true, heavy: true },
  SATELLITE_TERRAIN: {
    basemap: true,
    terrain: true,
    external: [['openSatellite']],
    webgl: true,
    heavy: true,
  },
  PHOTOREALISTIC_3D: {
    basemap: false,
    terrain: false,
    external: [['google3d']],
    webgl: true,
    heavy: true,
  },
  STREET_EXPLORER: {
    basemap: false,
    terrain: false,
    external: [['streetView', 'streetImagery']],
    webgl: true,
    heavy: true,
  },
  PANORAMA_STORY: {
    basemap: false,
    terrain: false,
    external: [['streetImagery']],
    webgl: true,
    heavy: true,
    content: 'stories',
  },
  PHOTO_EXPLORER: {
    basemap: false,
    terrain: false,
    external: [],
    webgl: false,
    heavy: true,
    content: 'media',
  },
};

/**
 * Tabla H de docs/architecture.md (PROPUESTA mía sin validar, F5-1): qué se prefiere según el tipo de destino. Una
 * ciudad se ve en `MAP_2D` con relieve como capa; una montaña, con terreno topográfico; en una isla el relieve solo
 * cubre la tierra y no hay batimetría, así que no se promociona.
 */
const KIND_ORDER: Readonly<Record<DestinationKind, readonly Representation[]>> = {
  city: ['PHOTOREALISTIC_3D', 'MAP_2D'],
  historic_district: ['PHOTOREALISTIC_3D', 'MAP_2D'],
  infrastructure: ['PHOTOREALISTIC_3D', 'MAP_2D'],
  locality: ['PHOTOREALISTIC_3D', 'TOPOGRAPHIC_TERRAIN', 'MAP_2D'],
  volcano: ['PHOTOREALISTIC_3D', 'SATELLITE_TERRAIN', 'TOPOGRAPHIC_TERRAIN', 'MAP_2D'],
  island: ['PHOTOREALISTIC_3D', 'MAP_2D'],
  archipelago: ['PHOTOREALISTIC_3D', 'MAP_2D'],
};

const INTENT_FIRST: Readonly<Record<Intent, readonly Representation[]>> = {
  explore: [],
  terrain: ['TOPOGRAPHIC_TERRAIN', 'SATELLITE_TERRAIN'],
  street: ['STREET_EXPLORER'],
  story: ['PANORAMA_STORY'],
  photos: ['PHOTO_EXPLORER'],
};

/** Orden de preferencia para este destino e intención; sin repetidos y siempre acaba en `MAP_2D`. */
export function preferenceOrder(kind: DestinationKind, intent: Intent): readonly Representation[] {
  const order: Representation[] = [];
  for (const r of [...INTENT_FIRST[intent], ...KIND_ORDER[kind], 'MAP_2D' as const]) {
    if (!order.includes(r)) order.push(r);
  }
  return order;
}

// ---------------------------------------------------------------------------------------------------------------------
// Elegibilidad
// ---------------------------------------------------------------------------------------------------------------------
function rightsReason(decision: RightsDecision): ExclusionReason | null {
  return decision.allowed
    ? null
    : { code: 'rights', subject: decision.subject, detail: decision.reason };
}

/** `VERIFIED` y `PARTIAL` permiten; lo demás, no, y se dice por qué (caducada ≠ ausente ≠ no medida). */
function coverageReason(
  coverage: readonly CoverageEvidence[],
  capability: Capability,
  today: string,
): ExclusionReason | null {
  const row = coverage.find((c) => c.capability === capability);
  if (!row) return { code: 'coverage-unknown', capability, cause: 'no-evidence' };
  const status = effectiveStatus(row, today);
  if (status === 'VERIFIED' || status === 'PARTIAL') return null;
  if (status === 'UNAVAILABLE') return { code: 'coverage-unavailable', capability };
  if (status === 'ERROR') return { code: 'coverage-unknown', capability, cause: 'error' };
  // UNKNOWN: ¿lo era de origen o caducó una evidencia que sí decía algo?
  return {
    code: 'coverage-unknown',
    capability,
    cause: row.status !== 'UNKNOWN' ? 'expired' : 'unknown',
  };
}

interface Evaluation {
  readonly reasons: ExclusionReason[];
  readonly providers: Partial<Record<Capability, string>>;
}

function evaluate(
  representation: Representation,
  input: ExperienceInput,
  basemap: RightsDecision,
  terrain: RightsDecision,
): Evaluation {
  const needs = NEEDS[representation];
  const reasons: ExclusionReason[] = [];
  const providers: Partial<Record<Capability, string>> = {};

  if (needs.webgl && !input.device.webgl) reasons.push({ code: 'no-webgl' });
  if (needs.heavy && input.device.saveData) reasons.push({ code: 'data-saver' });
  if (needs.basemap) {
    const r = rightsReason(basemap);
    if (r) reasons.push(r);
  }
  if (needs.terrain) {
    const r = rightsReason(terrain) ?? coverageReason(input.coverage, 'terrain', input.today);
    if (r) reasons.push(r);
  }
  if (needs.content === 'stories' && input.content.stories <= 0)
    reasons.push({ code: 'no-content', kind: 'stories' });
  if (needs.content === 'media' && input.content.licensedMedia <= 0)
    reasons.push({ code: 'no-content', kind: 'media' });

  for (const anyOf of needs.external) {
    const candidates = input.providers.filter((p) => anyOf.includes(p.capability));
    if (candidates.length === 0) {
      reasons.push({ code: 'no-provider', capability: anyOf[0] as Capability });
      continue;
    }
    const failures: ExclusionReason[] = [];
    let chosen: ProviderState | undefined;
    for (const p of candidates) {
      const own: ExclusionReason[] = [];
      if (!p.configured) own.push({ code: 'not-configured', provider: p.id });
      const rights = rightsReason(evaluateAll(input.rights, p.id, ['display'], input.env));
      if (rights) own.push(rights);
      const cov = coverageReason(input.coverage, p.capability, input.today);
      if (cov) own.push(cov);
      if (p.health === 'down') own.push({ code: 'provider-down', provider: p.id });
      if (p.budgetRemaining !== null && p.budgetRemaining <= 0)
        own.push({ code: 'over-budget', provider: p.id });
      if (own.length === 0) {
        chosen = p;
        break;
      }
      failures.push(...own);
    }
    if (chosen) providers[chosen.capability] = chosen.id;
    else reasons.push(...failures);
  }
  return { reasons, providers };
}

// ---------------------------------------------------------------------------------------------------------------------
// Resolución
// ---------------------------------------------------------------------------------------------------------------------
export function resolveExperience(input: ExperienceInput): ExperienceManifest {
  const map = resolveMapExperience(input.env, input.rights);
  const order = preferenceOrder(input.destination.kind, input.intent);

  const eligible: {
    representation: Representation;
    providers: Partial<Record<Capability, string>>;
  }[] = [];
  const excluded: { representation: Representation; reasons: readonly ExclusionReason[] }[] = [];
  for (const representation of order) {
    const e = evaluate(representation, input, map.basemap, map.terrain);
    if (e.reasons.length === 0) eligible.push({ representation, providers: e.providers });
    else excluded.push({ representation, reasons: e.reasons });
  }

  const preserved = {
    locale: input.locale,
    camera: input.camera,
    selection: { destinationKey: input.destination.key, areaId: input.areaId },
  };

  const best = eligible[0];
  if (!best) {
    return {
      representation: TEXT_ONLY,
      quality: 'LITE',
      why: 'text-only',
      eligible: [],
      fallbacks: [],
      excluded,
      providers: {},
      ...preserved,
    };
  }

  // Histéresis. EMPEORAR es inmediato: si la actual ya no es elegible, se cambia. MEJORAR espera a dos cosas: que la actual
  // lleve `MIN_HOLD_MS` mostrándose y que la mejor lleve `MIN_HOLD_MS` elegible SIN INTERRUPCIÓN (si no, un proveedor que
  // parpadea haría subir y bajar). Un cambio de intención o de destino es una orden de la persona y no se retrasa.
  let chosen = best;
  let why: ExperienceManifest['why'] = order[0] === best.representation ? 'preferred' : 'fallback';
  const prev = input.previous;
  if (
    prev &&
    prev.intent === input.intent &&
    prev.destinationKey === input.destination.key &&
    prev.representation !== best.representation
  ) {
    const keep = eligible.find((e) => e.representation === prev.representation);
    const proven = (prev.eligibleForMs[best.representation] ?? 0) >= MIN_HOLD_MS;
    if (keep && !(prev.heldMs >= MIN_HOLD_MS && proven)) {
      chosen = keep;
      why = 'hysteresis-hold';
    }
  }

  const quality = resolveQuality(
    input.device,
    prev && prev.representation === chosen.representation
      ? { quality: prev.quality, heldMs: prev.qualityHeldMs }
      : undefined,
  );
  return {
    representation: chosen.representation,
    quality,
    why,
    eligible: eligible.map((e) => e.representation),
    fallbacks: eligible.slice(eligible.indexOf(chosen) + 1).map((e) => e.representation),
    excluded,
    providers: chosen.providers,
    ...preserved,
  };
}

/**
 * Avanza la memoria de la histéresis tras una resolución: `elapsedMs` es el tiempo desde la anterior. Es la ÚNICA forma
 * prevista de construir `previous` (quien llame no debe reimplementar los contadores). Pura.
 *  - `heldMs` y `qualityHeldMs` se reinician cuando cambia la representación o la calidad (o la intención/destino).
 *  - `eligibleForMs[r]` crece mientras `r` siga siendo elegible y desaparece en cuanto deja de serlo.
 */
export function advancePrevious(
  manifest: ExperienceManifest,
  input: ExperienceInput,
  elapsedMs: number,
): PreviousExperience {
  const prev = input.previous;
  const same =
    prev !== undefined &&
    prev.intent === input.intent &&
    prev.destinationKey === input.destination.key;
  const eligibleForMs: Partial<Record<Representation, number>> = {};
  for (const r of manifest.eligible) {
    eligibleForMs[r] =
      same && prev.eligibleForMs[r] !== undefined ? (prev.eligibleForMs[r] ?? 0) + elapsedMs : 0;
  }
  return {
    representation: manifest.representation,
    quality: manifest.quality,
    intent: input.intent,
    destinationKey: input.destination.key,
    heldMs: same && prev.representation === manifest.representation ? prev.heldMs + elapsedMs : 0,
    qualityHeldMs:
      same && prev.representation === manifest.representation && prev.quality === manifest.quality
        ? prev.qualityHeldMs + elapsedMs
        : 0,
    eligibleForMs,
  };
}
