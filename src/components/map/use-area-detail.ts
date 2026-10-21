'use client';

import { useEffect, useState } from 'react';
import type { AreaDetail } from '@/domains/geography/area-detail';

export type AreaDetailState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly detail: AreaDetail }
  /** 404: no existe, no es público o su geometría no es válida (la API no distingue a propósito). */
  | { readonly status: 'notFound' }
  /** 403: los derechos no permiten servir estos datos todavía. */
  | { readonly status: 'blocked' }
  /** Sin base de datos, sin red, tiempo agotado o respuesta con forma inesperada. */
  | { readonly status: 'unavailable' };

/** Zoom de la geometría que se pide: solo hace falta para encuadrar, así que va muy simplificada. */
const FRAME_ZOOM = 6;

/**
 * Ficha de un área desde la API espacial (`/api/spatial/areas/by-overture/{id}`). La respuesta es un dato de
 * red: se valida antes de usarla. «Cargando» se deriva de que la petición no corresponde al ID actual (así no
 * se actualiza estado de forma síncrona dentro del efecto).
 */
export function useAreaDetail(id: string | undefined, locale: string): AreaDetailState {
  const [result, setResult] = useState<{
    readonly key: string;
    readonly value: AreaDetailState;
  } | null>(null);
  const key = id ? `${id}|${locale}` : null;

  useEffect(() => {
    if (!id || key === null) return;
    const controller = new AbortController();
    void (async () => {
      let value: AreaDetailState;
      try {
        const response = await fetch(
          `/api/spatial/areas/by-overture/${encodeURIComponent(id)}?locale=${encodeURIComponent(locale)}&zoom=${FRAME_ZOOM}`,
          { signal: controller.signal, headers: { Accept: 'application/geo+json' } },
        );
        if (response.status === 404) value = { status: 'notFound' };
        else if (response.status === 403) value = { status: 'blocked' };
        else if (!response.ok) value = { status: 'unavailable' };
        else {
          // El validador se carga solo cuando hay una respuesta que validar (no con la página).
          const { parseAreaDetail } = await import('@/domains/geography/area-detail');
          const detail = parseAreaDetail((await response.json()) as unknown);
          value = detail ? { status: 'ready', detail } : { status: 'unavailable' };
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        value = { status: 'unavailable' };
      }
      setResult({ key, value });
    })();
    return () => {
      controller.abort();
    };
  }, [id, key, locale]);

  if (!id) return { status: 'idle' };
  return result?.key === key ? result.value : { status: 'loading' };
}
