import { LOCALE_INFO, type Locale } from './locales';

/** Zona horaria de eventos y horarios locales (UTC−5, sin horario de verano). No es la del visitante. */
export const PANAMA_TIME_ZONE = 'America/Panama';

export type UnitSystem = 'metric' | 'imperial';

/**
 * Preferencias independientes del idioma (docs/i18n.md §4): cambiar de idioma NO cambia
 * moneda ni unidades, y nada se convierte automáticamente.
 */
export interface DisplayPreferences {
  readonly currency: string;
  readonly unitSystem: UnitSystem;
  /** Región de formato opcional (p. ej. `PA` → `es-PA`); por defecto solo el idioma. */
  readonly region?: string;
}

export const DEFAULT_PREFERENCES: DisplayPreferences = { currency: 'USD', unitSystem: 'metric' };

export function formatTag(locale: Locale, region?: string): string {
  const base = LOCALE_INFO[locale].formatTag;
  return region ? `${base}-${region}` : base;
}

export function formatNumber(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
  region?: string,
): string {
  return new Intl.NumberFormat(formatTag(locale, region), options).format(value);
}

export function formatCurrency(
  locale: Locale,
  amount: number,
  prefs: Pick<DisplayPreferences, 'currency' | 'region'> = DEFAULT_PREFERENCES,
): string {
  return new Intl.NumberFormat(formatTag(locale, prefs.region), {
    style: 'currency',
    currency: prefs.currency,
  }).format(amount);
}

/** Fecha/hora en la zona de Panamá: así se muestran horarios y eventos locales. */
export function formatPanamaDateTime(
  locale: Locale,
  date: Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat(formatTag(locale), {
    ...options,
    timeZone: PANAMA_TIME_ZONE,
  }).format(date);
}

/** Fecha sin hora; `isoDate` (AAAA-MM-DD) se interpreta como día calendario, sin saltos de zona. */
export function formatCalendarDate(locale: Locale, isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) throw new RangeError(`Fecha ISO inválida: ${isoDate}`);
  return new Intl.DateTimeFormat(formatTag(locale), { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Distancia: metros en el sistema métrico (m/km) y pies/millas en el imperial. */
export function formatDistance(locale: Locale, meters: number, unitSystem: UnitSystem): string {
  if (unitSystem === 'imperial') {
    const feet = meters * 3.280839895;
    return feet >= 1000
      ? new Intl.NumberFormat(formatTag(locale), {
          style: 'unit',
          unit: 'mile',
          unitDisplay: 'short',
          maximumFractionDigits: 1,
        }).format(meters / 1609.344)
      : new Intl.NumberFormat(formatTag(locale), {
          style: 'unit',
          unit: 'foot',
          unitDisplay: 'short',
          maximumFractionDigits: 0,
        }).format(feet);
  }
  return meters >= 1000
    ? new Intl.NumberFormat(formatTag(locale), {
        style: 'unit',
        unit: 'kilometer',
        unitDisplay: 'short',
        maximumFractionDigits: 1,
      }).format(meters / 1000)
    : new Intl.NumberFormat(formatTag(locale), {
        style: 'unit',
        unit: 'meter',
        unitDisplay: 'short',
        maximumFractionDigits: 0,
      }).format(meters);
}

/** Elevación sobre el nivel del mar (no altura elipsoidal). */
export function formatElevation(locale: Locale, meters: number, unitSystem: UnitSystem): string {
  const unit = unitSystem === 'imperial' ? 'foot' : 'meter';
  const value = unitSystem === 'imperial' ? meters * 3.280839895 : meters;
  return new Intl.NumberFormat(formatTag(locale), {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatList(locale: Locale, items: readonly string[]): string {
  return new Intl.ListFormat(formatTag(locale), { style: 'long', type: 'conjunction' }).format(
    items,
  );
}
