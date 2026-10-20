import { DESTINATION_KEYS, type DestinationKey } from '@/domains/tourism/destinations';
import {
  MAX_ALTITUDE_M,
  MAX_PITCH_DEG,
  normalizeHeading,
  normalizeRoll,
  type CameraState,
} from './camera';

/**
 * Estado del mapa en la URL (query): `d` destino (clave estable, no el slug traducido), `c` cámara, `l` capas.
 * Todo valor llega de fuera, así que se valida: lo inválido se descarta y se informa en `issues`; nunca se
 * «corrige» adivinando (un enlace roto vuelve al estado por defecto, no a uno inventado).
 */
export const MAP_LAYER_IDS = ['protectedAreas', 'hillshade', 'terrain3d'] as const;
export type MapLayerId = (typeof MAP_LAYER_IDS)[number];

/** Capas activas cuando la URL no trae `l`. Si trae `l` (aunque esté vacío), manda `l`. */
/** El relieve NO va por defecto: carga datos de un tercero (AWS) y le revela la IP; se activa a propósito. */
export const DEFAULT_MAP_LAYERS: readonly MapLayerId[] = ['protectedAreas'];

/** Capas que cargan datos de un tercero (hoy, el terreno de AWS). */
export const THIRD_PARTY_LAYERS: readonly MapLayerId[] = ['hillshade', 'terrain3d'];

/** Quita las capas de terceros cuando los derechos no permiten mostrarlas (también si vienen en el enlace). */
export function allowedLayers(
  layers: readonly MapLayerId[],
  thirdPartyAllowed: boolean,
): readonly MapLayerId[] {
  return thirdPartyAllowed ? layers : layers.filter((id) => !THIRD_PARTY_LAYERS.includes(id));
}

export interface MapUrlState {
  readonly destination?: DestinationKey;
  readonly camera?: CameraState;
  readonly layers?: readonly MapLayerId[];
}

export type MapUrlIssue = 'invalid-destination' | 'invalid-camera' | 'unknown-layers';

export interface ParsedMapUrlState {
  readonly state: MapUrlState;
  readonly issues: readonly MapUrlIssue[];
}

export type RawParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const MAX_PARAM_LENGTH = 200;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const LON_LAT_DECIMALS = 5;
const OTHER_DECIMALS = 1;
const MIN_ALTITUDE_M = 0.1;

function first(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  return value?.[0];
}

function round(value: number, decimals: number): number {
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function parseCamera(raw: string): CameraState | null {
  if (raw.length > MAX_PARAM_LENGTH) return null;
  const parts = raw.split(',');
  if (parts.length !== 6 || !parts.every((p) => NUMBER.test(p))) return null;
  const [lon, lat, altitudeM, headingDeg, pitchDeg, rollDeg] = parts.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (![lon, lat, altitudeM, headingDeg, pitchDeg, rollDeg].every(Number.isFinite)) return null;
  if (lon < -180 || lon > 180 || lat < -85 || lat > 85) return null;
  if (altitudeM <= 0 || altitudeM > MAX_ALTITUDE_M) return null;
  if (pitchDeg < 0 || pitchDeg > MAX_PITCH_DEG) return null;
  return {
    lon,
    lat,
    altitudeM,
    headingDeg: normalizeHeading(headingDeg),
    pitchDeg,
    rollDeg: normalizeRoll(rollDeg),
  };
}

/**
 * Forma canónica de la cámara: se redondea PRIMERO y se normaliza DESPUÉS (un rumbo de −0,01° es `0`, no `360`),
 * y se acota a lo que `parseCamera` acepta, de modo que lo serializado siempre se puede reanalizar.
 */
export function formatCamera(camera: CameraState): string {
  const lon = round(((((camera.lon + 180) % 360) + 360) % 360) - 180, LON_LAT_DECIMALS);
  const lat = round(Math.min(85, Math.max(-85, camera.lat)), LON_LAT_DECIMALS);
  const altitude = Math.min(
    MAX_ALTITUDE_M,
    Math.max(MIN_ALTITUDE_M, round(camera.altitudeM, OTHER_DECIMALS)),
  );
  const heading = normalizeHeading(round(camera.headingDeg, OTHER_DECIMALS));
  const pitch = Math.min(MAX_PITCH_DEG, Math.max(0, round(camera.pitchDeg, OTHER_DECIMALS)));
  const roll = normalizeRoll(round(camera.rollDeg, OTHER_DECIMALS));
  return [
    lon,
    lat,
    altitude,
    round(heading, OTHER_DECIMALS),
    pitch,
    round(roll, OTHER_DECIMALS),
  ].join(',');
}

const LAYER_SET: ReadonlySet<string> = new Set(MAP_LAYER_IDS);

/** Capas conocidas, sin duplicados y en el orden canónico; devuelve también si había identificadores ajenos. */
export function parseLayers(raw: string): { layers: MapLayerId[]; unknown: boolean } {
  const wanted = raw.length > MAX_PARAM_LENGTH ? [] : raw.split(',').filter((s) => s !== '');
  const unknown = raw.length > MAX_PARAM_LENGTH || wanted.some((id) => !LAYER_SET.has(id));
  const present = new Set(wanted);
  return { layers: MAP_LAYER_IDS.filter((id) => present.has(id)), unknown };
}

export function parseMapUrlState(params: RawParams): ParsedMapUrlState {
  const issues: MapUrlIssue[] = [];
  const state: {
    destination?: DestinationKey;
    camera?: CameraState;
    layers?: readonly MapLayerId[];
  } = {};

  const d = first(params.d);
  if (d !== undefined) {
    const key = DESTINATION_KEYS.find((k) => k === d);
    if (key) state.destination = key;
    else issues.push('invalid-destination');
  }

  const c = first(params.c);
  if (c !== undefined) {
    const camera = parseCamera(c);
    if (camera) state.camera = camera;
    else issues.push('invalid-camera');
  }

  const l = first(params.l);
  if (l !== undefined) {
    const { layers, unknown } = parseLayers(l);
    state.layers = layers;
    if (unknown) issues.push('unknown-layers');
  }

  return { state, issues };
}

export function serializeMapUrlState(
  state: MapUrlState,
): Record<'d' | 'c' | 'l', string | undefined> {
  return {
    d: state.destination,
    c: state.camera ? formatCamera(state.camera) : undefined,
    l: state.layers
      ? MAP_LAYER_IDS.filter((id) => state.layers?.includes(id)).join(',')
      : undefined,
  };
}

/** Conserva los parámetros ajenos al mapa y sustituye solo `d`, `c` y `l`. */
export function applyMapUrlState(search: URLSearchParams, state: MapUrlState): URLSearchParams {
  const next = new URLSearchParams(search);
  for (const key of ['d', 'c', 'l'] as const) next.delete(key);
  const serialized = serializeMapUrlState(state);
  for (const key of ['d', 'c', 'l'] as const) {
    const value = serialized[key];
    if (value !== undefined) next.set(key, value);
  }
  return next;
}

export function paramsFromSearch(search: URLSearchParams): RawParams {
  return {
    d: search.get('d') ?? undefined,
    c: search.get('c') ?? undefined,
    l: search.get('l') ?? undefined,
  };
}
