import type { Locale } from '@/i18n/locales';
import type { TranslationStatus } from '../editorial/publication';
import { resolveSlug, type SlugResolution } from './slugs';

/**
 * Registro de los nueve destinos iniciales. La CLAVE es la identidad estable e inmutable
 * (no se deriva del nombre mostrado, que puede cambiar). Cuando exista BD, estas filas
 * son la semilla de `destinations`, `destination_translations` y `destination_slugs`.
 */
export const DESTINATION_KEYS = [
  'panama-city',
  'casco-antiguo',
  'panama-canal',
  'el-valle-de-anton',
  'boquete',
  'volcan-baru',
  'bocas-del-toro',
  'santa-catalina',
  'coiba',
] as const;
export type DestinationKey = (typeof DESTINATION_KEYS)[number];

export const DESTINATION_KINDS = [
  'city',
  'historic_district',
  'infrastructure',
  'locality',
  'volcano',
  'archipelago',
  'island',
] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number];

/** Avisos sobre homonimia o ambigüedad (mensajes en `Destinations.notes`). */
export type DestinationNoteKey =
  | 'homonymBaru'
  | 'homonymSantaCatalina'
  | 'homonymElValle'
  | 'homonymCascoViejo'
  | 'bocasAmbiguous'
  | 'cascoNoBoundary';

export interface DestinationName {
  readonly name: string;
  /** El estado editorial del NOMBRE en ese idioma. Una máquina nunca figura como revisora. */
  readonly status: TranslationStatus;
  readonly provenance: 'toponym_original' | 'ai_translation_2026-10-20';
}

export interface DestinationSlugs {
  readonly current: string;
  /** Slugs anteriores: se conservan para redirigir (308) tras un cambio. */
  readonly aliases: readonly string[];
}

export interface DestinationEntry {
  readonly key: DestinationKey;
  readonly kind: DestinationKind;
  readonly names: Readonly<Record<Locale, DestinationName>>;
  readonly slugs: Readonly<Record<Locale, DestinationSlugs>>;
  readonly noteKeys: readonly DestinationNoteKey[];
}

const original = (name: string): DestinationName => ({
  name,
  status: 'draft',
  provenance: 'toponym_original',
});
const translated = (name: string): DestinationName => ({
  name,
  status: 'machine_translated',
  provenance: 'ai_translation_2026-10-20',
});
const slug = (current: string): DestinationSlugs => ({ current, aliases: [] });

