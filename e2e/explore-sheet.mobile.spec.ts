import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  TEXT_SPACING_CSS,
  applyCss,
  clippedText,
  focusRingClippedSideways,
  hiddenFocus,
} from './a11y-probes';
import { LOCALES, PATHS } from './helpers';
import {
  MAP_DATA_PRESENT,
  MAP_DATA_SKIP_REASON,
  closeSheet,
  mapCanvas,
  mapState,
  markerInSafeArea,
  openMap,
  openSheet,
  settled,
  sheetBody,
  sheetHandle,
} from './map-helpers';

/**
 * Hoja inferior de Explorar en móvil (ADR-0025 §8, entrega 5j · E3). Con el mapa a pantalla completa, todo el HUD que no
 * flota sobre el mapa va dentro de una hoja de dos detentes (cerrada: asa, título y resumen; abierta ≈ 60dvh con
 * desplazamiento interno) que se maneja con un BOTÓN (`aria-expanded`), sin gesto obligatorio. Corre solo en el proyecto
 * móvil (Pixel 5, 393×851, táctil).
 *
 * La mayoría de las pruebas no necesitan el mapa dibujado: se le quita el mapa base (404) para no gastar la CPU de WebGL por
 * software y para que no cuenten como omitidas. Las que miden el mapa (encuadre, créditos, marcadores) lo piden.
 */
const EXPLORE = PATHS.explore.es;
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/** Un identificador de área con la FORMA válida (la ficha no necesita que exista: sin base de datos dice que no hay ficha). */
const AREA = '00000000-0000-4000-8000-000000000001';

/**
 * Carga Explorar con el mapa base PARADO (la petición no termina nunca): el HUD se hidrata sin gastar la CPU de WebGL y el
 * mapa está «cargando», no «no disponible» (un mapa que no estará disponible abre la hoja solo: ver más abajo). Con
 * `missing` el mapa base da 404 (sin datos).
 */
async function loadHud(
  page: Page,
  path: string = EXPLORE,
  map: 'loading' | 'missing' = 'loading',
): Promise<void> {
  await page.route('**/data/panama-basemap.pmtiles', (route) =>
    map === 'missing'
      ? route.fulfill({ status: 404, body: 'sin mapa base en esta prueba' })
      : new Promise<void>(() => undefined),
  );
  await page.goto(path);
  await expect(page.locator('[data-hud-island]')).toHaveCount(4);
  await expect(sheetHandle(page)).toBeVisible();
}

const sheetBox = async (page: Page) => {
  const box = await page.locator('[data-hud-zone="sheet"]').boundingBox();
  if (!box) throw new Error('la hoja no tiene caja');
  return box;
};

/** Un dedo REAL (eventos táctiles del navegador) que arrastra de un punto a otro. */
async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** ¿Dónde está el foco: dentro del cuerpo de la hoja, en su asa, en el mapa…? */
const focusZone = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'body';
    if (el.closest('[data-sheet-body]')) return 'sheet-body';
    if (el.hasAttribute('data-sheet-handle')) return 'sheet-handle';
    if (el.closest('header')) return 'header';
    if (el.closest('[data-map-status]')) return 'map';
    if (el.closest('footer')) return 'footer';
    return el.closest('[data-hud-zone]')?.getAttribute('data-hud-zone') ?? 'other';
  });

