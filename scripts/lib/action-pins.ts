import { execFileSync } from 'node:child_process';

/**
 * Fijado de las acciones de terceros de GitHub Actions por hash de commit (F4-17b, R3-13).
 *
 * `actions/checkout@v4` es una etiqueta MÓVIL: quien controle (o comprometa) el repositorio de la acción cambia lo que
 * corre en el CI sin tocar este repositorio. Un hash de commit no se puede reasignar. La regla es textual (el proyecto no
 * tiene analizador de YAML): reconoce `uses:` por línea y FALLA CERRADO ante lo que parece un `uses:` y no sabe leer.
 *
 * Dos niveles: `pinProblems`/`unparsedUses` (sin red, siempre) comprueban la FORMA; `verifyAgainstTags` (con la salida de
 * `git ls-remote --tags`) comprueba que el hash es de verdad el commit de la versión que dice el comentario. Lo segundo
 * importa porque un hash puede venir de otro commit cualquiera accesible desde el repositorio (también de un fork).
 */
export interface ActionUse {
  readonly file: string;
  /** Línea 1-based. */
  readonly line: number;
  /** `owner/repo` o `owner/repo/ruta`. */
  readonly action: string;
  /** Lo que sigue a `@` (vacío si no hay). */
  readonly ref: string;
  /** Primera palabra del comentario final (`v4.4.0`), si lo hay. */
  readonly version: string | null;
}

export type PinProblem =
  | { readonly code: 'bad-name'; readonly use: ActionUse }
  | { readonly code: 'not-pinned'; readonly use: ActionUse }
  | { readonly code: 'no-version'; readonly use: ActionUse }
  | { readonly code: 'inconsistent'; readonly action: string; readonly pins: readonly string[] }
  | {
      readonly code: 'unparsed';
      readonly file: string;
      readonly line: number;
      readonly text: string;
    };

export type TagCheck =
  | { readonly status: 'ok' }
  | { readonly status: 'tag-not-found' }
  | { readonly status: 'sha-mismatch'; readonly actual: string };

/** Valor (con o sin comillas) y comentario final; el `#` solo abre un comentario si lo precede un espacio (YAML). */
const USES_LINE = /^\s*(?:-\s+)?uses:\s*(?:'([^']*)'|"([^"]*)"|([^\s'"]+))(?:\s+#\s*(.*?))?\s*$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const VERSION_WORD = /^v\d+\.\d+\.\d+$/;
const ACTION_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_.-]+)*$/;
const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

const lines = (source: string): string[] => source.split(/\r?\n/);

export function parseUses(file: string, source: string): ActionUse[] {
  const uses: ActionUse[] = [];
  lines(source).forEach((text, index) => {
    const match = USES_LINE.exec(text);
    if (match === null) return;
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    if (value.startsWith('./')) return; // acción local: es código de este repositorio
    const at = value.lastIndexOf('@');
    const action = at === -1 ? value : value.slice(0, at);
    const ref = at === -1 ? '' : value.slice(at + 1);
    const word = match[4]?.split(/\s+/)[0];
    uses.push({
      file,
      line: index + 1,
      action,
      ref,
      version: word === undefined || word === '' ? null : word,
    });
  });
  return uses;
}

/**
 * Líneas que parecen un `uses:` (en la posición de una clave, o en estilo de flujo) y que `parseUses` no sabe leer: una
 * referencia dinámica (`${{ … }}`), una clave rara, `{ uses: … }`. No se pueden fijar ni auditar: se rechazan.
 */
