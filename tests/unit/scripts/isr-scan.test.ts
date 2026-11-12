import { describe, expect, it } from 'vitest';
import {
  ISR_EXPECTATIONS,
  REVALIDATE_SECONDS,
  revalidationProblems,
  type PrerenderEntry,
} from '../../../scripts/lib/isr-scan';

/**
 * La caducidad del contenido y de la cobertura se evalúa por día al REGENERAR las páginas, así que la ficha, Explorar
 * (sus insignias de cobertura: r0:F-07) y el sitemap deben tener `revalidate` en el build (un `export const revalidate` mal puesto o ausente no da ningún error: la página queda
 * congelada en la fecha del build). Esto se comprueba sobre `.next/prerender-manifest.json` (`pnpm check:bundle`).
 */
const ficha = (n: number): Record<string, PrerenderEntry> =>
  Object.fromEntries(
    ['es', 'en', 'pt', 'fr', 'de'].map((l) => [
      `/${l}/destinations/destino-${String(n)}`,
      { initialRevalidateSeconds: REVALIDATE_SECONDS, srcRoute: '/[locale]/destinations/[slug]' },
    ]),
  );
const explorar = (seconds: number | false = REVALIDATE_SECONDS): Record<string, PrerenderEntry> =>
  Object.fromEntries(
    ['es', 'en', 'pt', 'fr', 'de'].map((l) => [
      `/${l}/explore`,
      { initialRevalidateSeconds: seconds, srcRoute: '/[locale]/explore' },
    ]),
  );
const sitemap = (seconds: number | false): Record<string, PrerenderEntry> => ({
  '/sitemap.xml': { initialRevalidateSeconds: seconds, srcRoute: '/sitemap.xml' },
});

describe('regeneración periódica de las páginas que dependen del día', () => {
  it('la ficha, Explorar y el sitemap se regeneran cada hora', () => {
    expect(REVALIDATE_SECONDS).toBe(3600);
    expect(
      revalidationProblems({ ...ficha(1), ...ficha(2), ...explorar(), ...sitemap(3600) }),
    ).toEqual([]);
  });

  it('Explorar estática (initialRevalidateSeconds: false) se denuncia en CADA idioma: sus insignias de cobertura se congelarían (r0:F-07)', () => {
    const problems = revalidationProblems({ ...ficha(1), ...explorar(false), ...sitemap(3600) });
    expect(problems).toHaveLength(5);
    for (const l of ['es', 'en', 'pt', 'fr', 'de']) {
      expect(problems.join('\n')).toContain(`/${l}/explore`);
    }
    expect(problems[0]).toContain('Explorar');
    expect(problems[0]).toContain('false');
  });

  it('un solo idioma de Explorar sin regeneración se denuncia, y solo ese', () => {
    const routes = { ...ficha(1), ...explorar(), ...sitemap(3600) };
    routes['/de/explore'] = { initialRevalidateSeconds: 60, srcRoute: '/[locale]/explore' };
    const problems = revalidationProblems(routes);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('/de/explore');
  });

  it('un sitemap estático (initialRevalidateSeconds: false) se denuncia: se congelaría en la fecha del build', () => {
    const problems = revalidationProblems({ ...ficha(1), ...explorar(), ...sitemap(false) });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('/sitemap.xml');
    expect(problems[0]).toContain('false');
  });

  it('una sola ficha con otro valor se denuncia, y solo esa', () => {
    const routes = { ...ficha(1), ...explorar(), ...sitemap(3600) };
    routes['/fr/destinations/destino-1'] = {
      initialRevalidateSeconds: false,
      srcRoute: '/[locale]/destinations/[slug]',
    };
    const problems = revalidationProblems(routes);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('/fr/destinations/destino-1');
  });

  it('si el build no contiene la ruta esperada, también es un problema (no se da por buena)', () => {
    expect(revalidationProblems({ ...ficha(1), ...explorar() }).join('\n')).toContain('sitemap');
    expect(revalidationProblems({ ...explorar(), ...sitemap(3600) }).join('\n')).toContain('ficha');
    expect(revalidationProblems({ ...ficha(1), ...sitemap(3600) }).join('\n')).toContain(
      'Explorar',
    );
    expect(revalidationProblems({})).toHaveLength(ISR_EXPECTATIONS.length);
  });

  it('un valor distinto de 3600 (p. ej. 60) tampoco pasa: la regla es la documentada', () => {
    const routes = { ...ficha(1), ...explorar(), ...sitemap(60) };
    expect(revalidationProblems(routes)).toHaveLength(1);
  });

  it('la página de Explorar del repositorio declara el mismo literal que la ficha y el sitemap (Next lo analiza estáticamente)', async () => {
    const { readFileSync } = await import('node:fs');
    const literal = (path: string) =>
      /export const revalidate = (\d+);/.exec(readFileSync(path, 'utf8'))?.[1];
    expect(literal('src/app/[locale]/explore/page.tsx')).toBe(String(REVALIDATE_SECONDS));
    expect(literal('src/app/[locale]/destinations/[slug]/page.tsx')).toBe(
      String(REVALIDATE_SECONDS),
    );
    expect(literal('src/app/sitemap.ts')).toBe(String(REVALIDATE_SECONDS));
  });
});
