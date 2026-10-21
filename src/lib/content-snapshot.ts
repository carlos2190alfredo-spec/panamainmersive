import raw from '../../data/content/published.json';
import type { AssertionRecord, FieldNotice } from '@/domains/content/assertion';
import type { DestinationKey } from '@/domains/tourism/destinations';
import { parseSnapshot, snapshotToRecords } from '@/domains/content/snapshot';

/**
 * Contenido verificado publicado: UNA fuente (`data/content/published.json`, producido por `pnpm content:export`).
 * Si el archivo no cumple el esquema o alguna puerta del dominio, la importación LANZA: el build falla en vez de
 * publicar contenido que no se puede defender. Solo servidor (zod no debe viajar al navegador: E-51).
 */
export const PUBLISHED_CONTENT = parseSnapshot(raw);
const RECORDS = snapshotToRecords(PUBLISHED_CONTENT);

export interface DestinationContent {
  readonly assertions: readonly AssertionRecord[];
  readonly notices: readonly FieldNotice[];
}

export function contentFor(key: DestinationKey): DestinationContent {
  return {
    assertions: RECORDS.filter((a) => a.destinationKey === key),
    notices: PUBLISHED_CONTENT.notices.filter((n) => n.destinationKey === key),
  };
}
