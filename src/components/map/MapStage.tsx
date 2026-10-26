'use client';

import '../../../vendor/maplibre-gl.trimmed.css';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Notice } from '@/components/Notice';
import { GLYPHS_URL_PATH } from '@/config/map-urls';
import { publicEnv } from '@/config/public-env';
import { WORKING_BBOX } from '@/domains/geography/bounds';
import { fromMapView, toMapView } from '@/domains/geography/camera';
import { framePadding, reachFrame, type FramePadding } from '@/domains/geography/hud-frame';
import { candidatesFromFeatures } from '@/domains/geography/area-selection';
import {
  clusterByScreenDistance,
  separationZoom,
  type Cluster,
} from '@/domains/geography/clustering';
import { SELECTION_LAYER_IDS, pickableLayers, selectionFilter } from '@/domains/geography/layers';
import {
  PALETTE_KEYS,
  buildMapStyle,
  paletteCssVariable,
  usesTerrain,
  type LabelLanguage,
  type MapPalette,
} from '@/domains/geography/map-style';
import {
  DEFAULT_MAP_LAYERS,
  MAP_LAYER_IDS,
  allowedLayers,
  formatCamera,
} from '@/domains/geography/map-url-state';
import type { DestinationKey } from '@/domains/tourism/destinations';
import { visibleKeys } from '@/domains/tourism/explore-filter';
import styles from './MapStage.module.css';
import {
  markMapUnavailable,
  publishVisibleAreas,
  rememberAreas,
  resetAreaStore,
  useAreaStore,
} from './area-selection-store';
import { useExploreFilter } from './explore-filter-store';
import { publishMapStatus, resetHudStore, useHudStore } from './hud-store';
import { isMobileLayout } from './sheet-store';
import type { MapDestination } from './map-data';
import {
  readMapUrlState,
  selectArea,
  selectDestination,
  useHydrated,
  useMapUrlState,
  writeCamera,
} from './use-map-url-state';

type Status = 'loading' | 'ready' | 'unsupported' | 'error' | 'dataMissing';

const MAX_BOUNDS: [[number, number], [number, number]] = [
  [WORKING_BBOX.west, WORKING_BBOX.south],
  [WORKING_BBOX.east, WORKING_BBOX.north],
];
const LABELS_FROM_ZOOM = 10;
/** Dos marcadores a menos de esta distancia en pantalla (objetivo táctil de 44 px + holgura) se agrupan. */
const CLUSTER_RADIUS_PX = 52;
const CAMERA_WRITE_DELAY_MS = 350;
const FLY_DURATION_MS = 1600;
const PITCH_DURATION_MS = 900;
/** Áreas que se listan como alternativa al clic (el total real se informa aparte: nunca se recorta en silencio). */
const AREA_LIST_LIMIT = 30;
const MAX_PITCH = 60;
const MAX_PITCH_TERRAIN = 75;
/**
 * Gestos cooperativos de MapLibre (un dedo desplaza la PÁGINA, dos dedos el mapa). Estuvieron activos por debajo de 56rem
 * mientras el mapa era una franja sobre un panel y la página se desplazaba. Con el mapa a pantalla completa y la hoja
 * inferior (ADR-0025 §8) un gesto sobre el mapa no debe desplazar la página (solo hay el pie debajo) y un dedo debe MOVER el mapa: se
 * desactivan. Si alguna vez vuelve un diseño en el que el mapa comparta pantalla con contenido que se desplaza, basta
 * con volver a activarlo (los textos en los cinco idiomas siguen en `Map.controls`).
 */
const COOPERATIVE_GESTURES = false;

const LANGUAGES: readonly LabelLanguage[] = ['es', 'en', 'pt', 'fr', 'de'];
const asLabelLanguage = (locale: string): LabelLanguage =>
  LANGUAGES.find((l) => l === locale) ?? 'es';

