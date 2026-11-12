import { expect, test, type Page } from '@playwright/test';
import { DESTINATIONS, destinationSlug } from '../src/domains/tourism/destinations';
import { LOCALES, PATHS, watchPage, type Locale } from './helpers';

/**
 * Portada inmersiva y rejilla de destinos (ADR-0025). Las pruebas de accesibilidad (axe, 320 px, 1.4.12, foco no oculto,
 * objetivos) las hacen e2e/a11y.a11y.spec.ts para TODAS las páginas; aquí solo lo propio de esta pantalla: estructura y
 * enlaces reales por idioma, ámbito inmersivo, buscador (con y sin JavaScript) y movimiento. No necesita el mapa base:
 * solo comprueba la URL a la que lleva Explorar, así que NO sube el presupuesto de pruebas omitidas.
 */
const homeBlock = (page: Page) => page.locator('main');

async function hydrated(page: Page): Promise<void> {
  // El buscador solo filtra con JavaScript: se espera a que la página esté hidratada antes de escribir.
  await page.waitForLoadState('networkidle');
}

test.describe('portada: estructura y enlaces reales en los cinco idiomas', () => {
  for (const locale of LOCALES) {
    test(`${locale}: un solo h1 y un solo buscador, nueve tarjetas con ficha y «Ver en el mapa», sin errores de CSP`, async ({
      page,
    }) => {
      const watch = watchPage(page);
      await page.goto(PATHS.home[locale]);
      await hydrated(page);
      const main = homeBlock(page);

      await expect(main.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(main.locator('[role="search"]')).toHaveCount(1);
      await expect(page.locator('[role="search"]')).toHaveCount(1);
      await expect(page.locator('main > [data-immersive]')).toHaveCount(1);

      const cards = main.locator('li[data-destination]');
      await expect(cards).toHaveCount(DESTINATIONS.length);
      for (const [i, d] of DESTINATIONS.entries()) {
        const card = cards.nth(i);
        await expect(card).toHaveAttribute('data-destination', d.key);
        await expect(card).toHaveAttribute('data-kind', d.kind);
        const links = card.locator('a');
        await expect(links).toHaveCount(2);
        await expect(links.nth(0)).toHaveAttribute(
          'href',
          `${PATHS.destinations[locale]}/${destinationSlug(d, locale)}`,
        );
        await expect(links.nth(1)).toHaveAttribute('href', `${PATHS.explore[locale]}?d=${d.key}`);
      }

      // Los botones del héroe y las entradas llevan a rutas reales de ESTE idioma.
      await expect(main.locator(`a[href="${PATHS.explore[locale]}"]`).first()).toBeVisible();
      await expect(main.locator(`a[href="${PATHS.destinations[locale]}"]`).first()).toBeVisible();
      await expect(main.locator(`a[href="${PATHS.sources[locale]}"]`)).toHaveCount(1);

      // Nada inventado: ni cuentas, ni planificador, ni valoraciones.
      await expect(
        main.locator('a[href*="login"], a[href*="planific"], a[href*="trip"]'),
      ).toHaveCount(0);
      const text = (await main.innerText()).toLowerCase();
      expect(text).not.toMatch(
        /iniciar sesión|sign in|log in|planifica tu viaje|plan your trip|próximamente|coming soon/,
      );

      expect(await watch.violations()).toEqual([]);
      expect(watch.errors).toEqual([]);
    });
  }

  test('la marca P es UNA imagen decorativa y el nombre es texto vivo', async ({ page }) => {
    await page.goto(PATHS.home.es);
    const mark = page.locator('main img');
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveAttribute('alt', '');
    await expect(mark).toHaveAttribute('src', /\/brand\/mark-p-320\.webp$/);
    await expect(page.locator('main').getByText('Immersive', { exact: true })).toBeVisible();
    // Se pinta de verdad (no es una imagen rota).
    const natural = await mark.evaluate((img) => (img as HTMLImageElement).naturalWidth);
    expect(natural).toBeGreaterThan(0);
  });

  test('en pantalla ancha la marca va a la derecha del texto', async ({ page }) => {
    await page.goto(PATHS.home.es);
    const [title, mark] = await Promise.all([
      page.locator('main h1').boundingBox(),
      page.locator('main img').boundingBox(),
    ]);
    expect(title && mark && mark.x > title.x + title.width - 1).toBe(true);
  });
});

test.describe('ámbito inmersivo (siempre oscuro) solo en la portada', () => {
  const paper = (page: Page) =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-paper').trim(),
    );

  test('la portada es oscura aunque el sistema esté en claro; /destinos sigue el tema del sistema', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(PATHS.home.es);
    const homeLight = await paper(page);
    await page.goto(PATHS.destinations.es);
    const destinationsLight = await paper(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(PATHS.destinations.es);
    const destinationsDark = await paper(page);

    expect(homeLight).not.toBe('');
    expect(destinationsLight, 'control: en claro las páginas normales NO son oscuras').not.toBe(
      homeLight,
    );
    expect(homeLight, 'la portada en claro = el tema oscuro').toBe(destinationsDark);
  });
});

