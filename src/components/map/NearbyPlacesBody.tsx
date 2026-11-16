'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { DestinationKey } from '@/domains/tourism/destinations';
import {
  DATASET_NAMES,
  PLACE_GROUPS,
  contributingDatasets,
  displayDistanceM,
  parseDestinationPlaces,
  placeLicenses,
  type DestinationPlaces,
  type NearbyPlace,
  type PlaceGroup,
} from '@/domains/tourism/places';
import { formatCalendarDate, formatDistance, formatList } from '@/i18n/format';
import { LOCALES, type Locale } from '@/i18n/locales';
import { useHudStore } from './hud-store';
import styles from './NearbyPlaces.module.css';
import { publishPlacesView, requestShowPlace, usePlacesStore } from './places-store';
import { isMobileLayout, isSheetOpen, setSheetOpen } from './sheet-store';

type PlacesState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: DestinationPlaces }
  /** 403: los derechos de Overture Places no permiten servirlos aquí. */
  | { readonly status: 'blocked' }
  /** Sin red, error del servidor o respuesta con una forma inesperada (no se aprovecha una parte). */
  | { readonly status: 'unavailable' };

const asLocale = (value: string): Locale => LOCALES.find((l) => l === value) ?? 'es';

/** Los lugares de un destino desde la API propia. La respuesta es un dato de red: se valida antes de usarla. */
function usePlaces(destination: DestinationKey): PlacesState {
  const [state, setState] = useState<PlacesState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      let next: PlacesState;
      try {
        const response = await fetch(`/api/places/${encodeURIComponent(destination)}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (response.status === 403) next = { status: 'blocked' };
        else if (!response.ok) next = { status: 'unavailable' };
        else {
          const data = parseDestinationPlaces((await response.json()) as unknown, destination);
          next = data ? { status: 'ready', data } : { status: 'unavailable' };
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        next = { status: 'unavailable' };
      }
      setState(next);
    })();
    return () => {
      controller.abort();
    };
  }, [destination]);
  return state;
}

function PlaceItem({
  place,
  locale,
  highlighted,
  mapReady,
  reasonId,
}: {
  place: NearbyPlace;
  locale: Locale;
  highlighted: boolean;
  mapReady: boolean;
  reasonId: string | undefined;
}) {
  const t = useTranslations('Map');
  const providers = formatList(locale, [
    DATASET_NAMES.Overture,
    ...contributingDatasets(place).map((d) => DATASET_NAMES[d]),
  ]);
  const licenses = formatList(locale, placeLicenses(place));
  return (
    <li
      className={styles.place}
      data-place-id={place.id}
      data-highlighted={highlighted || undefined}
    >
      {/* El nombre es de la fuente (idioma desconocido): texto, sin `lang` (ADR-0021: no se adivina). */}
      <p className={styles.name}>{place.name}</p>
      <p className={styles.meta}>
        <span>{t(`places.kind.${place.kind}`)}</span>
        <span>
          {t('places.distance', {
            distance: formatDistance(locale, displayDistanceM(place.distanceM), 'metric'),
          })}
        </span>
        <span className={styles.tag}>{t('places.unverified')}</span>
      </p>
      <p className={styles.source}>
        <span>{t('places.source', { providers, licenses })}</span>
        {place.sourceUpdated ? (
          <span>
            {t('places.updated', { date: formatCalendarDate(locale, place.sourceUpdated) })}
          </span>
        ) : null}
      </p>
      <button
        type="button"
        className={styles.show}
        disabled={!mapReady}
        aria-label={t('showOnMapLabel', { name: place.name })}
        aria-describedby={reasonId}
        onClick={() => {
          requestShowPlace({ id: place.id, lon: place.lon, lat: place.lat });
          // En móvil la lista vive en la hoja inferior, que abierta tapa más de la mitad del mapa: se pliega para ver el lugar.
          // Este botón queda inerte, así que el foco pasa al asa (abrirla de nuevo devuelve la lista).
          if (isMobileLayout() && isSheetOpen()) {
            setSheetOpen(false);
            document.querySelector<HTMLElement>('[data-sheet-handle]')?.focus();
          }
        }}
      >
        {t('showOnMap')}
      </button>
    </li>
  );
}

/**
 * Lista de lugares cercanos SIN VERIFICAR de un destino (ADR-0027 A2): tres pestañas (qué hacer, dónde comer, dónde dormir) con
 * el patrón de pestañas de ARIA (flechas, Inicio y Fin; activación al enfocar: el contenido ya está cargado). Lo que se ve en el
 * mapa son los puntos de la pestaña abierta; esta lista es su alternativa completa.
 */
export default function NearbyPlacesBody({ destination }: { destination: DestinationKey }) {
  const t = useTranslations('Map');
  const locale = asLocale(useLocale());
  const state = usePlaces(destination);
  const { mapStatus } = useHudStore();
  const { highlight } = usePlacesStore();
  const [group, setGroup] = useState<PlaceGroup>('activities');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const reasonId = useId();
  const data = state.status === 'ready' ? state.data : null;

  // El mapa pinta los puntos de la pestaña abierta; al cerrar la lista (o cambiar de destino) deja de pintarlos.
  const points = useMemo(
    () => data?.groups[group].places.map(({ id, lon, lat }) => ({ id, lon, lat })) ?? null,
    [data, group],
  );
  useEffect(() => {
    if (!points) return;
    publishPlacesView({ destination, group, points });
    return () => {
      publishPlacesView(null);
    };
  }, [destination, group, points]);

  if (state.status === 'loading') return <p className={styles.status}>{t('places.loading')}</p>;
  if (state.status === 'blocked') return <p className={styles.status}>{t('places.blocked')}</p>;
  if (!data) return <p className={styles.status}>{t('places.unavailable')}</p>;

  const radius = formatDistance(locale, data.radiusKm * 1000, 'metric');
  const block = data.groups[group];
  const shown = block.places.length;
  const mapReady = mapStatus === 'ready';

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = PLACE_GROUPS.indexOf(group);
    const last = PLACE_GROUPS.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const nextGroup = PLACE_GROUPS[next];
    if (!nextGroup) return;
    setGroup(nextGroup);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className={styles.body} data-places-status="ready">
      <div className={styles.tabs} role="tablist" aria-label={t('places.tabsLabel')}>
        {PLACE_GROUPS.map((g, i) => (
          <button
            key={g}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${g}`}
            className={styles.tab}
            aria-selected={g === group}
            aria-controls={`${base}-panel`}
            tabIndex={g === group ? 0 : -1}
            data-group={g}
            onKeyDown={onKeyDown}
            onClick={() => {
              setGroup(g);
            }}
          >
            {t('places.tab', { label: t(`places.group.${g}`), count: data.groups[g].total })}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${group}`}
        className={styles.panel}
        tabIndex={0}
        data-group={group}
      >
        <p className={styles.summary}>
          {block.total === 0
            ? t('places.empty', { radius })
            : shown < block.total
              ? t('places.summaryCapped', { shown, total: block.total, radius })
              : t('places.summary', { count: shown, radius })}
        </p>
        {shown > 0 ? (
          <>
            <p className={styles.hint}>{t('places.mapHint')}</p>
            <ol className={styles.list}>
              {block.places.map((place) => (
                <PlaceItem
                  key={place.id}
                  place={place}
                  locale={locale}
                  highlighted={highlight === place.id}
                  mapReady={mapReady}
                  reasonId={mapStatus === 'unavailable' ? reasonId : undefined}
                />
              ))}
            </ol>
          </>
        ) : null}
        {mapStatus === 'unavailable' && shown > 0 ? (
          <p id={reasonId} className={styles.status}>
            {t('hud.mapUnavailable')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
