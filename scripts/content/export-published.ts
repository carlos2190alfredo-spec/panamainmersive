/**
 * `pnpm content:export [--check | --dry-run] [--out <ruta>] [--allow-exclusions]`
 * Exporta el contenido verificado y público de la BD a `data/content/published.json` (ADR-0019).
 *  --check    no escribe: sale con 1 si el archivo difiere de lo que hay en la BD (sin contar la hora de exportación).
 *  --dry-run  muestra el resumen sin escribir.
 *  --allow-exclusions  no falla (código 4) cuando algo verificado ya no cumple las puertas del registro vigente y se
 *             EXCLUYE de la instantánea (ADR-0020). Sin esta opción el archivo se escribe igualmente, pero el código de
 *             salida avisa: que una exclusión pase desapercibida sería perder contenido en silencio.
 * Una base que NO sea local exige confirmar el host con CONTENT_CONFIRM_REMOTE=<host>. Solo LEE (rol `anon`).
 * Un argumento desconocido o incompleto se rechaza con código 2 (el modo por defecto ESCRIBE el archivo versionado).
 */
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import {
  SnapshotError,
  parseSnapshot,
  sameSnapshotContent,
  serializeSnapshot,
  sourcesWithoutLanguage,
} from '../../src/domains/content/snapshot';
import { checkDatabaseTarget, refusalMessage } from '../db/target';
import { UsageError, parseExportArgs, type ExportArgs } from './export-args';
import { exportPublished } from './export-lib';

let args: ExportArgs;
try {
  args = parseExportArgs(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(error.message);
  process.exit(2);
}
const out = resolve(args.out ?? 'data/content/published.json');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL (ver .env.example).');
  process.exit(2);
}
const target = checkDatabaseTarget(url, process.env.CONTENT_CONFIRM_REMOTE);
if (!target.ok) {
  console.error(refusalMessage(target, 'CONTENT_CONFIRM_REMOTE'));
  process.exit(target.reason === 'invalid_url' ? 2 : 3);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  const { snapshot, excluded } = await exportPublished(client, new Date());
  const summary = {
    assertions: snapshot.assertions.length,
    notices: snapshot.notices.length,
    destinations: new Set(snapshot.assertions.map((a) => a.destinationKey)).size,
    excluded: excluded.length,
    sourcesWithoutLanguage: sourcesWithoutLanguage(snapshot),
  };
  if (summary.sourcesWithoutLanguage > 0) {
    console.error(
      `AVISO: ${String(summary.sourcesWithoutLanguage)} fuente(s) sin idioma declarado: la ficha no puede marcar \`lang\` ` +
        'en su título, institución, licencia ni localizador (WCAG 3.1.2) y no lo adivina.',
    );
  }
  for (const e of excluded) {
    console.error(
      `EXCLUIDA ${e.destinationKey}/${e.fieldKey}@${String(e.version)} (${e.id}): ya no cumple ${e.codes.join(', ')}. ` +
        'No se publica: retírala o verifica una versión nueva.',
    );
  }
  if (args.mode === 'check') {
    const current = parseSnapshot(JSON.parse(readFileSync(out, 'utf8')) as unknown);
    const same = sameSnapshotContent(current, snapshot);
    console.log(JSON.stringify({ ...summary, upToDate: same }));
    process.exitCode = same ? 0 : 1;
  } else if (args.mode === 'dry-run') {
    console.log(JSON.stringify({ ...summary, wrote: false }));
  } else {
    // Escritura atómica: nunca queda un archivo a medias si el proceso muere a mitad, ni un temporal huérfano si
    // falla la escritura o el reemplazo (disco lleno, el destino es un directorio…).
    const tmp = `${out}.tmp-${String(process.pid)}`;
    try {
      writeFileSync(tmp, serializeSnapshot(snapshot));
      renameSync(tmp, out);
    } catch (error) {
      rmSync(tmp, { force: true });
      throw error;
    }
    console.log(JSON.stringify({ ...summary, wrote: out }));
  }
  if (excluded.length > 0 && !args.allowExclusions && process.exitCode === undefined) {
    process.exitCode = 4;
  }
} catch (error) {
  if (error instanceof SnapshotError) {
    console.error(error.message);
    for (const issue of error.issues) console.error(`  - ${issue}`);
    console.error('No se escribió nada: la instantánea no se repara ni se recorta en silencio.');
  } else {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  await client.end();
}