test.describe('hoja inferior: estructura y manejo', () => {
  test('arranca CERRADA: el asa es un botón con su nombre, el cuerpo es inerte y nada de lo plegado se ve ni se lee', async ({
    page,
  }) => {
    await loadHud(page);
    const handle = sheetHandle(page);
    await expect(handle).toHaveAttribute('aria-expanded', 'false');
    await expect(handle).toHaveAccessibleName('Explorar Panamá: abrir la información del mapa');
    // WCAG 2.5.3: el nombre contiene el rótulo VISIBLE de la cabecera (el título), no solo la acción (r2:N2)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explorar Panamá');
    const bodyId = await sheetBody(page).getAttribute('id');
    expect(bodyId).toBeTruthy();
    await expect(handle).toHaveAttribute('aria-controls', bodyId ?? '');
    await expect(sheetBody(page)).toHaveAttribute('inert', '');
    await expect(sheetBody(page)).toBeHidden();
    // Lo plegado no está en el árbol de accesibilidad ni se puede pulsar
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Ver en el mapa: / })).toHaveCount(0);
    // El título (h1) sigue a la vista: es el rótulo de la hoja cerrada
    await expect(page.getByRole('heading', { level: 1, name: 'Explorar Panamá' })).toBeVisible();
    // Cerrada asoma poco (el mapa manda) y llega hasta el borde de abajo
    const box = await sheetBox(page);
    const viewport = page.viewportSize();
    expect(box.height).toBeLessThanOrEqual((viewport?.height ?? 0) * 0.18);
    expect(box.y + box.height).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 1);
  });

  test('tocar el asa la abre (≈ 60dvh, con desplazamiento interno) y tocarla otra vez la cierra', async ({
    page,
  }) => {
    await loadHud(page);
    const viewport = page.viewportSize();
    const height = viewport?.height ?? 0;
    const closed = (await sheetBox(page)).height;
    await sheetHandle(page).tap();
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(sheetHandle(page)).toHaveAccessibleName(
      'Explorar Panamá: cerrar la información del mapa',
    );
    await expect(sheetBody(page)).toBeVisible();
    await expect(sheetBody(page)).not.toHaveAttribute('inert', /.*/);
    await settled(sheetBody(page));
    const open = await sheetBox(page);
    expect(open.height).toBeGreaterThan(closed + 250);
    expect(open.height).toBeGreaterThanOrEqual(height * 0.5);
    expect(open.height).toBeLessThanOrEqual(height * 0.7);
    // El cuerpo desplaza por dentro: hay más contenido que alto, y la barra de la página no se mueve
    const scroll = await sheetBody(page).evaluate((el) => ({
      scrollable: el.scrollHeight > el.clientHeight + 40,
      overflowY: getComputedStyle(el).overflowY,
      overscroll: getComputedStyle(el).overscrollBehaviorY,
    }));
    expect(scroll).toEqual({ scrollable: true, overflowY: 'auto', overscroll: 'contain' });
    await sheetHandle(page).tap();
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(sheetBody(page)).toBeHidden();
    await expect(sheetBody(page)).toHaveAttribute('inert', '');
    expect((await sheetBox(page)).height).toBeCloseTo(closed, 0);
  });

  test('el anillo de foco (contorno + halo, ≈ 8 px) no se recorta en el borde del cuerpo que desplaza: el campo del buscador deja sitio por todos lados', async ({
    page,
  }) => {
    await loadHud(page);
    await openSheet(page);
    await page.getByRole('searchbox').focus();
    const room = await page.evaluate(() => {
      const body = document.querySelector('[data-sheet-body]') as HTMLElement;
      const form = document.querySelector('form[role="search"]') as HTMLElement;
      const b = body.getBoundingClientRect();
      const f = form.getBoundingClientRect();
      const ring = Number.parseFloat(getComputedStyle(form).outlineWidth) + 5 + 2; // contorno + halo + separación
      return {
        left: f.left - b.left,
        right: b.right - f.right,
        top: f.top - b.top,
        ring,
        scrollPadding: Number.parseFloat(getComputedStyle(body).scrollPaddingBlockStart),
      };
    });
    // El anillo del buscador lo dibuja el formulario (`:has(:focus-visible)`)
    expect(room.left).toBeGreaterThanOrEqual(8);
    expect(room.right).toBeGreaterThanOrEqual(8);
    expect(room.top).toBeGreaterThanOrEqual(8);
    expect(room.scrollPadding).toBeGreaterThanOrEqual(8);
  });

  test('cerrada, NINGÚN Tab entra en el cuerpo; abierta, se llega al buscador, al filtro y a los destinos, en ese orden', async ({
    page,
  }) => {
    await loadHud(page);
    const visited = async (tabs: number): Promise<string[]> => {
      const zones: string[] = [];
      for (let i = 0; i < tabs; i++) {
        await page.keyboard.press('Tab');
        const zone = await focusZone(page);
        if (zones.at(-1) !== zone) zones.push(zone);
      }
      return zones;
    };
    const closedZones = await visited(40);
    expect(closedZones).toContain('sheet-handle');
    expect(closedZones).not.toContain('sheet-body');

    await page.reload();
    await expect(sheetHandle(page)).toBeVisible();
    await openSheet(page);
    await sheetHandle(page).focus();
    const names: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el?.closest('[data-sheet-body]')) return null;
        if (el.matches('input[type="search"]')) return 'buscador';
        if (el.hasAttribute('data-kind-filter')) return 'tipo';
        if (el.closest('summary') || el.tagName === 'SUMMARY') return 'grupo';
        if (el.closest('[data-hud-zone="carousel"]')) return 'carrusel';
        if (el.closest('[data-hud-zone="panel"]')) return 'panel';
        return 'otro';
      });
      if (info && names.at(-1) !== info) names.push(info);
    }
    expect(names.slice(0, 4)).toEqual(['buscador', 'grupo', 'tipo', 'grupo']);
    expect(names).toContain('carrusel');
    expect(names).toContain('panel');
  });

  test('con el teclado: Enter abre, Escape cierra y devuelve el foco al asa (también desde dentro de la hoja)', async ({
    page,
  }) => {
    await loadHud(page);
    await sheetHandle(page).focus();
    await page.keyboard.press('Enter');
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(sheetHandle(page)).toBeFocused();

    await page.keyboard.press('Space');
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    await settled(sheetBody(page));
    await page.getByRole('searchbox').focus();
    await page.keyboard.press('Escape');
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(sheetHandle(page)).toBeFocused();
    await expect(page.getByRole('searchbox')).toHaveCount(0);
  });

  test('Escape en el buscador con texto lo VACÍA y no cierra la hoja; con el campo vacío, cierra', async ({
    page,
  }) => {
    await loadHud(page);
    await openSheet(page);
    const search = page.getByRole('searchbox');
    await search.fill('boq');
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    await search.press('Escape');
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(sheetHandle(page)).toBeFocused();
  });

  test('el arrastre vertical del asa con un dedo abre (hacia arriba) y cierra (hacia abajo): una mejora, el botón no lo necesita', async ({
    page,
  }) => {
    await loadHud(page);
    const handle = await sheetHandle(page).boundingBox();
    if (!handle) throw new Error('sin asa');
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await touchDrag(page, { x, y }, { x, y: y - 160 });
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    await settled(sheetBody(page));
    const open = await sheetHandle(page).boundingBox();
    if (!open) throw new Error('sin asa abierta');
    await touchDrag(
      page,
      { x, y: open.y + open.height / 2 },
      { x, y: open.y + open.height / 2 + 160 },
    );
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false');
    // Un arrastre corto (un temblor del dedo, menos de 24 px) es un TOQUE: lo resuelve el botón y alterna, sin dejarla a medias
    await touchDrag(page, { x, y }, { x, y: y - 8 });
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    // La página no se desplazó por arrastrar el asa
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('el asa y todo lo que hay en la hoja mide al menos 44 px de alto (objetivo táctil del proyecto)', async ({
    page,
  }) => {
    await loadHud(page);
    await openSheet(page);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      const sheet = document.querySelector('[data-hud-zone="sheet"]');
      for (const el of sheet?.querySelectorAll('button, summary, input[type="search"]') ?? []) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 43.9 || r.width < 43.9) {
          out.push(
            `${el.tagName} «${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}» ${String(Math.round(r.width))}×${String(Math.round(r.height))}`,
          );
        }
      }
      return out;
    });
    expect(small).toEqual([]);
  });

  test('cada función existe UNA vez: un solo <aside>, un solo buscador, una sola ficha, un solo asa y un solo «Ver en el mapa» por destino', async ({
    page,
  }) => {
    await loadHud(page, `${EXPLORE}?d=coiba`);
    await openSheet(page);
    await expect(page.locator('aside')).toHaveCount(1);
    await expect(page.getByRole('complementary')).toHaveCount(1);
    await expect(page.locator('[role="search"]')).toHaveCount(1);
    await expect(sheetHandle(page)).toHaveCount(1);
    await expect(page.locator('#selected-destination-name')).toHaveCount(1);
    await expect(page.locator('li[data-destination]')).toHaveCount(9);
    await expect(page.locator('li[data-destination] a')).toHaveCount(9);
    await expect(page.getByRole('button', { name: /^Ver en el mapa: / })).toHaveCount(9);
    await expect(page.getByRole('button', { name: /^Ver en el mapa: Coiba$/ })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test('los dos enlaces del pie, Fuentes y Accesibilidad, están DENTRO de la hoja y se alcanzan (la página ya no se desplaza bajo el mapa)', async ({
    page,
  }) => {
    await loadHud(page);
    await openSheet(page);
    const panel = page.locator('[data-hud-zone="sheet"] aside');
    for (const name of ['Fuentes', 'Accesibilidad']) {
      const link = panel.getByRole('link', { name, exact: true });
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      // Dentro del cuerpo de la hoja y no tapado por nada
      const inside = await link.evaluate((el) => {
        const body = el.closest('[data-sheet-body]')?.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return !!body && r.top >= body.top - 1 && r.bottom <= body.bottom + 1;
      });
      expect(inside, name).toBe(true);
    }
    await panel.getByRole('link', { name: 'Fuentes', exact: true }).tap();
    await expect(page).toHaveURL(/\/es\/fuentes/);
  });
});

test.describe('hoja inferior: sin mapa', () => {
  test('sin datos del mapa base la hoja se abre SOLA una vez (la lista de destinos es la pantalla) y, si se cierra, no vuelve a abrirse', async ({
    page,
  }) => {
    await loadHud(page, EXPLORE, 'missing');
    await expect(page.locator('[data-map-status="dataMissing"]')).toBeVisible({ timeout: 30_000 });
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(sheetBody(page)).toBeVisible();
    await settled(sheetBody(page));
    // Los nueve destinos están a mano como enlaces, y el aviso del mapa se lee por encima de la hoja
    await expect(page.locator('li[data-destination] a')).toHaveCount(9);
    const sheet = await sheetBox(page);
    const notice = await page
      .getByRole('region', { name: 'Mapa de Panamá' })
      .getByRole('alert')
      .boundingBox();
    expect((notice?.y ?? 0) + (notice?.height ?? 0)).toBeLessThanOrEqual(sheet.y + 1);
    await closeSheet(page);
    await page.waitForTimeout(800);
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('mientras el mapa CARGA la hoja no se abre sola', async ({ page }) => {
    await loadHud(page);
    await expect(page.locator('[data-map-status="loading"]')).toBeAttached();
    await page.waitForTimeout(800);
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('hoja inferior: resumen del destino, capas y áreas', () => {
  test('con la hoja cerrada, el destino elegido se dice en su resumen (región en vivo); abierta, lo dice la ficha y el resumen se vacía', async ({
    page,
  }) => {
    await loadHud(page, `${EXPLORE}?d=coiba`);
    const summary = page.locator('[data-sheet-summary]');
    await expect(summary).toHaveAttribute('aria-live', 'polite');
    await expect(summary).toContainText('Coiba');
    await expect(summary).toContainText('Isla');
    await expect(summary).toContainText('Destino seleccionado: Coiba');
    // El título pasa a rótulo pequeño para que el destino mande
    const fontSizes = await page.evaluate(() => ({
      title: parseFloat(getComputedStyle(document.querySelector('h1') as Element).fontSize),
      name: parseFloat(
        getComputedStyle(document.querySelector('[data-sheet-summary] strong') as Element).fontSize,
      ),
    }));
    expect(fontSizes.name).toBeGreaterThan(fontSizes.title);
    await openSheet(page);
    await expect(summary).toBeEmpty();
    await expect(page.locator('#selected-destination-name')).toBeVisible();
    await expect(page.locator('#selected-destination-name')).toHaveText('Coiba');
    await closeSheet(page);
    await expect(summary).toContainText('Coiba');
  });

  test('sin destino elegido la hoja cerrada solo lleva el título (nada de «Destino seleccionado»)', async ({
    page,
  }) => {
    await loadHud(page);
    await expect(page.locator('[data-sheet-summary]')).toBeEmpty();
  });

  test('«Capas y leyenda» abre la hoja y despliega los dos grupos, con «Capas» a la vista; cerrada, el botón dice «cerrado»', async ({
    page,
  }) => {
    await loadHud(page);
    const tool = page.getByRole('button', { name: 'Capas y leyenda' });
    await expect(tool).toHaveAttribute('aria-expanded', 'false');
    await tool.tap();
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(tool).toHaveAttribute('aria-expanded', 'true');
    for (const id of ['hud-group-layers', 'hud-group-legend']) {
      await expect(page.locator(`#${id}`)).toHaveAttribute('open', '');
    }
    await settled(sheetBody(page));
    // El grupo «Capas» queda dentro del cuerpo visible (no hay que buscarlo desplazando)
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const body = document.querySelector('[data-sheet-body]')?.getBoundingClientRect();
            const layers = document.getElementById('hud-group-layers')?.getBoundingClientRect();
            return !!body && !!layers && layers.top >= body.top - 1 && layers.top < body.bottom;
          }),
        { timeout: 10_000 },
      )
      .toBe(true);
    await expect(page.getByRole('checkbox', { name: 'Áreas protegidas' })).toBeVisible();
    // Se cierra la hoja con los grupos aún abiertos: el botón dice la verdad (no hay nada visible)
    await closeSheet(page);
    await expect(tool).toHaveAttribute('aria-expanded', 'false');
    // Y pulsarlo otra vez NO pliega nada que no se ve: vuelve a abrir la hoja con los grupos desplegados
    await tool.tap();
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#hud-group-layers')).toHaveAttribute('open', '');
  });

  test('elegir un área (`a` en la URL) abre la hoja y lleva su panel de información a la vista', async ({
    page,
  }) => {
    await loadHud(page, `${EXPLORE}?a=${AREA}`);
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true');
    await settled(sheetBody(page));
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const body = document.querySelector('[data-sheet-body]')?.getBoundingClientRect();
            const panel = document
              .querySelector('[data-hud-zone="panel"]')
              ?.getBoundingClientRect();
            return !!body && !!panel && panel.top >= body.top - 1 && panel.top < body.bottom - 40;
          }),
        { timeout: 10_000 },
      )
      .toBe(true);
    await expect(page.locator('#selected-area-name')).toBeVisible();
    // Quien la cierra no la ve reabrirse sola
    await closeSheet(page);
    await page.waitForTimeout(600);
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('hoja inferior: tamaños y teclado en pantalla', () => {
  for (const [width, height] of [
    [320, 568],
    [851, 393],
  ] as const) {
    test(`${String(width)}×${String(height)}: la hoja abierta deja un trozo de mapa a la vista, cabe en la pantalla y su cuerpo desplaza`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await loadHud(page);
      await openSheet(page);
      const box = await sheetBox(page);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      // Bajo la cabecera (64 px) queda al menos un trozo de mapa para no perder el contexto
      expect(box.y).toBeGreaterThanOrEqual(64 + 96);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(
        await sheetBody(page).evaluate((el) => el.scrollHeight > el.clientHeight),
        'el cuerpo debe desplazar',
      ).toBe(true);
    });
  }

  test('teclado en pantalla: el viewport pide que encoja el contenido y, con la pantalla útil encogida, el buscador sigue entero a la vista', async ({
    page,
  }) => {
    await loadHud(page);
    // `interactive-widget=resizes-content` (Chrome/Edge/Firefox en Android): el teclado encoge la pantalla en vez de tapar la hoja
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /interactive-widget=resizes-content/,
    );
    await openSheet(page);
    const search = page.getByRole('searchbox');
    await search.focus();
    // Lo que hace el navegador con ese valor: una pantalla útil más baja (≈ 330 px menos, el alto de un teclado)
    const viewport = page.viewportSize();
    await page.setViewportSize({
      width: viewport?.width ?? 393,
      height: (viewport?.height ?? 851) - 330,
    });
    await settled(sheetBody(page));
    const info = await search.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const label = el.parentElement?.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        labelTop: label?.top ?? 0,
        innerHeight: window.innerHeight,
      };
    });
    expect(info.labelTop).toBeGreaterThan(64); // bajo la cabecera
    expect(info.bottom).toBeLessThanOrEqual(info.innerHeight - 8);
    await expect(search).toBeFocused();
    // …y la persona puede seguir escribiendo y pulsando lo que filtra
    await search.fill('boq');
    await expect(page.locator('li[data-destination]:visible')).toHaveCount(1);
  });
});