/** MapLibre 5+ necesita WebGL2. */
function webgl2Supported(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readPalette(): MapPalette {
  const computed = getComputedStyle(document.documentElement);
  const entries = PALETTE_KEYS.map((key) => {
    const value = computed.getPropertyValue(paletteCssVariable(key)).trim();
    if (value === '') throw new Error(`Falta el token CSS ${paletteCssVariable(key)}`);
    return [key, value] as const;
  });
  return Object.fromEntries(entries) as unknown as MapPalette;
}

const isNotFound = (error: unknown): boolean =>
  error instanceof Error && /\b404\b/.test(error.message);

/** Respiro (px) entre lo encuadrado y el borde del hueco libre de HUD. */
const FRAME_MARGIN_PX = 40;
const CLUSTER_MARGIN_PX = 72;
const WORLD_MARGIN_PX = 8;
/** El pin mide 44 px y su etiqueta cuelga debajo: el destino no se deja al ras del borde del hueco libre. */
const REACH_INSET_PX = 40;
/** Por abajo, además, cuelga la etiqueta del marcador seleccionado (≈ 30 px) y nada debe tocar la ficha. */
const REACH_INSET_BOTTOM_PX = 72;

/**
 * Relleno para encuadrar dentro del hueco que el HUD deja libre. El CSS decide ese hueco (`[data-hud-safe]`, la celda
 * central de la rejilla del HUD: sigue a los paneles aunque se plieguen) y aquí solo se MIDE en el momento de volar. En
 * móvil (el HUD se apila bajo el mapa) ese elemento no se pinta y el relleno es uniforme.
 */
function hudPadding(container: HTMLElement, margin: number): FramePadding {
  const safe = document.querySelector('[data-hud-safe]');
  return framePadding(
    container.getBoundingClientRect(),
    safe ? safe.getBoundingClientRect() : null,
    margin,
  );
}

/**
 * ¿Es inalcanzable este marcador? Lo es si ninguno de nueve puntos de su caja cae sobre el mapa visible sin NADA encima
 * (un panel del HUD, la cabecera fija al desplazarse la página…), o si está fuera de la pantalla (WCAG 2.4.11: el foco no
 * puede ir a un elemento ENTERAMENTE tapado). Mismo criterio que la sonda de las pruebas (`hiddenFocus`: 3×3 puntos). Un
 * marcador así sigue disponible desde el carrusel («Ver en el mapa»), que es la alternativa completa. «Libre» = lo que
 * hay encima pertenece al propio lienzo (el mapa, los marcadores, sus controles): se mira con `elementFromPoint`, así que
 * depende del desplazamiento de la página y se recalcula al desplazarla.
 */
function unreachableByPointer(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return false; // aún sin contenido: no se juzga
  let probes = 0;
  let free = 0;
  for (const fx of [0.1, 0.5, 0.9]) {
    for (const fy of [0.1, 0.5, 0.9]) {
      const x = box.left + box.width * fx;
      const y = box.top + box.height * fy;
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      probes += 1;
      const top = document.elementFromPoint(x, y);
      if (top && top.closest('[data-map-status]') !== null) free += 1;
    }
  }
  return probes === 0 || free === 0;
}

type BoxLngLat = readonly [west: number, south: number, east: number, north: number];

/**
 * Encuadra una caja dentro del hueco que el HUD deja libre. Es `fitBounds` con un paso más: `maxBounds` (Panamá es una
 * franja de 2,9° de alto) CLAVA el centro cuando la vista es más alta que la caja, y entonces un destino del sur
 * (Coiba) quedaba debajo del carrusel por mucho relleno que se pidiera. `reachFrame` lo detecta con las mismas
 * restricciones de MapLibre y sube el zoom lo justo para que el destino caiga en el hueco libre.
 */
function frameBox(
  map: MapLibreMap,
  container: HTMLElement,
  box: BoxLngLat,
  options: {
    margin: number;
    maxZoom: number;
    duration: number;
    minZoom?: number;
    /** Marcadores que deben quedar a la vista, dentro del hueco libre. */
    must?: readonly { lon: number; lat: number }[];
  },
): void {
  const padding = hudPadding(container, options.margin);
  // Diagnóstico (como `data-zoom`): la duración con que se pidió el último encuadre. 0 = inmediato (movimiento reducido).
  container.dataset.flightMs = String(options.duration);
  const [west, south, east, north] = box;
  const bounds: [[number, number], [number, number]] = [
    [west, south],
    [east, north],
  ];
  const camera = map.cameraForBounds(bounds, { padding, maxZoom: options.maxZoom });
  const rect = container.getBoundingClientRect();
  const fitZoom = camera?.zoom ?? map.getZoom();
  const reach = camera
    ? reachFrame({
        // `minZoom`: suelo propio del llamador (p. ej. que el destino no se funda con un grupo de marcadores)
        zoom: Math.max(fitZoom, options.minZoom ?? Number.NEGATIVE_INFINITY),
        maxZoom: map.getMaxZoom(),
        box: { west, south, east, north },
        ...(options.must ? { must: options.must } : {}),
        size: { width: rect.width, height: rect.height },
        padding,
        limits: WORKING_BBOX,
        bearing: map.getBearing(),
        inset: REACH_INSET_PX,
        insetBottom: REACH_INSET_BOTTOM_PX,
      })
    : null;
  // Se vuela con lo calculado aquí si subió el zoom (por alcanzabilidad o por el suelo del llamador) o si hubo que centrar
  // los propios puntos; si no, `fitBounds` hace exactamente lo mismo que el cálculo y con su animación habitual.
  if (reach && (reach.zoom > fitZoom + 1e-6 || reach.aim === 'points')) {
    map.flyTo({
      center: [reach.center.lon, reach.center.lat],
      zoom: reach.zoom,
      duration: options.duration,
    });
    return;
  }
  map.fitBounds(bounds, { padding, maxZoom: options.maxZoom, duration: options.duration });
}

/** Un destino sin caja (p. ej. la ciudad) es un punto: una caja de área cero, que se encuadra al zoom por defecto. */
const destinationBox = (destination: MapDestination): BoxLngLat =>
  destination.bounds ?? [destination.lon, destination.lat, destination.lon, destination.lat];

/** Suelo de zoom para que el destino se vea como SU marcador y no dentro de un grupo («3») de sus vecinos. */
const separatedFrom = (destination: MapDestination, all: readonly MapDestination[]): number =>
  separationZoom(all, destination.key, CLUSTER_RADIUS_PX + 4);

function frame(
  map: MapLibreMap,
  container: HTMLElement,
  destination: MapDestination,
  all: readonly MapDestination[],
  duration = prefersReducedMotion() ? 0 : FLY_DURATION_MS,
): void {
  frameBox(map, container, destinationBox(destination), {
    margin: FRAME_MARGIN_PX,
    maxZoom: destination.defaultZoom,
    duration,
    minZoom: separatedFrom(destination, all),
    must: [{ lon: destination.lon, lat: destination.lat }],
  });
}

function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

function zoomToCluster(
  map: MapLibreMap,
  container: HTMLElement,
  members: readonly MapDestination[],
): void {
  const lons = members.map((m) => m.lon);
  const lats = members.map((m) => m.lat);
  frameBox(
    map,
    container,
    [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
    {
      margin: CLUSTER_MARGIN_PX,
      maxZoom: 14,
      duration: prefersReducedMotion() ? 0 : FLY_DURATION_MS,
      must: members.map((m) => ({ lon: m.lon, lat: m.lat })),
    },
  );
}

export function MapStage({
  destinations,
  terrainAllowed,
}: {
  destinations: readonly MapDestination[];
  terrainAllowed: boolean;
}) {
  const t = useTranslations('Map');
  const locale = useLocale();
  const language = asLabelLanguage(locale);
  const { state, issues } = useMapUrlState();
  const hydrated = useHydrated();
  const layers = allowedLayers(state.layers ?? DEFAULT_MAP_LAYERS, terrainAllowed);
  const layersKey = layers.join(',');
  const cameraText = state.camera ? formatCamera(state.camera) : null;
  const selectedAreaId = state.area ?? null;
  const { frameRequest } = useAreaStore();
  const { frameRequest: destinationFrame, pitchRequest } = useHudStore();
  // Filtro por tipo y búsqueda (estado local, no en la URL): los marcadores muestran solo lo que coincide, y el destino
  // SELECCIONADO nunca se retira (sin marcador, la ficha quedaría suelta).
  const filter = useExploreFilter();
  const shownKeys = visibleKeys(filter, destinations, state.destination);
  const shownKey = shownKeys.join(',');

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const lastWrittenRef = useRef<string | null>(null);
  const appliedDestinationRef = useRef<DestinationKey | undefined>(undefined);
  const handledFrameRef = useRef(0);
  const handledPitchRef = useRef(0);
  const destinationsRef = useRef(destinations);
  const shownRef = useRef<ReadonlySet<string>>(new Set(shownKeys));
  const reclusterRef = useRef<() => void>(() => undefined);
  const styleInputsRef = useRef({ language, layers, selectedAreaId, locale });
  const markerStoreRef = useRef(new Map<string, { marker: MapLibreMarker; host: HTMLElement }>());
  const syncCoverageRef = useRef<() => void>(() => undefined);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [terrainFailed, setTerrainFailed] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [clusters, setClusters] = useState<readonly Cluster[]>([]);
  const [hosts, setHosts] = useState<ReadonlyMap<string, HTMLElement>>(new Map());
  const [paletteVersion, setPaletteVersion] = useState(0);

  /** Los destinos que se ven ahora (el filtro retiró los demás): con ellos se agrupan los marcadores y se encuadra. */
  const shownDestinations = (): readonly MapDestination[] =>
    destinationsRef.current.filter((d) => shownRef.current.has(d.key));

  useEffect(() => {
    destinationsRef.current = destinations;
    shownRef.current = new Set(shownKey === '' ? [] : shownKey.split(','));
    styleInputsRef.current = { language, layers, selectedAreaId, locale };
  });

  // Tema claro/oscuro: se releen los tokens y se reaplica el estilo.
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      setPaletteVersion((v) => v + 1);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);

  // Ciclo de vida del mapa: se crea UNA vez (y de nuevo al reintentar); la limpieza lo destruye por completo
  // (imprescindible con StrictMode, que monta, desmonta y vuelve a montar).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let map: MapLibreMap | undefined;
    let debounce: number | undefined;
    let removeProtocol: (() => void) | undefined;
    let attributionWatcher: MutationObserver | undefined;
    const store = markerStoreRef.current;
    // Los marcadores que un panel del HUD tapa por completo (o que caen fuera de la pantalla) salen del orden de
    // tabulación y del árbol de accesibilidad con `inert`; vuelven en cuanto se descubren. No cambia nada visible.
    syncCoverageRef.current = () => {
      if (disposed) return;
      for (const { host } of store.values()) host.inert = unreachableByPointer(host);
    };

    const fail = (next: Status) => {
      if (!disposed) setStatus(next);
    };

    void (async () => {
      if (!webgl2Supported()) {
        fail('unsupported');
        return;
      }
      try {
        const [maplibre, pmtiles] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
        if (disposed) return;

        // MapLibre 6 deduce la URL de su worker de `import.meta.url` del módulo principal; empaquetado, ese módulo
        // vive en un chunk de Next donde el worker no existe. Se le indica un recurso emitido por el bundler
        // (misma versión que el paquete instalado y mismo origen: `worker-src 'self'`).
        maplibre.setWorkerUrl(
          new URL('../../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url)
            .href,
        );

        const archiveUrl = new URL(publicEnv.basemapUrl, window.location.href).href;
        const archive = new pmtiles.PMTiles(archiveUrl);
        try {
          await archive.getHeader();
        } catch (error) {
          fail(isNotFound(error) ? 'dataMissing' : 'error');
          return;
        }
        if (disposed) return;
        const protocol = new pmtiles.Protocol();
        protocol.add(archive);
        maplibre.addProtocol('pmtiles', protocol.tile);
        removeProtocol = () => {
          maplibre.removeProtocol('pmtiles');
        };

        const buildStyle = () =>
          buildMapStyle({
            language: styleInputsRef.current.language,
            layers: styleInputsRef.current.layers,
            selectedAreaId: styleInputsRef.current.selectedAreaId,
            palette: readPalette(),
            basemapUrl: archiveUrl,
            glyphsUrl: new URL(GLYPHS_URL_PATH, window.location.href).href
              .replace(/%7B/g, '{')
              .replace(/%7D/g, '}'),
            terrainTilesUrl: publicEnv.terrainTilesUrl,
          });

        const initial = readMapUrlState(window.location.search).state;
        const reduced = prefersReducedMotion();
        const height = container.clientHeight || 600;
        const view = initial.camera ? toMapView(initial.camera, height) : undefined;
        const destination = initial.destination
          ? destinationsRef.current.find((d) => d.key === initial.destination)
          : undefined;
        lastWrittenRef.current = initial.camera ? formatCamera(initial.camera) : null;
        appliedDestinationRef.current = initial.destination;

        map = new maplibre.Map({
          container,
          style: buildStyle(),
          minZoom: 4,
          maxZoom: 18,
          maxBounds: MAX_BOUNDS,
          maxPitch:
            usesTerrain(styleInputsRef.current.layers) &&
            styleInputsRef.current.layers.includes('terrain3d')
              ? MAX_PITCH_TERRAIN
              : MAX_PITCH,
          attributionControl: { compact: true },
          cooperativeGestures: COOPERATIVE_GESTURES,
          fadeDuration: reduced ? 0 : 300,
          locale: {
            'AttributionControl.ToggleAttribution': t('controls.toggleAttribution'),
            'NavigationControl.ZoomIn': t('controls.zoomIn'),
            'NavigationControl.ZoomOut': t('controls.zoomOut'),
            'NavigationControl.ResetBearing': t('controls.resetBearing'),
            'Map.Title': t('controls.mapTitle'),
            'CooperativeGesturesHandler.MacHelpText': t('controls.cooperativeMac'),
            'CooperativeGesturesHandler.WindowsHelpText': t('controls.cooperativeWindows'),
            'CooperativeGesturesHandler.MobileHelpText': t('controls.cooperativeMobile'),
            'ScaleControl.Meters': t('controls.scaleMeters'),
            'ScaleControl.Kilometers': t('controls.scaleKilometers'),
          },
          ...(view
            ? {
                center: view.center as [number, number],
                zoom: view.zoom,
                bearing: view.bearing,
                pitch: view.pitch,
                roll: view.roll,
              }
            : destination
              ? {
                  // Un destino sin caja (p. ej. la ciudad) es un punto: caja de área cero al zoom por defecto.
                  bounds: [
                    [
                      destination.bounds?.[0] ?? destination.lon,
                      destination.bounds?.[1] ?? destination.lat,
                    ],
                    [
                      destination.bounds?.[2] ?? destination.lon,
                      destination.bounds?.[3] ?? destination.lat,
                    ],
                  ] as [[number, number], [number, number]],
                  fitBoundsOptions: {
                    padding: hudPadding(container, FRAME_MARGIN_PX),
                    maxZoom: destination.defaultZoom,
                  },
                }
              : {
                  bounds: MAX_BOUNDS,
                  fitBoundsOptions: { padding: hudPadding(container, WORLD_MARGIN_PX) },
                }),
        });
        mapRef.current = map;
        const current = map;
        // En móvil los créditos arrancan plegados a su botón «i»: MapLibre los abre en cuanto tiene algo que atribuir y ocupan
        // dos líneas de ancho completo sobre la hoja (el texto íntegro sigue en «Información del mapa» y detrás del botón).
        // Se pliegan EN CUANTO se abren, en la misma microtarea y antes del primer dibujo: hacerlo al terminar de cargar movía
        // los controles de la esquina (CLS 0,040 medido). Solo la primera vez: después, abrirlos es cosa de la persona.
        if (isMobileLayout()) {
          const collapse = (): boolean => {
            const attribution = container.querySelector('.maplibregl-ctrl-attrib');
            if (!attribution?.hasAttribute('open')) return false;
            attribution.removeAttribute('open');
            return true;
          };
          if (!collapse()) {
            attributionWatcher = new MutationObserver(() => {
              if (collapse()) attributionWatcher?.disconnect();
            });
            attributionWatcher.observe(container, {
              subtree: true,
              childList: true,
              attributes: true,
              attributeFilter: ['open'],
            });
          }
        }
        // El constructor ya encuadró el destino con el relleno del HUD; si `maxBounds` impide que quede en el hueco libre
        // (Coiba), se corrige aquí, antes del primer dibujo y sin animar.
        if (!view && destination) {
          frame(current, container, destination, shownDestinations(), 0);
        }

        current.addControl(new maplibre.NavigationControl({ visualizePitch: true }), 'top-right');
        current.addControl(
          new maplibre.ScaleControl({ unit: 'metric', maxWidth: 110 }),
          'bottom-left',
        );
        current.getCanvas().setAttribute('aria-describedby', 'map-keyboard-help');

        // Marcadores: elementos HTML reales (botones), no dibujo en el lienzo: son enfocables y se leen.
        // Se agrupan por distancia en pantalla (dos botones solapados no se pueden pulsar); se recalcula al terminar
        // cada movimiento y los marcadores se crean/retiran a la vez que cambian los grupos.
        const recluster = () => {
          if (disposed) return;
          const points = shownDestinations().map((d) => {
            const screen = current.project([d.lon, d.lat]);
            return { key: d.key, x: screen.x, y: screen.y, lon: d.lon, lat: d.lat };
          });
          const next = clusterByScreenDistance(points, CLUSTER_RADIUS_PX);
          const wanted = new Set(next.map((c) => c.id));
          for (const [id, entry] of store) {
            if (!wanted.has(id)) {
              entry.marker.remove();
              store.delete(id);
            }
          }
          for (const cluster of next) {
            if (store.has(cluster.id)) continue;
            const host = document.createElement('div');
            host.className = styles.markerHost ?? '';
            const marker = new maplibre.Marker({ element: host, anchor: 'center' })
              .setLngLat([cluster.lon, cluster.lat])
              .addTo(current);
            store.set(cluster.id, { marker, host });
          }
          setClusters((previous) =>
            previous.map((c) => c.id).join('|') === next.map((c) => c.id).join('|')
              ? previous
              : next,
          );
          setHosts(new Map([...store].map(([id, entry]) => [id, entry.host])));
        };

        reclusterRef.current = recluster;

        const updateData = () => {
          const c = current.getCenter();
          container.dataset.zoom = current.getZoom().toFixed(2);
          container.dataset.center = `${c.lng.toFixed(4)},${c.lat.toFixed(4)}`;
          container.dataset.pitch = current.getPitch().toFixed(1);
          // Capas que MapLibre tiene de verdad (tras el diff de estilo): lo que se dibuja, no lo que se pidió.
          container.dataset.styleLayers = current.getLayersOrder().join(',');
          setLabelsOpen(current.getZoom() >= LABELS_FROM_ZOOM);
        };

        current.on('load', () => {
          if (disposed) return;
          updateData();
          recluster();
          setStatus('ready');
        });
        // Selección de áreas: capas de MapLibre sobre las que se consulta, solo las que existen ahora mismo
        // (el registro dice cuáles admiten clic; si la capa está apagada no hay nada que elegir).
        const pickingNow = () => {
          const picking = pickableLayers(styleInputsRef.current.layers)[0];
          const ids = picking?.styleLayerIds.filter((id) => current.getLayer(id) !== undefined);
          return picking && ids && ids.length > 0 ? { picking, ids } : null;
        };
        // La lista por teclado: las áreas dibujadas en la vista actual (alternativa al clic).
        const publishAreas = () => {
          if (disposed) return;
          const now = pickingNow();
          if (!now) {
            publishVisibleAreas([], 0);
            return;
          }
          const features = current.queryRenderedFeatures({ layers: now.ids });
          const { items, total } = candidatesFromFeatures(
            features,
            now.picking.idProperty,
            styleInputsRef.current.locale,
            AREA_LIST_LIMIT,
          );
          publishVisibleAreas(items, total);
        };
        // Clic: solo si cae sobre el lienzo (un clic en un marcador de destino o en un control no es una
        // selección de área). Con áreas superpuestas se elige la de más arriba; las demás, desde la lista.
        current.on('click', (event) => {
          if (event.originalEvent.target !== current.getCanvas()) return;
          const now = pickingNow();
          if (!now) return;
          const [top] = current.queryRenderedFeatures(event.point, { layers: now.ids });
          const [candidate] = top
            ? candidatesFromFeatures(
                [top],
                now.picking.idProperty,
                styleInputsRef.current.locale,
                1,
              ).items
            : [];
          if (!candidate) return;
          rememberAreas([candidate]);
          selectArea(candidate.id);
        });
        const canvas = current.getCanvas();
        for (const picking of pickableLayers([...MAP_LAYER_IDS])) {
          for (const id of picking.styleLayerIds) {
            current.on('mouseenter', id, () => {
              canvas.style.cursor = 'pointer';
            });
            current.on('mouseleave', id, () => {
              canvas.style.cursor = '';
            });
          }
        }
        current.on('resize', recluster);
        current.on('idle', () => {
          attributionWatcher?.disconnect(); // ya salieron los créditos: lo que abra la persona es suyo
          updateData();
          publishAreas();
          syncCoverageRef.current();
        });
        current.on('moveend', () => {
          recluster();
          syncCoverageRef.current();
          window.clearTimeout(debounce);
          debounce = window.setTimeout(() => {
            if (disposed || container.clientHeight <= 0) return;
            const c = current.getCenter();
            const camera = fromMapView(
              {
                center: [c.lng, c.lat],
                zoom: current.getZoom(),
                bearing: current.getBearing(),
                pitch: current.getPitch(),
                roll: current.getRoll(),
              },
              container.clientHeight,
            );
            const written = formatCamera(camera);
            if (written === lastWrittenRef.current) return;
            lastWrittenRef.current = written;
            writeCamera(camera);
          }, CAMERA_WRITE_DELAY_MS);
        });
        current.on('error', (event) => {
          if (disposed) return;
          const sourceId = (event as { sourceId?: string }).sourceId;
          if (sourceId === 'terrain-dem') setTerrainFailed(true);
          // Un fallo del mapa base ANTES de cargar es fatal; después es transitorio (una tesela que no llegó).
          else if (!current.loaded()) setStatus((s) => (s === 'loading' ? 'error' : s));
        });
        current.getCanvas().addEventListener('webglcontextlost', () => {
          fail('error');
        });
      } catch {
        fail('error');
      }
    })();

    return () => {
      disposed = true;
      attributionWatcher?.disconnect();
      window.clearTimeout(debounce);
      for (const { marker } of store.values()) marker.remove();
      store.clear();
      map?.remove();
      mapRef.current = null;
      reclusterRef.current = () => undefined;
      resetAreaStore();
      resetHudStore();
      removeProtocol?.();
    };
    // `t` cambia de identidad entre renders pero el idioma es fijo por página; el mapa no debe recrearse por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Cámara y destino desde la URL (Atrás/Adelante, enlaces, botones). La cámara explícita manda sobre el destino.
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || status !== 'ready') return;
    if (state.camera && cameraText !== null && cameraText !== lastWrittenRef.current) {
      lastWrittenRef.current = cameraText;
      appliedDestinationRef.current = state.destination;
      const view = toMapView(state.camera, container.clientHeight || 600);
      map.jumpTo({
        center: view.center as [number, number],
        zoom: view.zoom,
        bearing: view.bearing,
        pitch: view.pitch,
        roll: view.roll,
      });
      return;
    }
    if (state.destination !== appliedDestinationRef.current) {
      appliedDestinationRef.current = state.destination;
      const destination = destinationsRef.current.find((d) => d.key === state.destination);
      if (destination) frame(map, container, destination, shownDestinations());
    }
  }, [cameraText, state.camera, state.destination, status]);

  // Capas, idioma y tema: se reaplica el estilo por diferencias (no se recrea el mapa).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    try {
      map.setStyle(
        buildMapStyle({
          language,
          layers,
          // La selección también va aquí: al cambiar idioma, tema o capas el resalte no se pierde.
          selectedAreaId: styleInputsRef.current.selectedAreaId,
          palette: readPalette(),
          basemapUrl: new URL(publicEnv.basemapUrl, window.location.href).href,
          glyphsUrl: new URL(GLYPHS_URL_PATH, window.location.href).href
            .replace(/%7B/g, '{')
            .replace(/%7D/g, '}'),
          terrainTilesUrl: publicEnv.terrainTilesUrl,
        }),
        { diff: true },
      );
      map.setMaxPitch(layers.includes('terrain3d') ? MAX_PITCH_TERRAIN : MAX_PITCH);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTerrainFailed(false);
    } catch {
      setStatus('error');
    }
    // `layers` se identifica por `layersKey` (un array nuevo en cada render no debe reaplicar el estilo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layersKey, language, paletteVersion, status]);

  // Si el mapa no se puede mostrar, la lista de áreas lo dice (no se queda «esperando» para siempre).
  useEffect(() => {
    if (status === 'unsupported' || status === 'error' || status === 'dataMissing') {
      markMapUnavailable();
    }
  }, [status]);

  // Selección: solo cambia el filtro del resalte (no se reaplica el estilo entero).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    for (const id of SELECTION_LAYER_IDS) {
      if (map.getLayer(id)) map.setFilter(id, selectionFilter(selectedAreaId));
    }
  }, [selectedAreaId, status, layersKey]);

  // La ficha pide mostrar el área (no se mueve la cámara sola).
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || status !== 'ready' || !frameRequest) return;
    frameBox(map, container, frameRequest.bounds, {
      margin: FRAME_MARGIN_PX,
      maxZoom: 12,
      duration: prefersReducedMotion() ? 0 : FLY_DURATION_MS,
    });
  }, [frameRequest, status]);

  // La ficha del destino pide «volver a encuadrar»: la cámara explícita (`c`) gana a `d`, así que elegirlo de nuevo
  // no vuela; esto sí. Cada orden lleva un `nonce` (se atiende una sola vez); sin orden, se rearma.
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!destinationFrame) {
      handledFrameRef.current = 0;
      return;
    }
    if (!map || !container || status !== 'ready') return;
    if (destinationFrame.nonce <= handledFrameRef.current) return;
    handledFrameRef.current = destinationFrame.nonce;
    const destination = destinationsRef.current.find((d) => d.key === destinationFrame.key);
    if (destination) frame(map, container, destination, shownDestinations());
  }, [destinationFrame, status]);

  // El botón «Relieve en 3D» pide inclinar (o enderezar) la cámara. Solo lo pide la persona al pulsarlo. Con movimiento
  // reducido la cámara cambia de golpe, sin animación (un cambio instantáneo no es movimiento; sin él el relieve
  // activado no se vería). Cada orden lleva un `nonce` y se atiende una sola vez.
  useEffect(() => {
    const map = mapRef.current;
    if (!pitchRequest) {
      handledPitchRef.current = 0;
      return;
    }
    if (!map || status !== 'ready') return;
    if (pitchRequest.nonce <= handledPitchRef.current) return;
    handledPitchRef.current = pitchRequest.nonce;
    map.easeTo({
      pitch: pitchRequest.pitch,
      duration: prefersReducedMotion() ? 0 : PITCH_DURATION_MS,
    });
  }, [pitchRequest, status]);

  // El filtro por tipo o la búsqueda cambian qué marcadores se ven: se reagrupan (la agrupación solo se recalculaba al
  // cargar, al redimensionar y al terminar un movimiento).
  useEffect(() => {
    if (status === 'ready') reclusterRef.current();
  }, [shownKey, status]);

  // Tras pintar los botones de los marcadores (el portal) se juzga cuáles tapa el HUD, ANTES de que el navegador pinte y
  // de que nada pueda enfocarlos (un efecto «pasivo» llega tarde: con la máquina cargada, una pulsación de Tab se
  // adelantaba y el foco caía en un marcador tapado). También cuando los paneles cambian de tamaño (plegar el
  // carrusel o el panel descubre lo que había debajo) y cuando la PÁGINA se desplaza (la cabecera fija tapa el mapa).
  useLayoutEffect(() => {
    syncCoverageRef.current();
  }, [clusters, hosts, status]);
  useEffect(() => {
    if (status !== 'ready') return;
    const watched = document.querySelectorAll('[data-hud-safe], [data-hud-zone]');
    let frame = 0;
    const schedule = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncCoverageRef.current();
      });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    for (const el of watched) observer?.observe(el);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.cancelAnimationFrame(frame);
    };
  }, [status]);

  // Los controles del HUD que dependen del mapa (volver a encuadrar, carrusel plegable) leen su estado de aquí.
  useEffect(() => {
    publishMapStatus(
      status === 'ready' ? 'ready' : status === 'loading' ? 'loading' : 'unavailable',
    );
  }, [status]);

  return (
    <div
      className={styles.stage}
      data-map-status={status}
      data-map-layers={layersKey}
      data-selected-area={selectedAreaId ?? undefined}
      data-map-terrain-failed={terrainFailed ? 'true' : undefined}
    >
      <p id="map-keyboard-help" className="visually-hidden">
        {t('keyboardHelp')}
      </p>
      <div
        ref={containerRef}
        className={styles.canvas}
        aria-busy={status === 'loading'}
        // Mientras el aviso (carga, error…) tapa el mapa, sus controles —ya creados— no deben recibir el foco: un
        // teclado aterrizaría en botones invisibles (WCAG 2.4.11). `inert` los saca del orden de tabulación.
        inert={status !== 'ready'}
        data-testid="map-canvas"
      />
      {/* Decoración pura (viñeta y brillo bajo el HUD): ni datos, ni profundidad medida, ni clima. No recibe punteros. */}
      <div className={styles.atmosphere} data-atmosphere aria-hidden="true" />

      {clusters.map((cluster) => {
        const host = hosts.get(cluster.id);
        if (!host) return null;
        const members = cluster.keys
          .map((key) => destinations.find((d) => d.key === key))
          .filter((d): d is MapDestination => d !== undefined);
        const [only] = members;
        if (members.length === 1 && only) {
          const selected = state.destination === only.key;
          return createPortal(
            <button
              type="button"
              className={cx(
                styles.marker,
                selected && styles.markerSelected,
                labelsOpen && styles.markerOpen,
              )}
              aria-pressed={selected}
              data-destination={only.key}
              onClick={() => {
                selectDestination(only.key);
              }}
            >
              <span className={styles.pin} aria-hidden="true" />
              <span className={styles.label}>{only.name}</span>
            </button>,
            host,
            cluster.id,
          );
        }
        const names = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
          members.map((m) => m.name),
        );
        return createPortal(
          <button
            type="button"
            className={styles.cluster}
            data-cluster={cluster.id}
            aria-label={t('cluster', { count: members.length, names })}
            onClick={() => {
              const container = containerRef.current;
              if (mapRef.current && container) {
                zoomToCluster(mapRef.current, container, members);
              }
            }}
          >
            <span aria-hidden="true">{members.length}</span>
          </button>,
          host,
          cluster.id,
        );
      })}

      {status !== 'ready' && (hydrated || status !== 'loading') ? (
        <div className={styles.overlay}>
          {status === 'loading' ? (
            <p role="status" className={styles.loading}>
              {t('loading')}
            </p>
          ) : null}
          {status === 'unsupported' ? (
            <Notice role="alert">
              <p>
                <strong>{t('unsupported.title')}</strong>
              </p>
              <p>{t('unsupported.body')}</p>
            </Notice>
          ) : null}
          {status === 'dataMissing' ? (
            <Notice role="alert">
              <p>
                <strong>{t('dataMissing.title')}</strong>
              </p>
              <p>{t('dataMissing.body')}</p>
            </Notice>
          ) : null}
          {status === 'error' ? (
            <Notice role="alert">
              <p>
                <strong>{t('error.title')}</strong>
              </p>
              <p>{t('error.body')}</p>
              <button
                type="button"
                className={styles.retry}
                onClick={() => {
                  setStatus('loading');
                  setAttempt((n) => n + 1);
                }}
              >
                {t('error.retry')}
              </button>
            </Notice>
          ) : null}
        </div>
      ) : null}

      <div className={styles.notices}>
        {/* Con una capa de relieve activa (la casilla o «Relieve en 3D»: el aviso es el mismo y UNO solo) se dice a quién
            llega la dirección IP. Vive aquí y no en el grupo «Capas» del carril porque ese grupo puede estar plegado. */}
        {usesTerrain(layers) ? (
          <Notice role="status">
            <p>{t('layers.thirdPartyNotice')}</p>
          </Notice>
        ) : null}
        {terrainFailed ? (
          <Notice role="status">
            <p>
              <strong>{t('terrainError.title')}</strong> {t('terrainError.body')}
            </p>
          </Notice>
        ) : null}
        {issues.length > 0 ? (
          <Notice role="status">
            <p>{t('invalidLink')}</p>
          </Notice>
        ) : null}
      </div>
    </div>
  );
}
