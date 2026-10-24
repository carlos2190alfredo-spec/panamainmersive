import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeProblem,
  describeTagFailure,
  parseUses,
  pinProblems,
  repoOf,
  unparsedUses,
  verifyAgainstTags,
  type ActionUse,
} from '../../../scripts/lib/action-pins';

/**
 * Fijado de las acciones de terceros por hash de commit (F4-17b, R3-13). Una etiqueta como `actions/checkout@v4` es
 * MÓVIL: quien controle (o comprometa) el repositorio de la acción cambia lo que corre en el CI sin tocar este
 * repositorio. Un hash de commit no se puede reasignar. Estas pruebas fijan las reglas con entradas sintéticas; las
 * dos últimas secciones vigilan los flujos REALES del proyecto.
 */
const SHA_A = '11d5960a326750d5838078e36cf38b85af677262';
const SHA_B = '49933ea5288caeca8642d1e84afbd3f7d6820020';

function use(over: Partial<ActionUse> = {}): ActionUse {
  return {
    file: 'ci.yml',
    line: 1,
    action: 'actions/checkout',
    ref: SHA_A,
    version: 'v4.4.0',
    ...over,
  };
}

describe('parseUses', () => {
  it('lee la acción, el hash y la versión del comentario, con su fichero y su línea (1-based)', () => {
    const source = `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${SHA_A} # v4.4.0\n`;
    expect(parseUses('ci.yml', source)).toEqual([
      { file: 'ci.yml', line: 4, action: 'actions/checkout', ref: SHA_A, version: 'v4.4.0' },
    ]);
  });

  it('reconoce `uses:` como elemento de lista y como clave de un paso con `name:`', () => {
    const source = [
      '      - uses: a/one@v1',
      '      - name: x',
      '        uses: b/two@v2',
      '        with:',
      '          k: v',
    ].join('\n');
    expect(parseUses('x.yml', source).map((u) => [u.action, u.ref, u.line])).toEqual([
      ['a/one', 'v1', 1],
      ['b/two', 'v2', 3],
    ]);
  });

  it('una acción con ruta (`owner/repo/sub/path@ref`) conserva la ruta', () => {
    const [u] = parseUses('x.yml', '      - uses: github/codeql-action/analyze@v3\n');
    expect(u?.action).toBe('github/codeql-action/analyze');
    expect(repoOf(u?.action ?? '')).toBe('github/codeql-action');
  });

  it('con comillas simples o dobles se lee igual (si no, unas comillas esquivarían la guarda)', () => {
    const source = `      - uses: 'a/one@v1'\n      - uses: "b/two@v2" # v2.0.0\n`;
    const parsed = parseUses('x.yml', source);
    expect(parsed.map((u) => [u.action, u.ref, u.version])).toEqual([
      ['a/one', 'v1', null],
      ['b/two', 'v2', 'v2.0.0'],
    ]);
  });

  it('ignora las acciones locales (`./…`), los comentarios y lo que no es la clave `uses`', () => {
    const source = [
      '      - uses: ./.github/actions/local',
      '      # - uses: a/commented@v1',
      '      - run: echo "uses: a/in-a-string@v1"',
      '      - name: uses a/b@v1',
      '      - reuses: a/c@v1',
    ].join('\n');
    expect(parseUses('x.yml', source)).toEqual([]);
  });

  it('tolera saltos de línea de Windows y espacios al final', () => {
    const source = `      - uses: a/one@${SHA_A}   # v1.2.3   \r\n      - uses: b/two@v2\r\n`;
    const parsed = parseUses('x.yml', source);
    expect(parsed.map((u) => [u.action, u.ref, u.version])).toEqual([
      ['a/one', SHA_A, 'v1.2.3'],
      ['b/two', 'v2', null],
    ]);
  });

  it('un `uses:` sin `@` queda con la referencia vacía (y la guarda lo rechaza)', () => {
    const [u] = parseUses('x.yml', '      - uses: a/one\n');
    expect(u?.ref).toBe('');
    expect(pinProblems([u as ActionUse]).map((p) => p.code)).toContain('not-pinned');
  });

  it('el comentario de versión es la PRIMERA palabra tras `#` (el resto es texto libre)', () => {
    const [u] = parseUses('x.yml', `      - uses: a/one@${SHA_A} # v1.2.3 (ver nota)\n`);
    expect(u?.version).toBe('v1.2.3');
  });
});

