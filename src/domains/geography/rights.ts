import { z } from 'zod';
import { USED_SOURCES, type RightsStatus } from './sources';

/**
 * Evaluador de derechos (ADR-0007, docs/provider-rights.md). Política por defecto: DENEGAR.
 *  - `verified`    → permite la acción en cualquier entorno (si está en la lista de acciones permitidas);
 *  - `provisional` → permite SOLO fuera de producción y bloquea la publicación a producción;
 *  - sin política, o acción no listada → deniega siempre.
 * Función pura: el entorno y las políticas son parámetros.
 */
export type RightsAction =
  | 'display'
  | 'combine'
  | 'cache'
  | 'download'
  | 'transform'
  | 'redistribute'
  | 'offline'
  | 'aiProcess';

export type SiteEnv = 'development' | 'staging' | 'production';

export interface RightsPolicy {
  readonly subject: string;
  readonly status: RightsStatus;
  readonly allowed: readonly RightsAction[];
}

export type RightsDecision =
  | { readonly allowed: true; readonly reason: 'verified' | 'provisional-outside-production' }
  | {
      readonly allowed: false;
      readonly reason: 'no-policy' | 'action-not-allowed' | 'provisional-in-production';
      readonly subject: string;
    };

export function evaluateRights(
  policies: readonly RightsPolicy[],
  subject: string,
  action: RightsAction,
  env: SiteEnv,
): RightsDecision {
  const policy = policies.find((p) => p.subject === subject);
  if (!policy) return { allowed: false, reason: 'no-policy', subject };
  if (!policy.allowed.includes(action))
    return { allowed: false, reason: 'action-not-allowed', subject };
  if (policy.status === 'verified') return { allowed: true, reason: 'verified' };
  if (env === 'production') return { allowed: false, reason: 'provisional-in-production', subject };
  return { allowed: true, reason: 'provisional-outside-production' };
}

const ACTIONS = [
  'display',
  'combine',
  'cache',
  'download',
  'transform',
  'redistribute',
  'offline',
  'aiProcess',
] as const;

const PoliciesDocument = z.object({
  schema: z.literal(1),
  reviewedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().min(1),
  policies: z
    .array(
      z.object({
        subject: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        status: z.enum(['verified', 'provisional']),
        allowed: z.array(z.enum(ACTIONS)).min(1),
        evidence: z.string().min(1),
      }),
    )
    .min(1),
});

/** Valida el documento de políticas; rechaza sujetos repetidos (una sola política por fuente). */
export function parsePolicies(raw: unknown): readonly RightsPolicy[] {
  const doc = PoliciesDocument.parse(raw);
  const subjects = doc.policies.map((p) => p.subject);
  if (new Set(subjects).size !== subjects.length) throw new Error('Política de derechos repetida');
  return doc.policies.map(({ subject, status, allowed }) => ({ subject, status, allowed }));
}

export interface MapExperience {
  /** Mapa base vectorial (cartografía + etiquetas). Si se deniega, no se inicializa el mapa. */
  readonly basemap: RightsDecision;
  /** Capas de relieve (datos de un tercero). Si se deniega, no se ofrecen ni se cargan. */
  readonly terrain: RightsDecision;
}

function firstDenied(decisions: readonly RightsDecision[]): RightsDecision | undefined {
  return decisions.find((d) => !d.allowed);
}

/** Experience Resolver v1: qué partes de la experiencia de mapa se pueden ofrecer HOY y por qué. */
export function resolveMapExperience(
  env: SiteEnv,
  policies: readonly RightsPolicy[],
): MapExperience {
  const basemapChecks: RightsDecision[] = [
    evaluateRights(policies, 'overture', 'display', env),
    evaluateRights(policies, 'overture', 'transform', env),
    evaluateRights(policies, 'overture', 'redistribute', env),
    evaluateRights(policies, 'noto-sans-glyphs', 'display', env),
    evaluateRights(policies, 'noto-sans-glyphs', 'redistribute', env),
  ];
  return {
    basemap: firstDenied(basemapChecks) ?? {
      allowed: true,
      reason: 'provisional-outside-production',
    },
    terrain: evaluateRights(policies, 'aws-terrain', 'display', env),
  };
}

/** Coherencia: toda fuente en uso tiene política y su estado coincide con el del registro de fuentes. */
export function policiesMatchSources(policies: readonly RightsPolicy[]): string[] {
  const problems: string[] = [];
  for (const source of USED_SOURCES) {
    const policy = policies.find((p) => p.subject === source.id);
    if (!policy) problems.push(`${source.id}: en uso pero sin política de derechos`);
    else if (policy.status !== source.rights) {
      problems.push(`${source.id}: política ${policy.status} ≠ registro ${source.rights}`);
    }
  }
  for (const policy of policies) {
    if (!USED_SOURCES.some((s) => s.id === policy.subject)) {
      problems.push(`${policy.subject}: política sin fuente en uso`);
    }
  }
  return problems;
}
