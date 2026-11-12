import { useSyncExternalStore } from 'react';

/**
 * Sustituto REACTIVO de `useSearchParams` de `next/navigation` para pruebas en jsdom: lee `window.location.search` y avisa
 * cuando `pushState`/`replaceState`/`popstate` la cambian (como hace la integración de Next con el historial). Sin esto,
 * un componente que escribe la URL (`selectDestination`, `writeLayers`) no se volvería a pintar en la prueba.
 */
const listeners = new Set<() => void>();
let patched = false;

function patch(): void {
  if (patched) return;
  patched = true;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args);
      notify();
    };
  }
  window.addEventListener('popstate', notify);
}

export function useSearchParams(): URLSearchParams {
  patch();
  const search = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => window.location.search,
    () => '',
  );
  return new URLSearchParams(search);
}
