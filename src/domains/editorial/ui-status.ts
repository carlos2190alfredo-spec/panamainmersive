import type { Locale } from '@/i18n/locales';
import type { TranslationStatus } from './publication';

/**
 * Estado editorial de las cadenas de INTERFAZ por idioma (docs/i18n.md §3).
 * El texto fuente en español lo redactó una IA y espera revisión editorial (`draft`);
 * el resto son traducciones automáticas sin revisión humana. Una máquina NUNCA figura
 * como revisora: cuando una persona revise un idioma, se cambia aquí (y en la BD) con su nombre.
 */
export const UI_TRANSLATION_STATUS: Readonly<Record<Locale, TranslationStatus>> = {
  es: 'draft',
  en: 'machine_translated',
  pt: 'machine_translated',
  fr: 'machine_translated',
  de: 'machine_translated',
};

/** Política del sitio: por defecto solo se indexa `published` y nunca traducción automática. */
export const SITE_PUBLICATION_POLICY = {
  indexReviewed: false,
  allowMachineTranslatedGeneral: false,
} as const;
