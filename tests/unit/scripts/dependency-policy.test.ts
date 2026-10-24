import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkAudit,
  checkLicenses,
  licenseAllowed,
  mergeAdvisories,
  parseAudit,
  parseLicenseList,
  parsePolicy,
  withScopes,
  type Advisory,
  type PackageLicense,
  type Policy,
} from '../../../scripts/lib/dependency-policy';

/**
 * Política de dependencias y licencias (PROMPT-MAESTRO §18: «Comprueba dependencias y licencias sin bloquear el proyecto
 * por alertas no relacionadas o no aplicables»; `docs/security.md` lo declaraba y no estaba implementado). La política vive
 * en `data/dependency-policy.json`; esto prueba la lógica con entradas sintéticas y vigila el fichero real.
 */
const TODAY = '2026-10-24';

function policy(over: Partial<Policy> = {}): Policy {
  return {
    schema: 1,
    reviewedOn: '2026-10-24',
    note: 'sintética',
    allowedLicenses: { prod: ['MIT', 'ISC', 'Apache-2.0'], dev: ['MPL-2.0'] },
    licenseExceptions: [],
    audit: { failOnProd: 'high', failOnDev: 'critical', exceptions: [] },
    ...over,
  };
}

function pkg(over: Partial<PackageLicense> = {}): PackageLicense {
  return { name: 'left-pad', version: '1.0.0', license: 'MIT', scope: 'prod', ...over };
}

function advisory(over: Partial<Advisory> = {}): Advisory {
  return {
    id: '1106913',
    ghsa: 'GHSA-35jh-r3h4-6jhm',
    title: 'Command Injection in lodash',
    module: 'lodash',
    severity: 'high',
    vulnerable: '<4.17.21',
    scope: 'prod',
    ...over,
  };
}

describe('licenseAllowed (expresiones SPDX; falla cerrado)', () => {
  const allowed = new Set(['mit', 'isc', 'apache-2.0']);
  const ok = (expression: string) => licenseAllowed(expression, allowed);

  it('un identificador de la lista pasa y uno que no está, no', () => {
    expect(ok('MIT')).toBe(true);
    expect(ok('Apache-2.0')).toBe(true);
    expect(ok('GPL-3.0-only')).toBe(false);
  });

  it('los identificadores SPDX no distinguen mayúsculas de minúsculas', () => {
    expect(ok('mit')).toBe(true);
    expect(ok('APACHE-2.0')).toBe(true);
  });

  it('OR: basta una alternativa permitida', () => {
    expect(ok('(MIT OR GPL-3.0-only)')).toBe(true);
    expect(ok('GPL-3.0-only OR MIT')).toBe(true);
    expect(ok('GPL-3.0-only OR LGPL-3.0-only')).toBe(false);
  });

  it('AND: hacen falta todas', () => {
    expect(ok('Apache-2.0 AND MIT')).toBe(true);
    expect(ok('MIT AND GPL-3.0-only')).toBe(false);
  });

  it('AND liga más fuerte que OR y los paréntesis mandan', () => {
    expect(ok('MIT OR GPL-3.0-only AND LGPL-3.0-only')).toBe(true); // MIT OR (GPL AND LGPL)
    expect(ok('GPL-3.0-only AND LGPL-3.0-only OR MIT')).toBe(true);
    expect(ok('(GPL-3.0-only OR MIT) AND LGPL-3.0-only')).toBe(false);
    expect(ok('((MIT))')).toBe(true);
    expect(ok('(MIT AND (ISC OR GPL-3.0-only))')).toBe(true);
  });

  it('`WITH` (excepción de licencia) solo añade permisos: vale lo que valga la licencia base', () => {
    expect(ok('MIT WITH Classpath-exception-2.0')).toBe(true);
    expect(ok('GPL-2.0-only WITH Classpath-exception-2.0')).toBe(false);
  });

  it.each([
    '',
    '   ',
    'UNKNOWN',
    'Unknown',
    'SEE LICENSE IN LICENSE.md',
    'MIT OR',
    'OR MIT',
    '(MIT',
    'MIT)',
    '()',
    'MIT AND AND ISC',
    'MIT and ISC',
    'MIT WITH',
    'MIT MIT',
    'MIT; DROP TABLE',
  ])('«%s» no es una expresión válida: se rechaza', (expression) => {
    expect(ok(expression)).toBe(false);
  });

  it('un identificador que contiene OR o AND dentro (no como operador) es un identificador', () => {
    expect(licenseAllowed('ORACLE-1.0', new Set(['oracle-1.0']))).toBe(true);
    expect(licenseAllowed('ANDROID-1.0', new Set(['android-1.0']))).toBe(true);
  });
});

