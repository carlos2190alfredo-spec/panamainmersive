'use client';

/**
 * Las islas de cliente del HUD de Explorar que NO hacen falta para pintar ni para hidratar la pantalla: el filtro por
 * tipo, el buscador, las herramientas del mapa y el recuento del carrusel. Viven juntas en UN solo módulo para que el
 * empaquetador las emita en UN solo chunk diferido (`HudIslandsLazy`), con su almacén y su lógica compartidos, en vez de
 * sumar su peso al JS de la carga inicial (presupuesto: docs/performance.md M-08 y M-09).
 */
export { CarouselFilterStatus } from './CarouselFilterStatus';
export { FilterChips } from './FilterChips';
export { MapTools } from './MapTools';
export { SearchBox } from './SearchBox';
