/**
 * `pnpm content:export [--out <ruta>] [--check] [--dry-run]`
 * Exporta el contenido verificado y público de la BD a `data/content/published.json` (ADR-0019).
 *  --check    no escribe: sale con 1 si el archivo difiere de lo que hay en la BD (sin contar la hora de exportación).
 *  --dry-run  muestra el resumen sin escribir.
 * Una base que NO sea local exige confirmar el host con CONTENT_CONFIRM_REMOTE=<host>. Solo LEE (rol `anon`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import {
  SnapshotError,
  parseSnapshot,
  sameSnapshotContent,
  serializeSnapshot,
} from '../../src/domains/content/snapshot';
import { isLocalHost } from '../db/lib';
import { exportPublished } from './export-lib';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = resolve(value('--out') ?? 'data/content/published.json');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL (ver .env.example).');
  process.exit(2);
}
const host = new URL(url).hostname;
if (!isLocalHost(host) && process.env.CONTENT_CONFIRM_REMOTE !== host) {
  console.error(
    `Rechazado: «${host}» no es una base local. Si es intencionado y está autorizado, repite con CONTENT_CONFIRM_REMOTE=${host}.`,
  );
  process.exit(3);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  const snapshot = await exportPublished(client, new Date());
  const summary = {
    assertions: snapshot.assertions.length,
    notices: snapshot.notices.length,
    destinations: new Set(snapshot.assertions.map((a) => a.destinationKey)).size,
  };
  if (flag('--check')) {
    const current = parseSnapshot(JSON.parse(readFileSync(out, 'utf8')) as unknown);
    const same = sameSnapshotContent(current, snapshot);
    console.log(JSON.stringify({ ...summary, upToDate: same }));
    process.exitCode = same ? 0 : 1;
  } else if (flag('--dry-run')) {
    console.log(JSON.stringify({ ...summary, wrote: false }));
  } else {
    writeFileSync(out, serializeSnapshot(snapshot));
    console.log(JSON.stringify({ ...summary, wrote: out }));
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