describe('checkLicenses', () => {
  it('una licencia permitida en su ámbito pasa', () => {
    const report = checkLicenses([pkg(), pkg({ name: 'b', license: 'ISC' })], policy(), TODAY);
    expect(report.violations).toEqual([]);
    expect(report.pending).toEqual([]);
    expect(report.counts).toMatchObject({ allowed: 2, violations: 0 });
  });

  it('MPL-2.0 vale en desarrollo (no se distribuye) y no en producción', () => {
    const dev = checkLicenses([pkg({ license: 'MPL-2.0', scope: 'dev' })], policy(), TODAY);
    expect(dev.violations).toEqual([]);
    const prod = checkLicenses([pkg({ license: 'MPL-2.0', scope: 'prod' })], policy(), TODAY);
    expect(prod.violations).toHaveLength(1);
  });

  it('en desarrollo también valen las licencias de producción', () => {
    expect(checkLicenses([pkg({ scope: 'dev' })], policy(), TODAY).violations).toEqual([]);
  });

  it('una licencia fuera de la lista, o desconocida, o vacía, es una violación que dice paquete y licencia', () => {
    for (const license of ['GPL-3.0-only', 'UNKNOWN', '']) {
      const { violations } = checkLicenses([pkg({ license })], policy(), TODAY);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatchObject({ reason: 'not-allowed' });
      expect(violations[0]?.pkg.name).toBe('left-pad');
    }
  });

  describe('excepciones', () => {
    const exception = {
      package: 'sharp-libvips',
      license: 'LGPL-3.0-or-later',
      scope: 'prod' as const,
      status: 'provisional' as const,
      reason: 'Biblioteca nativa opcional de next; no se distribuye al navegador.',
      reviewBy: '2027-01-22',
    };
    const lgpl = pkg({ name: 'sharp-libvips', license: 'LGPL-3.0-or-later' });

    it('provisional y en plazo: pasa PERO queda pendiente a la vista', () => {
      const report = checkLicenses([lgpl], policy({ licenseExceptions: [exception] }), TODAY);
      expect(report.violations).toEqual([]);
      expect(report.pending).toHaveLength(1);
      expect(report.counts).toMatchObject({ provisional: 1, violations: 0 });
    });

    it('el último día del plazo todavía vale; al día siguiente es una violación («decide»)', () => {
      const p = policy({ licenseExceptions: [exception] });
      expect(checkLicenses([lgpl], p, '2027-01-22').violations).toEqual([]);
      const late = checkLicenses([lgpl], p, '2027-01-23');
      expect(late.violations).toHaveLength(1);
      expect(late.violations[0]).toMatchObject({ reason: 'exception-expired' });
    });

    it('aceptada por una persona: pasa y no figura como pendiente', () => {
      const accepted = {
        package: exception.package,
        license: exception.license,
        scope: exception.scope,
        status: 'accepted' as const,
        reason: exception.reason,
        reviewedBy: 'Responsable legal',
      };
      const report = checkLicenses([lgpl], policy({ licenseExceptions: [accepted] }), '2099-01-01');
      expect(report.violations).toEqual([]);
      expect(report.pending).toEqual([]);
      expect(report.counts).toMatchObject({ accepted: 1 });
    });

    it('si el paquete cambia de licencia en una versión nueva, la excepción ya no lo cubre', () => {
      const changed = pkg({ name: 'sharp-libvips', license: 'GPL-3.0-only' });
      const report = checkLicenses([changed], policy({ licenseExceptions: [exception] }), TODAY);
      expect(report.violations).toHaveLength(1);
    });

    it('una excepción de producción no cubre el mismo paquete en desarrollo, ni al revés', () => {
      const asDev = pkg({ name: 'sharp-libvips', license: 'LGPL-3.0-or-later', scope: 'dev' });
      expect(
        checkLicenses([asDev], policy({ licenseExceptions: [exception] }), TODAY).violations,
      ).toHaveLength(1);
    });

    it('una excepción que no corresponde a ningún paquete se avisa (no bloquea: depende de la plataforma)', () => {
      const report = checkLicenses([pkg()], policy({ licenseExceptions: [exception] }), TODAY);
      expect(report.violations).toEqual([]);
      expect(report.staleExceptions).toEqual([exception]);
    });
  });

  it('cada versión se evalúa por separado', () => {
    const report = checkLicenses(
      [pkg({ version: '1.0.0' }), pkg({ version: '2.0.0', license: 'GPL-3.0-only' })],
      policy(),
      TODAY,
    );
    expect(report.violations.map((v) => v.pkg.version)).toEqual(['2.0.0']);
  });
});

