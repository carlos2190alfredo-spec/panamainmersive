import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { TEXT_SPACING_CSS, applyCss, clippedText, hiddenFocus } from './a11y-probes';
import { LOCALES, PAGE_NAMES, PATHS } from './helpers';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('WCAG 2.2 AA con axe (todas las páginas × cinco idiomas × tema claro/oscuro)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const name of PAGE_NAMES) {
      test(`${name} (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        for (const locale of LOCALES) {
          await page.goto(PATHS[name][locale]);
          await page.waitForLoadState('networkidle');
          const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
          const summary = results.violations.map(
            (v) =>
              `${v.id} [${v.impact ?? '?'}] ${v.nodes
                .slice(0, 3)
                .map((n) => n.target.join(' '))
                .join(' | ')}`,
          );
          expect(summary, `${locale} ${PATHS[name][locale]}`).toEqual([]);
        }
      });
    }
  }

  test('con el menú de idioma abierto tampoco hay violaciones', async ({ page }) => {
    for (const locale of LOCALES) {
      await page.goto(PATHS.explore[locale]);
      await page.locator('summary').first().click();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(
        results.violations.map((v) => v.id),
        locale,
      ).toEqual([]);
    }
  });
});

test.describe('teclado y foco', () => {
  for (const locale of LOCALES) {
    test(`${locale}: el primer Tab es «saltar al contenido» y lleva el foco a <main>`, async ({
      page,
    }) => {
      await page.goto(PATHS.home[locale]);
      await page.keyboard.press('Tab');
      const skip = page.locator('a[href="#main-content"]');
      await expect(skip).toBeFocused();
      await expect(skip).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(page.locator('#main-content')).toBeFocused();
    });
  }

  test('todo es alcanzable con Tab y el foco siempre se ve (anillo con contraste)', async ({
    page,
  }) => {
    await page.goto(PATHS.destinations.es);
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        return {
          tag: el.tagName,
          name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30),
          outlineWidth: parseFloat(s.outlineWidth),
          outlineStyle: s.outlineStyle,
        };
      });
      if (info) {
        seen.push(`${info.tag}:${info.name}`);
        expect(info.outlineStyle, `${info.tag} ${info.name}`).not.toBe('none');
        expect(info.outlineWidth, `${info.tag} ${info.name}`).toBeGreaterThanOrEqual(2);
      }
    }
    // Alcanza los nueve destinos (la lista es el equivalente accesible del mapa).
    expect(seen.filter((s) => s.startsWith('A:')).length).toBeGreaterThanOrEqual(9);
  });

  test('objetivos táctiles ≥ 24×24 px (WCAG 2.5.8) en la cabecera y la lista', async ({ page }) => {
    await page.goto(PATHS.explore.de);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll('a[href], button, summary')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.width < 24 || r.height < 24))
          out.push(`${el.tagName} ${el.textContent?.trim()}`);
      }
      return out;
    });
    expect(small).toEqual([]);
  });
});

test.describe('reflow y textos largos (320 px, sin desplazamiento horizontal de la página)', () => {
  for (const locale of LOCALES) {
    test(`${locale}: ninguna página desborda a 320 px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      for (const name of PAGE_NAMES) {
        await page.goto(PATHS[name][locale]);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${locale} ${name}`).toBeLessThanOrEqual(0);
      }
    });
  }
});

test.describe('espaciado de texto (WCAG 1.4.12)', () => {
  test('control: el CSS se aplica y el detector ve un recorte real', async ({ page }) => {
    await page.goto(PATHS.home.es);
    await applyCss(page, TEXT_SPACING_CSS);
    const spacing = await page.evaluate(
      () => getComputedStyle(document.querySelector('p') as Element).letterSpacing,
    );
    expect(spacing, 'el espaciado inyectado no se aplicó: la prueba no mediría nada').not.toBe(
      'normal',
    );
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.style.cssText = 'overflow:hidden;height:10px;width:100px';
      box.textContent = 'Texto largo que no cabe en la caja y queda recortado';
      document.body.append(box);
    });
    expect((await clippedText(page)).length).toBeGreaterThan(0);
  });

  for (const locale of LOCALES) {
    test(`${locale}: ninguna página recorta texto ni desborda con el espaciado exigido`, async ({
      page,
    }) => {
      for (const name of PAGE_NAMES) {
        await page.goto(PATHS[name][locale]);
        await page.waitForLoadState('networkidle');
        await applyCss(page, TEXT_SPACING_CSS);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${locale} ${name}: desbordamiento horizontal`).toBeLessThanOrEqual(0);
        expect(await clippedText(page), `${locale} ${name}: texto recortado`).toEqual([]);
      }
    });
  }
});

test.describe('foco no oculto (WCAG 2.4.11)', () => {
  test('control: el detector ve un foco tapado por una capa', async ({ page }) => {
    await page.goto(PATHS.destinations.es);
    await page.evaluate(() => {
      const cover = document.createElement('div');
      cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
      document.body.append(cover);
    });
    const { checked, hidden } = await hiddenFocus(page, 3);
    expect(checked).toBeGreaterThan(0);
    expect(hidden.length, 'una capa a pantalla completa tiene que tapar el foco').toBeGreaterThan(
      0,
    );
  });

  for (const locale of ['es', 'de'] as const) {
    for (const name of [
      'destinations',
      'destination',
      'sources',
      'accessibility',
      'explore',
    ] as const) {
      test(`${locale} ${name}: con Tab, ningún elemento enfocado queda entero bajo la cabecera fija`, async ({
        page,
      }) => {
        await page.goto(PATHS[name][locale]);
        await page.waitForLoadState('networkidle');
        const { checked, hidden } = await hiddenFocus(page, 75);
        expect(checked, 'casi nada se comprobó: la prueba no mediría nada').toBeGreaterThan(10);
        expect(hidden).toEqual([]);
      });
    }
  }
});

test.describe('movimiento', () => {
  test('con prefers-reduced-motion las transiciones se anulan', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(PATHS.destinations.en);
    const ms = await page.evaluate(() => {
      const el = document.querySelector('[data-destination] a') as HTMLElement;
      return parseFloat(getComputedStyle(el).transitionDuration) * 1000;
    });
    expect(ms).toBeLessThan(1);
  });
});