describe('unparsedUses (lo que parece un `uses:` pero no se sabe leer se rechaza: fallar cerrado)', () => {
  it.each([
    ['en estilo de flujo', '      - { uses: a/b@v1 }'],
    ['con la clave entre comillas', '      - "uses": a/b@v1'],
    ['con un espacio antes de los dos puntos', '      - uses : a/b@v1'],
    ['con una referencia dinámica', '      - uses: ${{ matrix.action }}'],
    ['sin valor', '      - uses:'],
    ['como clave de un paso con otras claves delante', '        uses:'],
  ])('%s', (_label, line) => {
    const problems = unparsedUses('x.yml', `a: 1\n${line}\n`);
    expect(problems).toEqual([
      expect.objectContaining({ code: 'unparsed', file: 'x.yml', line: 2 }),
    ]);
    expect(describeProblem(problems[0] as never)).toContain('x.yml:2');
  });

  it.each([
    ['un uso normal', '      - uses: a/b@v1'],
    ['un uso con comentario', `      - uses: a/b@${SHA_A} # v1.0.0`],
    ['una acción local', '      - uses: ./.github/actions/x'],
    ['un comentario', '      # - uses: a/b@v1'],
    ['un texto que menciona uses:', '      - run: echo "uses: a/b@v1"'],
    ['una clave que acaba en uses', '      - reuses: a/b@v1'],
    ['un nombre que dice uses', '      - name: uses a/b@v1'],
  ])('no marca %s', (_label, line) => {
    expect(unparsedUses('x.yml', `${line}\n`)).toEqual([]);
  });
});