describe('parseLicenseList y withScopes (salida de `pnpm licenses list --json`)', () => {
  const sample = {
    MIT: [
      { name: 'a', versions: ['1.0.0', '2.0.0'], license: 'MIT' },
      { name: 'b', versions: ['3.0.0'], license: 'MIT' },
    ],
    'Apache-2.0 AND MIT': [{ name: 'c', versions: ['0.1.0'], license: 'Apache-2.0 AND MIT' }],
  };

  it('expande cada versión de cada paquete con su licencia', () => {
    expect(parseLicenseList(sample)).toEqual([
      { name: 'a', version: '1.0.0', license: 'MIT' },
      { name: 'a', version: '2.0.0', license: 'MIT' },
      { name: 'b', version: '3.0.0', license: 'MIT' },
      { name: 'c', version: '0.1.0', license: 'Apache-2.0 AND MIT' },
    ]);
  });

  it('la clave del objeto es la licencia (si el paquete no la repite)', () => {
    expect(parseLicenseList({ ISC: [{ name: 'x', versions: ['1.0.0'] }] })).toEqual([
      { name: 'x', version: '1.0.0', license: 'ISC' },
    ]);
  });

  it.each([
    ['no es un objeto', []],
    ['una entrada sin nombre', { MIT: [{ versions: ['1.0.0'] }] }],
    ['una entrada sin versiones', { MIT: [{ name: 'a' }] }],
    ['versiones vacías', { MIT: [{ name: 'a', versions: [] }] }],
    ['la lista de una licencia no es un array', { MIT: { name: 'a' } }],
    ['un objeto vacío (nada que evaluar)', {}],
  ])('%s: se rechaza (no se pudo evaluar)', (_label, raw) => {
    expect(() => parseLicenseList(raw)).toThrow();
  });

  it('withScopes: lo que está en la lista de producción es producción, el resto desarrollo', () => {
    const all = parseLicenseList(sample);
    const prod = parseLicenseList({ MIT: [{ name: 'a', versions: ['1.0.0'], license: 'MIT' }] });
    const scoped = withScopes(all, prod);
    expect(scoped.map((p) => `${p.name}@${p.version}:${p.scope}`)).toEqual([
      'a@1.0.0:prod',
      'a@2.0.0:dev',
      'b@3.0.0:dev',
      'c@0.1.0:dev',
    ]);
  });
});

