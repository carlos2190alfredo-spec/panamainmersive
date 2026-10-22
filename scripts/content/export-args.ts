import { parseArgs } from 'node:util';

/**
 * Argumentos de `pnpm content:export`. El modo por defecto ESCRIBE el archivo versionado, así que lo que no se
 * entiende se rechaza en lugar de ignorarse (con `includes`/`indexOf`, `--chek`, `--dry_run`, `--check=true` u
 * `--out` sin valor sobrescribían `data/content/published.json`).
 */
export class UsageError extends Error {
  constructor(message: string) {
    super(`${message}\n${USAGE}`);
    this.name = 'UsageError';
  }
}

export const USAGE = [
  'Uso: pnpm content:export [--check | --dry-run] [--out <ruta>] [--allow-exclusions]',
  '  --check             no escribe: sale con 1 si el archivo difiere de la BD',
  '  --dry-run           muestra el resumen sin escribir',
  '  --out <ruta>        archivo de salida (por defecto data/content/published.json)',
  '  --allow-exclusions  no falla (código 4) si algo verificado se excluye por no cumplir el registro vigente',
].join('\n');

export type ExportMode = 'write' | 'check' | 'dry-run';

export interface ExportArgs {
  readonly mode: ExportMode;
  readonly out: string | undefined;
  readonly allowExclusions: boolean;
}

export function parseExportArgs(argv: readonly string[]): ExportArgs {
  let values: ReturnType<typeof parse>['values'];
  try {
    values = parse(argv).values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  if (values.check && values['dry-run']) {
    throw new UsageError('--check y --dry-run son excluyentes.');
  }
  return {
    mode: values.check ? 'check' : values['dry-run'] ? 'dry-run' : 'write',
    out: values.out,
    allowExclusions: values['allow-exclusions'] === true,
  };
}

const parse = (argv: readonly string[]) =>
  parseArgs({
    args: [...argv],
    options: {
      check: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      out: { type: 'string' },
      'allow-exclusions': { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
