import { z } from 'zod';

/**
 * Política de dependencias y licencias (PROMPT-MAESTRO §18: «Comprueba dependencias y licencias sin bloquear el
 * proyecto por alertas no relacionadas o no aplicables»). Todo lo que decide está en `data/dependency-policy.json`:
 * las licencias permitidas por ámbito (producción / desarrollo), las excepciones con motivo y plazo, y los umbrales de
 * gravedad. Esta librería es PURA: recibe la salida ya leída de `pnpm licenses list --json` y `pnpm audit --json` y el
 * día; no ejecuta nada ni mira el reloj (el CLI `scripts/check-deps.ts` lo hace).
 *
 * Principio: una excepción NO esconde nada. Pasa, pero con motivo escrito, con plazo y a la vista en cada ejecución;
 * una excepción vencida vuelve a bloquear, para que alguien decida.
 */
export type Scope = 'prod' | 'dev';
export const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

interface LicenseExceptionBase {
  readonly package: string;
  readonly license: string;
  readonly scope: Scope;
  readonly reason: string;
}
export type LicenseException =
  | (LicenseExceptionBase & { readonly status: 'provisional'; readonly reviewBy: string })
  | (LicenseExceptionBase & { readonly status: 'accepted'; readonly reviewedBy: string });

export interface AdvisoryException {
  readonly id: string;
  readonly package: string;
  readonly reason: string;
  readonly until: string;
}

export interface Policy {
  readonly schema: 1;
  readonly reviewedOn: string;
  readonly note: string;
  readonly allowedLicenses: { readonly prod: readonly string[]; readonly dev: readonly string[] };
  readonly licenseExceptions: readonly LicenseException[];
  readonly audit: {
    readonly failOnProd: Severity;
    readonly failOnDev: Severity;
    readonly exceptions: readonly AdvisoryException[];
  };
}

export interface PackageLicense {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly scope: Scope;
}

export interface Advisory {
  readonly id: string;
  readonly ghsa: string | null;
  readonly title: string;
  readonly module: string;
  readonly severity: Severity;
  readonly vulnerable: string;
  readonly scope: Scope;
}

// --- La política (esquema estricto) --------------------------------------------------------------------------------

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  // `Date.parse('2026-02-31')` no da NaN (E-52): se comprueba que la fecha vuelve igual.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const isoDate = z.string().refine(isIsoDate, 'fecha ISO (AAAA-MM-DD) inexistente');
const reason = z.string().min(20, 'el motivo debe explicarse (≥ 20 caracteres)');
const nonEmpty = z.string().min(1);
const severity = z.enum(SEVERITIES);
const licenseId = z
  .string()
  .regex(/^[A-Za-z0-9.+-]+$/, 'un identificador SPDX, no una expresión ni un comodín');
const exactName = z
  .string()
  .regex(/^[@A-Za-z0-9][@A-Za-z0-9._/-]*$/, 'un nombre de paquete exacto');
const scope = z.enum(['prod', 'dev']);

const exceptionBase = { package: exactName, license: licenseId, scope, reason };
const licenseException = z.union([
  z.strictObject({ ...exceptionBase, status: z.literal('provisional'), reviewBy: isoDate }),
  z.strictObject({
    ...exceptionBase,
    status: z.literal('accepted'),
    reviewedBy: z.string().min(3),
  }),
]);

const advisoryException = z.strictObject({
  id: nonEmpty,
  package: exactName,
  reason,
  until: isoDate,
});

function uniqueLicenses(list: readonly string[]): boolean {
  const lower = list.map((id) => id.toLowerCase());
  return new Set(lower).size === lower.length;
}

const policySchema = z
  .strictObject({
    schema: z.literal(1),
    reviewedOn: isoDate,
    note: nonEmpty,
    allowedLicenses: z.strictObject({
      prod: z.array(licenseId).refine(uniqueLicenses, 'licencias repetidas'),
      dev: z.array(licenseId).refine(uniqueLicenses, 'licencias repetidas'),
    }),
    licenseExceptions: z.array(licenseException),
    audit: z.strictObject({
      failOnProd: severity,
      failOnDev: severity,
      exceptions: z.array(advisoryException),
    }),
  })
  .superRefine((policy, context) => {
    const seen = new Set<string>();
    for (const e of policy.licenseExceptions) {
      const key = `${e.package}\0${e.license}\0${e.scope}`;
      if (seen.has(key)) {
        context.addIssue({
          code: 'custom',
          message: `excepción repetida: ${e.package} (${e.license}, ${e.scope})`,
        });
      }
      seen.add(key);
    }
    const ids = new Set<string>();
    for (const e of policy.audit.exceptions) {
      const key = `${e.id}\0${e.package}`;
      if (ids.has(key))
        context.addIssue({ code: 'custom', message: `excepción de aviso repetida: ${e.id}` });
      ids.add(key);
    }
  });