test.describe('buscador de destinos', () => {
  test('«baru» encuentra solo el volcán, con su ficha y «Ver en el mapa» por clave', async ({
    page,
  }) => {
    await page.goto(PATHS.home.es);
    await hydrated(page);
    const search = page.getByRole('search');
    await search.getByRole('searchbox').fill('baru');
    const results = search.locator('[data-search-result]');
    await expect(results).toHaveCount(1);
    await expect(results.first()).toHaveAttribute('data-search-result', 'volcan-baru');
    await expect(results.first().locator('a').nth(0)).toHaveAttribute('href', PATHS.destination.es);
    await expect(results.first().locator('a').nth(1)).toHaveAttribute(
      'href',
      `${PATHS.explore.es}?d=volcan-baru`,
    );
    await expect(search.getByRole('status')).not.toBeEmpty();
  });

  test('«santa catalina» → un destino; «Panama Canal» se encuentra desde la interfaz en alemán', async ({
    page,
  }) => {
    await page.goto(PATHS.home.es);
    await hydrated(page);
    await page.getByRole('searchbox').fill('santa catalina');
    await expect(page.locator('[data-search-result]')).toHaveCount(1);
    await expect(page.locator('[data-search-result]').first()).toHaveAttribute(
      'data-search-result',
      'santa-catalina',
    );

    await page.goto(PATHS.home.de);
    await hydrated(page);
    await page.getByRole('searchbox').fill('Panama Canal');
    await expect(page.locator('[data-search-result]')).toHaveCount(1);
    await expect(page.locator('[data-search-result]').first()).toHaveAttribute(
      'data-search-result',
      'panama-canal',
    );
  });

  test('sin coincidencias lo dice en la región viva y no pinta lista; Escape lo borra todo', async ({
    page,
  }) => {
    await page.goto(PATHS.home.en);
    await hydrated(page);
    const box = page.getByRole('searchbox');
    await box.fill('zzzz');
    await expect(page.locator('[data-search-result]')).toHaveCount(0);
    await expect(page.getByRole('search').getByRole('status')).toContainText('zzzz');
    await box.fill('coiba');
    await expect(page.locator('[data-search-result]')).toHaveCount(1);
    await box.press('Escape');
    await expect(box).toHaveValue('');
    await expect(page.locator('[data-search-result]')).toHaveCount(0);
    await expect(page.getByRole('search').getByRole('status')).toBeEmpty();
  });

  test('Enter con resultados abre Explorar con el primero (?d=<clave>)', async ({ page }) => {
    await page.goto(PATHS.home.fr);
    await hydrated(page);
    await page.getByRole('searchbox').fill('coiba');
    await page.getByRole('searchbox').press('Enter');
    await expect(page).toHaveURL(new RegExp(`${PATHS.explore.fr}\\?d=coiba$`));
  });

  test('Enter sin resultados no navega', async ({ page }) => {
    await page.goto(PATHS.home.es);
    await hydrated(page);
    await page.getByRole('searchbox').fill('zzzz');
    await page.getByRole('searchbox').press('Enter');
    await expect(page).toHaveURL(new RegExp(`${PATHS.home.es}$`));
  });

  test('la consulta no sale a la red', async ({ page }) => {
    await page.goto(PATHS.home.es);
    await hydrated(page);
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.getByRole('searchbox').fill('zzqxw');
    await page.getByRole('searchbox').press('Enter');
    await page.waitForTimeout(300);
    expect(urls.filter((u) => u.toLowerCase().includes('zzqxw'))).toEqual([]);
  });

  // Sin JavaScript el formulario se OCULTA y el campo no lleva `name` (r0:F-09: antes la consulta acababa en `?q=…` y Explorar la
  // ignoraba): lo prueba e2e/shell-review-x3.spec.ts, «buscador de la portada sin JavaScript».
});

