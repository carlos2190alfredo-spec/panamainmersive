import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EMPTY_SNAPSHOT,
  parseSnapshot,
  serializeSnapshot,
} from '../../src/domains/content/snapshot';
import { createTestDb, seedPeople, type TestDb } from './helpers';
import { makeVerified } from './content-helpers';

/**
 * El CLI REAL (`pnpm content:export`), como proceso, contra una base temporal. Hasta ahora solo se probaba
 * `exportPublished`: los argumentos, los códigos de salida, la guardia de host y la escritura atómica no tenían
 * ninguna prueba, y la revisión independiente los rompió a mano (errata en un flag → sobrescribe el archivo
 * versionado; `?host=` evita la guardia; una URL malformada vuelca la contraseña).
 *
 * Cada ejecución usa un directorio de trabajo temporal: el modo por defecto escribe en SU `data/content/`, nunca en
 * el archivo versionado del repositorio.
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TSX = join(ROOT, 'node_modules/.bin/tsx');
const SCRIPT = join(ROOT, 'scripts/content/export-published.ts');
const SENTINEL = '{"centinela":"no debe cambiar"}\n';

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(cwd: string, args: string[], env: Record<string, string>): Promise<Run> {
  return new Promise((resolve) => {
    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
    delete childEnv.CONTENT_CONFIRM_REMOTE;
    execFile(
      TSX,
      ['--tsconfig', join(ROOT, 'tsconfig.json'), SCRIPT, ...args],
      { cwd, env: { ...childEnv, ...env }, encoding: 'utf8', timeout: 60_000 },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

function workdir(): { cwd: string; published: string; leftovers: () => string[] } {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-export-cli-'));
  mkdirSync(join(cwd, 'data/content'), { recursive: true });
  const published = join(cwd, 'data/content/published.json');
  return {
    cwd,
    published,
    leftovers: () => readdirSync(join(cwd, 'data/content')).filter((f) => f !== 'published.json'),
  };
}

describe('CLI content:export', () => {
  let db: TestDb;
  const dirs: string[] = [];
  const fresh = () => {
    const w = workdir();
    dirs.push(w.cwd);
    return w;
  };

  beforeAll(async () => {
    db = await createTestDb();
    await seedPeople(db);
    const dest = await db.owner.query<{ id: string }>(
      "insert into public.destinations (key, kind, status) values ('boquete', 'locality', 'published') returning id",
    );
    await makeVerified(db, {
      destinationId: (dest.rows[0] as { id: string }).id,
      text: '[prueba] resumen',
    });
  }, 120_000);
  afterAll(async () => {
    await db.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('--dry-run resume y NO escribe nada', async () => {
    const w = fresh();
    const r = await runCli(w.cwd, ['--dry-run'], { DATABASE_URL: db.connectionString });
    expect(r.code, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ assertions: 1, destinations: 1, wrote: false });
    expect(existsSync(w.published)).toBe(false);
  });

  it('avisa de las fuentes SIN idioma declarado (la ficha no puede marcar `lang`), sin convertirlo en un fallo', async () => {
    const w = fresh();
    const r = await runCli(w.cwd, ['--dry-run'], { DATABASE_URL: db.connectionString });
    expect(r.code, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ sourcesWithoutLanguage: 1 });
    expect(r.stderr).toMatch(/AVISO: 1 fuente\(s\) sin idioma declarado.*WCAG 3\.1\.2/);
  });

  it('por defecto escribe un archivo válido y atómico (sin temporales) que --check reconoce al día', async () => {
    const w = fresh();
    const env = { DATABASE_URL: db.connectionString };
    const written = await runCli(w.cwd, [], env);
    expect(written.code, written.stderr).toBe(0);
    expect(JSON.parse(written.stdout)).toMatchObject({ assertions: 1 });
    const snapshot = parseSnapshot(JSON.parse(readFileSync(w.published, 'utf8')));
    expect(snapshot.assertions).toHaveLength(1);
    expect(readFileSync(w.published, 'utf8')).toBe(serializeSnapshot(snapshot));
    expect(w.leftovers()).toEqual([]);

    const same = await runCli(w.cwd, ['--check'], env);
    expect(same.code, same.stderr).toBe(0);
    expect(JSON.parse(same.stdout)).toMatchObject({ upToDate: true });

    writeFileSync(w.published, serializeSnapshot(EMPTY_SNAPSHOT));
    const stale = await runCli(w.cwd, ['--check'], env);
    expect(stale.code).toBe(1);
    expect(JSON.parse(stale.stdout)).toMatchObject({ upToDate: false });
    // --check nunca escribe
    expect(readFileSync(w.published, 'utf8')).toBe(serializeSnapshot(EMPTY_SNAPSHOT));
  });

  it.each([
    ['una errata en el flag', ['--chek']],
    ['guion bajo', ['--dry_run']],
    ['un booleano con valor', ['--check=true']],
    ['--out sin valor', ['--out']],
    ['--check y --dry-run juntos', ['--check', '--dry-run']],
  ])('%s: sale con 2 y NO toca el archivo versionado', async (_name, args) => {
    const w = fresh();
    writeFileSync(w.published, SENTINEL);
    const r = await runCli(w.cwd, args, { DATABASE_URL: db.connectionString });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Uso: pnpm content:export');
    expect(readFileSync(w.published, 'utf8')).toBe(SENTINEL);
    expect(w.leftovers()).toEqual([]);
  });

  it('--out=<ruta> escribe en esa ruta y no en la de por defecto', async () => {
    const w = fresh();
    writeFileSync(w.published, SENTINEL);
    const other = join(w.cwd, 'otra.json');
    const r = await runCli(w.cwd, [`--out=${other}`], { DATABASE_URL: db.connectionString });
    expect(r.code, r.stderr).toBe(0);
    expect(parseSnapshot(JSON.parse(readFileSync(other, 'utf8'))).assertions).toHaveLength(1);
    expect(readFileSync(w.published, 'utf8')).toBe(SENTINEL);
  });

  it('una base remota se rechaza (3) aunque la URL diga localhost: manda el host real de pg', async () => {
    const w = fresh();
    writeFileSync(w.published, SENTINEL);
    const r = await runCli(w.cwd, [], {
      DATABASE_URL: 'postgresql://postgres@localhost/db?host=zz-remote-host.invalid',
    });
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('CONTENT_CONFIRM_REMOTE=zz-remote-host.invalid');
    expect(readFileSync(w.published, 'utf8')).toBe(SENTINEL);
  });

  it('una DATABASE_URL malformada sale con 2 y no vuelca la contraseña', async () => {
    const w = fresh();
    const r = await runCli(w.cwd, [], {
      DATABASE_URL: 'postgresql://panama:Sup3r/Secret@db.example.com:5x/db',
    });
    expect(r.code).toBe(2);
    for (const secret of ['Sup3r', 'Secret']) {
      expect(r.stdout + r.stderr).not.toContain(secret);
    }
  });

  it('si la exportación falla, el archivo existente queda intacto y sin temporales', async () => {
    const local = await createTestDb();
    const w = fresh();
    try {
      await seedPeople(local);
      const dest = await local.owner.query<{ id: string }>(
        "insert into public.destinations (key, kind, status) values ('no-esta-en-el-registro', 'locality', 'published') returning id",
      );
      await makeVerified(local, { destinationId: (dest.rows[0] as { id: string }).id });
      writeFileSync(w.published, SENTINEL);
      const r = await runCli(w.cwd, [], { DATABASE_URL: local.connectionString });
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('No se escribió nada');
      expect(readFileSync(w.published, 'utf8')).toBe(SENTINEL);
      expect(w.leftovers()).toEqual([]);
    } finally {
      await local.close();
    }
  }, 120_000);

  it('si no se puede reemplazar el destino (p. ej. es un directorio), falla (1) sin dejar un temporal huérfano', async () => {
    const w = fresh();
    const target = join(w.cwd, 'es-un-directorio');
    mkdirSync(target);
    writeFileSync(join(target, 'dentro.txt'), 'no se toca');
    const r = await runCli(w.cwd, [`--out=${target}`], { DATABASE_URL: db.connectionString });
    expect(r.code).toBe(1);
    expect(readdirSync(w.cwd).sort()).toEqual(['data', 'es-un-directorio']);
    expect(readdirSync(target)).toEqual(['dentro.txt']);
  });

  it('una exclusión avisa con código 4 (el archivo se escribe igualmente); --allow-exclusions lo acepta', async () => {
    const local = await createTestDb();
    try {
      await seedPeople(local);
      const dest = await local.owner.query<{ id: string }>(
        "insert into public.destinations (key, kind, status) values ('boquete', 'locality', 'published') returning id",
      );
      const destId = (dest.rows[0] as { id: string }).id;
      // La BD admitió una fuente de 400 días para «entry_rules»; el registro de código (180) es más estricto.
      await local.owner.query(
        "update public.content_fields set evidence_max_age_days = 3650 where key = 'restrictions.entry_rules'",
      );
      await makeVerified(local, {
        destinationId: destId,
        fieldKey: 'restrictions.entry_rules',
        validUntilDays: 30,
        retrievedDaysAgo: 400,
      });
      await makeVerified(local, { destinationId: destId, text: '[prueba] resumen sano' });
      const env = { DATABASE_URL: local.connectionString };

      const w = fresh();
      const strict = await runCli(w.cwd, [], env);
      expect(strict.code, strict.stderr).toBe(4);
      expect(strict.stderr).toContain('EXCLUIDA boquete/restrictions.entry_rules@1');
      expect(JSON.parse(strict.stdout)).toMatchObject({ assertions: 1, excluded: 1 });
      const snapshot = parseSnapshot(JSON.parse(readFileSync(w.published, 'utf8')));
      expect(snapshot.assertions.map((a) => a.fieldKey)).toEqual(['overview.summary']);

      const allowed = await runCli(fresh().cwd, ['--allow-exclusions', '--dry-run'], env);
      expect(allowed.code, allowed.stderr).toBe(0);
      expect(allowed.stderr).toContain('EXCLUIDA');
    } finally {
      await local.close();
    }
  }, 120_000);
});
