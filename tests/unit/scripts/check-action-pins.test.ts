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
import { lsRemoteTags } from '../../../scripts/lib/action-pins';

/**
 * `scripts/check-action-pins.ts` de punta a punta: la lógica pura se prueba en `action-pins.test.ts`; esto vigila el
 * PEGAMENTO (0 bien · 1 incumple · 2 no se pudo evaluar) y que la comprobación EN LÍNEA no toca la red salvo que se pida.
 * Nunca hay red: un `git` falso, el primero del PATH, devuelve la salida de `ls-remote` que cada caso prepara.
 */
const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts/check-action-pins.ts');
const TSX = pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href;
const SHA_A = '11d5960a326750d5838078e36cf38b85af677262';
const SHA_B = '49933ea5288caeca8642d1e84afbd3f7d6820020';
const SHA_C = 'b906affcce14559ad1aafd4ab0e942779e9f58b1';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workdir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pi-action-pins-'));
  dirs.push(dir);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  return dir;
}

const workflow = (...lines: string[]) =>
  `name: x\njobs:\n  a:\n    steps:\n${lines.map((l) => `      - uses: ${l}`).join('\n')}\n`;

const GOOD = workflow(
  `actions/checkout@${SHA_A} # v4.4.0`,
  `actions/setup-node@${SHA_B} # v4.4.0`,
  `actions/checkout@${SHA_A} # v4.4.0`,
);

interface FakeGit {
  readonly bin: string;
  readonly log: string;
}

/** Un `git` falso: registra sus argumentos y devuelve `<dir>/<owner>_<repo>.out`, o falla como un repositorio inexistente. */
function fakeGit(outputs: Record<string, string>): FakeGit {
  const dir = workdir({});
  const log = join(dir, 'git.log');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  for (const [repo, text] of Object.entries(outputs)) {
    writeFileSync(join(dir, `${repo.replace('/', '_')}.out`), text);
  }
  const script = join(bin, 'git');
  writeFileSync(
    script,
    `#!/bin/sh
echo "$* | prompt=$GIT_TERMINAL_PROMPT" >> "${log}"
repo=$(echo "$3" | sed 's#https://github.com/##')
file="${dir}/$(echo "$repo" | tr '/' '_').out"
if [ -f "$file" ]; then cat "$file"; exit 0; fi
echo "fatal: repository '$3' not found" >&2
exit 128
`,
  );
  chmodSync(script, 0o755);
  return { bin, log };
}

const calls = (git: FakeGit): string[] =>
  existsSync(git.log) ? readFileSync(git.log, 'utf8').trim().split('\n') : [];

function run(dir: string, args: string[], git?: FakeGit) {
  // `GIT_TERMINAL_PROMPT=1` a propósito: este entorno (y otros) ya lo trae a `0`, y entonces la prueba de que el guion lo
  // fuerza a `0` pasaría sin medir nada (una mutación que quita esa línea sobrevivía).
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '1' };
  if (git) env.PATH = `${git.bin}:${process.env.PATH ?? ''}`;
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

