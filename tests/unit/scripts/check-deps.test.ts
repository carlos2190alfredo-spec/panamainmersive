import { execFile } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `scripts/check-deps.ts` de punta a punta (`pnpm check:licenses` y `pnpm check:audit`): la lógica pura se prueba en
 * `dependency-policy.test.ts`; esto vigila el PEGAMENTO (0 bien · 1 incumple · 2 no se pudo evaluar), qué se ejecuta
 * exactamente y que «no pude comprobarlo» nunca es un verde. Nunca hay red ni se lee el árbol real: un `pnpm` falso, el
 * primero del PATH, devuelve el JSON que cada caso prepara. Las fechas de los plazos son 2000-01-01 (vencida) y
 * 2999-12-31 (vigente) para no depender del reloj.
 */
const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts/check-deps.ts');
const TSX = pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workdir(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'pi-check-deps-'));
  dirs.push(dir);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  return dir;
}

const REASON = 'Un motivo con suficiente detalle para poder revisarlo en la prueba.';

function policyJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: 1,
    reviewedOn: '2026-10-24',
    note: 'sintética',
    allowedLicenses: { prod: ['MIT', 'ISC'], dev: ['MPL-2.0'] },
    licenseExceptions: [],
    audit: { failOnProd: 'high', failOnDev: 'critical', exceptions: [] },
    ...over,
  });
}

const entry = (name: string, version: string, license: string) => ({
  name,
  versions: [version],
  license,
});
const byLicense = (...entries: ReturnType<typeof entry>[]) => {
  const out: Record<string, unknown[]> = {};
  for (const e of entries) (out[e.license] ??= []).push(e);
  return JSON.stringify(out);
};
const adv = (id: number, module: string, severity: string, ghsa = `GHSA-${String(id)}`) => ({
  [String(id)]: {
    id,
    title: `aviso ${String(id)}`,
    module_name: module,
    severity,
    vulnerable_versions: '<9.9.9',
    github_advisory_id: ghsa,
  },
});
const audit = (...list: Record<string, unknown>[]) =>
  JSON.stringify({
    actions: [],
    muted: [],
    metadata: {},
    advisories: list.reduce((all, one) => ({ ...all, ...one }), {}),
  });

interface FakePnpm {
  readonly bin: string;
  readonly log: string;
}
interface Answers {
  licensesAll?: string;
  licensesProd?: string;
  auditProd?: string;
  auditDev?: string;
  /** Como el `pnpm audit` real, que sale con 1 cuando hay avisos. */
  auditExit?: number;
  licensesExit?: number;
}

/** Un `pnpm` falso: registra sus argumentos y contesta con los ficheros de `Answers`; cualquier otra orden falla. */
function fakePnpm(answers: Answers): FakePnpm {
  const dir = workdir();
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const log = join(dir, 'pnpm.log');
  const files: Record<string, string | undefined> = {
    'licenses-all': answers.licensesAll,
    'licenses-prod': answers.licensesProd,
    'audit-prod': answers.auditProd,
    'audit-dev': answers.auditDev,
  };
  for (const [name, text] of Object.entries(files)) {
    if (text !== undefined) writeFileSync(join(dir, name), text);
  }
  const script = join(bin, 'pnpm');
  writeFileSync(
    script,
    `#!/bin/sh
echo "$*" >> "${log}"
send() { if [ -f "${dir}/$1" ]; then cat "${dir}/$1"; else echo "no hay respuesta preparada para $1" >&2; exit 97; fi; }
case "$*" in
  "licenses list --prod --json") send licenses-prod; exit ${String(answers.licensesExit ?? 0)} ;;
  "licenses list --json") send licenses-all; exit ${String(answers.licensesExit ?? 0)} ;;
  "audit --prod --json") send audit-prod; exit ${String(answers.auditExit ?? 0)} ;;
  "audit --dev --json") send audit-dev; exit ${String(answers.auditExit ?? 0)} ;;
  *) echo "orden inesperada: $*" >&2; exit 99 ;;
esac
`,
  );
  chmodSync(script, 0o755);
  return { bin, log };
}

const calls = (pnpm: FakePnpm): string[] =>
  existsSync(pnpm.log) ? readFileSync(pnpm.log, 'utf8').trim().split('\n') : [];