test.describe('hoja inferior: accesibilidad con la hoja abierta (cinco idiomas)', () => {
  for (const locale of LOCALES) {
    test(`${locale}: axe WCAG 2.2 AA, a 320 px sin desbordar y con el espaciado exigido sin recortar texto`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await loadHud(page, PATHS.explore[locale]);
      await openSheet(page);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(
        results.violations.map(
          (v) =>
            `${v.id} [${v.impact ?? '?'}] ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join(' | ')}`,
        ),
        locale,
      ).toEqual([]);
      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
      expect(await overflow(), `${locale}: desbordamiento`).toBeLessThanOrEqual(0);
      await applyCss(page, TEXT_SPACING_CSS);
      await settled(sheetBody(page));
      expect(await overflow(), `${locale}: desbordamiento con el espaciado`).toBeLessThanOrEqual(0);
      expect(await clippedText(page), `${locale}: texto recortado`).toEqual([]);
    });
  }

  for (const state of ['cerrada', 'abierta'] as const) {
    test(`con Tab y la hoja ${state}, ningún elemento queda ENTERO bajo otro (2.4.11)`, async ({
      page,
    }) => {
      await loadHud(page);
      if (state === 'abierta') await openSheet(page);
      const { checked, hidden } = await hiddenFocus(page, state === 'abierta' ? 90 : 40);
      expect(checked, 'casi nada se comprobó: la prueba no mediría nada').toBeGreaterThan(10);
      expect(hidden).toEqual([]);
    });
  }

  test('control: el detector SÍ ve un foco tapado por la hoja (un botón colocado bajo ella cuenta como tapado)', async ({
    page,
  }) => {
    await loadHud(page);
    await openSheet(page);
    // Un botón fijo en la zona que ocupa la hoja abierta, justo DESPUÉS del menú de idioma en el orden de tabulación
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.textContent = 'tapado';
      button.style.cssText =
        'position:fixed;inset-inline-start:40px;inset-block-end:20px;z-index:1';
      document.querySelector('header')?.after(button);
    });
    await page.locator('summary').first().focus();
    const { checked, hidden } = await hiddenFocus(page, 1);
    expect(checked).toBe(1);
    expect(hidden.length, 'la hoja abierta tiene que tapar el botón').toBe(1);
  });
});