describe('parseAudit y mergeAdvisories (salida de `pnpm audit --json`)', () => {
  const raw = {
    actions: [],
    muted: [],
    metadata: {},
    advisories: {
      '1106913': {
        id: 1106913,
        title: 'Command Injection in lodash',
        module_name: 'lodash',
        severity: 'high',
        vulnerable_versions: '<4.17.21',
        github_advisory_id: 'GHSA-35jh-r3h4-6jhm',
      },
    },
  };

  it('lee id, GHSA, paquete, gravedad y rango, y asigna el ámbito de la ejecución', () => {
    expect(parseAudit(raw, 'prod')).toEqual([advisory()]);
    expect(parseAudit(raw, 'dev')[0]?.scope).toBe('dev');
  });

  it('sin avisos es una lista vacía válida (no es lo mismo que «no se pudo ejecutar»)', () => {
    expect(parseAudit({ advisories: {}, metadata: {}, actions: [], muted: [] }, 'prod')).toEqual(
      [],
    );
  });

  it('un aviso sin GHSA queda con `ghsa: null`', () => {
    const noGhsa = {
      ...raw,
      advisories: { '1': { ...raw.advisories['1106913'], github_advisory_id: undefined } },
    };
    expect(parseAudit(noGhsa, 'prod')[0]?.ghsa).toBeNull();
  });

  it.each([
    ['sin `advisories` (p. ej. un error de red en JSON)', { error: { code: 'ENOTFOUND' } }],
    ['`advisories` no es un objeto', { advisories: [] }],
    [
      'una gravedad desconocida',
      { advisories: { '1': { ...raw.advisories['1106913'], severity: 'catastrophic' } } },
    ],
    ['un aviso sin paquete', { advisories: { '1': { id: 1, severity: 'high', title: 't' } } }],
    ['no es un objeto', 'texto'],
  ])('%s: se rechaza (no se pudo evaluar)', (_label, bad) => {
    expect(() => parseAudit(bad, 'prod')).toThrow();
  });

  it('mergeAdvisories: un aviso que está en producción NO se degrada a desarrollo', () => {
    const merged = mergeAdvisories(
      [advisory({ scope: 'prod' })],
      [advisory({ scope: 'dev' }), advisory({ id: '2', scope: 'dev' })],
    );
    expect(merged.map((a) => `${a.id}:${a.scope}`).sort()).toEqual(['1106913:prod', '2:dev']);
  });
});

describe('checkAudit', () => {
  it('sin avisos: nada que decir', () => {
    expect(checkAudit([], policy(), TODAY)).toMatchObject({ violations: [], warnings: [] });
  });

  it('producción: «high» o peor bloquea; «moderate» solo avisa', () => {
    const report = checkAudit(
      [advisory({ severity: 'high' }), advisory({ id: '2', severity: 'moderate' })],
      policy(),
      TODAY,
    );
    expect(report.violations.map((v) => v.advisory.id)).toEqual(['1106913']);
    expect(report.warnings.map((w) => w.id)).toEqual(['2']);
  });

  it('desarrollo: solo «critical» bloquea (una herramienta de compilación no se despliega)', () => {
    const report = checkAudit(
      [
        advisory({ scope: 'dev', severity: 'high' }),
        advisory({ id: '3', scope: 'dev', severity: 'critical' }),
      ],
      policy(),
      TODAY,
    );
    expect(report.violations.map((v) => v.advisory.id)).toEqual(['3']);
    expect(report.warnings.map((w) => w.id)).toEqual(['1106913']);
  });

  it('los umbrales salen de la política, no del código', () => {
    const strict = policy({ audit: { failOnProd: 'low', failOnDev: 'moderate', exceptions: [] } });
    expect(checkAudit([advisory({ severity: 'low' })], strict, TODAY).violations).toHaveLength(1);
    expect(
      checkAudit([advisory({ scope: 'dev', severity: 'moderate' })], strict, TODAY).violations,
    ).toHaveLength(1);
  });

  describe('excepciones («no aplicables», con motivo y plazo)', () => {
    const exception = {
      id: 'GHSA-35jh-r3h4-6jhm',
      package: 'lodash',
      reason: 'Solo se usa con entradas propias constantes; no hay ruta de explotación.',
      until: '2026-12-31',
    };
    const withException = policy({
      audit: { failOnProd: 'high', failOnDev: 'critical', exceptions: [exception] },
    });

    it('por GHSA o por id numérico, dentro del plazo: no bloquea y queda a la vista', () => {
      for (const id of [exception.id, '1106913']) {
        const p = policy({
          audit: { failOnProd: 'high', failOnDev: 'critical', exceptions: [{ ...exception, id }] },
        });
        const report = checkAudit([advisory()], p, TODAY);
        expect(report.violations).toEqual([]);
        expect(report.excepted).toHaveLength(1);
      }
    });

    it('vencida: vuelve a bloquear y dice que la excepción venció', () => {
      const report = checkAudit([advisory()], withException, '2027-01-01');
      expect(report.violations).toHaveLength(1);
      expect(report.violations[0]).toMatchObject({ reason: 'exception-expired' });
    });

    it('debe coincidir también el paquete (un id repetido en otro paquete no queda exceptuado)', () => {
      const report = checkAudit([advisory({ module: 'otro' })], withException, TODAY);
      expect(report.violations).toHaveLength(1);
    });

    it('una excepción sin aviso correspondiente se avisa como obsoleta', () => {
      const report = checkAudit([], withException, TODAY);
      expect(report.staleExceptions).toEqual([exception]);
    });
  });
});

