'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Notice } from '@/components/Notice';
import { GLYPHS_URL_PATH } from '@/config/map-urls';
import { publicEnv } from '@/config/public-env';
import { WORKING_BBOX } from '@/domains/geography/bounds';
import { fromMapView, toMapView } from '@/domains/geography/camera';
import { clusterByScreenDistance, type Cluster } from '@/domains/geography/clustering';
import {
  PALETTE_KEYS,
  buildMapStyle,
  paletteCssVariable,
  usesTerrain,
  type LabelLanguage,
  type MapPalette,
} from '@/domains/geography/map-style';
import { DEFAULT_MAP_LAYERS, allowedLayers, formatCamera } from '@/domains/geography/map-url-state';
import type { DestinationKey } from '@/domains/tourism/destinations';
import styles from './MapStage.module.css';
import type { MapDestination } from './map-data';
import {
  readMapUrlState,
  selectDestination,
  useHydrated,
  useMapUrlState,
  writeCamera,
} from './use-map-url-state';

type Status = 'loading' | 'ready' | 'unsupported' | 'error' | 'dataMissing' | 'blocked';

const MAX_BOUNDS: [[number, number], [number, number]] = [
  [WORKING_BBOX.west, WORKING_BBOX.south],
  [WORKING_BBOX.east, WORKING_BBOX.north],
];
const LABELS_FROM_ZOOM = 10;
/** Dos marcadores a menos de esta distancia en pantalla (objetivo táctil de 44 px + holgura) se agrupan. */
const CLUSTER_RADIUS_PX = 52;
const CAMERA_WRITE_DELAY_MS = 350;
const FLY_DURATION_MS = 1600;
const MAX_PITCH = 60;
const MAX_PITCH_TERRAIN = 75;

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

function frame(map: MapLibreMap, destination: MapDestination): void {
  const duration = prefersReducedMotion() ? 0 : FLY_DURATION_MS;
  if (destination.bounds) {
    const [w, s, e, n] = destination.bounds;
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 48, maxZoom: destination.defaultZoom, duration },
    );
  } else {
    map.flyTo({
      center: [destination.lon, destination.lat],
      zoom: destination.defaultZoom,
      duration,
    });
  }
}

function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

function zoomToCluster(map: MapLibreMap, members: readonly MapDestination[]): void {
  const lons = members.map((m) => m.lon);
  const lats = members.map((m) => m.lat);
  map.fitBounds(
    [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    { padding: 96, maxZoom: 14, duration: prefersReducedMotion() ? 0 : FLY_DURATION_MS },
  );
}

export function MapStage({
  destinations,
  blocked,
  terrainAllowed,
}: {
  destinations: readonly MapDestination[];
  /** Los derechos no permiten mostrar el mapa base (p. ej. política provisional en producción). */
  blocked: boolean;
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

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const lastWrittenRef = useRef<string | null>(null);
  const appliedDestinationRef = useRef<DestinationKey | undefined>(undefined);
  const destinationsRef = useRef(destinations);
  const styleInputsRef = useRef({ language, layers });
  const markerStoreRef = useRef(new Map<string, { marker: MapLibreMarker; host: HTMLElement }>());
  const [status, setStatus] = useState<Status>(blocked ? 'blocked' : 'loading');
  const [attempt, setAttempt] = useState(0);
  const [terrainFailed, setTerrainFailed] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [clusters, setClusters] = useState<readonly Cluster[]>([]);
  const [hosts, setHosts] = useState<ReadonlyMap<string, HTMLElement>>(new Map());
  const [paletteVersion, setPaletteVersion] = useState(0);

  useEffect(() => {
    destinationsRef.current = destinations;
    styleInputsRef.current = { language, layers };
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
    if (!container || blocked) return;
    let disposed = false;
    let map: MapLibreMap | undefined;
    let debounce: number | undefined;
    let removeProtocol: (() => void) | undefined;
    const store = markerStoreRef.current;

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
          cooperativeGestures: window.matchMedia('(max-width: 56rem)').matches,
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
            : destination?.bounds
              ? {
                  bounds: [
                    [destination.bounds[0], destination.bounds[1]],
                    [destination.bounds[2], destination.bounds[3]],
                  ] as [[number, number], [number, number]],
                  fitBoundsOptions: { padding: 48, maxZoom: destination.defaultZoom },
                }
              : destination
                ? {
                    center: [destination.lon, destination.lat] as [number, number],
                    zoom: destination.defaultZoom,
                  }
                : { bounds: MAX_BOUNDS, fitBoundsOptions: { padding: 8 } }),
        });
        mapRef.current = map;
        const current = map;

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
          const points = destinationsRef.current.map((d) => {
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
        current.on('resize', recluster);
        current.on('idle', updateData);
        current.on('moveend', () => {
          recluster();
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
      window.clearTimeout(debounce);
      for (const { marker } of store.values()) marker.remove();
      store.clear();
      map?.remove();
      mapRef.current = null;
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
      if (destination) frame(map, destination);
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

  return (
    <div
      className={styles.stage}
      data-map-status={status}
      data-map-layers={layersKey}
      data-map-terrain-failed={terrainFailed ? 'true' : undefined}
    >
      <p id="map-keyboard-help" className="visually-hidden">
        {t('keyboardHelp')}
      </p>
      <div
        ref={containerRef}
        className={styles.canvas}
        aria-busy={status === 'loading'}
        data-testid="map-canvas"
      />

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
              if (mapRef.current) zoomToCluster(mapRef.current, members);
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
          {status === 'blocked' ? (
            <Notice role="status">
              <p>
                <strong>{t('blocked.title')}</strong>
              </p>
              <p>{t('blocked.body')}</p>
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
