'use client';

import dynamic from 'next/dynamic';

/**
 * Las islas del HUD cargadas DESPUÉS de hidratar (`ssr: false`) y todas del mismo módulo (`HudIslands`): un solo
 * chunk. El sitio que ocupan lo reserva el CSS de la página (`.filterSlot`, `.search`, `.tools`), así que al llegar no
 * mueven nada (CLS 0). Sin JavaScript no hay nada que cargar y tampoco controles sin función: el servidor no los pinta.
 * Marcador del chunk para `pnpm check:bundle`: data-hud-island.
 */
const load = () => import('./HudIslands');

export const FilterChipsLazy = dynamic(() => load().then((m) => m.FilterChips), { ssr: false });
export const SearchBoxLazy = dynamic(() => load().then((m) => m.SearchBox), { ssr: false });
export const MapToolsLazy = dynamic(() => load().then((m) => m.MapTools), { ssr: false });
export const CarouselFilterStatusLazy = dynamic(() => load().then((m) => m.CarouselFilterStatus), {
  ssr: false,
});
