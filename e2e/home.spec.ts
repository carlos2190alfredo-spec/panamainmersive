import { expect, test, type Page } from '@playwright/test';
import { DESTINATIONS, destinationSlug } from '../src/domains/tourism/destinations';
import { travesiaStops } from '../src/domains/tourism/travesia';
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

      // Las paradas de la travesía van de OESTE a ESTE (ADR-0026), no en el orden del registro
      const cards = main.locator('li[data-destination]');
      await expect(cards).toHaveCount(DESTINATIONS.length);
      for (const [i, d] of travesiaStops()
        .map((stop) => stop.entry)
        .entries()) {
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

  test('el istmo del héroe se dibuja con los nueve destinos y su crédito de datos se ve (la marca ya está en la cabecera)', async ({
    page,
  }) => {
    await page.goto(PATHS.home.es);
    await expect(page.locator('main img')).toHaveCount(0);
    const isthmus = page.locator('main svg[data-isthmus="hero"]');
    await expect(isthmus).toBeVisible();
    await expect(isthmus.locator('[data-stop]')).toHaveCount(9);
    const box = await isthmus.boundingBox();
    expect(box?.width ?? 0, 'el istmo es grande: protagonista del héroe').toBeGreaterThan(500);
    await expect(page.locator('main figcaption span[lang="en"]')).toBeVisible();
  });

  test('en pantalla ancha el istmo va a la derecha del texto', async ({ page }) => {
    await page.goto(PATHS.home.es);
    const [title, isthmus] = await Promise.all([
      page.locator('main h1').boundingBox(),
      page.locator('main figure').boundingBox(),
    ]);
    expect(title && isthmus && isthmus.x > title.x + title.width - 1).toBe(true);
  });
});