test.describe('antes de hidratar', () => {
  test('con el JavaScript sin llegar aún, la hoja se ve CERRADA (no hay asa) y lo plegado no se ve ni se tabula', async ({
    page,
  }) => {
    // El HTML llega pero los scripts no: `@media (scripting: none)` NO se cumple (el JavaScript está activado), así que
    // lo que ordena el CSS es el estado «pending» (el de antes de hidratar, que se ve como cerrada)
    await page.route(/\/_next\/static\/.*\.js(\?.*)?$/, (route) => route.abort());
    await page.goto(EXPLORE);
    await expect(page.locator('[data-hud-zone="sheet"]')).toHaveAttribute('data-state', 'pending');
    await expect(sheetHandle(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Explorar Panamá' })).toBeVisible();
    const body = await sheetBody(page).evaluate((el) => ({
      visibility: getComputedStyle(el).visibility,
      height: el.getBoundingClientRect().height,
    }));
    expect(body).toEqual({ visibility: 'hidden', height: 0 });
    await expect(page.getByRole('link', { name: /Boquete/ })).toHaveCount(0);
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      expect(await focusZone(page), `Tab ${String(i + 1)}`).not.toBe('sheet-body');
    }
  });
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('no hay asa (sería un botón muerto): la hoja es una pila bajo el mapa con los nueve destinos como enlaces', async ({
    page,
  }) => {
    await page.goto(EXPLORE);
    await expect(page.locator('[data-hud-zone="sheet"]')).toHaveAttribute('data-state', 'pending');
    await expect(sheetHandle(page)).toHaveCount(0);
    await expect(page.locator('[data-hud] button')).toHaveCount(0);
    await expect(sheetBody(page)).toBeVisible();
    await expect(page.locator('li[data-destination] a')).toHaveCount(9);
    for (const link of await page.locator('li[data-destination] a').all()) {
      await expect(link).toBeVisible();
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Explorar Panamá' })).toBeVisible();
    // El título queda DENTRO de la caja de la hoja (con el asa oculta, su margen negativo lo dejaba a caballo sobre el borde)
    const title = await page.getByRole('heading', { level: 1 }).boundingBox();
    const sheet = await sheetBox(page);
    expect((title?.y ?? 0) - sheet.y, 'el título sobresale de la caja').toBeGreaterThanOrEqual(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('hoja inferior con el mapa', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  test('con la hoja ABIERTA, «Ver en el mapa» encuadra el destino en el hueco libre y ENCIMA de la hoja; abrir o cerrar la hoja no mueve la cámara', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    await openSheet(page);
    await page.getByRole('button', { name: /^Ver en el mapa: Coiba$/ }).tap();
    await expect(page).toHaveURL(/[?&]d=coiba/);
    await expect.poll(() => markerInSafeArea(page, 'coiba'), { timeout: 30_000 }).toBe(true);
    // El marcador pasa por el hueco libre MIENTRAS vuela: se mide cuando el vuelo terminó (la caja deja de moverse)
    await settled(page.locator('button[data-destination="coiba"]'));
    expect(await markerInSafeArea(page, 'coiba')).toBe(true);
    const marker = await page.locator('button[data-destination="coiba"]').boundingBox();
    const sheet = await sheetBox(page);
    expect((marker?.y ?? 0) + (marker?.height ?? 0)).toBeLessThanOrEqual(sheet.y + 1);
    // La cámara solo la mueve la persona: abrir y cerrar la hoja no la toca
    await expect.poll(async () => (await mapState(page)).zoom).toBeGreaterThan(4);
    await page.waitForTimeout(1500);
    const before = await mapState(page);
    await closeSheet(page);
    await openSheet(page);
    await page.waitForTimeout(800);
    const after = await mapState(page);
    expect(after.zoom).toBeCloseTo(before.zoom, 5);
    expect(after.center[0]).toBeCloseTo(before.center[0], 5);
    expect(after.center[1]).toBeCloseTo(before.center[1], 5);
  });

  test('abrir Explorar en el móvil NO mueve nada una vez pintado (CLS 0): los créditos arrancan ya plegados, no se pliegan al terminar de cargar', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const shifts: { value: number; hadRecentInput: boolean }[] = [];
      (window as unknown as { __shifts: typeof shifts }).__shifts = shifts;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as unknown as { value: number; hadRecentInput: boolean };
          shifts.push({ value: shift.value, hadRecentInput: shift.hadRecentInput });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await openMap(page, EXPLORE);
    await page.waitForTimeout(2500);
    const cls = await page.evaluate(() =>
      (window as unknown as { __shifts: { value: number; hadRecentInput: boolean }[] }).__shifts
        .filter((s) => !s.hadRecentInput)
        .reduce((sum, s) => sum + s.value, 0),
    );
    expect(cls).toBe(0);
  });

  test('la escala y los créditos del mapa (obligatorios por la licencia ODbL) quedan SIEMPRE por encima de la hoja, cerrada y abierta', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    const controlsBottom = () =>
      page.evaluate(() => {
        const out: Record<string, number> = {};
        for (const [name, selector] of [
          ['creditos', '.maplibregl-ctrl-attrib'],
          ['escala', '.maplibregl-ctrl-scale'],
        ] as const) {
          const el = document.querySelector(selector);
          if (el) out[name] = el.getBoundingClientRect().bottom;
        }
        return out;
      });
    for (const state of ['cerrada', 'abierta'] as const) {
      if (state === 'abierta') await openSheet(page);
      const sheetTop = (await sheetBox(page)).y;
      await expect
        .poll(async () => Object.keys(await controlsBottom()).length, { timeout: 15_000 })
        .toBe(2);
      for (const [name, bottom] of Object.entries(await controlsBottom())) {
        expect(bottom, `${name} con la hoja ${state}`).toBeLessThanOrEqual(sheetTop + 1);
      }
    }
    // Los créditos arrancan plegados a su botón en móvil (el texto íntegro está en «Información del mapa»)
    await expect(page.locator('.maplibregl-ctrl-attrib')).not.toHaveAttribute('open', /.*/);
    await expect(page.locator('[data-hud-zone="panel"]')).toContainText('OpenStreetMap');
  });

  test('un marcador que la hoja abierta tapa ENTERO sale de la tabulación y vuelve al cerrarla (2.4.11)', async ({
    page,
  }) => {
    await openMap(page, `${EXPLORE}?d=coiba`);
    const host = page.locator('button[data-destination="coiba"]').locator('xpath=..');
    await expect(host).not.toHaveJSProperty('inert', true);
    await openSheet(page);
    await expect.poll(() => host.evaluate((el: HTMLElement) => el.inert)).toBe(true);
    await closeSheet(page);
    await expect.poll(() => host.evaluate((el: HTMLElement) => el.inert)).toBe(false);
  });

  test('el mapa conserva el zoom nativo, la brújula y las herramientas a la vista con la hoja abierta (nada los tapa)', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    await openSheet(page);
    const sheetTop = (await sheetBox(page)).y;
    for (const name of ['Acercar', 'Alejar', 'Orientar al norte', '3D', 'Capas y leyenda']) {
      const box = await page
        .getByRole('button', { name, exact: name === '3D' ? false : true })
        .first()
        .boundingBox();
      expect(box, name).not.toBeNull();
      expect((box?.y ?? 0) + (box?.height ?? 0), `${name} sobre la hoja`).toBeLessThanOrEqual(
        sheetTop + 1,
      );
    }
    await expect(mapCanvas(page)).toBeVisible();
  });
});

test.describe('hoja inferior: el anillo de foco de los chips del filtro no se recorta (r2:N5, misma familia)', () => {
  test('la fila de tipos desplaza en horizontal: el anillo (8 px) del primero y del último cabe en su caja', async ({
    page,
  }) => {
    await loadHud(page);
    await openSheet(page);
    const chips = page.locator('[data-kind-filter]');
    for (const index of [0, (await chips.count()) - 1]) {
      const chip = chips.nth(index);
      await chip.scrollIntoViewIfNeeded();
      await chip.focus();
      expect(await focusRingClippedSideways(chip), `chip ${String(index)}`).toEqual([]);
    }
  });

  test('control: con la fila sin su relleno (el defecto original) el detector SÍ ve el anillo del primer chip recortado', async ({
    page,
  }) => {
    await loadHud(page);
    await openSheet(page);
    await applyCss(
      page,
      'ul:has(> li > [data-kind-filter]) { padding: 0 !important; margin: 0 !important; }',
    );
    const first = page.locator('[data-kind-filter]').first();
    await first.focus();
    expect((await focusRingClippedSideways(first)).length).toBeGreaterThan(0);
  });
});

test.describe('hoja inferior: a 320×256 (zoom del 400 %) el cuerpo abierto no mide 0 (r2:F4)', () => {
  test('la hoja abierta tiene un cuerpo utilizable y el foco no cae en controles tapados', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await loadHud(page);
    await openSheet(page);
    const body = await sheetBody(page).evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      scroll: el.scrollHeight,
      inert: el.hasAttribute('inert'),
    }));
    expect(body.inert).toBe(false);
    // Antes 0 px: buscador, filtro, ficha, lista y panel inalcanzables
    expect(body.height).toBeGreaterThanOrEqual(64);
    expect(body.scroll).toBeGreaterThan(body.height);
    // El primer control del cuerpo (el buscador) se ve entero y Tab no cae en nada tapado por la hoja o por el asa
    const search = page.getByRole('searchbox');
    await search.focus();
    const visible = await search.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const bodyRect = document.querySelector('[data-sheet-body]')?.getBoundingClientRect();
      return !!bodyRect && r.top >= bodyRect.top - 1 && r.bottom <= bodyRect.bottom + 1;
    });
    expect(visible, 'el buscador cabe en el cuerpo abierto').toBe(true);
    const { checked, hidden } = await hiddenFocus(page, 12);
    expect(checked).toBeGreaterThan(5);
    expect(hidden).toEqual([]);
  });

  test('control: la fórmula de antes (sin el suelo) deja el cuerpo en 0 px a esa altura', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await loadHud(page);
    await openSheet(page);
    await applyCss(
      page,
      '[data-sheet-body] { block-size: min(calc(60dvh - 5.5rem), calc(100dvh - var(--header-height) - 14rem)) !important; }',
    );
    // El alto se anima (240 ms): se espera a que llegue
    await expect
      .poll(() => sheetBody(page).evaluate((el) => el.getBoundingClientRect().height))
      .toBeLessThanOrEqual(1);
  });
});