describe('check-action-pins (sin red)', () => {
  it('todo fijado: sale con 0, cuenta usos y acciones y NO ejecuta git', async () => {
    const dir = workdir({ '.github/workflows/ci.yml': GOOD });
    const git = fakeGit({});
    const result = await run(dir, [], git);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('3 usos');
    expect(result.stdout).toContain('2 acciones distintas');
    expect(calls(git)).toEqual([]);
  });

  it('una etiqueta móvil: sale con 1 y dice fichero, línea y acción', async () => {
    const dir = workdir({
      '.github/workflows/ci.yml': workflow(`actions/checkout@${SHA_A} # v4.4.0`, 'a/b@v4'),
    });
    const result = await run(dir, []);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('.github/workflows/ci.yml:6');
    expect(result.stderr).toContain('a/b@v4');
  });

  it('lee TODOS los flujos del directorio (.yml y .yaml) e informa de cada uno', async () => {
    const dir = workdir({
      '.github/workflows/a.yml': GOOD,
      '.github/workflows/b.yaml': workflow('x/y@main'),
      '.github/workflows/notas.md': 'uses: no/leer@v1',
    });
    const result = await run(dir, []);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('b.yaml');
    expect(result.stderr).not.toContain('no/leer');
  });

  it('`--workflows` cambia el directorio', async () => {
    const dir = workdir({ 'otros/ci.yml': GOOD });
    expect((await run(dir, ['--workflows', 'otros'])).code).toBe(0);
    expect((await run(dir, ['--workflows=otros'])).code).toBe(0);
  });

  it.each([
    ['sin el directorio de flujos', {}, []],
    ['con el directorio vacío', { '.github/workflows/.keep': '' }, []],
    ['con un argumento desconocido', { '.github/workflows/ci.yml': GOOD }, ['--lo-que-sea']],
    ['con `--workflows` sin valor', { '.github/workflows/ci.yml': GOOD }, ['--workflows']],
    ['con una ruta suelta', { '.github/workflows/ci.yml': GOOD }, ['ci.yml']],
  ])('%s: sale con 2 (no se pudo evaluar), nunca con 0', async (_label, files, args) => {
    const result = await run(workdir(files), args);
    expect(result.code).toBe(2);
  });
});

describe('check-action-pins --online (git falso)', () => {
  const tags = (name: string, sha: string) => `${sha}\trefs/tags/${name}\n`;
  const ALL = {
    'actions/checkout': tags('v4.4.0', SHA_A),
    'actions/setup-node': tags('v4.4.0', SHA_B),
  };

  it('todo coincide: sale con 0 y consulta cada REPOSITORIO una sola vez', async () => {
    const dir = workdir({ '.github/workflows/ci.yml': GOOD });
    const git = fakeGit(ALL);
    const result = await run(dir, ['--online'], git);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('coinciden con las etiquetas');
    expect(calls(git).sort()).toEqual([
      'ls-remote --tags https://github.com/actions/checkout | prompt=0',
      'ls-remote --tags https://github.com/actions/setup-node | prompt=0',
    ]);
  });

  it('un hash que no es el de su etiqueta: sale con 1 y dice el hash real', async () => {
    const dir = workdir({ '.github/workflows/ci.yml': GOOD });
    const git = fakeGit({ ...ALL, 'actions/setup-node': tags('v4.4.0', SHA_C) });
    const result = await run(dir, ['--online'], git);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(SHA_B);
    expect(result.stderr).toContain(SHA_C);
    expect(result.stderr).toContain('actions/setup-node');
  });

  it('una etiqueta que ya no existe: sale con 1', async () => {
    const dir = workdir({ '.github/workflows/ci.yml': GOOD });
    const git = fakeGit({ ...ALL, 'actions/checkout': tags('v4.3.0', SHA_A) });
    const result = await run(dir, ['--online'], git);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('v4.4.0');
  });

  it('un repositorio SIN etiquetas (salida vacía) no es un verde: sale con 1, no se confunde con «no se pudo leer»', async () => {
    const dir = workdir({ '.github/workflows/ci.yml': GOOD });
    const git = fakeGit({ ...ALL, 'actions/checkout': '' });
    const result = await run(dir, ['--online'], git);
    expect(result.code, result.stderr).toBe(1);
    expect(result.stderr).toContain('v4.4.0');
    expect(result.stdout).not.toContain('coinciden');
  });

  it('acciones DISTINTAS del mismo repositorio (`owner/repo/a`, `owner/repo/b`) se consultan con UNA sola llamada', async () => {
    const dir = workdir({
      '.github/workflows/ci.yml': workflow(
        `github/codeql-action/init@${SHA_C} # v3.1.0`,
        `github/codeql-action/analyze@${SHA_C} # v3.1.0`,
      ),
    });
    const git = fakeGit({ 'github/codeql-action': tags('v3.1.0', SHA_C) });
    const result = await run(dir, ['--online'], git);
    expect(result.code, result.stderr).toBe(0);
    expect(calls(git)).toEqual([
      'ls-remote --tags https://github.com/github/codeql-action | prompt=0',
    ]);
  });

  it('un repositorio ilegible usado por varias acciones se intenta UNA vez y se dice UNA vez', async () => {
    const dir = workdir({
      '.github/workflows/ci.yml': workflow(
        `github/codeql-action/init@${SHA_C} # v3.1.0`,
        `github/codeql-action/analyze@${SHA_C} # v3.1.0`,
      ),
    });
    const git = fakeGit({}); // `git` falla (128) para cualquier repositorio
    const result = await run(dir, ['--online'], git);
    expect(result.code).toBe(2);
    expect(calls(git)).toHaveLength(1);
    expect(result.stderr.match(/FALLO/g)).toHaveLength(1);
  });

  it('`git` que falla (sin red, repositorio inexistente): sale con 2 y nombra el repositorio, NUNCA con 0', async () => {
    const dir = workdir({ '.github/workflows/ci.yml': GOOD });
    const git = fakeGit({ 'actions/checkout': ALL['actions/checkout'] });
    const result = await run(dir, ['--online'], git);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('actions/setup-node');
  });

  it('si ya hay problemas de forma, los dice y NO sale a la red', async () => {
    const dir = workdir({
      '.github/workflows/ci.yml': workflow(`actions/checkout@${SHA_A} # v4.4.0`, 'a/b@v4'),
    });
    const git = fakeGit(ALL);
    const result = await run(dir, ['--online'], git);
    expect(result.code).toBe(1);
    expect(calls(git)).toEqual([]);
  });
});