export const DESTINATIONS: readonly DestinationEntry[] = [
  {
    key: 'panama-city',
    kind: 'city',
    names: {
      es: original('Ciudad de Panamá'),
      en: translated('Panama City'),
      pt: translated('Cidade do Panamá'),
      fr: translated('Ville de Panama'),
      de: translated('Panama-Stadt'),
    },
    slugs: {
      es: slug('ciudad-de-panama'),
      en: slug('panama-city'),
      pt: slug('cidade-do-panama'),
      fr: slug('ville-de-panama'),
      de: slug('panama-stadt'),
    },
    noteKeys: [],
  },
  {
    key: 'casco-antiguo',
    kind: 'historic_district',
    names: {
      es: original('Casco Antiguo'),
      en: original('Casco Antiguo'),
      pt: original('Casco Antiguo'),
      fr: original('Casco Antiguo'),
      de: original('Casco Antiguo'),
    },
    slugs: {
      es: slug('casco-antiguo'),
      en: slug('casco-antiguo'),
      pt: slug('casco-antiguo'),
      fr: slug('casco-antiguo'),
      de: slug('casco-antiguo'),
    },
    noteKeys: ['cascoNoBoundary', 'homonymCascoViejo'],
  },
  {
    key: 'panama-canal',
    kind: 'infrastructure',
    names: {
      es: original('Canal de Panamá'),
      en: translated('Panama Canal'),
      pt: translated('Canal do Panamá'),
      fr: translated('Canal de Panama'),
      de: translated('Panamakanal'),
    },
    slugs: {
      es: slug('canal-de-panama'),
      en: slug('panama-canal'),
      pt: slug('canal-do-panama'),
      fr: slug('canal-de-panama'),
      de: slug('panamakanal'),
    },
    noteKeys: [],
  },
  {
    key: 'el-valle-de-anton',
    kind: 'locality',
    names: {
      es: original('El Valle de Antón'),
      en: original('El Valle de Antón'),
      pt: original('El Valle de Antón'),
      fr: original('El Valle de Antón'),
      de: original('El Valle de Antón'),
    },
    slugs: {
      es: slug('el-valle-de-anton'),
      en: slug('el-valle-de-anton'),
      pt: slug('el-valle-de-anton'),
      fr: slug('el-valle-de-anton'),
      de: slug('el-valle-de-anton'),
    },
    noteKeys: ['homonymElValle'],
  },
  {
    key: 'boquete',
    kind: 'locality',
    names: {
      es: original('Boquete'),
      en: original('Boquete'),
      pt: original('Boquete'),
      fr: original('Boquete'),
      de: original('Boquete'),
    },
    slugs: {
      es: slug('boquete'),
      en: slug('boquete'),
      pt: slug('boquete'),
      fr: slug('boquete'),
      de: slug('boquete'),
    },
    noteKeys: [],
  },
  {
    key: 'volcan-baru',
    kind: 'volcano',
    names: {
      es: original('Volcán Barú'),
      en: translated('Barú Volcano'),
      pt: translated('Vulcão Barú'),
      fr: translated('Volcan Barú'),
      de: translated('Vulkan Barú'),
    },
    slugs: {
      es: slug('volcan-baru'),
      en: slug('baru-volcano'),
      pt: slug('vulcao-baru'),
      fr: slug('volcan-baru'),
      de: slug('vulkan-baru'),
    },
    noteKeys: ['homonymBaru'],
  },
  {
    key: 'bocas-del-toro',
    kind: 'archipelago',
    names: {
      es: original('Bocas del Toro'),
      en: original('Bocas del Toro'),
      pt: original('Bocas del Toro'),
      fr: original('Bocas del Toro'),
      de: original('Bocas del Toro'),
    },
    slugs: {
      es: slug('bocas-del-toro'),
      en: slug('bocas-del-toro'),
      pt: slug('bocas-del-toro'),
      fr: slug('bocas-del-toro'),
      de: slug('bocas-del-toro'),
    },
    noteKeys: ['bocasAmbiguous'],
  },
  {
    key: 'santa-catalina',
    kind: 'locality',
    names: {
      es: original('Santa Catalina'),
      en: original('Santa Catalina'),
      pt: original('Santa Catalina'),
      fr: original('Santa Catalina'),
      de: original('Santa Catalina'),
    },
    slugs: {
      es: slug('santa-catalina'),
      en: slug('santa-catalina'),
      pt: slug('santa-catalina'),
      fr: slug('santa-catalina'),
      de: slug('santa-catalina'),
    },
    noteKeys: ['homonymSantaCatalina'],
  },
  {
    key: 'coiba',
    kind: 'island',
    names: {
      es: original('Coiba'),
      en: original('Coiba'),
      pt: original('Coiba'),
      fr: original('Coiba'),
      de: original('Coiba'),
    },
    slugs: {
      es: slug('coiba'),
      en: slug('coiba'),
      pt: slug('coiba'),
      fr: slug('coiba'),
      de: slug('coiba'),
    },
    noteKeys: [],
  },
];

export function getDestination(key: string): DestinationEntry | undefined {
  return DESTINATIONS.find((d) => d.key === key);
}

export function destinationName(entry: DestinationEntry, locale: Locale): string {
  return entry.names[locale].name;
}

export function destinationSlug(entry: DestinationEntry, locale: Locale): string {
  return entry.slugs[locale].current;
}

export function resolveDestinationSlug(
  locale: Locale,
  slug: string,
  entries: readonly DestinationEntry[] = DESTINATIONS,
): SlugResolution {
  return resolveSlug(entries, locale, slug);
}
