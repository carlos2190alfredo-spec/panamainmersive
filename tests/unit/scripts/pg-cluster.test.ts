import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PostgresUnavailableError, findBinDir } from '../../integration/pg-cluster';

/**
 * Cómo se elige el PostgreSQL de las pruebas. «No hay PostgreSQL» es un error TIPADO (los orquestadores E2E pueden
 * omitir la suite en local, pero en CI es un fallo) y cualquier OTRO fallo (initdb, pg_ctl) no debe confundirse con él.
 * Además se prefiere una versión con PostGIS: «la más alta» podía ser una sin la extensión.
 */
describe('selección del PostgreSQL de las pruebas', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** Una instalación falsa: `<lib>/<versión>/bin/initdb` y, si procede, `<share>/<versión>/extension/postgis.control`. */
  function layout(versions: Record<string, { postgis: boolean }>) {
    const root = mkdtempSync(join(tmpdir(), 'pi-pgbin-'));
    dirs.push(root);
    const libRoot = join(root, 'lib');
    const shareRoot = join(root, 'share');
    for (const [version, { postgis }] of Object.entries(versions)) {
      mkdirSync(join(libRoot, version, 'bin'), { recursive: true });
      writeFileSync(join(libRoot, version, 'bin', 'initdb'), '');
      mkdirSync(join(shareRoot, version, 'extension'), { recursive: true });
      if (postgis) writeFileSync(join(shareRoot, version, 'extension', 'postgis.control'), '');
    }
    return { libRoot, shareRoot };
  }

  it('elige la versión MÁS ALTA que tiene PostGIS, aunque haya una más nueva sin él', () => {
    const roots = layout({
      '15': { postgis: true },
      '16': { postgis: true },
      '17': { postgis: false },
    });
    expect(findBinDir({ env: {}, ...roots })).toBe(join(roots.libRoot, '16', 'bin'));
  });

  it('con una sola versión y PostGIS, esa', () => {
    const roots = layout({ '16': { postgis: true } });
    expect(findBinDir({ env: {}, ...roots })).toBe(join(roots.libRoot, '16', 'bin'));
  });

  it('hay PostgreSQL pero ninguna versión tiene PostGIS → «no disponible», diciendo por qué', () => {
    const roots = layout({ '16': { postgis: false } });
    expect(() => findBinDir({ env: {}, ...roots })).toThrow(PostgresUnavailableError);
    // El mensaje de la causa concreta (la genérica de «no hay PostgreSQL» también nombra a PostGIS y no orienta igual).
    expect(() => findBinDir({ env: {}, ...roots })).toThrow(
      /ninguna versión instalada tiene PostGIS/,
    );
  });

  it('PI_PG_BIN_DIR manda: una ruta con initdb se usa tal cual', () => {
    const roots = layout({ '16': { postgis: true } });
    const bin = join(roots.libRoot, '16', 'bin');
    expect(findBinDir({ env: { PI_PG_BIN_DIR: bin }, ...roots })).toBe(bin);
  });

  it("PI_PG_BIN_DIR definida pero VACÍA se ignora (típico de `env: PI_PG_BIN_DIR: ''` en un CI)", () => {
    const roots = layout({ '16': { postgis: true } });
    expect(findBinDir({ env: { PI_PG_BIN_DIR: '' }, ...roots })).toBe(
      join(roots.libRoot, '16', 'bin'),
    );
  });

  it('PI_PG_BIN_DIR apuntando a donde no hay initdb → «no disponible» (así se simula en las pruebas)', () => {
    const roots = layout({ '16': { postgis: true } });
    const error = (() => {
      try {
        findBinDir({ env: { PI_PG_BIN_DIR: '/ruta/que/no/existe' }, ...roots });
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(PostgresUnavailableError);
    expect((error as Error).message).toContain('PI_PG_BIN_DIR');
  });

  it('el mensaje de «no hay PostgreSQL» no remite a una variable que nada lee (DATABASE_URL_TEST)', () => {
    const roots = layout({});
    expect(() => findBinDir({ env: { PATH: '' }, ...roots })).toThrow(PostgresUnavailableError);
    expect(() => findBinDir({ env: { PATH: '' }, ...roots })).not.toThrow(/DATABASE_URL_TEST/);
  });
});
