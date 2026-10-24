/**
 * Acciones de terceros de `.github/workflows/` fijadas por hash de commit (F4-17b, R3-13). Sin argumentos comprueba la
 * FORMA, sin red (también la ejecuta `pnpm test`): todo `uses:` apunta a un hash de 40 hexadecimales, lleva su versión
 * exacta en el comentario y no hay dos referencias distintas para la misma acción. Con `--online` comprueba además, contra
 * el repositorio de cada acción (`git ls-remote --tags`), que cada hash es el commit de la versión que dice su comentario:
 * es lo que hay que repetir al revisar una actualización de Dependabot.
 *
 * Códigos de salida: 0 bien · 1 incumple · 2 no se pudo evaluar (sin flujos, argumento desconocido, sin red). «No pude
 * comprobarlo» nunca es un verde.
 *
 * Uso:  node --import tsx scripts/check-action-pins.ts [--workflows DIR] [--online]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  describeProblem,
  describeTagFailure,
  lsRemoteTags,
  parseUses,
  pinProblems,
  repoOf,
  unparsedUses,
  verifyAgainstTags,
  type ActionUse,
} from './lib/action-pins';

const DEFAULT_DIR = '.github/workflows';

interface Options {
  readonly dir: string;
  readonly online: boolean;
}

function parseArgs(argv: string[]): Options | string {
  let dir = DEFAULT_DIR;
  let online = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--online') {
      online = true;
    } else if (arg === '--workflows') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('-'))
        return '`--workflows` necesita un directorio';
      dir = value;
    } else if (arg !== undefined && arg.startsWith('--workflows=')) {
      dir = arg.slice('--workflows='.length);
    } else {
      return `Argumento no reconocido: ${String(arg)}`;
    }
  }
  return { dir, online };
}

function verifyOnline(uses: readonly ActionUse[]): number {
  // Un hash distinto por (acción, hash, versión): el mismo uso repetido en varios jobs se consulta una vez.
  const pins = new Map<string, ActionUse>();
  for (const use of uses) {
    const key = `${use.action}\0${use.ref}\0${use.version ?? ''}`;
    if (!pins.has(key)) pins.set(key, use);
  }
  // Un repositorio sin etiquetas devuelve una salida VACÍA, que no es lo mismo que «no se pudo leer»: son dos conjuntos.
  const tagsByRepo = new Map<string, string>();
  const unreadable = new Set<string>();
  for (const use of pins.values()) {
    const repo = repoOf(use.action);
    if (tagsByRepo.has(repo) || unreadable.has(repo)) continue;
    try {
      tagsByRepo.set(repo, lsRemoteTags(repo));
    } catch (error) {
      unreadable.add(repo);
      console.error(`FALLO: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  let violations = 0;
  for (const use of pins.values()) {
    const repo = repoOf(use.action);
    if (unreadable.has(repo)) continue; // ya se dijo que no se pudo leer
    const check = verifyAgainstTags(use, tagsByRepo.get(repo) ?? '');
    if (check.status !== 'ok') {
      violations += 1;
      console.error(`FALLO: ${describeTagFailure(use, check)}`);
    }
  }
  if (violations > 0) return 1;
  if (unreadable.size > 0) return 2;
  console.log(
    `En línea: los ${String(pins.size)} hashes coinciden con las etiquetas de sus versiones en el repositorio de cada acción`,
  );
  return 0;
}

function main(argv: string[]): number {
  const options = parseArgs(argv);
  if (typeof options === 'string') {
    console.error(options);
    return 2;
  }
  if (!existsSync(options.dir) || !statSync(options.dir).isDirectory()) {
    console.error(`FALLO: no existe el directorio de flujos ${options.dir}`);
    return 2;
  }
  const names = readdirSync(options.dir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  if (names.length === 0) {
    console.error(`FALLO: no hay ningún flujo (.yml/.yaml) en ${options.dir}`);
    return 2;
  }

  const uses: ActionUse[] = [];
  const problems: ReturnType<typeof pinProblems> = [];
  for (const name of names) {
    const file = join(options.dir, name);
    const text = readFileSync(file, 'utf8');
    uses.push(...parseUses(file, text));
    problems.push(...unparsedUses(file, text));
  }
  problems.push(...pinProblems(uses));

  for (const problem of problems) console.error(`FALLO: ${describeProblem(problem)}`);
  if (problems.length > 0) return 1;

  const distinct = new Set(uses.map((use) => use.action)).size;
  console.log(
    `Acciones: ${String(uses.length)} usos de ${String(distinct)} acciones distintas en ${String(names.length)} flujo(s), todos fijados por hash con su versión`,
  );
  return options.online ? verifyOnline(uses) : 0;
}

process.exit(main(process.argv.slice(2)));