function run(dir: string, args: string[], pnpm?: FakePnpm) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (pnpm) env.PATH = `${pnpm.bin}:${process.env.PATH ?? ''}`;
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      ['--import', TSX, SCRIPT, ...args],
      { cwd: dir, env, timeout: 60_000 },
      (error, stdout, stderr) => {
        resolve({
          code: error === null ? 0 : typeof error.code === 'number' ? error.code : -1,
          stdout,
          stderr,
        });
      },
    );
  });
}

const POLICY_PATH = 'data/dependency-policy.json';
const project = (policy = policyJson()) => workdir({ [POLICY_PATH]: policy });

describe('check-deps --licenses', () => {
  const all = byLicense(entry('a', '1.0.0', 'MIT'), entry('b', '2.0.0', 'ISC'));
  const prod = byLicense(entry('a', '1.0.0', 'MIT'));

  it('todo permitido: sale con 0, cuenta paquetes y ejecuta SOLO las dos órdenes de licencias', async () => {
    const pnpm = fakePnpm({ licensesAll: all, licensesProd: prod });
    const result = await run(project(), ['--licenses'], pnpm);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('2 paquetes (1 de producción)');
    expect(result.stdout).toContain('2 permitidas');
    expect(calls(pnpm).sort()).toEqual(['licenses list --json', 'licenses list --prod --json']);
  });

  it('una licencia no permitida en producción: sale con 1 y dice paquete, versión, licencia y ámbito', async () => {
    const pnpm = fakePnpm({
      licensesAll: byLicense(entry('evil', '1.0.0', 'GPL-3.0-only')),
      licensesProd: byLicense(entry('evil', '1.0.0', 'GPL-3.0-only')),
    });
    const result = await run(project(), ['--licenses'], pnpm);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('evil@1.0.0');
    expect(result.stderr).toContain('GPL-3.0-only');
    expect(result.stderr).toContain('producción');
  });

  it('MPL-2.0: el ámbito sale de comparar con la lista de producción (solo desarrollo pasa)', async () => {
    const mpl = byLicense(entry('tool', '1.0.0', 'MPL-2.0'));
    const emptyProd = byLicense(entry('a', '1.0.0', 'MIT'));
    const devOnly = await run(
      project(),
      ['--licenses'],
      fakePnpm({
        licensesAll: byLicense(entry('a', '1.0.0', 'MIT'), entry('tool', '1.0.0', 'MPL-2.0')),
        licensesProd: emptyProd,
      }),
    );
    expect(devOnly.code, devOnly.stderr).toBe(0);
    const inProd = await run(
      project(),
      ['--licenses'],
      fakePnpm({ licensesAll: mpl, licensesProd: mpl }),
    );
    expect(inProd.code).toBe(1);
    expect(inProd.stderr).toContain('tool@1.0.0');
  });

  describe('excepciones', () => {
    const lgpl = byLicense(entry('libvips', '1.0.0', 'LGPL-3.0-or-later'));
    const exception = (reviewBy: string) => ({
      package: 'libvips',
      license: 'LGPL-3.0-or-later',
      scope: 'prod',
      status: 'provisional',
      reason: REASON,
      reviewBy,
    });

    it('provisional y vigente: sale con 0 pero la dice, con su motivo y su plazo, en cada ejecución', async () => {
      const result = await run(
        project(policyJson({ licenseExceptions: [exception('2999-12-31')] })),
        ['--licenses'],
        fakePnpm({ licensesAll: lgpl, licensesProd: lgpl }),
      );
      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout).toContain('PENDIENTE');
      expect(result.stdout).toContain('libvips@1.0.0');
      expect(result.stdout).toContain('2999-12-31');
      expect(result.stdout).toContain(REASON);
    });

    it('provisional vencida: sale con 1 y dice que venció', async () => {
      const result = await run(
        project(policyJson({ licenseExceptions: [exception('2000-01-01')] })),
        ['--licenses'],
        fakePnpm({ licensesAll: lgpl, licensesProd: lgpl }),
      );
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('venció');
      expect(result.stderr).toContain('2000-01-01');
    });

    it('una excepción sin paquete correspondiente se avisa y no bloquea', async () => {
      const result = await run(
        project(policyJson({ licenseExceptions: [exception('2999-12-31')] })),
        ['--licenses'],
        fakePnpm({ licensesAll: all, licensesProd: prod }),
      );
      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout).toContain('AVISO');
      expect(result.stdout).toContain('libvips');
    });
  });

  it.each([
    ['`pnpm` no devuelve JSON', { licensesAll: 'esto no es JSON', licensesProd: '{}' }],
    [
      '`pnpm` falla y no devuelve nada utilizable',
      { licensesAll: '', licensesProd: '', licensesExit: 1 },
    ],
    ['la lista está vacía (no hay nada que evaluar)', { licensesAll: '{}', licensesProd: '{}' }],
    ['la forma no es la esperada', { licensesAll: '[]', licensesProd: '[]' }],
    ['falta la lista de producción', { licensesAll: byLicense(entry('a', '1.0.0', 'MIT')) }],
  ] as [string, Answers][])(
    '%s: sale con 2 (no se pudo evaluar), nunca con 0',
    async (_label, answers) => {
      const result = await run(project(), ['--licenses'], fakePnpm(answers));
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/pnpm|licencias/);
    },
  );

  it('sin `pnpm` en el PATH (o que no arranca): sale con 2', async () => {
    const dir = workdir();
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const result = await new Promise<{ code: number; stderr: string }>((resolve) => {
      execFile(
        process.execPath,
        ['--import', TSX, SCRIPT, '--licenses'],
        { cwd: project(), env: { ...process.env, PATH: bin }, timeout: 60_000 },
        (error, _stdout, stderr) =>
          resolve({
            code: error === null ? 0 : typeof error.code === 'number' ? error.code : -1,
            stderr,
          }),
      );
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('pnpm');
  });
});

