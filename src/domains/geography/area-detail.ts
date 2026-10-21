import { LOCALES, type Locale } from '@/i18n/locales';

/**
 * Respuesta de `GET /api/spatial/areas/by-overture/{id}` (ADR-0016/0018). Los datos de red se validan en el
 * cliente: no se confía en la forma de lo recibido, ni siquiera de nuestra propia API.
 *
 * Validador escrito a mano a propósito: este módulo viaja al navegador y zod 4 sondea `new Function` al construir
 * un esquema, lo que bajo nuestra CSP (sin `unsafe-eval`) dispara una violación aunque se capture (E-51).
 */
export type NameProvenance = 'source_local' | 'source_common' | 'editorial';

export interface AreaName {
  readonly value: string;
  readonly locale: Locale | null;
  readonly provenance: NameProvenance;
}

export interface AreaSource {
  readonly ref: string;
  readonly key: string;
  readonly institution: string;
  readonly kind: string;
  readonly versionLabel: string;
  readonly retrievedAt: string;
  readonly license: { readonly name: string; readonly url: string | null };
  readonly attribution: string;
  readonly rightsStatus: 'verified' | 'provisional';
}

export interface AreaDetail {
  readonly type: 'Feature';
  readonly id: string;
  readonly geometry: unknown;
  readonly properties: {
    readonly id: string;
    readonly kind: string;
    readonly sourceClass: 'official' | 'osm_derived' | 'editorial';
    readonly name: AreaName | null;
    readonly area: { readonly squareMeters: number; readonly method: string } | null;
    readonly geometryVersion: number;
    readonly overtureId: string | null;
    readonly sourceRef: string | null;
    readonly names: readonly {
      readonly locale: Locale | null;
      readonly name: string;
      readonly provenance: NameProvenance;
    }[];
  };
  readonly sources: readonly AreaSource[];
}

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isStringOrNull = (v: unknown): v is string | null => v === null || isString(v);
const isOneOf = <T extends string>(v: unknown, values: readonly T[]): v is T =>
  isString(v) && (values as readonly string[]).includes(v);

const PROVENANCE = ['source_local', 'source_common', 'editorial'] as const;
const SOURCE_CLASS = ['official', 'osm_derived', 'editorial'] as const;
const RIGHTS = ['verified', 'provisional'] as const;
const isLocaleOrNull = (v: unknown): v is Locale | null => v === null || isOneOf(v, LOCALES);

function parseName(v: unknown): AreaName | null | undefined {
  if (v === null) return null;
  if (!isRecord(v)) return undefined;
  const { value, locale, provenance } = v;
  return isString(value) && isLocaleOrNull(locale) && isOneOf(provenance, PROVENANCE)
    ? { value, locale, provenance }
    : undefined;
}

function parseSource(v: unknown): AreaSource | undefined {
  if (!isRecord(v) || !isRecord(v.license)) return undefined;
  const { ref, key, institution, kind, versionLabel, retrievedAt, attribution, rightsStatus } = v;
  const { name, url } = v.license;
  if (
    !isString(ref) ||
    !isString(key) ||
    !isString(institution) ||
    !isString(kind) ||
    !isString(versionLabel) ||
    !isString(retrievedAt) ||
    !isString(attribution) ||
    !isOneOf(rightsStatus, RIGHTS) ||
    !isString(name) ||
    !isStringOrNull(url)
  ) {
    return undefined;
  }
  return {
    ref,
    key,
    institution,
    kind,
    versionLabel,
    retrievedAt,
    license: { name, url },
    attribution,
    rightsStatus,
  };
}

export function parseAreaDetail(json: unknown): AreaDetail | null {
  if (!isRecord(json) || json.type !== 'Feature' || !isString(json.id)) return null;
  const p = json.properties;
  if (!isRecord(p) || !Array.isArray(json.sources) || !Array.isArray(p.names)) return null;

  const name = parseName(p.name);
  const { id, kind, sourceClass, area, geometryVersion, overtureId, sourceRef } = p;
  if (
    name === undefined ||
    !isString(id) ||
    !isString(kind) ||
    !isOneOf(sourceClass, SOURCE_CLASS) ||
    !(
      typeof geometryVersion === 'number' &&
      Number.isInteger(geometryVersion) &&
      geometryVersion > 0
    ) ||
    !isStringOrNull(overtureId) ||
    !isStringOrNull(sourceRef)
  ) {
    return null;
  }

  let parsedArea: AreaDetail['properties']['area'] = null;
  if (area !== null) {
    if (
      !isRecord(area) ||
      typeof area.squareMeters !== 'number' ||
      !Number.isFinite(area.squareMeters) ||
      area.squareMeters < 0 ||
      !isString(area.method)
    ) {
      return null;
    }
    parsedArea = { squareMeters: area.squareMeters, method: area.method };
  }

  const names: AreaDetail['properties']['names'][number][] = [];
  for (const n of p.names as unknown[]) {
    if (
      !isRecord(n) ||
      !isLocaleOrNull(n.locale) ||
      !isString(n.name) ||
      !isOneOf(n.provenance, PROVENANCE)
    ) {
      return null;
    }
    names.push({ locale: n.locale, name: n.name, provenance: n.provenance });
  }

  const sources: AreaSource[] = [];
  for (const s of json.sources as unknown[]) {
    const source = parseSource(s);
    if (!source) return null;
    sources.push(source);
  }

  return {
    type: 'Feature',
    id: json.id,
    geometry: json.geometry,
    properties: {
      id,
      kind,
      sourceClass,
      name,
      area: parsedArea,
      geometryVersion,
      overtureId,
      sourceRef,
      names,
    },
    sources,
  };
}

/** La fuente de un área (la de su `sourceRef`), si la respuesta la trae. */
export function sourceOf(detail: AreaDetail): AreaSource | null {
  const ref = detail.properties.sourceRef;
  return ref === null ? null : (detail.sources.find((s) => s.ref === ref) ?? null);
}

/** Solo `https:` se convierte en enlace (nada de `javascript:` ni `data:` aunque llegue por la red). */
export function safeHttpsUrl(url: string | null): string | null {
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Superficie en hectáreas, redondeada para mostrar (el valor exacto se queda en la BD). */
export function squareMetersToHectares(squareMeters: number): number {
  return squareMeters / 10_000;
}