describe('lsRemoteTags', () => {
  function withPath<T>(git: FakeGit, body: () => T): T {
    const before = { path: process.env.PATH, prompt: process.env.GIT_TERMINAL_PROMPT };
    process.env.PATH = `${git.bin}:${before.path ?? ''}`;
    process.env.GIT_TERMINAL_PROMPT = '1'; // ver `run`: la prueba solo mide algo si parte de un valor distinto de 0
    try {
      return body();
    } finally {
      process.env.PATH = before.path;
      if (before.prompt === undefined) delete process.env.GIT_TERMINAL_PROMPT;
      else process.env.GIT_TERMINAL_PROMPT = before.prompt;
    }
  }

  it('devuelve lo que imprime `git ls-remote --tags` sin pedir credenciales por terminal', () => {
    const git = fakeGit({ 'a/b': `${SHA_A}\trefs/tags/v1.0.0\n` });
    expect(withPath(git, () => lsRemoteTags('a/b'))).toBe(`${SHA_A}\trefs/tags/v1.0.0\n`);
    expect(calls(git)).toEqual(['ls-remote --tags https://github.com/a/b | prompt=0']);
  });

  it('un fallo de git se convierte en un error que nombra el repositorio', () => {
    const git = fakeGit({});
    expect(() => withPath(git, () => lsRemoteTags('a/b'))).toThrow(/a\/b/);
  });

  it('un git que no responde se corta en el plazo y falla (no deja colgado el CI)', () => {
    const dir = workdir({});
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nexec sleep 30\n');
    chmodSync(join(bin, 'git'), 0o755);
    const started = Date.now();
    expect(() => withPath({ bin, log: join(dir, 'x') }, () => lsRemoteTags('a/b', 300))).toThrow(
      /a\/b/,
    );
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('rechaza un nombre de repositorio raro antes de ejecutar nada', () => {
    const git = fakeGit({});
    expect(() => withPath(git, () => lsRemoteTags('a/b c'))).toThrow();
    expect(() => withPath(git, () => lsRemoteTags('--upload-pack=x/y'))).toThrow();
    expect(calls(git)).toEqual([]);
  });
});
