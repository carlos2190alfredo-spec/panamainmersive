import { describe, expect, it } from 'vitest';
import { LOCALES } from '@/i18n/locales';
import { ROUTE_PATHNAMES } from '@/i18n/route-table';
import { routing } from '@/i18n/routing';

function pathFor(route: keyof typeof ROUTE_PATHNAMES, locale: (typeof LOCALES)[number]): string {
  const entry = ROUTE_PATHNAMES[route];
  return typeof entry === 'string' ? entry : entry[locale];
}

describe('rutas localizadas', () => {
  it('el routing usa prefijo siempre, es por defecto y NO genera hreflang automático', () => {
    expect(routing.defaultLocale).toBe('es');
    expect(routing.localePrefix).toBe('always');
    expect(routing.alternateLinks).toBe(false);
    expect([...routing.locales]).toEqual([...LOCALES]);
  });

  it('cada ruta define los cinco idiomas', () => {
    for (const [route, entry] of Object.entries(ROUTE_PATHNAMES)) {
      if (typeof entry === 'string') continue;
      for (const locale of LOCALES) {
        expect(entry[locale], `${route} / ${locale}`).toMatch(/^\//);
      }
    }
  });

  it('las rutas del documento rector son las esperadas', () => {
    expect(pathFor('/explore', 'es')).toBe('/explorar');
    expect(pathFor('/explore', 'en')).toBe('/explore');
    expect(pathFor('/explore', 'pt')).toBe('/explorar');
    expect(pathFor('/explore', 'fr')).toBe('/explorer');
    expect(pathFor('/explore', 'de')).toBe('/entdecken');
  });

  it('no hay dos rutas distintas con la misma URL pública dentro de un idioma', () => {
    for (const locale of LOCALES) {
      const seen = new Map<string, string>();
      for (const route of Object.keys(ROUTE_PATHNAMES) as (keyof typeof ROUTE_PATHNAMES)[]) {
        const p = pathFor(route, locale);
        expect(seen.get(p), `${locale}: ${p}`).toBeUndefined();
        seen.set(p, route);
      }
    }
  });

  it('las rutas dinámicas conservan el segmento [slug] en todos los idiomas', () => {
    for (const locale of LOCALES) {
      expect(pathFor('/destinations/[slug]', locale)).toMatch(/\/\[slug\]$/);
      // La base de la ficha coincide con la del índice de destinos.
      expect(pathFor('/destinations/[slug]', locale)).toBe(
        `${pathFor('/destinations', locale)}/[slug]`,
      );
    }
  });

  it('las URLs públicas son ASCII en minúscula (sin acentos que compliquen compartir enlaces)', () => {
    for (const locale of LOCALES) {
      for (const route of Object.keys(ROUTE_PATHNAMES) as (keyof typeof ROUTE_PATHNAMES)[]) {
        expect(pathFor(route, locale)).toMatch(/^[a-z0-9/[\]-]*$/);
      }
    }
  });
});