describe('parsePolicy', () => {
  const valid = () => JSON.parse(JSON.stringify(policy())) as Record<string, unknown>;

  it('acepta una política válida', () => {
    expect(parsePolicy(valid())).toEqual(policy());
  });

  it.each([
    ['otro número de esquema', (p: Record<string, unknown>) => (p.schema = 2)],
    ['una clave desconocida', (p: Record<string, unknown>) => (p.extra = 1)],
    ['una fecha imposible', (p: Record<string, unknown>) => (p.reviewedOn = '2026-02-31')],
    ['una fecha sin formato ISO', (p: Record<string, unknown>) => (p.reviewedOn = '24/10/2026')],
    [
      'un identificador de licencia con espacios',
      (p: Record<string, unknown>) => (p.allowedLicenses = { prod: ['MIT OR ISC'], dev: [] }),
    ],
    [
      'un comodín en la lista de licencias',
      (p: Record<string, unknown>) => (p.allowedLicenses = { prod: ['*'], dev: [] }),
    ],
    [
      'licencias repetidas',
      (p: Record<string, unknown>) => (p.allowedLicenses = { prod: ['MIT', 'mit'], dev: [] }),
    ],
    [
      'una gravedad desconocida',
      (p: Record<string, unknown>) =>
        (p.audit = { failOnProd: 'severe', failOnDev: 'high', exceptions: [] }),
    ],
  ])('rechaza %s', (_label, mutate) => {
    const p = valid();
    mutate(p);
    expect(() => parsePolicy(p)).toThrow();
  });

  describe('excepciones de licencia', () => {
    const base = {
      package: 'x',
      license: 'LGPL-3.0-or-later',
      scope: 'prod',
      reason: 'Un motivo con suficiente detalle para poder revisarlo.',
    };
    const withExceptions = (...list: object[]) => ({ ...valid(), licenseExceptions: list });

    it('provisional necesita `reviewBy` y no admite `reviewedBy`', () => {
      expect(() =>
        parsePolicy(withExceptions({ ...base, status: 'provisional', reviewBy: '2027-01-22' })),
      ).not.toThrow();
      expect(() => parsePolicy(withExceptions({ ...base, status: 'provisional' }))).toThrow();
      expect(() =>
        parsePolicy(
          withExceptions({
            ...base,
            status: 'provisional',
            reviewBy: '2027-01-22',
            reviewedBy: 'Ana',
          }),
        ),
      ).toThrow();
    });

    it('aceptada necesita quién la aceptó y no lleva plazo', () => {
      expect(() =>
        parsePolicy(
          withExceptions({ ...base, status: 'accepted', reviewedBy: 'Responsable legal' }),
        ),
      ).not.toThrow();
      expect(() => parsePolicy(withExceptions({ ...base, status: 'accepted' }))).toThrow();
      expect(() =>
        parsePolicy(
          withExceptions({
            ...base,
            status: 'accepted',
            reviewedBy: 'Ana',
            reviewBy: '2027-01-22',
          }),
        ),
      ).toThrow();
    });

    it('exige un motivo con detalle, un estado conocido y un ámbito conocido', () => {
      const ok = { ...base, status: 'provisional', reviewBy: '2027-01-22' };
      expect(() => parsePolicy(withExceptions({ ...ok, reason: 'ok' }))).toThrow();
      expect(() => parsePolicy(withExceptions({ ...ok, status: 'maybe' }))).toThrow();
      expect(() => parsePolicy(withExceptions({ ...ok, scope: 'all' }))).toThrow();
    });

    it('una licencia exceptuada es UNA, no una expresión ni un comodín', () => {
      const ok = { ...base, status: 'provisional', reviewBy: '2027-01-22' };
      expect(() => parsePolicy(withExceptions({ ...ok, license: '*' }))).toThrow();
      expect(() => parsePolicy(withExceptions({ ...ok, package: '*' }))).toThrow();
    });

    it('no admite dos excepciones para el mismo paquete, licencia y ámbito', () => {
      const ok = { ...base, status: 'provisional', reviewBy: '2027-01-22' };
      expect(() => parsePolicy(withExceptions(ok, ok))).toThrow();
    });
  });

  it('las excepciones de avisos exigen id, paquete, motivo con detalle y plazo', () => {
    const e = {
      id: 'GHSA-35jh-r3h4-6jhm',
      package: 'lodash',
      reason: 'Un motivo con suficiente detalle para poder revisarlo.',
      until: '2026-12-31',
    };
    const wrap = (x: object) => ({
      ...valid(),
      audit: { failOnProd: 'high', failOnDev: 'critical', exceptions: [x] },
    });
    expect(() => parsePolicy(wrap(e))).not.toThrow();
    expect(() => parsePolicy(wrap({ ...e, until: undefined }))).toThrow();
    expect(() => parsePolicy(wrap({ ...e, reason: 'no aplica' }))).toThrow();
    expect(() => parsePolicy(wrap({ ...e, package: '' }))).toThrow();
    expect(() =>
      parsePolicy({
        ...valid(),
        audit: { failOnProd: 'high', failOnDev: 'critical', exceptions: [e, e] },
      }),
    ).toThrow();
  });
});