test.describe('tarjetas: enlace estirado y foco', () => {
  test('pulsar en cualquier parte de la tarjeta abre la ficha; «Ver en el mapa» abre Explorar con su clave', async ({
    page,
  }) => {
    await page.goto(PATHS.destinations.es);
    const coiba = page.locator('li[data-destination="coiba"]');
    await coiba.click({ position: { x: 24, y: 24 } }); // el hueco del pictograma: no es el enlace, lo cubre el estirado
    await expect(page).toHaveURL(new RegExp('/es/destinos/coiba$'));

    await page.goto(PATHS.destinations.es);
    await page.locator('li[data-destination="coiba"] a').nth(1).click();
    await expect(page).toHaveURL(new RegExp(`${PATHS.explore.es}\\?d=coiba$`));
  });

  test('con el teclado, el enlace principal enfocado muestra un anillo propio Y el de la tarjeta', async ({
    page,
  }) => {
    await page.goto(PATHS.destinations.es);
    const first = page.locator('li[data-destination] a').first();
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      if (await first.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(first).toBeFocused();
    const rings = await first.evaluate((el) => {
      const own = getComputedStyle(el);
      const card = getComputedStyle(el.closest('li') as HTMLElement);
      return {
        own: [own.outlineStyle, parseFloat(own.outlineWidth)] as const,
        card: [card.outlineStyle, parseFloat(card.outlineWidth)] as const,
      };
    });
    expect(rings.own[0]).not.toBe('none');
    expect(rings.own[1]).toBeGreaterThanOrEqual(2);
    expect(rings.card[0]).not.toBe('none');
    expect(rings.card[1]).toBeGreaterThanOrEqual(2);
  });
});

test.describe('movimiento: finito, solo con no-preference y sin inclinar con reduce', () => {
  const infinite = (page: Page) =>
    page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY)
          .length,
    );

  test('ninguna animación es infinita (WCAG 2.2.2) y la entrada del héroe existe (control)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(PATHS.home.es);
    await hydrated(page);
    expect(await infinite(page)).toBe(0);
    // Control: con no-preference HAY animaciones (la entrada del héroe, con relleno «both»); si no, la prueba no mide nada.
    const total = await page.evaluate(() => document.getAnimations().length);
    expect(total).toBeGreaterThanOrEqual(7);
    // Control del detector: una animación infinita inyectada SÍ se cuenta.
    await page.evaluate(() => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(
        '@keyframes e2eSpin{to{rotate:1turn}} main h1{animation:e2eSpin 1s linear infinite !important}',
      );
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    });
    expect(await infinite(page)).toBe(1);
  });

  test('con prefers-reduced-motion: reduce no hay ninguna animación en la portada', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(PATHS.home.es);
    await hydrated(page);
    // Se cuenta lo PERCEPTIBLE: ninguna animación con `@keyframes` y ninguna transición de más de 1 ms. La regla de reduce de
    // base.css deja TODA transición en 0,01 ms (no en 0), y la cabecera es un contenedor (consultas de contenedor): al medirse
    // en la primera maquetación el navegador vuelve a calcular los estilos de sus hijos y cada cambio nace como una transición
    // de 0,01 ms que `getAnimations()` ve unos milisegundos (hasta 77 a la vez, intermitente; X3). Eso no es movimiento.
    const perceptible = () =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) =>
                !(a instanceof CSSTransition) ||
                Number(a.effect?.getComputedTiming().duration ?? 0) > 1,
            ).length,
      );
    expect(await perceptible()).toBe(0);
    // Control del detector: una animación de 1 s inyectada SÍ se cuenta
    await page.evaluate(() => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(
        '@keyframes e2eSlide{to{translate:10px 0}} main h1{animation:e2eSlide 1s linear both !important}',
      );
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    });
    expect(await perceptible()).toBeGreaterThanOrEqual(1);
  });

  test('la inclinación del marco de la marca solo ocurre con no-preference', async ({ page }) => {
    const transformOnHover = async (): Promise<string> => {
      await page.goto(PATHS.home.es);
      // `networkidle` NO llega en la SEGUNDA visita de este contexto: Explorar se regenera (ISR, r0:F-07) y su respuesta
      // (`s-maxage` + `stale-while-revalidate`, también la de su prefetch desde la portada) la revalida Chromium en segundo
      // plano, petición que a Playwright no le llega a terminar (2 pendientes durante 25 s con el servidor respondiendo en 24 ms;
      // sin `revalidate` en Explorar no ocurre). Esta prueba solo mide un `transform` CSS: basta con que la página haya cargado.
      await page.waitForLoadState('load');
      const frame = page.locator('main img').locator('..');
      await frame.hover();
      await page.waitForTimeout(500);
      return frame.evaluate((el) => getComputedStyle(el).transform);
    };
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await transformOnHover(), 'control: con no-preference sí se inclina').not.toBe('none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await transformOnHover()).toBe('none');
  });

  test('el enlace principal de cada tarjeta tiene transición con no-preference (control de la prueba de reduce)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(PATHS.destinations.en);
    const ms = await page.evaluate(
      () =>
        parseFloat(
          getComputedStyle(document.querySelector('[data-destination] a') as HTMLElement)
            .transitionDuration,
        ) * 1000,
    );
    expect(ms).toBeGreaterThan(10);
  });
});