test.describe('hoja inferior con el mapa: marcadores parcialmente tapados y créditos (r2:F9, r1:V-18)', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  test('con un destino elegido y la hoja abierta, ningún marcador activo queda con menos de 24 px a la vista (axe target-size) y los inactivos son inertes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openMap(page, `${EXPLORE}?d=boquete`);
    await openSheet(page);
    await expect
      .poll(() =>
        page
          .locator('div:has(> button[data-destination="volcan-baru"])')
          .evaluate((el: HTMLElement) => el.inert),
      )
      .toBe(true);
    // Especificación independiente: un marcador ACTIVO tiene ≥ 24 px de ancho y de alto a la vista, medido con una rejilla más fina (1 px de paso hasta 1/44)
    const issues = await page.evaluate(() => {
      const out: string[] = [];
      for (const b of document.querySelectorAll<HTMLElement>(
        'button[data-destination], button[data-cluster]',
      )) {
        if (b.parentElement?.inert) continue;
        const r = b.getBoundingClientRect();
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let x = Math.ceil(r.left); x < r.right; x += 1) {
          for (let y = Math.ceil(r.top); y < r.bottom; y += 1) {
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
            const top = document.elementFromPoint(x, y);
            if (top?.closest('[data-map-status]')) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
        }
        if (maxX - minX < 23 || maxY - minY < 23) {
          out.push(
            `${b.getAttribute('data-destination') ?? b.getAttribute('data-cluster') ?? '?'}: ${String(maxX - minX + 1)}×${String(maxY - minY + 1)} px a la vista`,
          );
        }
      }
      return out;
    });
    expect(issues).toEqual([]);
    const results = await new AxeBuilder({ page }).withRules(['target-size']).analyze();
    expect(
      results.violations.map(
        (v) =>
          `${v.id}: ${v.nodes
            .slice(0, 2)
            .map((n) => n.target.join(' '))
            .join(' | ')}`,
      ),
    ).toEqual([]);
  });

  test('a 320 px con la hoja abierta la pastilla «i» de los créditos no tapa ningún marcador ni grupo (el hueco libre reserva su franja)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openMap(page, EXPLORE);
    await openSheet(page);
    const overlaps = await page.evaluate(() => {
      const credits = document.querySelector('.maplibregl-ctrl-attrib')?.getBoundingClientRect();
      if (!credits) return ['sin créditos'];
      const out: string[] = [];
      for (const b of document.querySelectorAll<HTMLElement>(
        'button[data-destination], button[data-cluster]',
      )) {
        if (b.parentElement?.inert) continue;
        const r = b.getBoundingClientRect();
        const ox = Math.min(r.right, credits.right) - Math.max(r.left, credits.left);
        const oy = Math.min(r.bottom, credits.bottom) - Math.max(r.top, credits.top);
        if (ox > 1 && oy > 1)
          out.push(b.getAttribute('data-destination') ?? b.getAttribute('data-cluster') ?? '?');
      }
      return out;
    });
    expect(overlaps).toEqual([]);
  });
  test('el anillo de foco de los botones de área (a todo el ancho) no se recorta a izquierda y derecha dentro de la hoja (r2:N5)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMap(page, EXPLORE);
    await openSheet(page);
    const buttons = page.locator('[data-area-id]');
    await expect(buttons.first()).toBeAttached({ timeout: 20_000 });
    await buttons.first().scrollIntoViewIfNeeded();
    await buttons.first().focus();
    expect(await focusRingClippedSideways(buttons.first())).toEqual([]);
  });
});
