import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/i18n/locales';

/** Valida el segmento `[locale]`; un idioma desconocido es un 404 (nunca se asume español). */
export function assertLocale(value: string): Locale {
  if (!isLocale(value)) notFound();
  return value;
}

export type LocaleParams = { params: Promise<{ locale: string }> };
