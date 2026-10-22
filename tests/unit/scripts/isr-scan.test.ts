import { describe, expect, it } from 'vitest';
import {
  ISR_EXPECTATIONS,
  REVALIDATE_SECONDS,
  revalidationProblems,
  type PrerenderEntry,
} from '../../../scripts/lib/isr-scan';

/**
 * La caducidad del contenido se evalúa por día al REGENERAR las páginas, así que la ficha y el sitemap deben tener
 * `revalidate` en el build (un `export const revalidate` mal puesto o ausente no da ningún error: la página queda
 * congelada en la fecha del build). Esto se comprueba sobre `.next/prerender-manifest.json` (`pnpm check:bundle`).
 */
const ficha = (n: number): Record<string, PrerenderEntry> =>
  Object.fromEntries(
    ['es', 'en', 'pt', 'fr', 'de'].map((l) => [
      `/${l}/destinations/destino-${String(n)}`,
      { initialRevalidateSeconds: REVALIDATE_SECONDS, srcRoute: '/[locale]/destinations/[slug]' },
    ]),
  );
const sitemap = (seconds: number | false): Record<string, PrerenderEntry> => ({
  '/sitemap.xml': { initialRevalidateSeconds: seconds, srcRoute: '/sitemap.xml' },
});

describe('regeneración periódica de las páginas que dependen del día', () => {
  it('la ficha y el sitemap se regeneran cada hora', () => {
    expect(REVALIDATE_SECONDS).toBe(3600);
    expect(revalidationProblems({ ...ficha(1), ...ficha(2), ...sitemap(3600) })).toEqual([]);
  });

  it('un sitemap estático (initialRevalidateSeconds: false) se denuncia: se congelaría en la fecha del build', () => {
    const problems = revalidationProblems({ ...ficha(1), ...sitemap(false) });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('/sitemap.xml');
    expect(problems[0]).toContain('false');
  });

  it('una sola ficha con otro valor se denuncia, y solo esa', () => {
    const routes = { ...ficha(1), ...sitemap(3600) };
    routes['/fr/destinations/destino-1'] = {
      initialRevalidateSeconds: false,
      srcRoute: '/[locale]/destinations/[slug]',
    };
    const problems = revalidationProblems(routes);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('/fr/destinations/destino-1');
  });

  it('si el build no contiene la ruta esperada, también es un problema (no se da por buena)', () => {
    expect(revalidationProblems(ficha(1)).join('\n')).toContain('sitemap');
    expect(revalidationProblems(sitemap(3600)).join('\n')).toContain('ficha');
    expect(revalidationProblems({})).toHaveLength(ISR_EXPECTATIONS.length);
  });

  it('un valor distinto de 3600 (p. ej. 60) tampoco pasa: la regla es la documentada', () => {
    const routes = { ...ficha(1), ...sitemap(60) };
    expect(revalidationProblems(routes)).toHaveLength(1);
  });
});