describe('check-deps --audit', () => {
  const clean = audit();

  it('sin avisos: sale con 0 y ejecuta SOLO las dos auditorías (producción y desarrollo)', async () => {
    const pnpm = fakePnpm({ auditProd: clean, auditDev: clean });
    const result = await run(project(), ['--audit'], pnpm);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('0 avisos');
    expect(calls(pnpm).sort()).toEqual(['audit --dev --json', 'audit --prod --json']);
  });

  it('un aviso alto en producción: sale con 1 aunque `pnpm audit` salga con 1 y diga el paquete y la gravedad', async () => {
    const pnpm = fakePnpm({
      auditProd: audit(adv(1, 'lodash', 'high')),
      auditDev: clean,
      auditExit: 1,
    });
    const result = await run(project(), ['--audit'], pnpm);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('lodash');
    expect(result.stderr).toContain('high');
    expect(result.stderr).toContain('GHSA-1');
  });

  it('un aviso solo de desarrollo: «high» avisa y no bloquea; «critical» bloquea', async () => {
    const high = await run(
      project(),
      ['--audit'],
      fakePnpm({ auditProd: clean, auditDev: audit(adv(2, 'tool', 'high')), auditExit: 1 }),
    );
    expect(high.code, high.stderr).toBe(0);
    expect(high.stdout).toContain('AVISO');
    expect(high.stdout).toContain('tool');
    const critical = await run(
      project(),
      ['--audit'],
      fakePnpm({ auditProd: clean, auditDev: audit(adv(3, 'tool', 'critical')), auditExit: 1 }),
    );
    expect(critical.code).toBe(1);
  });

  it('un aviso que está en producción y en desarrollo cuenta como de producción', async () => {
    const both = audit(adv(4, 'shared', 'high'));
    const result = await run(
      project(),
      ['--audit'],
      fakePnpm({ auditProd: both, auditDev: both, auditExit: 1 }),
    );
    expect(result.code).toBe(1);
  });

  describe('excepciones', () => {
    const exception = (until: string) => ({
      id: 'GHSA-5',
      package: 'lodash',
      reason: REASON,
      until,
    });
    const withException = (until: string) =>
      policyJson({
        audit: { failOnProd: 'high', failOnDev: 'critical', exceptions: [exception(until)] },
      });
    const answers = { auditProd: audit(adv(5, 'lodash', 'high')), auditDev: clean, auditExit: 1 };

    it('vigente: sale con 0 y la deja a la vista con su motivo y su plazo', async () => {
      const result = await run(
        project(withException('2999-12-31')),
        ['--audit'],
        fakePnpm(answers),
      );
      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout).toContain('EXCEPTUADO');
      expect(result.stdout).toContain('2999-12-31');
      expect(result.stdout).toContain(REASON);
    });

    it('vencida: sale con 1 y dice que venció', async () => {
      const result = await run(
        project(withException('2000-01-01')),
        ['--audit'],
        fakePnpm(answers),
      );
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('venció');
    });
  });

  it.each([
    [
      'sin red: `pnpm` imprime un error en JSON',
      { auditProd: '{"error":{"code":"ENOTFOUND"}}', auditDev: '{"error":{}}', auditExit: 1 },
    ],
    [
      '`pnpm` imprime texto y falla',
      { auditProd: 'ERR_PNPM_AUDIT_BAD_RESPONSE', auditDev: '', auditExit: 1 },
    ],
    [
      'una gravedad que no conoce',
      { auditProd: audit(adv(6, 'x', 'catastrophic')), auditDev: audit() },
    ],
    ['falta la auditoría de desarrollo', { auditProd: audit() }],
  ] as [string, Answers][])(
    '%s: sale con 2 (no se pudo evaluar), nunca con 0',
    async (_label, answers) => {
      const result = await run(project(), ['--audit'], fakePnpm(answers));
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/pnpm|audit|gravedad/);
    },
  );
});