describe('el fichero REAL data/dependency-policy.json', () => {
  const root = process.cwd();
  const raw: unknown = JSON.parse(readFileSync(join(root, 'data/dependency-policy.json'), 'utf8'));
  const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');

  it('es una política válida', () => {
    expect(() => parsePolicy(raw)).not.toThrow();
  });

  it('no permite licencias de copyleft fuerte ni de uso restringido en ningún ámbito', () => {
    const p = parsePolicy(raw);
    const all = [...p.allowedLicenses.prod, ...p.allowedLicenses.dev].map((l) => l.toLowerCase());
    for (const id of all) {
      expect(id, id).not.toMatch(/^(a?gpl|lgpl|sspl|busl|cc-by-nc|unlicensed|proprietary)/);
    }
  });

  it('toda excepción nombra un paquete que EXISTE en pnpm-lock.yaml (sin excepciones muertas)', () => {
    const p = parsePolicy(raw);
    for (const e of p.licenseExceptions) {
      expect(lock, e.package).toContain(`${e.package}@`);
    }
    for (const e of p.audit.exceptions) {
      expect(lock, e.package).toContain(`${e.package}@`);
    }
  });

  it('las excepciones de licencia son PROVISIONALES salvo que una persona las haya aceptado (nombrada)', () => {
    const p = parsePolicy(raw);
    for (const e of p.licenseExceptions) {
      if (e.status === 'accepted') expect(e.reviewedBy.length).toBeGreaterThan(2);
      else expect(e.reviewBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