export function unparsedUses(file: string, source: string): PinProblem[] {
  const problems: PinProblem[] = [];
  lines(source).forEach((text, index) => {
    if (USES_LINE.test(text)) return;
    const body = text.trim().replace(/^-\s+/, '');
    if (body.startsWith('#')) return;
    const asKey = /^['"]?uses['"]?\s*:/.test(body);
    const inFlow = /^[{[]/.test(body) && /(?:^|[\s{,[])['"]?uses['"]?\s*:/.test(body);
    if (asKey || inFlow)
      problems.push({ code: 'unparsed', file, line: index + 1, text: text.trim() });
  });
  return problems;
}

export function repoOf(action: string): string {
  return action.split('/').slice(0, 2).join('/');
}

function validName(action: string): boolean {
  return (
    ACTION_NAME.test(action) && !action.split('/').some((part) => part === '.' || part === '..')
  );
}

/** Todos los problemas de FORMA, en orden: por uso (nombre, hash, versión) y luego las incoherencias entre usos. */
export function pinProblems(uses: readonly ActionUse[]): PinProblem[] {
  const problems: PinProblem[] = [];
  const wellFormed: ActionUse[] = [];
  for (const use of uses) {
    const before = problems.length;
    if (!validName(use.action)) problems.push({ code: 'bad-name', use });
    if (!COMMIT_SHA.test(use.ref)) problems.push({ code: 'not-pinned', use });
    if (use.version === null || !VERSION_WORD.test(use.version)) {
      problems.push({ code: 'no-version', use });
    }
    if (problems.length === before) wellFormed.push(use);
  }
  const byAction = new Map<string, Set<string>>();
  for (const use of wellFormed) {
    const pins = byAction.get(use.action) ?? new Set<string>();
    pins.add(`${use.ref} # ${use.version ?? ''}`);
    byAction.set(use.action, pins);
  }
  for (const [action, pins] of byAction) {
    if (pins.size > 1) problems.push({ code: 'inconsistent', action, pins: [...pins] });
  }
  return problems;
}

export function describeProblem(problem: PinProblem): string {
  switch (problem.code) {
    case 'bad-name':
      return `${problem.use.file}:${String(problem.use.line)}: «${problem.use.action}» no es un nombre de acción reconocible (owner/repo[/ruta])`;
    case 'not-pinned':
      return `${problem.use.file}:${String(problem.use.line)}: ${problem.use.action}@${problem.use.ref} no está fijada por hash de commit (40 hexadecimales en minúscula)`;
    case 'no-version':
      return `${problem.use.file}:${String(problem.use.line)}: ${problem.use.action} no lleva la versión exacta en el comentario (\`# vX.Y.Z\`): sin ella el hash no se puede auditar ni actualizar`;
    case 'inconsistent':
      return `${problem.action} aparece con referencias distintas: ${problem.pins.join(' · ')}`;
    case 'unparsed':
      return `${problem.file}:${String(problem.line)}: línea con «uses:» que no se sabe leer (${problem.text}); escríbela como «- uses: acción@hash # vX.Y.Z»`;
  }
}

/**
 * ¿Es `use.ref` el commit de la etiqueta `use.version` en la salida de `git ls-remote --tags`? Una etiqueta ANOTADA
 * aparece dos veces: el objeto etiqueta y su commit pelado (`^{}`); el que se fija es el commit. Los nombres se comparan
 * enteros (sin expresiones regulares: `v4.4.0` no es `v4.4.0-rc1`).
 */
export function verifyAgainstTags(use: ActionUse, lsRemoteOutput: string): TagCheck {
  if (use.version === null) return { status: 'tag-not-found' };
  let direct: string | undefined;
  let peeled: string | undefined;
  for (const text of lines(lsRemoteOutput)) {
    const match = /^([0-9a-f]{40})\trefs\/tags\/(.+)$/.exec(text);
    if (match === null) continue;
    if (match[2] === use.version) direct = match[1];
    else if (match[2] === `${use.version}^{}`) peeled = match[1];
  }
  const actual = peeled ?? direct;
  if (actual === undefined) return { status: 'tag-not-found' };
  return actual === use.ref ? { status: 'ok' } : { status: 'sha-mismatch', actual };
}

export function describeTagFailure(use: ActionUse, check: TagCheck): string {
  const where = `${use.file}:${String(use.line)}: ${use.action}`;
  if (check.status === 'sha-mismatch') {
    return `${where}: el hash fijado ${use.ref} NO es el commit de ${use.version ?? '?'} (que es ${check.actual})`;
  }
  return `${where}: la etiqueta ${use.version ?? '(sin versión)'} no existe en ${repoOf(use.action)}`;
}

/** Etiquetas del repositorio de la acción, de la fuente primaria (`git ls-remote`, sin shell ni credenciales). */
export function lsRemoteTags(repo: string, timeoutMs = 60_000): string {
  if (!REPO_NAME.test(repo)) throw new Error(`nombre de repositorio no válido: «${repo}»`);
  try {
    return execFileSync('git', ['ls-remote', '--tags', `https://github.com/${repo}`], {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new Error(`no se pudieron leer las etiquetas de ${repo}: ${detail ?? ''}`, {
      cause: error,
    });
  }
}
