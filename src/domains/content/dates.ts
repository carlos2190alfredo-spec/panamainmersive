/**
 * Fechas del modelo de contenido. Las vigencias son DÍAS CALENDARIO (`AAAA-MM-DD`), sin hora ni zona: «vigente
 * hasta el 2027-01-31» incluye todo ese día en Panamá. Las marcas de tiempo (consulta, verificación) son ISO 8601.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const MS_PER_DAY = 86_400_000;

function utcDay(value: string): number | null {
  const day = value.slice(0, 10);
  if (!ISO_DATE.test(day)) return null;
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const time = Date.UTC(y, m - 1, d);
  const check = new Date(time);
  // Rechaza 2026-02-31 y similares (Date los «corrige» en silencio)
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d
    ? time
    : null;
}

export const isIsoDate = (value: string): boolean => ISO_DATE.test(value) && utcDay(value) !== null;
// `Date.parse` acepta «2026-02-31T…» en V8 (lo desborda): el día se valida aparte, como en `isIsoDate`.
export const isIsoInstant = (value: string): boolean =>
  ISO_INSTANT.test(value) && utcDay(value) !== null && !Number.isNaN(Date.parse(value));

/** Días de calendario de `a` a `b` (positivo si `b` es posterior); `null` si alguna no es una fecha válida. */
export function daysBetween(a: string, b: string): number | null {
  const x = utcDay(a);
  const y = utcDay(b);
  return x === null || y === null ? null : Math.round((y - x) / MS_PER_DAY);
}

/** `AAAA-MM-DD` de un instante, en la fecha que lleva escrita (no se convierte de zona). */
export const dayOf = (value: string): string => value.slice(0, 10);

export function addDays(date: string, days: number): string | null {
  const t = utcDay(date);
  return t === null ? null : new Date(t + days * MS_PER_DAY).toISOString().slice(0, 10);
}