test.describe('teclado en la portada', () => {
  test('todo lo interactivo de la portada se alcanza con Tab y su foco se ve', async ({ page }) => {
    await page.goto(PATHS.home.es);
    await hydrated(page);
    const seen = new Set<string>();
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        return {
          id: `${el.tagName}:${el.getAttribute('href') ?? el.getAttribute('name') ?? el.textContent?.trim().slice(0, 20) ?? ''}`,
          style: s.outlineStyle,
          width: parseFloat(s.outlineWidth),
        };
      });
      if (!info) continue;
      seen.add(info.id);
      expect(info.style, info.id).not.toBe('none');
      expect(info.width, info.id).toBeGreaterThanOrEqual(2);
    }
    // Buscador (campo y botón) + dos botones + 2 entradas + 18 enlaces de las tarjetas, como mínimo.
    expect(seen.size).toBeGreaterThanOrEqual(24);
  });
});

test.describe('idiomas: el nombre y el tipo de cada tarjeta salen del registro', () => {
  const sample: Record<Locale, string> = {
    es: 'Volcán Barú',
    en: 'Barú Volcano',
    pt: 'Vulcão Barú',
    fr: 'Volcan Barú',
    de: 'Vulkan Barú',
  };
  for (const locale of LOCALES) {
    test(`${locale}: la tarjeta del volcán muestra «${sample[locale]}»`, async ({ page }) => {
      await page.goto(PATHS.destinations[locale]);
      const card = page.locator('li[data-destination="volcan-baru"]');
      await expect(card).toContainText(sample[locale]);
      await expect(card.locator('a').first()).toHaveAttribute('href', PATHS.destination[locale]);
    });
  }
});