test.describe('travesía: de oeste a este, con la barra de paradas', () => {
  test('al desplazarse, la barra marca la parada a la vista y se llena; un enlace de la barra lleva a su escena', async ({
    page,
  }) => {
    await page.goto(PATHS.home.es);
    await hydrated(page);
    const rail = page.locator('nav[data-travesia-rail]');
    const stops = travesiaStops();
    await expect(rail.locator('[aria-current]')).toHaveCount(0); // control: sin desplazarse no hay parada actual
    const progress = (): Promise<number> =>
      rail.evaluate((el) => Number(el.style.getPropertyValue('--travesia-progress')));
    // La escena centrada es LA marcada (no «una de las nueve»: r:T-1) y la pista llega al centro de su columna
    // stops[2] y no la central: (2 + 0,5) / 9 = 0,278 frente a 2 / 8 = 0,25 de la fórmula antigua (r2:H-07)
    const target = stops[2]!.entry.key;
    await page
      .locator(`#parada-${target}`)
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(rail.locator('[aria-current="step"]')).toHaveAttribute(
      'data-travesia-link',
      target,
      { timeout: 10_000 },
    );
    await expect.poll(progress).toBeCloseTo(2.5 / stops.length, 3);
    // La barra se queda pegada bajo la cabecera mientras se recorren las escenas
    const [header, railBox] = await Promise.all([
      page.locator('header').boundingBox(),
      rail.boundingBox(),
    ]);
    expect(
      Math.abs((railBox?.y ?? 0) - ((header?.y ?? 0) + (header?.height ?? 0))),
    ).toBeLessThanOrEqual(2);
    // Un enlace de la barra lleva a su escena (ancla de la propia página)
    const last = stops.at(-1)!.entry.key;
    await rail.locator(`a[href="#parada-${last}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#parada-${last}$`));
    await expect(page.locator(`#parada-${last}`)).toBeInViewport();
    // El ancla deja la escena JUSTO bajo la barra (no a 284 px, contando dos veces la cabecera: r:A11Y-4) y la marca
    const [sceneTop, railBottom] = await Promise.all([
      page.locator(`#parada-${last}`).evaluate((el) => el.getBoundingClientRect().top),
      rail.evaluate((el) => el.getBoundingClientRect().bottom),
    ]);
    expect(sceneTop).toBeGreaterThanOrEqual(railBottom);
    expect(sceneTop - railBottom).toBeLessThanOrEqual(40);
    await expect(rail.locator('[aria-current="step"]')).toHaveAttribute(
      'data-travesia-link',
      last,
      {
        timeout: 10_000,
      },
    );
    await expect.poll(progress).toBeCloseTo(8.5 / stops.length, 3);
  });

  test('al invertir el sentido con dos escenas en la franja, la marcada es la que sigue a la vista (r:JS-1)', async ({
    page,
  }) => {
    // Pantalla alta: la franja de lectura (10 % de lo visible bajo cabecera y barra, ≈ 91 px) es MAYOR que el hueco entre
    // escenas (72 px), así que dos escenas pueden estar dentro a la vez
    await page.setViewportSize({ width: 1280, height: 1100 });
    await page.goto(PATHS.home.es);
    await hydrated(page);
    const rail = page.locator('nav[data-travesia-rail]');
    const stops = travesiaStops();
    const a = stops[2]!.entry.key;
    const b = stops[3]!.entry.key;
    const current = rail.locator('[aria-current="step"]');
    const scrollBy = (dy: number): Promise<void> =>
      page.evaluate(async (y) => {
        window.scrollBy({ top: y, behavior: 'instant' });
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 150)));
      }, dy);
    // 1) El final de A, 10 px por encima de la línea de lectura: solo A está en la franja
    const offset = await page.evaluate((key) => {
      const top =
        (document.querySelector('header')?.getBoundingClientRect().height ?? 0) +
        (document.querySelector('[data-travesia-rail]') as HTMLElement).offsetHeight;
      const line = top + (innerHeight - top) / 2;
      return document.getElementById(`parada-${key}`)!.getBoundingClientRect().bottom - line + 10;
    }, a);
    await scrollBy(offset);
    await expect(current).toHaveAttribute('data-travesia-link', a, { timeout: 10_000 });
    // 2) 30 px más abajo: entra B (su borde está más cerca de la línea) y se marca
    await scrollBy(30);
    await expect(current).toHaveAttribute('data-travesia-link', b, { timeout: 10_000 });
    // 3) 20 px de vuelta: B sale de la franja y A, que NO cambió de estado, tiene que volver a marcarse (con solo las
    //    entradas que cambian se quedaba B)
    await scrollBy(-20);
    await expect(current).toHaveAttribute('data-travesia-link', a, { timeout: 10_000 });
  });

  for (const size of [
    { width: 1280, height: 800 },
    { width: 820, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    test(`a ${String(size.width)} px el panel de cada escena NO tapa el punto de su destino en el localizador (r:F1)`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' }); // sin la separación de planos atada al scroll: medida estable
      await page.setViewportSize(size);
      await page.goto(PATHS.home.es);
      await hydrated(page);
      const covered: string[] = [];
      for (const s of travesiaStops()) {
        const dot = page.locator(
          `#parada-${s.entry.key} svg[data-isthmus="mini"] [data-stop="${s.entry.key}"] circle:last-child`,
        );
        await dot.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        const hit = await dot.evaluate((el) => {
          const b = el.getBoundingClientRect();
          const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return top === el || el.parentElement?.contains(top ?? null) === true
            ? ''
            : `${top?.tagName ?? '-'}.${String(top?.className ?? '')}`;
        });
        if (hit) covered.push(`${s.entry.key} tapado por ${hit}`);
      }
      expect(covered).toEqual([]);
    });
  }

  test('el anillo de foco de los enlaces de la barra cabe ENTERO dentro de la lista que desplaza (r:F3)', async ({
    page,
  }) => {
    for (const size of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await page.goto(PATHS.home.es);
      // `load` y no `networkidle`: en la segunda visita del contexto no llega (ISR de Explorar) y `focus()` no necesita
      // la página hidratada
      await page.waitForLoadState('load');
      const stops = travesiaStops();
      for (const key of [stops[0]!.entry.key, stops.at(-1)!.entry.key]) {
        const link = page.locator(`a[data-travesia-link="${key}"]`);
        await link.focus();
        const clipped = await link.evaluate((el) => {
          const ring = 8; // contorno de 3 px + separación de 2 px + halo de 5 px (base.css)
          const b = el.getBoundingClientRect();
          const list = el.closest('ol')!.getBoundingClientRect();
          const out: string[] = [];
          if (b.top - ring < list.top - 0.5) out.push('arriba');
          if (b.bottom + ring > list.bottom + 0.5) out.push('abajo');
          if (b.left - ring < list.left - 0.5) out.push('izquierda');
          if (b.right + ring > list.right + 0.5) out.push('derecha');
          return out;
        });
        expect(clipped, `${key} a ${String(size.width)} px`).toEqual([]);
      }
    }
  });

  test('a 1280 px las nueve paradas caben en la barra sin desplazarla (es y de: r:F5)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const path of [PATHS.home.es, PATHS.home.de]) {
      await page.goto(path);
      const fits = await page
        .locator('nav[data-travesia-rail] ol')
        .evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(fits, path).toBe(true);
    }
  });

  test('cada escena dice su ubicación real en el idioma de la página', async ({ page }) => {
    await page.goto(PATHS.home.en);
    const baru = page.locator('li[data-destination="volcan-baru"]');
    await expect(baru).toContainText('8.81° N · 82.54° W');
    await page.goto(PATHS.home.es);
    await expect(page.locator('li[data-destination="volcan-baru"]')).toContainText(
      '8,81° N · 82,54° O',
    );
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

  test('profundidad espacial: con el ratón las capas del istmo se desplazan solo con no-preference', async ({
    page,
  }) => {
    const nearTranslate = async (): Promise<string> => {
      await page.goto(PATHS.home.es);
      // `networkidle` no llega en la segunda visita de este contexto (ISR de Explorar, r0:F-07): se espera a que DepthStage
      // escuche (mover el ratón antes de hidratar no probaría nada: r:T-3)
      await page.waitForLoadState('load');
      await expect(page.locator('#inicio[data-depth-ready]')).toHaveCount(1);
      const box = await page.locator('main figure').boundingBox();
      if (!box) throw new Error('sin istmo');
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.1, { steps: 4 });
      await page.waitForTimeout(500);
      return page
        .locator('main svg[data-isthmus="hero"] g[data-depth="near"]')
        .evaluate((el) => getComputedStyle(el).translate);
    };
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const moved = await nearTranslate();
    expect(moved, 'control: con no-preference sí se desplaza').not.toBe('none');
    expect(moved).not.toBe('0px');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await nearTranslate()).toBe('none');
  });

  test('profundidad: las variables van en el SVG (no en la sección) y un dedo no mueve nada (r2:H-08)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(PATHS.home.es);
    await hydrated(page);
    await expect(page.locator('#inicio[data-depth-ready]')).toHaveCount(1);
    const read = (): Promise<{ section: string; svg: string }> =>
      page.evaluate(() => ({
        section: (document.getElementById('inicio') as HTMLElement).style.getPropertyValue(
          '--depth-x',
        ),
        svg: (
          document.querySelector('svg[data-isthmus="hero"]') as SVGElement
        ).style.getPropertyValue('--depth-x'),
      }));
    // Un dedo (pointerType touch) que se arrastra por el héroe: nada se escribe
    await page.evaluate(async () => {
      const stage = document.getElementById('inicio')!;
      const box = stage.getBoundingClientRect();
      for (const f of [0.2, 0.5, 0.9]) {
        stage.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            pointerType: 'touch',
            clientX: box.left + box.width * f,
            clientY: box.top + box.height * f,
          }),
        );
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
      }
    });
    expect(await read()).toEqual({ section: '', svg: '' });
    // Control: el mismo gesto con un ratón SÍ escribe, y en el SVG, no en la sección
    const box = await page.locator('main figure').boundingBox();
    if (!box) throw new Error('sin istmo');
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.2, { steps: 3 });
    await expect.poll(async () => (await read()).svg).not.toBe('');
    expect((await read()).section).toBe('');
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
    for (let i = 0; i < 60; i++) {
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
    // Buscador (campo y botón) + dos botones + 2 entradas + 9 de la barra de paradas + 18 de las escenas, como mínimo (r:T-2).
    expect(seen.size).toBeGreaterThanOrEqual(33);
    // Cada escena por sus DOS enlaces (la ficha y «Ver en el mapa»), no por el de la barra (r2:H-06)
    for (const s of travesiaStops()) {
      expect(seen.has(`A:#parada-${s.entry.key}`), `barra ${s.entry.key}`).toBe(true);
      expect(
        seen.has(`A:${PATHS.destinations.es}/${destinationSlug(s.entry, 'es')}`),
        `ficha ${s.entry.key}`,
      ).toBe(true);
      expect(seen.has(`A:${PATHS.explore.es}?d=${s.entry.key}`), `mapa ${s.entry.key}`).toBe(true);
    }
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