describe('pinProblems', () => {
  it('un hash de 40 hexadecimales en minúscula con versión exacta es válido', () => {
    expect(pinProblems([use()])).toEqual([]);
  });

  it.each([
    ['una etiqueta móvil', 'v4'],
    ['una etiqueta exacta (también se puede reasignar)', 'v4.4.0'],
    ['una rama', 'main'],
    ['un hash abreviado', SHA_A.slice(0, 7)],
    ['un hash de 39 caracteres', SHA_A.slice(0, 39)],
    ['un hash de 41 caracteres', `${SHA_A}0`],
    ['un hash en mayúsculas', SHA_A.toUpperCase()],
    ['una referencia vacía', ''],
    ['un hash con un carácter no hexadecimal', `${SHA_A.slice(0, 39)}g`],
  ])('rechaza %s', (_label, ref) => {
    const problems = pinProblems([use({ ref })]);
    expect(problems.map((p) => p.code)).toContain('not-pinned');
  });

  it('un hash sin versión en el comentario no se puede auditar: se rechaza', () => {
    expect(pinProblems([use({ version: null })]).map((p) => p.code)).toEqual(['no-version']);
  });

  it.each(['v4', 'v4.4', '4.4.0', 'latest', 'v4.4.0.1'])(
    'una versión que no es `vX.Y.Z` («%s») se rechaza',
    (word) => {
      const [u] = parseUses('x.yml', `      - uses: a/one@${SHA_A} # ${word}\n`);
      expect(pinProblems([u as ActionUse]).map((p) => p.code)).toEqual(['no-version']);
    },
  );

  it('la misma acción con dos hashes distintos es una inconsistencia', () => {
    const problems = pinProblems([use({ line: 1 }), use({ line: 9, ref: SHA_B })]);
    expect(problems.map((p) => p.code)).toEqual(['inconsistent']);
    expect(problems[0]).toMatchObject({ action: 'actions/checkout' });
  });

  it('la misma acción con el mismo hash pero distinta versión anotada también', () => {
    const problems = pinProblems([use(), use({ line: 2, version: 'v4.3.0' })]);
    expect(problems.map((p) => p.code)).toEqual(['inconsistent']);
  });

  it('acciones DISTINTAS con hashes distintos son lo normal', () => {
    expect(pinProblems([use(), use({ action: 'actions/setup-node', ref: SHA_B })])).toEqual([]);
  });

  it('el mismo uso repetido en varios jobs no es un problema', () => {
    expect(pinProblems([use({ line: 1 }), use({ line: 40 }), use({ line: 80 })])).toEqual([]);
  });

  it('una referencia mal formada de una acción no genera además una incoherencia con sus otros usos', () => {
    const problems = pinProblems([use(), use({ line: 2, ref: 'v4', version: null })]);
    expect(problems.map((p) => p.code)).toEqual(['not-pinned', 'no-version']);
  });

  it.each(['checkout', 'a/b/', '../x/y', 'a b/c', 'a/b c', '-x/y', 'a/b/..', 'a/b/.', 'a/b/../c'])(
    'un nombre de acción que no reconoce («%s») se rechaza en vez de usarlo',
    (action) => {
      expect(pinProblems([use({ action })]).map((p) => p.code)).toContain('bad-name');
    },
  );

  it('dice TODOS los problemas de un uso, no solo el primero', () => {
    const codes = pinProblems([use({ ref: 'v4', version: null })]).map((p) => p.code);
    expect(codes).toEqual(['not-pinned', 'no-version']);
  });

  it('cada problema se describe con su fichero y su línea (o la acción, si es global)', () => {
    const [notPinned] = pinProblems([
      use({ file: '.github/workflows/ci.yml', line: 37, ref: 'v4' }),
    ]);
    expect(describeProblem(notPinned as never)).toContain('.github/workflows/ci.yml:37');
    expect(describeProblem(notPinned as never)).toContain('actions/checkout@v4');
    const [inconsistent] = pinProblems([use(), use({ ref: SHA_B })]);
    expect(describeProblem(inconsistent as never)).toContain('actions/checkout');
    expect(describeProblem(inconsistent as never)).toContain(SHA_A);
    expect(describeProblem(inconsistent as never)).toContain(SHA_B);
  });
});

describe('repoOf', () => {
  it.each([
    ['actions/checkout', 'actions/checkout'],
    ['github/codeql-action/analyze', 'github/codeql-action'],
    ['a/b/c/d', 'a/b'],
  ])('%s → %s', (action, repo) => {
    expect(repoOf(action)).toBe(repo);
  });
});

