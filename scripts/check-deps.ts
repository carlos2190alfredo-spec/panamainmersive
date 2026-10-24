/**
 * Dependencias y licencias contra `data/dependency-policy.json` (PROMPT-MAESTRO §18; docs/security.md).
 *
 *   --licenses  `pnpm licenses list --json` (todo y `--prod`) contra las licencias permitidas por ámbito. Determinista
 *               (lee `node_modules`, sin red): puede bloquear un cambio.
 *   --audit     `pnpm audit --json` (`--prod` y `--dev`) contra los umbrales de gravedad. Necesita red y su resultado
 *               cambia con la base de avisos aunque el código no cambie: va en un flujo programado, no en cada cambio.
 *
 * Códigos de salida: 0 bien · 1 incumple · 2 no se pudo evaluar (política ilegible, `pnpm` que falla o no devuelve JSON,
 * lista vacía, sin red). «No pude comprobarlo» nunca es un verde. Si se piden los dos modos y uno incumple, manda el 1.
 *
 * El ámbito de un aviso sale de qué ejecución lo devolvió (`--prod` o `--dev`), NO del campo `dev` de las acciones de
 * `pnpm audit`: probado con una dependencia de desarrollo, ese campo sale `false` (E-87).
 *
 * Uso:  node --import tsx scripts/check-deps.ts (--licenses | --audit)... [--policy FILE]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  checkAudit,
  checkLicenses,
  mergeAdvisories,
  parseAudit,
  parseLicenseList,
  parsePolicy,
  withScopes,
  type Policy,
} from './lib/dependency-policy';

const DEFAULT_POLICY = 'data/dependency-policy.json';

interface Options {
  readonly licenses: boolean;
  readonly audit: boolean;
  readonly policy: string;
}

function parseArgs(argv: string[]): Options | string {
  let licenses = false;
  let audit = false;
  let policy = DEFAULT_POLICY;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--licenses') {
      licenses = true;
    } else if (arg === '--audit') {
      audit = true;
    } else if (arg === '--policy') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('-')) return '`--policy` necesita un fichero';
      policy = value;
    } else if (arg !== undefined && arg.startsWith('--policy=')) {
      policy = arg.slice('--policy='.length);
    } else {
      return `Argumento no reconocido: ${String(arg)}`;
    }
  }
  if (!licenses && !audit) return 'Indica qué comprobar: --licenses y/o --audit';
  return { licenses, audit, policy };
}

function loadPolicy(path: string): Policy {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(
      `no se pudo leer la política ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`la política ${path} no es JSON válido`);
  }
  return parsePolicy(raw);
}

/** Ejecuta `pnpm` y devuelve su salida estándar como JSON. El código de salida no importa: `pnpm audit` sale con 1 si hay avisos. */
function pnpmJson(args: string[]): unknown {
  const result = spawnSync('pnpm', args, {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  const command = `pnpm ${args.join(' ')}`;
  if (result.error) throw new Error(`no se pudo ejecutar \`${command}\`: ${result.error.message}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    const detail = (result.stderr || result.stdout).trim().split('\n')[0] ?? '';
    throw new Error(`\`${command}\` no devolvió JSON (salida ${String(result.status)}): ${detail}`);
  }
}

const scopeName = { prod: 'producción', dev: 'desarrollo' } as const;

function runLicenses(policy: Policy, today: string): number {
  const all = parseLicenseList(pnpmJson(['licenses', 'list', '--json']));
  const prod = parseLicenseList(pnpmJson(['licenses', 'list', '--prod', '--json']));
  const packages = withScopes(all, prod);
  const report = checkLicenses(packages, policy, today);

  console.log(
    `Licencias: ${String(packages.length)} paquetes (${String(packages.filter((p) => p.scope === 'prod').length)} de producción): ` +
      `${String(report.counts.allowed)} permitidas · ${String(report.counts.accepted)} aceptadas · ` +
      `${String(report.counts.provisional)} provisionales · ${String(report.counts.violations)} incumplen`,
  );
  for (const { pkg, exception } of report.pending) {
    const until = exception.status === 'provisional' ? exception.reviewBy : '';
    console.log(
      `PENDIENTE (provisional, revisar antes del ${until}): ${pkg.name}@${pkg.version} [${pkg.license}, ${scopeName[pkg.scope]}] — ${exception.reason}`,
    );
  }
  for (const e of report.staleExceptions) {
    console.log(
      `AVISO: la excepción de ${e.package} (${e.license}, ${scopeName[e.scope]}) no corresponde a ningún paquete instalado: quítala si ya no hace falta`,
    );
  }
  for (const v of report.violations) {
    const where = `${v.pkg.name}@${v.pkg.version} (licencia «${v.pkg.license}», ${scopeName[v.pkg.scope]})`;
    if (v.reason === 'exception-expired' && v.exception?.status === 'provisional') {
      console.error(
        `FALLO: ${where}: la excepción provisional venció el ${v.exception.reviewBy}; hay que decidir (aceptarla con nombre, quitar la dependencia o prorrogarla con motivo)`,
      );
    } else {
      console.error(`FALLO: ${where}: licencia no permitida por la política y sin excepción`);
    }
  }
  return report.violations.length > 0 ? 1 : 0;
}

function runAudit(policy: Policy, today: string): number {
  const prod = parseAudit(pnpmJson(['audit', '--prod', '--json']), 'prod');
  const dev = parseAudit(pnpmJson(['audit', '--dev', '--json']), 'dev');
  const advisories = mergeAdvisories(prod, dev);
  const report = checkAudit(advisories, policy, today);

  console.log(
    `Auditoría: ${String(advisories.length)} avisos (${String(advisories.filter((a) => a.scope === 'prod').length)} en producción, ` +
      `${String(advisories.filter((a) => a.scope === 'dev').length)} solo en desarrollo): ` +
      `${String(report.violations.length)} bloquean · ${String(report.warnings.length)} avisan · ${String(report.excepted.length)} exceptuados`,
  );
  const label = (a: {
    module: string;
    id: string;
    ghsa: string | null;
    severity: string;
    title: string;
    vulnerable: string;
    scope: 'prod' | 'dev';
  }) =>
    `${a.module} ${a.vulnerable} [${a.severity}, ${scopeName[a.scope]}] ${a.ghsa ?? a.id}: ${a.title}`;
  for (const { advisory, exception } of report.excepted) {
    console.log(`EXCEPTUADO (hasta ${exception.until}): ${label(advisory)} — ${exception.reason}`);
  }
  for (const advisory of report.warnings) console.log(`AVISO: ${label(advisory)}`);
  for (const e of report.staleExceptions) {
    console.log(
      `AVISO: la excepción ${e.id} (${e.package}) no corresponde a ningún aviso actual: quítala si ya no hace falta`,
    );
  }
  for (const { advisory, reason } of report.violations) {
    console.error(
      reason === 'exception-expired'
        ? `FALLO: ${label(advisory)}: la excepción venció; hay que decidir`
        : `FALLO: ${label(advisory)}`,
    );
  }
  return report.violations.length > 0 ? 1 : 0;
}

function main(argv: string[]): number {
  const options = parseArgs(argv);
  if (typeof options === 'string') {
    console.error(options);
    return 2;
  }
  let policy: Policy;
  try {
    policy = loadPolicy(options.policy);
  } catch (error) {
    console.error(`FALLO: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const today = new Date().toISOString().slice(0, 10);

  let violated = false;
  let notEvaluated = false;
  const attempt = (name: string, step: () => number): void => {
    try {
      if (step() === 1) violated = true;
    } catch (error) {
      notEvaluated = true;
      console.error(
        `FALLO (${name}, no se pudo evaluar): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  if (options.licenses) attempt('licencias', () => runLicenses(policy, today));
  if (options.audit) attempt('auditoría', () => runAudit(policy, today));
  if (violated) return 1;
  return notEvaluated ? 2 : 0;
}

process.exit(main(process.argv.slice(2)));
