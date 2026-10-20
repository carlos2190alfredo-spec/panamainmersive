import { z } from 'zod';
import { DEFAULT_TERRAIN_TILES_URL, hasTileTemplate, originOf } from './map-urls';

/**
 * Configuración validada por entorno (docs/security.md). Se valida al arrancar: un valor inválido
 * detiene la aplicación con TODOS los problemas listados. Reglas:
 *  - ningún secreto lleva el prefijo NEXT_PUBLIC_ (se expone al navegador);
 *  - las integraciones opcionales se activan solo con su flag Y su credencial.
 */
const bool = z.stringbool().default(false);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SITE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_TILES_BASE_URL: z.string().min(1).default('/data'),
  NEXT_PUBLIC_TERRAIN_TILES_URL: z.string().min(1).default(DEFAULT_TERRAIN_TILES_URL),

  DATABASE_URL: z.string().min(1).optional(),

  FEATURE_GOOGLE_3D: bool,
  GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),
  FEATURE_CESIUM: bool,
  CESIUM_ION_TOKEN: z.string().min(1).optional(),
  FEATURE_MAPILLARY: bool,
  MAPILLARY_ACCESS_TOKEN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

export class ConfigError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Configuración inválida:\n - ${issues.join('\n - ')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/** Nombres que parecen secretos: jamás pueden ir con prefijo público. */
const SECRET_NAME = /(SECRET|SERVICE_ROLE|PRIVATE|TOKEN|PASSWORD|API_KEY|CREDENTIAL)/i;
/** Claves obligatoriamente públicas de mapas (restringidas por origen y API) que se permiten con prefijo. */
const PUBLIC_KEY_ALLOWLIST: ReadonlySet<string> = new Set(['NEXT_PUBLIC_GOOGLE_MAPS_KEY']);

export function findPublicSecrets(raw: Readonly<Record<string, string | undefined>>): string[] {
  return Object.keys(raw)
    .filter(
      (k) => k.startsWith('NEXT_PUBLIC_') && SECRET_NAME.test(k) && !PUBLIC_KEY_ALLOWLIST.has(k),
    )
    .sort();
}

export function parseEnv(raw: Readonly<Record<string, string | undefined>>): Env {
  const issues: string[] = [];

  for (const k of findPublicSecrets(raw)) {
    issues.push(
      `${k}: un secreto no puede llevar el prefijo NEXT_PUBLIC_ (se expondría al navegador)`,
    );
  }

  // Cadenas vacías (`VAR=`) se tratan como ausentes.
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    for (const i of parsed.error.issues)
      issues.push(`${i.path.join('.') || '(raíz)'}: ${i.message}`);
  }

  if (parsed.success) {
    const e = parsed.data;
    if (!hasTileTemplate(e.NEXT_PUBLIC_TERRAIN_TILES_URL)) {
      issues.push('NEXT_PUBLIC_TERRAIN_TILES_URL: debe contener {z}, {x} e {y}');
    }
    for (const [name, value] of [
      ['NEXT_PUBLIC_TILES_BASE_URL', e.NEXT_PUBLIC_TILES_BASE_URL],
      ['NEXT_PUBLIC_TERRAIN_TILES_URL', e.NEXT_PUBLIC_TERRAIN_TILES_URL],
    ] as const) {
      if (!value.startsWith('/') && originOf(value) === null) {
        issues.push(`${name}: debe ser una ruta que empiece por «/» o una URL http(s) absoluta`);
      }
      if (e.SITE_ENV === 'production' && originOf(value)?.startsWith('http:')) {
        issues.push(`${name}: en producción una URL absoluta debe ser https`);
      }
    }
    if (e.SITE_ENV === 'production') {
      const url = new URL(e.NEXT_PUBLIC_SITE_URL);
      if (url.protocol !== 'https:')
        issues.push('NEXT_PUBLIC_SITE_URL: en producción debe ser https');
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        issues.push('NEXT_PUBLIC_SITE_URL: en producción no puede apuntar a localhost');
      }
    }
  }

  if (issues.length > 0 || !parsed.success) throw new ConfigError(issues);
  return parsed.data;
}

let cached: Env | undefined;

/**
 * Entorno del servidor (memoizado). Los valores NEXT_PUBLIC_* se leen aquí también en servidor;
 * el código de cliente solo debe usar `publicEnv`.
 */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

// --- Integraciones: activas solo con flag + credencial; si no, deshabilitadas con motivo observable ---

export type FeatureName = 'google3d' | 'cesium' | 'mapillary';
export type FeatureReason = 'enabled' | 'flag_off' | 'missing_credential';
export interface FeatureState {
  readonly enabled: boolean;
  readonly reason: FeatureReason;
}

export function featureState(name: FeatureName, env: Env): FeatureState {
  const [flag, credential] = {
    google3d: [env.FEATURE_GOOGLE_3D, env.GOOGLE_MAPS_API_KEY],
    cesium: [env.FEATURE_CESIUM, env.CESIUM_ION_TOKEN],
    mapillary: [env.FEATURE_MAPILLARY, env.MAPILLARY_ACCESS_TOKEN],
  }[name];
  if (!flag) return { enabled: false, reason: 'flag_off' };
  if (!credential) return { enabled: false, reason: 'missing_credential' };
  return { enabled: true, reason: 'enabled' };
}
