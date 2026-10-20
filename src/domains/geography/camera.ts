/**
 * Cámara del mapa: estado independiente del motor y su conversión con la vista de MapLibre.
 *
 * Convenciones (explícitas porque cada motor usa las suyas):
 * - `altitudeM`: altura de la cámara sobre el suelo del PUNTO CENTRAL (no sobre el nivel del mar ni el elipsoide).
 * - `headingDeg`: rumbo de la cámara, 0 = norte, sentido horario, en [0, 360).
 * - `pitchDeg`: 0 = mirando al nadir (vertical), crece hacia el horizonte (convención MapLibre/Mapbox).
 *   NO es la de Cesium (−90 = nadir): un adaptador futuro deberá convertirla.
 * - `rollDeg`: alabeo en (−180, 180].
 *
 * La conversión altitud↔zoom depende de la altura del viewport en píxeles (a igual altitud, una ventana más alta
 * abarca más terreno). Usa el campo de visión vertical y el tamaño de tesela que usa MapLibre.
 */
export interface CameraState {
  readonly lon: number;
  readonly lat: number;
  readonly altitudeM: number;
  readonly headingDeg: number;
  readonly pitchDeg: number;
  readonly rollDeg: number;
}

export interface MapView {
  readonly center: readonly [lon: number, lat: number];
  readonly zoom: number;
  readonly bearing: number;
  readonly pitch: number;
  readonly roll: number;
}

/** Campo de visión vertical por defecto de MapLibre (rad); tan(fov/2) = 1/3. */
export const MAP_FOV_RAD = 0.6435011087932844;
export const MAP_TILE_SIZE_PX = 512;
/** Radio de la esfera de Web Mercator (EPSG:3857). */
export const EARTH_RADIUS_M = 6_378_137;
export const MAX_PITCH_DEG = 85;
export const MAX_ALTITUDE_M = 10_000_000;

const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * EARTH_RADIUS_M;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function normalizeHeading(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function normalizeRoll(deg: number): number {
  const wrapped = normalizeHeading(deg);
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** Distancia (px) de la cámara al punto central a lo largo del eje de visión. */
export function cameraToCenterDistancePx(viewportHeightPx: number): number {
  return (0.5 / Math.tan(MAP_FOV_RAD / 2)) * viewportHeightPx;
}

/** Metros por píxel en el suelo a esa latitud y zoom (Web Mercator, tesela de 512 px). */
export function metersPerPixel(latDeg: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos(toRad(latDeg))) / (MAP_TILE_SIZE_PX * 2 ** zoom);
}

function assertViewport(viewportHeightPx: number): void {
  if (!Number.isFinite(viewportHeightPx) || viewportHeightPx <= 0) {
    throw new RangeError(`Altura de viewport inválida: ${viewportHeightPx}`);
  }
}

function assertPitch(pitchDeg: number): void {
  if (!Number.isFinite(pitchDeg) || pitchDeg < 0 || pitchDeg > MAX_PITCH_DEG) {
    throw new RangeError(`pitch fuera de [0, ${MAX_PITCH_DEG}]: ${pitchDeg}`);
  }
}

/** Altitud de la cámara sobre el suelo del centro para una vista de MapLibre. */
export function altitudeFromView(
  view: Pick<MapView, 'zoom' | 'pitch'> & { readonly lat: number },
  viewportHeightPx: number,
): number {
  assertViewport(viewportHeightPx);
  assertPitch(view.pitch);
  const distanceM =
    cameraToCenterDistancePx(viewportHeightPx) * metersPerPixel(view.lat, view.zoom);
  return distanceM * Math.cos(toRad(view.pitch));
}

/** Zoom de MapLibre que sitúa la cámara a esa altitud (inversa de `altitudeFromView`). */
export function zoomFromAltitude(
  camera: Pick<CameraState, 'lat' | 'altitudeM' | 'pitchDeg'>,
  viewportHeightPx: number,
): number {
  assertViewport(viewportHeightPx);
  assertPitch(camera.pitchDeg);
  if (!Number.isFinite(camera.altitudeM) || camera.altitudeM <= 0) {
    throw new RangeError(`altitud inválida: ${camera.altitudeM}`);
  }
  const distanceM = camera.altitudeM / Math.cos(toRad(camera.pitchDeg));
  const mpp = distanceM / cameraToCenterDistancePx(viewportHeightPx);
  return Math.log2(
    (EARTH_CIRCUMFERENCE_M * Math.cos(toRad(camera.lat))) / (MAP_TILE_SIZE_PX * mpp),
  );
}

export function toMapView(camera: CameraState, viewportHeightPx: number): MapView {
  return {
    center: [camera.lon, camera.lat],
    zoom: zoomFromAltitude(camera, viewportHeightPx),
    bearing: normalizeHeading(camera.headingDeg),
    pitch: camera.pitchDeg,
    roll: normalizeRoll(camera.rollDeg),
  };
}

export function fromMapView(view: MapView, viewportHeightPx: number): CameraState {
  const [lon, lat] = view.center;
  return {
    lon,
    lat,
    altitudeM: altitudeFromView({ zoom: view.zoom, pitch: view.pitch, lat }, viewportHeightPx),
    headingDeg: normalizeHeading(view.bearing),
    pitchDeg: view.pitch,
    rollDeg: normalizeRoll(view.roll),
  };
}