describe('verifyAgainstTags (contra la salida de `git ls-remote --tags`)', () => {
  const lightweight = (name: string, sha: string) => `${sha}\trefs/tags/${name}\n`;

  it('una etiqueta ligera cuyo commit coincide: bien', () => {
    expect(verifyAgainstTags(use(), lightweight('v4.4.0', SHA_A))).toEqual({ status: 'ok' });
  });

  it('una etiqueta ANOTADA se compara por su commit pelado (`^{}`), no por el objeto etiqueta', () => {
    const output = `deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\trefs/tags/v4.4.0\n${SHA_A}\trefs/tags/v4.4.0^{}\n`;
    expect(verifyAgainstTags(use(), output)).toEqual({ status: 'ok' });
  });

  it('fijar el OBJETO etiqueta en vez del commit es un error común: se detecta y se dice cuál es el commit', () => {
    const tagObject = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const output = `${tagObject}\trefs/tags/v4.4.0\n${SHA_A}\trefs/tags/v4.4.0^{}\n`;
    expect(verifyAgainstTags(use({ ref: tagObject }), output)).toEqual({
      status: 'sha-mismatch',
      actual: SHA_A,
    });
  });

  it('un hash que NO es el de la etiqueta que dice su comentario: discrepancia con el hash real', () => {
    expect(verifyAgainstTags(use({ ref: SHA_B }), lightweight('v4.4.0', SHA_A))).toEqual({
      status: 'sha-mismatch',
      actual: SHA_A,
    });
  });

  it('una etiqueta que no existe en el repositorio de la acción: no encontrada', () => {
    expect(verifyAgainstTags(use(), lightweight('v4.3.0', SHA_A))).toEqual({
      status: 'tag-not-found',
    });
  });

  it('el nombre de la etiqueta se compara ENTERO (v4.4.0 no es v4.4.0-rc1 ni v4.4.01)', () => {
    const output = lightweight('v4.4.0-rc1', SHA_A) + lightweight('v4.4.01', SHA_A);
    expect(verifyAgainstTags(use(), output)).toEqual({ status: 'tag-not-found' });
  });

  it('una etiqueta cuyo nombre contiene caracteres de expresión regular no se interpreta como patrón', () => {
    const output = lightweight('v4x4x0', SHA_A);
    expect(verifyAgainstTags(use(), output)).toEqual({ status: 'tag-not-found' });
  });

  it('con la salida vacía (el repositorio no tiene etiquetas): no encontrada', () => {
    expect(verifyAgainstTags(use(), '')).toEqual({ status: 'tag-not-found' });
  });

  it('un uso sin versión no se puede verificar: no encontrada (la guarda sin red ya lo rechaza)', () => {
    expect(verifyAgainstTags(use({ version: null }), lightweight('v4.4.0', SHA_A))).toEqual({
      status: 'tag-not-found',
    });
    // ni siquiera por una etiqueta que se llame como el texto «null»
    expect(verifyAgainstTags(use({ version: null }), lightweight('null', SHA_A))).toEqual({
      status: 'tag-not-found',
    });
  });

  it('las discrepancias se describen con el hash fijado y el real', () => {
    const text = describeTagFailure(use({ ref: SHA_B, line: 7 }), {
      status: 'sha-mismatch',
      actual: SHA_A,
    });
    expect(text).toContain('ci.yml:7');
    expect(text).toContain(SHA_B);
    expect(text).toContain(SHA_A);
    expect(text).toContain('v4.4.0');
    expect(describeTagFailure(use(), { status: 'tag-not-found' })).toContain('v4.4.0');
  });
});

describe('los flujos REALES del proyecto', () => {
  const dir = join(process.cwd(), '.github/workflows');
  const files = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));
  const sources = files.map((name) => ({
    file: `.github/workflows/${name}`,
    text: readFileSync(join(dir, name), 'utf8'),
  }));
  const uses = sources.flatMap((s) => parseUses(s.file, s.text));

  it('hay flujos y usos que mirar (si no, esta sección no mediría nada)', () => {
    expect(files).toContain('ci.yml');
    expect(uses.length).toBeGreaterThanOrEqual(16);
  });

  it('TODAS las acciones de terceros están fijadas por hash, con versión y sin incoherencias', () => {
    const problems = [
      ...sources.flatMap((s) => unparsedUses(s.file, s.text)),
      ...pinProblems(uses),
    ];
    expect(problems.map(describeProblem)).toEqual([]);
  });

  it('el conjunto de acciones es EXACTAMENTE el revisado: una nueva es una decisión visible', () => {
    expect([...new Set(uses.map((u) => u.action))].sort()).toEqual([
      'actions/checkout',
      'actions/setup-node',
      'actions/setup-python',
      'actions/upload-artifact',
      'pnpm/action-setup',
    ]);
  });
});

describe('Dependabot (mantiene los hashes al día: fijar sin actualizar envejece en silencio)', () => {
  it('vigila las acciones de GitHub en la raíz con una periodicidad', () => {
    const config = readFileSync(join(process.cwd(), '.github/dependabot.yml'), 'utf8');
    expect(config).toMatch(/^version:\s*2\s*$/m);
    expect(config).toMatch(/^\s*-\s*package-ecosystem:\s*github-actions\s*$/m);
    expect(config).toMatch(/^\s*directory:\s*\/\s*$/m);
    expect(config).toMatch(/^\s*interval:\s*(daily|weekly|monthly)\s*$/m);
  });
});