export function parsePolicy(raw: unknown): Policy {
  const result = policySchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(
      `política de dependencias no válida: ${first ? `${first.path.join('.') || '(raíz)'}: ${first.message}` : 'forma desconocida'}`,
    );
  }
  return result.data;
}

// --- Expresiones de licencia SPDX (subconjunto: OR · AND · WITH · paréntesis) -------------------------------------

/**
 * ¿Está permitida la expresión? `allowed` en minúsculas (los identificadores SPDX no distinguen mayúsculas). FALLA
 * CERRADO: lo que no es una expresión válida (vacío, `UNKNOWN`, `SEE LICENSE IN …`, paréntesis sin cerrar, operadores
 * en minúscula) no está permitido. `AND` liga más fuerte que `OR`; `X WITH excepción` vale lo que valga `X` (una
 * excepción de licencia solo añade permisos).
 */
export function licenseAllowed(expression: string, allowed: ReadonlySet<string>): boolean {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let position = 0;
  const peek = (): string | undefined => tokens[position];

  const idToken = (): string => {
    const token = tokens[position++];
    if (
      token === undefined ||
      !/^[A-Za-z0-9.+-]+$/.test(token) ||
      ['AND', 'OR', 'WITH'].includes(token)
    ) {
      throw new SyntaxError('identificador esperado');
    }
    return token;
  };
  const factor = (): boolean => {
    if (peek() === '(') {
      position += 1;
      const value = or();
      if (tokens[position++] !== ')') throw new SyntaxError('paréntesis sin cerrar');
      return value;
    }
    const id = idToken();
    const base = allowed.has(id.toLowerCase());
    if (peek() === 'WITH') {
      position += 1;
      idToken();
    }
    return base;
  };
  const and = (): boolean => {
    let value = factor();
    while (peek() === 'AND') {
      position += 1;
      const next = factor();
      value = value && next;
    }
    return value;
  };
  const or = (): boolean => {
    let value = and();
    while (peek() === 'OR') {
      position += 1;
      const next = and();
      value = value || next;
    }
    return value;
  };

  try {
    const value = or();
    return position === tokens.length && value;
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

// --- Licencias -------------------------------------------------------------------------------------------------------

export interface LicenseFinding {
  readonly pkg: PackageLicense;
  readonly reason: 'not-allowed' | 'exception-expired';
  readonly exception?: LicenseException;
}
export interface LicensePending {
  readonly pkg: PackageLicense;
  readonly exception: LicenseException;
}
export interface LicenseReport {
  readonly violations: LicenseFinding[];
  readonly pending: LicensePending[];
  readonly staleExceptions: LicenseException[];
  readonly counts: {
    readonly allowed: number;
    readonly accepted: number;
    readonly provisional: number;
    readonly violations: number;
  };
}

/** `pnpm licenses list --json`: un objeto cuya clave es la licencia y cuyo valor son los paquetes (con sus versiones). */
export function parseLicenseList(raw: unknown): Omit<PackageLicense, 'scope'>[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('la lista de licencias no es un objeto');
  }
  const out: Omit<PackageLicense, 'scope'>[] = [];
  for (const [key, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) throw new Error(`la lista de la licencia «${key}» no es un array`);
    for (const entry of list as unknown[]) {
      const item = entry as { name?: unknown; versions?: unknown; license?: unknown } | null;
      if (typeof item?.name !== 'string' || item.name === '') {
        throw new Error(`una entrada de «${key}» no tiene nombre`);
      }
      if (
        !Array.isArray(item.versions) ||
        item.versions.length === 0 ||
        !item.versions.every((v) => typeof v === 'string')
      ) {
        throw new Error(`${item.name}: sin versiones`);
      }
      const license = typeof item.license === 'string' ? item.license : key;
      for (const version of item.versions) out.push({ name: item.name, version, license });
    }
  }
  if (out.length === 0)
    throw new Error('la lista de licencias está vacía: no hay nada que evaluar');
  return out;
}

/** Lo que está en la lista de producción es producción; el resto de la lista completa, desarrollo. */
export function withScopes(
  all: readonly Omit<PackageLicense, 'scope'>[],
  prod: readonly Omit<PackageLicense, 'scope'>[],
): PackageLicense[] {
  const inProd = new Set(prod.map((p) => `${p.name}@${p.version}`));
  return all.map((p) => ({ ...p, scope: inProd.has(`${p.name}@${p.version}`) ? 'prod' : 'dev' }));
}

export function checkLicenses(
  packages: readonly PackageLicense[],
  policy: Policy,
  today: string,
): LicenseReport {
  const prodAllowed = new Set(policy.allowedLicenses.prod.map((id) => id.toLowerCase()));
  const devAllowed = new Set([
    ...prodAllowed,
    ...policy.allowedLicenses.dev.map((id) => id.toLowerCase()),
  ]);
  const violations: LicenseFinding[] = [];
  const pending: LicensePending[] = [];
  const used = new Set<LicenseException>();
  const counts = { allowed: 0, accepted: 0, provisional: 0, violations: 0 };

  for (const pkg of packages) {
    if (licenseAllowed(pkg.license, pkg.scope === 'prod' ? prodAllowed : devAllowed)) {
      counts.allowed += 1;
      continue;
    }
    const exception = policy.licenseExceptions.find(
      (e) => e.package === pkg.name && e.license === pkg.license && e.scope === pkg.scope,
    );
    if (exception === undefined) {
      violations.push({ pkg, reason: 'not-allowed' });
    } else {
      used.add(exception);
      if (exception.status === 'accepted') {
        counts.accepted += 1;
      } else if (today <= exception.reviewBy) {
        counts.provisional += 1;
        pending.push({ pkg, exception });
      } else {
        violations.push({ pkg, reason: 'exception-expired', exception });
      }
    }
  }
  counts.violations = violations.length;
  return {
    violations,
    pending,
    staleExceptions: policy.licenseExceptions.filter((e) => !used.has(e)),
    counts,
  };
}

// --- Avisos de seguridad ---------------------------------------------------------------------------------------------

export interface AuditViolation {
  readonly advisory: Advisory;
  readonly reason: 'above-threshold' | 'exception-expired';
}
export interface AuditReport {
  readonly violations: AuditViolation[];
  readonly warnings: Advisory[];
  readonly excepted: { readonly advisory: Advisory; readonly exception: AdvisoryException }[];
  readonly staleExceptions: AdvisoryException[];
}

/** `pnpm audit --json`: el ámbito lo pone quien llama según qué ejecución lo devolvió (`--prod` o `--dev`). */
export function parseAudit(raw: unknown, scope: Scope): Advisory[] {
  const advisories = (raw as { advisories?: unknown } | null)?.advisories;
  if (typeof advisories !== 'object' || advisories === null || Array.isArray(advisories)) {
    throw new Error(
      'la salida de `pnpm audit` no trae `advisories` (¿error de red o de registro?)',
    );
  }
  return Object.entries(advisories).map(([key, value]) => {
    const a = value as Record<string, unknown> | null;
    const id = typeof a?.id === 'number' || typeof a?.id === 'string' ? a.id : key;
    if (typeof a?.module_name !== 'string' || a.module_name === '') {
      throw new Error(`el aviso ${key} no indica el paquete`);
    }
    if (!SEVERITIES.includes(a.severity as Severity)) {
      throw new Error(`el aviso ${key} tiene una gravedad desconocida: ${String(a.severity)}`);
    }
    return {
      id: String(id),
      ghsa: typeof a.github_advisory_id === 'string' ? a.github_advisory_id : null,
      title: typeof a.title === 'string' ? a.title : '',
      module: a.module_name,
      severity: a.severity as Severity,
      vulnerable: typeof a.vulnerable_versions === 'string' ? a.vulnerable_versions : '',
      scope,
    };
  });
}

/** Un aviso que aparece en producción NO se degrada a desarrollo por aparecer también ahí. */
export function mergeAdvisories(prod: readonly Advisory[], dev: readonly Advisory[]): Advisory[] {
  const byId = new Map<string, Advisory>();
  for (const a of dev) byId.set(`${a.id}\0${a.module}`, a);
  for (const a of prod) byId.set(`${a.id}\0${a.module}`, a);
  return [...byId.values()];
}

export function checkAudit(
  advisories: readonly Advisory[],
  policy: Policy,
  today: string,
): AuditReport {
  const violations: AuditViolation[] = [];
  const warnings: Advisory[] = [];
  const excepted: AuditReport['excepted'] = [];
  const used = new Set<AdvisoryException>();
  const rank = (s: Severity): number => SEVERITIES.indexOf(s);

  for (const advisory of advisories) {
    const threshold = advisory.scope === 'prod' ? policy.audit.failOnProd : policy.audit.failOnDev;
    if (rank(advisory.severity) < rank(threshold)) {
      warnings.push(advisory);
      continue;
    }
    const exception = policy.audit.exceptions.find(
      (e) => e.package === advisory.module && (e.id === advisory.id || e.id === advisory.ghsa),
    );
    if (exception === undefined) {
      violations.push({ advisory, reason: 'above-threshold' });
    } else {
      used.add(exception);
      if (today <= exception.until) excepted.push({ advisory, exception });
      else violations.push({ advisory, reason: 'exception-expired' });
    }
  }
  return {
    violations,
    warnings,
    excepted,
    staleExceptions: policy.audit.exceptions.filter((e) => !used.has(e)),
  };
}
