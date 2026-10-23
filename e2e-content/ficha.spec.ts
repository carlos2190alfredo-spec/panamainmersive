import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { LOCALES, PATHS, watchPage, type Locale } from '../e2e/helpers';
import { SYNTHETIC } from '../scripts/e2e-content-seed';
import { destinationSlug, getDestination } from '../src/domains/tourism/destinations';
import { formatElevation } from '../src/i18n/format';

/**
 * La ficha con contenido VERIFICADO, de punta a punta: PostgreSQL temporal (flujo editorial real) → exportación como
 * `anon` → copia de la app construida con esa instantánea → Next en producción. Lo orquesta `scripts/e2e-content.ts`.
 * Los textos son sintéticos («sintético E2E»): no describen Panamá.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function pathOf(key: string, locale: Locale): string {
  const entry = getDestination(key);
  if (!entry) throw new Error(`destino desconocido: ${key}`);
  return `${PATHS.destinations[locale]}/${destinationSlug(entry, locale)}`;
}

const article = (page: Page, id: string) => page.locator(`article[aria-labelledby="${id}"]`);

test.describe('ficha con contenido verificado (es)', () => {
  test('muestra lo verificado con su fecha, confianza y fuentes con enlaces seguros', async ({
    page,
  }) => {
    await page.goto(pathOf('boquete', 'es'));
    const summary = article(page, 'content-overview-summary');
    await expect(summary).toContainText(SYNTHETIC.summaryEs);
    await expect(summary).toContainText('Verificado el');
    await expect(summary).toContainText('Confianza: media');
    await expect(summary.locator('h4')).toHaveText('Fuentes');
    const link = summary.locator('a[href^="https://example.org/e2e/"]');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('rel', /noreferrer/);
    await expect(summary).toContainText('Licencia sintética E2E');
    await expect(summary).toContainText('Institución sintética E2E');
    // y nada de «sin redactar» cuando sí hay contenido
    await expect(page.getByText('todavía no está redactada')).toHaveCount(0);
  });

  test('la vigencia se declara donde existe', async ({ page }) => {
    await page.goto(pathOf('boquete', 'es'));
    await expect(article(page, 'content-visit-best_season')).toContainText('Vigente hasta el');
    await expect(article(page, 'content-overview-summary')).not.toContainText('Vigente hasta');
  });

  test('lo vencido y lo disputado se avisan SIN su contenido', async ({ page }) => {
    await page.goto(pathOf('boquete', 'es'));
    await expect(
      page.getByText('Reglas de entrada: la información verificada venció el'),
    ).toBeVisible();
    await expect(
      page.getByText('Riesgos y seguridad: hay información contradictoria en revisión'),
    ).toBeVisible();
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toContain(SYNTHETIC.expiredEs);
    expect(body).not.toContain(SYNTHETIC.disputedEs);
    await expect(article(page, 'content-restrictions-entry_rules')).toHaveCount(0);
    await expect(article(page, 'content-safety-hazards')).toHaveCount(0);
  });

  test('lo que no está verificado se lista como tal, y lo verificado no aparece ahí', async ({
    page,
  }) => {
    await page.goto(pathOf('boquete', 'es'));
    const unknown = page.locator('section[aria-labelledby="content-unknown-title"]');
    await expect(unknown).toContainText('Sin datos verificados todavía');
    for (const label of ['Cómo llegar', 'Situación legal', 'Accesibilidad del lugar']) {
      await expect(unknown).toContainText(label);
    }
    for (const label of [
      'Resumen',
      'Mejor época para visitar',
      'Reglas de entrada',
      'Riesgos y seguridad',
    ]) {
      await expect(unknown).not.toContainText(label);
    }
    // La fecha es la de la exportación de TODO el sitio y se dice así; sale porque esta ficha publica algo
    await expect(page.getByText(/Contenido del sitio actualizado por última vez el/)).toBeVisible();
  });

  test('un destino sin contenido no inventa nada', async ({ page }) => {
    await page.goto(pathOf('coiba', 'es'));
    await expect(page.locator('article')).toHaveCount(0);
    await expect(page.getByText('todavía no está redactada')).toBeVisible();
    await expect(page.locator('section[aria-labelledby="content-unknown-title"]')).toContainText(
      'Resumen',
    );
    // Sin nada que decir, tampoco se muestra la fecha de exportación de todo el sitio (no es de este destino)
    await expect(page.getByText(/Contenido del sitio actualizado/)).toHaveCount(0);
  });
});

const SPANISH_IN = { pt: 'em espanhol', fr: 'en espagnol', de: 'auf Spanisch' } as const;

test.describe('idioma sin fingir traducción', () => {
  test('en: la traducción humana publicada se muestra y se declara; lo demás cae al original con indicador', async ({
    page,
  }) => {
    await page.goto(pathOf('boquete', 'en'));
    const summary = article(page, 'content-overview-summary');
    await expect(summary).toContainText(SYNTHETIC.summaryEn);
    await expect(summary).toContainText('Translation reviewed by a person.');
    await expect(summary.locator('p[lang="en"]')).toHaveCount(1); // el párrafo del texto (no el enlace «pestaña nueva», que lleva el idioma de la interfaz)

    const season = article(page, 'content-visit-best_season');
    await expect(season).toContainText(
      'Showing the original text in Spanish: there is no translation into this language yet.',
    );
    await expect(season.locator('[lang="es"]')).toContainText(SYNTHETIC.seasonEs);
    await expect(season).not.toContainText('Translation reviewed');
  });

  for (const locale of ['pt', 'fr', 'de'] as const) {
    test(`${locale}: todo cae al original, con indicador y marca de idioma; nunca una traducción sin revisar`, async ({
      page,
    }) => {
      await page.goto(pathOf('boquete', locale));
      for (const id of ['content-overview-summary', 'content-visit-best_season']) {
        const item = article(page, id);
        await expect(item.locator('[lang="es"]')).toHaveCount(1);
        // El idioma del original se nombra en el idioma de la interfaz (nunca el endónimo dentro de la frase)
        await expect(item).toContainText(SPANISH_IN[locale]);
        await expect(item).not.toContainText('Español');
      }
      const body = (await page.locator('body').textContent()) ?? '';
      expect(body).not.toContain(SYNTHETIC.summaryEn);
    });
  }
});

test.describe('idioma de las fuentes (WCAG 3.1.2)', () => {
  const sourcesOf = (page: Page, id: string) => article(page, id).locator('ul');

  for (const locale of LOCALES) {
    test(`${locale}: título, institución, licencia y localizador llevan el idioma del DOCUMENTO; la interfaz que los rodea, el suyo`, async ({
      page,
    }) => {
      await page.goto(pathOf('boquete', locale));
      const sources = sourcesOf(page, 'content-overview-summary');
      const marked = sources.locator(`[lang="${SYNTHETIC.summarySourceLanguage}"]`);
      // enlace del título + institución + licencia + localizador
      await expect(marked).toHaveCount(4);
      await expect(sources.locator('a')).toHaveAttribute('lang', SYNTHETIC.summarySourceLanguage);
      await expect(marked.nth(1)).toHaveText('Institución sintética E2E');
      await expect(marked.nth(2)).toHaveText('Licencia sintética E2E');
      await expect(marked.nth(3)).toHaveText('sección sintética');
      // «se abre en una pestaña nueva» es texto de la interfaz: vuelve al idioma de la página dentro del enlace marcado
      await expect(sources.locator('a .visually-hidden')).toHaveAttribute('lang', locale);
    });
  }

  test('sin idioma declarado NO se adivina: ningún `lang` en las fuentes', async ({ page }) => {
    await page.goto(pathOf('boquete', 'es'));
    await expect(sourcesOf(page, 'content-visit-best_season').locator('[lang]')).toHaveCount(0);
    await expect(sourcesOf(page, 'content-visit-best_season')).toContainText(
      'Institución sintética E2E',
    );
  });

  test('una etiqueta con región (pt-BR) llega al HTML tal cual', async ({ page }) => {
    await page.goto(pathOf('volcan-baru', 'es'));
    const sources = sourcesOf(page, 'content-facts-elevation_m');
    await expect(sources.locator(`[lang="${SYNTHETIC.elevationSourceLanguage}"]`)).toHaveCount(4);
  });
});

test.describe('cantidades', () => {
  for (const locale of LOCALES) {
    test(`${locale}: la altitud verificada se muestra con su unidad, sin convertir`, async ({
      page,
    }) => {
      await page.goto(pathOf('volcan-baru', locale));
      const value = page.locator('article[aria-labelledby="content-facts-elevation_m"] p').first();
      await expect(value).toHaveText(formatElevation(locale, 3475, 'metric'));
    });
  }
});

test.describe('robustez', () => {
  test('sin errores de consola ni violaciones de CSP, y noindex fuera de producción', async ({
    page,
  }) => {
    const watch = watchPage(page);
    await page.goto(pathOf('boquete', 'es'));
    await page.waitForLoadState('networkidle');
    expect(watch.errors).toEqual([]);
    expect(await watch.violations()).toEqual([]);
    const robotsTags = await page
      .locator('meta[name="robots"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('content') ?? ''));
    // Debe EXISTIR: si la etiqueta desapareciera, recorrer una lista vacía «pasaba» sin comprobar nada.
    expect(robotsTags.length).toBeGreaterThan(0);
    for (const robots of robotsTags) expect(robots).toMatch(/noindex/);
  });

  for (const locale of ['es', 'de'] as const) {
    test(`${locale}: a 320 px nada desborda en horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(pathOf('boquete', locale));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('WCAG 2.2 AA con contenido verificado (axe)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`boquete en los cinco idiomas (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const locale of LOCALES) {
        await page.goto(pathOf('boquete', locale));
        await page.waitForLoadState('networkidle');
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(
          results.violations.map(
            (v) =>
              `${v.id} [${v.impact ?? '?'}] ${v.nodes
                .slice(0, 3)
                .map((n) => n.target.join(' '))
                .join(' | ')}`,
          ),
          `${locale} ${scheme}`,
        ).toEqual([]);
      }
    });

    test(`volcán Barú con altitud (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(pathOf('volcan-baru', 'es'));
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }
});