describe('check-deps (argumentos y política)', () => {
  const ok: Answers = {
    licensesAll: byLicense(entry('a', '1.0.0', 'MIT')),
    licensesProd: byLicense(entry('a', '1.0.0', 'MIT')),
    auditProd: audit(),
    auditDev: audit(),
  };

  it.each([
    ['sin modo', []],
    ['con un argumento desconocido', ['--licenses', '--lo-que-sea']],
    ['con `--policy` sin valor', ['--licenses', '--policy']],
    ['con una ruta suelta', ['--licenses', 'data/dependency-policy.json']],
  ])('%s: sale con 2 y no ejecuta nada', async (_label, args) => {
    const pnpm = fakePnpm(ok);
    const result = await run(project(), args, pnpm);
    expect(result.code).toBe(2);
    expect(calls(pnpm)).toEqual([]);
  });

  it('`--policy` (con espacio o con `=`) cambia el fichero de la política', async () => {
    const dir = workdir({ 'otra.json': policyJson() });
    expect((await run(dir, ['--licenses', '--policy', 'otra.json'], fakePnpm(ok))).code).toBe(0);
    expect((await run(dir, ['--licenses', '--policy=otra.json'], fakePnpm(ok))).code).toBe(0);
  });

  it.each([
    ['una política que no existe', () => workdir()],
    ['una política que no es JSON', () => workdir({ [POLICY_PATH]: 'no es json' })],
    ['una política con la forma equivocada', () => workdir({ [POLICY_PATH]: '{"schema":1}' })],
  ])('%s: sale con 2 y NO ejecuta pnpm (no se evalúa con otra política)', async (_label, make) => {
    // El directorio se crea AQUÍ: `afterEach` borra todos los creados, y uno hecho al recoger la prueba no sobreviviría.
    const pnpm = fakePnpm(ok);
    const result = await run(make(), ['--licenses'], pnpm);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/política/);
    expect(calls(pnpm)).toEqual([]);
  });

  it('los dos modos a la vez: un incumplimiento (1) manda sobre un «no se pudo evaluar» (2) del otro', async () => {
    const result = await run(
      project(),
      ['--licenses', '--audit'],
      fakePnpm({
        licensesAll: byLicense(entry('evil', '1.0.0', 'GPL-3.0-only')),
        licensesProd: byLicense(entry('evil', '1.0.0', 'GPL-3.0-only')),
        auditProd: 'no es json',
        auditDev: 'no es json',
      }),
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('evil@1.0.0');
    expect(result.stderr).toMatch(/pnpm|audit/);
  });

  it('los dos modos a la vez y todo bien: 0', async () => {
    const result = await run(project(), ['--licenses', '--audit'], fakePnpm(ok));
    expect(result.code, result.stderr).toBe(0);
  });
});
