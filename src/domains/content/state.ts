import type { DestinationKind } from '@/domains/tourism/destinations';
import type { AssertionRecord, FieldNotice } from './assertion';
import { isIsoDate } from './dates';
import { appliesTo, type ContentField } from './fields';
import { passesGates } from './gates';

/**
 * Estado PÚBLICO de un campo, DERIVADO de evidencia y caducidad (nunca un booleano almacenado):
 *  - VERIFIED: hay una afirmación vigente que supera todas las puertas;
 *  - EXPIRED: la hubo, pero su vigencia venció (NO se muestra su contenido: podría estar desactualizado);
 *  - DISPUTED: hay información contradictoria en revisión (tampoco se muestra);
 *  - UNKNOWN: no hay nada verificado. Es ausencia de verificación, NO prueba de que no exista.
 * Los borradores y revisiones en curso no cambian el estado público.
 */
export type FieldState =
  | {
      readonly status: 'VERIFIED';
      readonly assertion: AssertionRecord;
      readonly verifiedAt: string;
      readonly validUntil: string | null;
    }
  | { readonly status: 'EXPIRED'; readonly verifiedAt: string; readonly validUntil: string }
  | { readonly status: 'DISPUTED' }
  | { readonly status: 'UNKNOWN'; readonly reason: 'not_investigated' | 'not_applicable' };

/**
 * `assertions` y `notices` son los de UN destino. Precedencia: una disputa abierta más nueva que lo vigente gana
 * (no se muestra algo que se está discutiendo); después lo vigente; después lo vencido; si no, desconocido.
 */
export function fieldState(
  assertions: readonly AssertionRecord[],
  notices: readonly FieldNotice[],
  field: ContentField,
  kind: DestinationKind,
  today: string,
): FieldState {
  if (!isIsoDate(today)) throw new RangeError(`Fecha de referencia inválida: ${today}`);
  if (!appliesTo(field, kind)) return { status: 'UNKNOWN', reason: 'not_applicable' };

  const mine = assertions.filter((a) => a.fieldKey === field.key);
  // La instantánea no lleva identidades: esa puerta la garantiza el exportador contra la BD.
  const current = mine
    .filter(
      (a) =>
        a.status === 'verified' &&
        a.supersededAt === null &&
        passesGates(a, kind, { people: 'unavailable' }),
    )
    .sort((a, b) => b.version - a.version)[0];

  const disputed =
    mine.some(
      (a) =>
        a.status === 'disputed' && a.supersededAt === null && a.version > (current?.version ?? 0),
    ) || notices.some((n) => n.fieldKey === field.key && n.state === 'DISPUTED');
  if (disputed) return { status: 'DISPUTED' };

  if (current?.verifiedAt) {
    if (current.validUntil !== null && today > current.validUntil) {
      return { status: 'EXPIRED', verifiedAt: current.verifiedAt, validUntil: current.validUntil };
    }
    return {
      status: 'VERIFIED',
      assertion: current,
      verifiedAt: current.verifiedAt,
      validUntil: current.validUntil,
    };
  }

  const expired = notices.find((n) => n.fieldKey === field.key && n.state === 'EXPIRED');
  if (expired?.state === 'EXPIRED') {
    return { status: 'EXPIRED', verifiedAt: expired.verifiedAt, validUntil: expired.validUntil };
  }
  return { status: 'UNKNOWN', reason: 'not_investigated' };
}
