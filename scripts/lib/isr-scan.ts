/**
 * Verificación del `revalidate` de las páginas cuyo contenido depende del DÍA (caducidad de lo verificado).
 *
 * `export const revalidate = 3600` debe ser un literal en cada archivo (Next lo analiza estáticamente; no admite una
 * constante importada), así que el valor vive duplicado en la ficha y en `sitemap.ts`. Nada falla si falta o se
 * escribe mal: la página queda congelada en la fecha del build. Esta comprobación lee el resultado REAL del build
 * (`.next/prerender-manifest.json`) y es lo que mantiene los literales de acuerdo (`pnpm check:bundle`).
 */
export const REVALIDATE_SECONDS = 3600;

export interface PrerenderEntry {
  readonly initialRevalidateSeconds?: number | false;
  readonly srcRoute?: string | null;
}

export interface IsrExpectation {
  readonly label: string;
  readonly matches: (route: string, entry: PrerenderEntry) => boolean;
  readonly seconds: number;
}

export const ISR_EXPECTATIONS: readonly IsrExpectation[] = [
  {
    label: 'ficha de destino',
    matches: (_route, entry) => entry.srcRoute === '/[locale]/destinations/[slug]',
    seconds: REVALIDATE_SECONDS,
  },
  {
    label: 'sitemap.xml',
    matches: (route) => route === '/sitemap.xml',
    seconds: REVALIDATE_SECONDS,
  },
];

/** Problemas en el manifiesto de prerenderizado; vacío = cada página esperada se regenera con el plazo fijado. */
export function revalidationProblems(
  routes: Readonly<Record<string, PrerenderEntry>>,
  expectations: readonly IsrExpectation[] = ISR_EXPECTATIONS,
): string[] {
  const problems: string[] = [];
  for (const expectation of expectations) {
    const found = Object.entries(routes).filter(([route, entry]) =>
      expectation.matches(route, entry),
    );
    if (found.length === 0) {
      problems.push(
        `${expectation.label}: el build no contiene ninguna ruta (¿cambió cómo se emite?); no se puede comprobar su regeneración.`,
      );
      continue;
    }
    for (const [route, entry] of found) {
      const actual = entry.initialRevalidateSeconds;
      if (actual !== expectation.seconds) {
        problems.push(
          `${expectation.label}: ${route} tiene initialRevalidateSeconds=${String(actual)}, se esperaba ${String(expectation.seconds)}: ` +
            'sin regeneración, la caducidad del contenido se congela en la fecha del build.',
        );
      }
    }
  }
  return problems;
}
