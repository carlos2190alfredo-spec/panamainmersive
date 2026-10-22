import { describe, expect, it } from 'vitest';
import { UsageError, parseExportArgs } from '../../../scripts/content/export-args';

/**
 * El modo por defecto de `content:export` ESCRIBE `data/content/published.json`. Por eso un argumento que no se
 * entiende debe fallar, no ignorarse: con el análisis anterior (`includes`/`indexOf`), `--chek`, `--dry_run`,
 * `--check=true` u `--out` sin valor terminaban sobrescribiendo el archivo versionado.
 */
describe('argumentos de content:export', () => {
  it('sin argumentos: escribe en el archivo por defecto', () => {
    expect(parseExportArgs([])).toEqual({ mode: 'write', out: undefined, allowExclusions: false });
  });

  it('modos y opciones válidos', () => {
    expect(parseExportArgs(['--check']).mode).toBe('check');
    expect(parseExportArgs(['--dry-run']).mode).toBe('dry-run');
    expect(parseExportArgs(['--allow-exclusions']).allowExclusions).toBe(true);
    expect(parseExportArgs(['--out', 'a/b.json']).out).toBe('a/b.json');
    expect(parseExportArgs(['--out=a/b.json']).out).toBe('a/b.json');
    expect(parseExportArgs(['--check', '--out', 'x.json'])).toEqual({
      mode: 'check',
      out: 'x.json',
      allowExclusions: false,
    });
  });

  it.each([
    ['errata en el nombre', ['--chek']],
    ['guion bajo', ['--dry_run']],
    ['sin guion interior', ['--dryrun']],
    ['booleano con valor', ['--check=true']],
    ['booleano con valor (dry-run)', ['--dry-run=true']],
    ['atajo inexistente', ['-n']],
    ['--out sin valor', ['--out']],
    ['--out toma una opción como valor', ['--out', '--check']],
    ['--check y --dry-run a la vez', ['--check', '--dry-run']],
    ['argumento posicional', ['published.json']],
    ['opción repetida desconocida', ['--dry-run', '--force']],
  ])('rechaza: %s', (_name, argv) => {
    expect(() => parseExportArgs(argv)).toThrow(UsageError);
  });

  it('el mensaje de uso lista las opciones válidas', () => {
    try {
      parseExportArgs(['--chek']);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      const message = (error as UsageError).message;
      for (const option of ['--check', '--dry-run', '--out', '--allow-exclusions']) {
        expect(message).toContain(option);
      }
    }
  });
});
