import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { applyCss, controlOverlaps, focusRingClippedSideways, hiddenFocus } from './a11y-probes';
import { PATHS } from './helpers';
import {
  MAP_DATA_PRESENT,
  MAP_DATA_SKIP_REASON,
  mapCanvas,
  mapState,
  markerInSafeArea,
  openAreasPanel,
  openLayers,
  openMap,
  routeTerrain,
  safeBox,
  watchFraming,
} from './map-helpers';

/**
 * HUD de Explorar (ADR-0025 §8): el mapa a pantalla completa y, encima, los componentes REALES de siempre como paneles
 * de vidrio. Estas pruebas fijan lo que no se ve en una captura y que se rompe sin avisar: cada función existe UNA
 * sola vez (los selectores estrictos de toda la suite dependen de ello), el orden de tabulación, que el foco nunca
 * quede entero bajo un panel, que el HUD esté por encima del aviso del mapa, qué se desactiva sin mapa y que el
 * encuadre deje cada destino en el hueco que los paneles dejan libre.
 *
 * Las que no necesitan WebGL ni el mapa base (estructura, estados sin mapa) no se omiten nunca; las demás sí, diciéndolo.
 */
const EXPLORE = PATHS.explore.es;
const PMTILES = '**/data/panama-basemap.pmtiles';
const NINE = [
  ['bocas-del-toro', 'Bocas del Toro'],
  ['boquete', 'Boquete'],
  ['casco-antiguo', 'Casco Antiguo'],
  ['coiba', 'Coiba'],
  ['el-valle-de-anton', 'El Valle de Antón'],
  ['panama-canal', 'Canal de Panamá'],
  ['panama-city', 'Ciudad de Panamá'],
  ['santa-catalina', 'Santa Catalina'],
  ['volcan-baru', 'Volcán Barú'],
] as const;

const toggleCarousel = (page: Page) =>
  page.getByRole('button', { name: /^(Ocultar|Mostrar) los destinos$/ });
const panelToggle = (page: Page) => page.locator('aside button[aria-expanded]');

/**
 * Espera a que el HUD esté hidratado (los botones «Ver en el mapa» solo existen con JavaScript) y a que lleguen sus cuatro
 * ISLAS diferidas (filtro por tipo, buscador, herramientas, recuento del carrusel: un solo chunk, tras hidratar).
 */
async function hydrated(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: /^Ver en el mapa: / })).toHaveCount(9);
  await expect(page.locator('[data-hud-island]')).toHaveCount(4);
}

test.describe('HUD de Explorar: estructura (no necesita el mapa)', () => {
  test('cada función existe UNA sola vez en el DOM (selectores únicos de toda la suite)', async ({
    page,
  }) => {
    await page.goto(EXPLORE);
    await hydrated(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explorar Panamá');
    await expect(page.getByRole('complementary')).toHaveCount(1);
    await openLayers(page); // «Capas» y «Leyenda» arrancan plegadas
    await expect(page.getByRole('region', { name: 'Leyenda' })).toHaveCount(1);
    await expect(page.locator('[data-map-status]')).toHaveCount(1);
    await expect(page.locator('[data-map-layers]')).toHaveCount(1);
    await expect(page.locator('[data-hud]')).toHaveCount(1);
    await expect(page.locator('[data-hud-safe]')).toHaveCount(1);
    // Nueve destinos: un `li`, UN enlace a su ficha y UN botón «Ver en el mapa» cada uno.
    await expect(page.locator('li[data-destination]')).toHaveCount(9);
    await expect(page.locator('li[data-destination] a')).toHaveCount(9);
    for (const [key, name] of NINE) {
      await expect(page.locator(`li[data-destination="${key}"] a`)).toHaveCount(1);
      await expect(page.getByRole('button', { name: `Ver en el mapa: ${name}` })).toHaveCount(1);
    }
    // Sin selección no hay ficha ni nombre de destino; UN solo buscador, UN solo filtro por tipo, UNAS herramientas.
    await expect(page.locator('#selected-destination-name')).toHaveCount(0);
    await expect(page.locator('[role="search"], search')).toHaveCount(1);
    await expect(page.getByRole('searchbox')).toHaveCount(1);
    await expect(page.locator('[data-kind-filter]')).toHaveCount(8); // «todos» + los 7 tipos reales
    await expect(page.getByRole('group', { name: 'Herramientas del mapa' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Relieve en 3D' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Capas y leyenda' })).toHaveCount(1);
    // Ningún botón del HUD usa `data-destination` (los selectores de los marcadores del lienzo son `button[...]`).
    await expect(page.locator('li[data-destination] button[data-destination]')).toHaveCount(0);
  });

  test('es de ámbito inmersivo: siempre oscuro aunque el sistema pida claro, y la barra del navegador lo anticipa', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(EXPLORE);
    await expect(page.locator('[data-immersive]')).toHaveCount(1);
    const scope = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const meta = (name: string) =>
        document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;
      return {
        paper: root.getPropertyValue('--color-paper').trim(),
        surface: root.getPropertyValue('--color-surface').trim(),
        scheme: root.colorScheme,
        themeColor: meta('theme-color'),
        colorScheme: meta('color-scheme'),
      };
    });
    expect(scope.paper).toBe('#050f2a');
    expect(scope.scheme).toBe('dark');
    // Una sola fuente: el `viewport` de la página usa el mismo oscuro que la cabecera (`--color-surface` inmersivo)
    expect(scope.themeColor).toBe(scope.surface);
    expect(scope.colorScheme).toBe('dark');
    // Y otra página, en la misma sesión, NO hereda el ámbito
    await page.goto(PATHS.destinations.es);
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-paper').trim(),
      ),
    ).toBe('#f9f6f0');
  });

  test('el HUD flota SOBRE el mapa y no le roba el clic fuera de sus paneles', async ({ page }) => {
    await page.goto(EXPLORE);
    await hydrated(page);
    // El lienzo se carga DESPUÉS de hidratar (isla diferida): se espera a que exista su contenedor
    await expect(page.locator('[data-map-status]')).toHaveCount(1);
    const geometry = await page.evaluate(() => {
      const rect = (el: Element | null) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
      };
      const hud = document.querySelector('[data-hud]');
      const map = document.querySelector('[data-map-status]');
      const shell = document.querySelector('[data-immersive]');
      const header = document.querySelector('header');
      return {
        hud: rect(hud),
        map: rect(map),
        shell: rect(shell),
        header: rect(header),
        position: hud ? getComputedStyle(hud).position : null,
        pointer: hud ? getComputedStyle(hud).pointerEvents : null,
        vh: innerHeight,
      };
    });
    // La cabecera mide exactamente 4 rem y el mapa a sangre ocupa el resto de la pantalla
    expect(geometry.header?.h).toBe(64);
    expect(geometry.shell?.h).toBeCloseTo(geometry.vh - 64, 0);
    expect(geometry.map?.w).toBeCloseTo(1280, 0);
    expect(geometry.map?.h).toBeCloseTo(geometry.shell?.h ?? 0, 0);
    // El HUD cubre el mapa pero deja pasar los punteros (cada panel los pide para sí)
    expect(geometry.position).toBe('absolute');
    expect(geometry.pointer).toBe('none');
    expect(geometry.hud?.w).toBeCloseTo(geometry.map?.w ?? 0, 0);
    // El centro del hueco libre cae sobre el mapa (no sobre un panel)
    const target = await page.evaluate(() => {
      const safe = document.querySelector('[data-hud-safe]')?.getBoundingClientRect();
      if (!safe) return null;
      const top = document.elementFromPoint(safe.left + safe.width / 2, safe.top + safe.height / 2);
      return { inHud: top?.closest('[data-hud]') !== null, tag: top?.tagName ?? null };
    });
    expect(target?.inHud).toBe(false);
  });

  test('los paneles de vidrio no se solapan entre sí (1280×800 y 1024×768) y dejan un hueco libre', async ({
    page,
  }) => {
    for (const [width, height] of [
      [1280, 800],
      [1024, 768],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(`${EXPLORE}?d=boquete`);
      await hydrated(page);
      await expect(page.locator('#selected-destination-name')).toBeVisible();
      const boxes = await page.evaluate(() =>
        [...document.querySelectorAll('[data-hud-zone]')]
          .map((el) => {
            const r = el.getBoundingClientRect();
            const visible = r.width > 0 && r.height > 0 && el.checkVisibility();
            return {
              zone: el.getAttribute('data-hud-zone') ?? '',
              x: r.left,
              y: r.top,
              w: r.width,
              h: r.height,
              visible,
            };
          })
          .filter((b) => b.visible),
      );
      expect(boxes.map((b) => b.zone)).toEqual(
        expect.arrayContaining(['title', 'rail', 'featured', 'carousel', 'panel']),
      );
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (!a || !b) continue;
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(
            overlapX > 1 && overlapY > 1,
            `${a.zone} y ${b.zone} se solapan a ${String(width)}×${String(height)}`,
          ).toBe(false);
        }
      }
      const safe = await safeBox(page);
      expect(safe.width, `hueco libre a ${String(width)}`).toBeGreaterThan(300);
      expect(safe.height, `hueco libre a ${String(width)}`).toBeGreaterThan(120);
    }
  });

  test('desde 80rem el carril cabe ENTERO sin desplazar (F2-11: los ocho tipos y las cabeceras de «Capas» y «Leyenda»); a 1024×768, donde no cabe, desplaza por dentro y no recorta', async ({
    page,
  }) => {
    const railFit = () =>
      page.evaluate(() => {
        const rail = document.querySelector('[data-hud-zone="rail"]') as HTMLElement;
        const r = rail.getBoundingClientRect();
        const outside = (el: Element): boolean => {
          const b = el.getBoundingClientRect();
          return b.top < r.top - 1 || b.bottom > r.bottom + 1;
        };
        return {
          overflow: rail.scrollHeight - rail.clientHeight,
          overflowY: getComputedStyle(rail).overflowY,
          chips: rail.querySelectorAll('[data-kind-filter]').length,
          chipsOutside: [...rail.querySelectorAll('[data-kind-filter]')].filter(outside).length,
          groupsOutside: [...rail.querySelectorAll('[data-hud-group] > summary')].filter(outside)
            .length,
        };
      });
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
    ] as const) {
      for (const query of ['', '?d=boquete']) {
        await page.setViewportSize({ width, height });
        await page.goto(`${EXPLORE}${query}`);
        await hydrated(page);
        const fit = await railFit();
        const where = `${String(width)}×${String(height)} ${query}`;
        expect(fit.chips, where).toBe(8); // «Todos» + los siete tipos reales
        expect(fit.overflow, `${where}: el carril desplaza`).toBeLessThanOrEqual(1);
        expect(fit.chipsOutside, `${where}: chips fuera`).toBe(0);
        expect(fit.groupsOutside, `${where}: grupos fuera`).toBe(0);
      }
    }
    // Por debajo de 80rem el dock sigue a todo el ancho y el carril no cabe: desplaza en vertical, sin recortar nada
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${EXPLORE}?d=boquete`);
    await hydrated(page);
    const narrow = await railFit();
    expect(narrow.overflowY).toBe('auto');
    expect(narrow.overflow).toBeGreaterThan(40);
  });

  test('a lo sumo TRES superficies de vidrio piden desenfoque a la vez, y solo con puntero fino y ≥ 56rem', async ({
    page,
  }) => {
    await page.goto(`${EXPLORE}?d=boquete`);
    await hydrated(page);
    await expect(page.locator('#selected-destination-name')).toBeVisible();
    const blurred = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((el) => {
          const value = getComputedStyle(el).backdropFilter;
          return value !== '' && value !== 'none';
        })
        .map((el) => el.getAttribute('data-hud-zone') ?? el.tagName),
    );
    expect(blurred.length).toBeGreaterThanOrEqual(1); // el mecanismo funciona en este navegador (control)
    expect(blurred.length).toBeLessThanOrEqual(3);
    // En móvil (< 56rem) ninguna: relleno sólido
    await page.setViewportSize({ width: 600, height: 900 });
    const narrow = await page.evaluate(
      () =>
        [...document.querySelectorAll('body *')].filter((el) => {
          const value = getComputedStyle(el).backdropFilter;
          return value !== '' && value !== 'none';
        }).length,
    );
    expect(narrow).toBe(0);
  });

  test('el carrusel se pliega con un botón (aria-expanded) y plegado devuelve el espacio al mapa', async ({
    page,
  }) => {
    // Con el mapa base AUSENTE, el estado «no disponible» llega tarde (cuando el lienzo diferido pide el PMTiles y recibe un
    // 404) y obliga al carrusel a quedarse abierto y sin botón: la prueba podía plegarlo justo antes (flaky en el CI sin
    // mapa: 1 de 334 en la ejecución completa sin el fichero). Se deja el mapa «cargando» (la petición no termina nunca):
    // el estado es el mismo con y sin datos y plegar el carrusel es posible.
    await page.route(PMTILES, () => new Promise<void>(() => undefined));
    await page.goto(EXPLORE);
    await hydrated(page);
    const toggle = toggleCarousel(page);
    await expect(toggle).toHaveText('Ocultar los destinos');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('li[data-destination]').first()).toBeVisible();
    const before = await safeBox(page);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveText('Mostrar los destinos');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('li[data-destination]').first()).toBeHidden();
    // Plegado el hueco libre crece (la franja del carrusel pasa a ser mapa) y el foco no se pierde
    await expect.poll(async () => (await safeBox(page)).height).toBeGreaterThan(before.height + 80);
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('li[data-destination]').first()).toBeVisible();
  });

  test('el panel de información arranca plegado y se abre y se cierra con su botón', async ({
    page,
  }) => {
    await page.goto(EXPLORE);
    await hydrated(page);
    await expect(panelToggle(page)).toHaveAccessibleName('Información del mapa');
    await expect(panelToggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('link', { name: 'Fuentes', exact: true }).last()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Áreas protegidas en esta vista' })).toHaveCount(
      0,
    );
    await panelToggle(page).click();
    await expect(panelToggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(panelToggle(page)).toHaveAccessibleName(
      'Mostrar u ocultar el panel de información',
    );
    await expect(
      page.getByRole('region', { name: 'Áreas protegidas en esta vista' }),
    ).toBeVisible();
    await expect(page.getByText(/^Mapa base: © OpenStreetMap contributors/)).toBeVisible();
    await expect(
      page.getByRole('complementary').getByRole('link', { name: 'Accesibilidad' }),
    ).toBeVisible();
    await panelToggle(page).click();
    await expect(panelToggle(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('con un área en la URL (`a`) el panel se abre solo y la ficha del área queda a la vista', async ({
    page,
  }) => {
    await page.goto(`${EXPLORE}?a=00000000-0000-4000-8000-000000000001`);
    await hydrated(page);
    await expect(panelToggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#selected-area-name')).toBeVisible();
  });
});

test.describe('HUD de Explorar: sin mapa (datos ausentes o sin WebGL2)', () => {
  const noMap: Record<string, (page: Page) => Promise<void>> = {
    'sin datos del mapa base': async (page) => {
      await page.route(PMTILES, (route) => route.fulfill({ status: 404, body: 'no' }));
    },
    'sin WebGL2': async (page) => {
      await page.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (
          this: HTMLCanvasElement,
          type: string,
          ...rest: unknown[]
        ) {
          if (type === 'webgl2' || type === 'webgl') return null;
          return (original as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
        } as typeof original;
      });
    },
  };

  for (const [name, setup] of Object.entries(noMap)) {
    test(`${name}: el HUD queda por ENCIMA del aviso, el carrusel es la alternativa y lo que depende del mapa se apaga con su motivo`, async ({
      page,
    }) => {
      await setup(page);
      await page.goto(`${EXPLORE}?d=boquete`);
      await expect(page.locator('[data-map-status]')).toHaveAttribute(
        'data-map-status',
        /dataMissing|unsupported/,
        { timeout: 30_000 },
      );
      await hydrated(page);
      // El aviso del mapa existe y está DEBAJO del HUD (z-index) y bajo el carrusel en el apilado real
      const stack = await page.evaluate(() => {
        const overlay = document.querySelector('[data-map-status] [role="alert"]')?.parentElement;
        const hud = document.querySelector('[data-hud]');
        const card = document.querySelector('li[data-destination]');
        const r = card?.getBoundingClientRect();
        const top = r ? document.elementFromPoint(r.left + r.width / 2, r.top + 10) : null;
        return {
          overlayZ: overlay ? Number(getComputedStyle(overlay).zIndex) : null,
          hudZ: hud ? Number(getComputedStyle(hud).zIndex) : null,
          cardOnTop: top?.closest('li[data-destination]') !== null,
        };
      });
      expect(stack.overlayZ).not.toBeNull();
      expect(stack.hudZ).toBeGreaterThan(stack.overlayZ ?? Number.POSITIVE_INFINITY);
      expect(stack.cardOnTop).toBe(true);
      // La lista de enlaces sigue entera, y el carrusel NO se puede plegar (es lo único que ofrece la pantalla)
      await expect(page.locator('li[data-destination] a')).toHaveCount(9);
      await expect(
        page.getByRole('button', { name: /^(Ocultar|Mostrar) los destinos$/ }),
      ).toHaveCount(0);
      // Lo que depende del mapa está apagado y lo dice por escrito
      const reason = page.getByText('No disponible: el mapa no está activo.');
      await expect(reason).toHaveCount(3); // carrusel, capas y «volver a encuadrar»
      for (const [, label] of NINE) {
        const button = page.getByRole('button', { name: `Ver en el mapa: ${label}` });
        await expect(button).toBeDisabled();
        await expect(button).toHaveAccessibleDescription('No disponible: el mapa no está activo.');
      }
      await openLayers(page);
      await expect(page.getByRole('checkbox')).toHaveCount(7);
      for (const box of await page.getByRole('checkbox').all()) await expect(box).toBeDisabled();
      // «Relieve en 3D» también se apaga y dice por qué (descrito por el aviso del carrusel); «Capas y leyenda» no
      // depende del mapa y sigue activo: sin mapa, la leyenda y los textos de las capas se pueden leer igualmente
      const threeD = page.getByRole('button', { name: 'Relieve en 3D' });
      await expect(threeD).toBeDisabled();
      await expect(threeD).toHaveAccessibleDescription('No disponible: el mapa no está activo.');
      await expect(page.getByRole('button', { name: 'Capas y leyenda' })).toBeEnabled();
      await expect(
        page.getByRole('button', { name: 'Volver a encuadrar el destino' }),
      ).toBeDisabled();
      // Con la ficha del destino y su enlace a la ficha completa todavía disponibles
      await expect(page.getByRole('link', { name: 'Abrir la ficha de Boquete' })).toBeVisible();
    });
  }
});

test.describe('HUD de Explorar: con el mapa dibujado', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  test('mientras el mapa carga, sus controles son inertes y «volver a encuadrar» está apagado; al estar listo, se activan', async ({
    page,
  }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(PMTILES, async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(`${EXPLORE}?d=boquete`);
    await hydrated(page);
    await expect(page.locator('[data-map-status]')).toHaveAttribute('data-map-status', 'loading');
    await expect(mapCanvas(page)).toHaveAttribute('inert', '');
    await expect(
      page.getByRole('button', { name: 'Volver a encuadrar el destino' }),
    ).toBeDisabled();
    // El aviso de carga (z 5) está bajo el HUD: sus botones reciben el foco y el carrusel se puede pulsar
    await expect(toggleCarousel(page)).toBeEnabled();
    await page.getByRole('button', { name: 'Ver en el mapa: Coiba' }).click();
    await expect(page).toHaveURL(/[?&]d=coiba/);
    release();
    await expect(page.locator('[data-map-status="ready"]')).toBeVisible({ timeout: 60_000 });
    await expect(mapCanvas(page)).not.toHaveAttribute('inert', /.*/);
    await expect(page.getByRole('button', { name: 'Volver a encuadrar el destino' })).toBeEnabled();
    // El destino pedido mientras cargaba se encuadra en cuanto el mapa está listo
    await expect.poll(() => markerInSafeArea(page, 'coiba'), { timeout: 20_000 }).toBe(true);
  });

  test('el orden de tabulación es el del diseño: cabecera → mapa → herramientas → buscador → carril → ficha → carrusel → panel', async ({
    page,
  }) => {
    await openMap(page, `${EXPLORE}?d=boquete`);
    const order: string[] = [];
    for (let i = 0; i < 90; i++) {
      await page.keyboard.press('Tab');
      const zone = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'body';
        if (el.closest('a[href="#main-content"]')) return 'skip';
        if (el.closest('header')) return 'header';
        const hudZone = el.closest('[data-hud-zone]')?.getAttribute('data-hud-zone');
        if (hudZone) return hudZone;
        if (el.closest('[data-map-status]')) return 'map';
        if (el.closest('footer')) return 'footer';
        return 'other';
      });
      if (order.at(-1) !== zone) order.push(zone);
    }
    // Las herramientas del mapa (3D, «Capas y leyenda») van JUSTO tras el mapa y ANTES de la hoja: en móvil flotan sobre el
    // mapa y no se pliegan con ella (no pueden quedar dentro de su cuerpo inerte), y «Capas y leyenda» gobierna lo que
    // viene después. El título (h1) no es enfocable: el buscador es la primera zona de la hoja. Los controles (carril)
    // van ANTES del contenido que gobiernan (ficha y carrusel). Pasado el panel se llega al pie.
    // (Antes las herramientas iban entre el carril y la ficha; la hoja inferior móvil obligó a sacarlas de su cuerpo.)
    expect(order.slice(0, 9)).toEqual([
      'skip',
      'header',
      'map',
      'tools',
      'search',
      'rail',
      'featured',
      'carousel',
      'panel',
    ]);
    expect(order).not.toContain('other');
  });

  test('con el mapa listo, el foco nunca queda ENTERO bajo un panel (2.4.11): los marcadores tapados salen del orden de tabulación', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    // En la vista inicial (todo el país) hay marcadores bajo el carril y el carrusel: Coiba, la más al sur, cae bajo este
    const covered = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button[data-destination], button[data-cluster]')]
        .filter((b) => b.parentElement?.inert === true)
        .map((b) => b.getAttribute('data-destination') ?? b.getAttribute('data-cluster')),
    );
    expect(
      covered.length,
      'el control: algún marcador queda tapado por el HUD en la vista inicial',
    ).toBeGreaterThan(0);
    const result = await hiddenFocus(page, 80);
    expect(result.checked).toBeGreaterThan(30);
    expect(result.hidden).toEqual([]);
  });

  // Dos disposiciones, la misma intención («lo que un panel tapa ENTERO sale de la tabulación y vuelve cuando el panel se
  // pliega»): desde 80rem el carril baja hasta la franja inferior (F2-11) y tapa a Coiba, la más al sur; por debajo, el dock
  // ocupa todo el ancho y la tapa el carrusel.
  test('un marcador tapado por el HUD vuelve al orden de tabulación en cuanto se ve (≥ 80rem: al plegar el filtro del carril, que baja hasta la franja inferior)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMap(page, EXPLORE);
    // En la vista inicial (todo el país): Boquete y el volcán, agrupados, y Coiba, la más al sur, quedan bajo el carril.
    // Plegar el filtro (el grueso del carril) los descubre; desplegarlo los vuelve a tapar. El carrusel (a la derecha del
    // carril) no tapa a ninguno de los dos: plegarlo no cambia nada.
    const host = (selector: string) => page.locator(`div:has(> button${selector})`);
    const west = host('[data-cluster*="boquete"]');
    const coiba = host('[data-destination="coiba"]');
    const inert = (el: typeof west) => () => el.evaluate((node: HTMLElement) => node.inert);
    await expect(west).toHaveJSProperty('inert', true);
    await expect(coiba).toHaveJSProperty('inert', true);

    const filter = page.locator('[data-hud-group="filter"] > summary');
    await filter.click();
    await expect.poll(inert(west), { timeout: 10_000 }).toBe(false);
    await expect.poll(inert(coiba), { timeout: 10_000 }).toBe(false);

    await toggleCarousel(page).click(); // plegar el carrusel no cambia nada: no tapaba a ninguno
    await expect(west).toHaveJSProperty('inert', false);
    await expect(coiba).toHaveJSProperty('inert', false);
    await toggleCarousel(page).click();

    await filter.click();
    await expect.poll(inert(west), { timeout: 10_000 }).toBe(true);
    await expect.poll(inert(coiba), { timeout: 10_000 }).toBe(true);
  });

  test('un marcador tapado por el HUD vuelve al orden de tabulación en cuanto se ve (< 80rem: al plegar el carril y el carrusel)', async ({
    page,
  }) => {
    // 1279 px: justo por debajo de 80rem (1280 px), con la geometría de siempre pero la disposición anterior del carril.
    await page.setViewportSize({ width: 1279, height: 800 });
    await openMap(page, EXPLORE);
    // En la vista inicial (todo el país): Boquete y el volcán, agrupados, quedan bajo el carril; Coiba, la más al sur, bajo el
    // carrusel (el dock ocupa todo el ancho). Plegar cada panel descubre lo que tenía debajo; desplegarlo lo vuelve a tapar.
    const host = (selector: string) => page.locator(`div:has(> button${selector})`);
    const west = host('[data-cluster*="boquete"]');
    const coiba = host('[data-destination="coiba"]');
    const inert = (el: typeof west) => () => el.evaluate((node: HTMLElement) => node.inert);
    await expect(west).toHaveJSProperty('inert', true);
    await expect(coiba).toHaveJSProperty('inert', true);

    const filter = page.locator('[data-hud-group="filter"] > summary');
    await filter.click();
    await expect.poll(inert(west), { timeout: 10_000 }).toBe(false);
    await expect(coiba).toHaveJSProperty('inert', true); // el carril no la tapaba
    await toggleCarousel(page).click();
    await expect.poll(inert(coiba), { timeout: 10_000 }).toBe(false);

    // Y de vuelta: al desplegar los dos vuelven a quedar tapados
    await filter.click();
    await expect.poll(inert(west), { timeout: 10_000 }).toBe(true);
    await toggleCarousel(page).click();
    await expect.poll(inert(coiba), { timeout: 10_000 }).toBe(true);
  });

  test('al desplazar la PÁGINA (la cabecera fija tapa la parte alta del mapa) los marcadores cubiertos salen del orden de tabulación y vuelven al regresar', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    // Especificación independiente de la implementación (r2:F9): un marcador es inalcanzable si la parte de su caja que queda
    // sobre el mapa, sin nada encima, mide menos de 24 px en algún lado (o está fuera de la pantalla); lo que lo tapa puede ser
    // un panel, la hoja o la cabecera. Aquí se mide con una rejilla de 1 px; la implementación usa una de 9 × 9 que es un
    // límite INFERIOR, así que entre 24 y 36 px de parte visible cualquiera de los dos estados es admisible (solo se exige lo
    // inequívoco: menos de 24 px ⇒ inerte; 36 px o más ⇒ activo).
    const mismatches = () =>
      page.evaluate(() => {
        const out: string[] = [];
        for (const b of document.querySelectorAll<HTMLElement>(
          'button[data-destination], button[data-cluster]',
        )) {
          const r = b.getBoundingClientRect();
          let minX = Number.POSITIVE_INFINITY;
          let maxX = Number.NEGATIVE_INFINITY;
          let minY = Number.POSITIVE_INFINITY;
          let maxY = Number.NEGATIVE_INFINITY;
          for (let x = Math.ceil(r.left); x < r.right; x += 1) {
            for (let y = Math.ceil(r.top); y < r.bottom; y += 1) {
              if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
              if (document.elementFromPoint(x, y)?.closest('[data-map-status]')) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
              }
            }
          }
          const span = Math.min(maxX - minX + 1, maxY - minY + 1); // ≤ 0 o NaN-ish si no hay ninguna sonda libre
          const visible = Number.isFinite(span) ? span : 0;
          const name = b.getAttribute('data-destination') ?? b.getAttribute('data-cluster') ?? '?';
          const inert = b.parentElement?.inert === true;
          if (visible < 24 && !inert)
            out.push(`${name}: activo con ${String(visible)} px a la vista`);
          if (visible >= 36 && inert)
            out.push(`${name}: inerte con ${String(visible)} px a la vista`);
        }
        return out;
      });
    const farthest = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    expect(farthest, 'la página tiene pie: se puede desplazar').toBeGreaterThan(100);
    for (const y of [0, 120, 360, farthest, 0]) {
      await page.evaluate((to) => window.scrollTo(0, to), y);
      await expect
        .poll(mismatches, { message: `desplazada ${String(y)} px`, timeout: 5000 })
        .toEqual([]);
    }
    // Control: con la página arriba, el mismo marcador de Coiba sigue tapado por el carril (la comprobación no es vacía)
    await expect(page.locator('div:has(> button[data-destination="coiba"])')).toHaveJSProperty(
      'inert',
      true,
    );
  });

  test('«Ver en el mapa» deja CADA uno de los nueve destinos dentro del hueco libre, con su propio marcador (sin fundirse en un grupo)', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMap(page, EXPLORE);
    for (const [key, name] of NINE) {
      await page.getByRole('button', { name: `Ver en el mapa: ${name}` }).click();
      await expect(page).toHaveURL(new RegExp(`[?&]d=${key}(&|$)`));
      await expect
        .poll(() => markerInSafeArea(page, key), { message: `${name} a la vista`, timeout: 20_000 })
        .toBe(true);
      await expect(page.locator(`button[data-destination="${key}"]`)).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
  });

  test('la ficha destacada: «Volver a encuadrar» devuelve el destino al hueco libre aunque la cámara se haya movido', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMap(page, `${EXPLORE}?d=boquete`);
    await expect.poll(() => markerInSafeArea(page, 'boquete')).toBe(true);
    await expect(page.locator('#selected-destination-name')).toHaveText('Boquete');
    // Se mueve la cámara con el teclado hasta sacar el marcador del hueco
    await mapCanvas(page).locator('canvas').focus();
    for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(() => markerInSafeArea(page, 'boquete'), { timeout: 15_000 }).toBe(false);
    // Elegir otra vez el mismo destino no hace nada (la cámara explícita `c` gana a `d`): el botón de la ficha SÍ
    await page.getByRole('button', { name: 'Volver a encuadrar el destino' }).click();
    await expect.poll(() => markerInSafeArea(page, 'boquete'), { timeout: 15_000 }).toBe(true);
    // Y «Quitar la selección» la retira (la región en vivo sigue ahí, vacía)
    await page.getByRole('button', { name: 'Quitar la selección', exact: true }).click();
    await expect(page.locator('#selected-destination-name')).toHaveCount(0);
  });

  test('la hoja de MapLibre RECORTADA (vendor/maplibre-gl.trimmed.css) conserva lo que el mapa usa: lienzo, esquinas, iconos, créditos y marcadores', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    const styles = await page.evaluate(() => {
      const css = (selector: string, prop: string): string | null => {
        const el = document.querySelector(selector);
        return el ? getComputedStyle(el).getPropertyValue(prop) : null;
      };
      return {
        canvas: css('canvas.maplibregl-canvas', 'position'),
        topRight: css('.maplibregl-ctrl-top-right', 'position'),
        topRightZ: css('.maplibregl-ctrl-top-right', 'z-index'),
        bottomLeft: css('.maplibregl-ctrl-bottom-left', 'position'),
        zoomIcon: css('.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon', 'background-image'),
        compassIcon: css('.maplibregl-ctrl-compass .maplibregl-ctrl-icon', 'background-image'),
        compact: document.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact') !== null,
        marker: css('.maplibregl-marker', 'position'),
        // Lo que SÍ se quitó no debe estar en la hoja ni en la página: el logotipo de MapLibre (no se muestra)
        logo: document.querySelector('.maplibregl-ctrl-logo'),
      };
    });
    expect(styles.canvas).toBe('absolute');
    expect(styles.topRight).toBe('absolute');
    expect(styles.topRightZ).toBe('2');
    expect(styles.bottomLeft).toBe('absolute');
    expect(styles.zoomIcon).toContain('data:image/svg+xml');
    expect(styles.compassIcon).toContain('data:image/svg+xml');
    expect(styles.compact).toBe(true);
    expect(styles.marker).toBe('absolute');
    expect(styles.logo).toBeNull();
  });

  test('los créditos del mapa (obligatorios por la licencia ODbL) se leen YA RENDERIZADOS: ningún velo del HUD los atenúa', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    const credits = page.locator('.maplibregl-ctrl-attrib');
    await expect(credits).toBeVisible();
    // Nada del HUD encima de ellos
    const covered = await credits.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top?.closest('[data-hud]') !== null;
    });
    expect(covered).toBe(false);
    // Y el contraste de lo que realmente se pinta (el texto más claro frente al fondo más oscuro del recuadro)
    const png = (await credits.screenshot()).toString('base64');
    const ratio = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('sin contexto 2D');
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      let max = 0;
      let min = 1;
      for (let i = 0; i < data.length; i += 4) {
        const l =
          0.2126 * lin(data[i] ?? 0) +
          0.7152 * lin(data[i + 1] ?? 0) +
          0.0722 * lin(data[i + 2] ?? 0);
        max = Math.max(max, l);
        min = Math.min(min, l);
      }
      return (max + 0.05) / (min + 0.05);
    }, png);
    expect(ratio, 'contraste del texto de los créditos ya renderizado').toBeGreaterThan(7);
  });

  test('las herramientas, el carrusel y los destinos siguen siendo únicos con el mapa listo (nada se duplica al hidratar)', async ({
    page,
  }) => {
    await openMap(page, `${EXPLORE}?d=casco-antiguo`);
    await expect(page.getByRole('complementary')).toHaveCount(1);
    await expect(page.locator('li[data-destination] a')).toHaveCount(9);
    await expect(page.getByRole('button', { name: /^Ver en el mapa: / })).toHaveCount(9);
    await expect(page.locator('[data-map-status]')).toHaveCount(1);
    // Casco Antiguo, Canal y Ciudad están a < 0,06° entre sí: seleccionado, el suyo es un marcador, no un «3»
    await expect(page.locator('button[data-destination="casco-antiguo"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

/* ====================================================================================================================== */
/* Revisión independiente (5j · X1): disposición y accesibilidad del HUD                                                  */
/* ====================================================================================================================== */

/** Carga Explorar con el mapa base PARADO (la petición no termina nunca): el HUD se hidrata y el mapa «carga», sin gastar WebGL. */
async function loadingHud(page: Page, path: string = EXPLORE): Promise<void> {
  await page.route(PMTILES, () => new Promise<void>(() => undefined));
  await page.goto(path);
  await hydrated(page);
}

test.describe('HUD de Explorar: poca altura y texto agrandado (r2:F5; no necesita el mapa)', () => {
  const CASES = [
    { name: '1280×560', width: 1280, height: 560, path: EXPLORE, fontPercent: 0 },
    {
      name: '1280×600 con un destino elegido',
      width: 1280,
      height: 600,
      path: `${EXPLORE}?d=boquete`,
      fontPercent: 0,
    },
    { name: '960×480', width: 960, height: 480, path: EXPLORE, fontPercent: 0 },
    {
      name: '1280×800 con el texto del navegador al 150 %',
      width: 1280,
      height: 800,
      path: EXPLORE,
      fontPercent: 150,
    },
  ] as const;

  for (const c of CASES) {
    test(`${c.name}: ningún control del HUD tapa a otro («Información del mapa», «Relieve en 3D», «Capas y leyenda», el carrusel…)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: c.width, height: c.height });
      await loadingHud(page, c.path);
      if (c.fontPercent > 0)
        await applyCss(page, `html { font-size: ${String(c.fontPercent)}% !important; }`);
      // Lo que se mide existe y se ve (la prueba no es vacía)
      for (const name of ['Relieve en 3D', 'Capas y leyenda']) {
        await expect(page.getByRole('button', { name })).toBeVisible();
      }
      await expect(panelToggle(page)).toBeVisible();
      expect(await controlOverlaps(page)).toEqual([]);
    });
  }

  test('control: con la píldora devuelta a la columna de las herramientas (el defecto original) el detector SÍ ve que tapa «Capas y leyenda»', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await loadingHud(page, `${EXPLORE}?d=boquete`);
    await applyCss(
      page,
      "[data-hud-zone='panel'] { grid-column: 4 !important; grid-row: 1 / span 2 !important; }",
    );
    const overlaps = await controlOverlaps(page);
    expect(overlaps.join('\n')).toMatch(/Capas y leyenda/);
  });

  test('la píldora y el panel abierto comparten su borde derecho (no saltan al abrir) y el buscador no se mueve (r1:V-07)', async ({
    page,
  }) => {
    await loadingHud(page, `${EXPLORE}?d=casco-antiguo`);
    const geometry = () =>
      page.evaluate(() => {
        const box = (selector: string) => {
          const r = document.querySelector(selector)?.getBoundingClientRect();
          return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
        };
        return {
          search: box('[data-hud-zone="search"]'),
          panel: box('[data-hud-zone="panel"]'),
          dock: box('[data-hud-zone="carousel"]'),
          tools: box('[data-hud-zone="tools"] [role="group"]'),
        };
      });
    const closed = await geometry();
    await panelToggle(page).click();
    await expect(panelToggle(page)).toHaveAttribute('aria-expanded', 'true');
    await settledLayout(page);
    const open = await geometry();
    expect(closed.search && open.search).toBeTruthy();
    // El campo de búsqueda no se recoloca (antes saltaba 144 px a la izquierda)
    expect(Math.abs((open.search?.left ?? 0) - (closed.search?.left ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((open.search?.right ?? 0) - (closed.search?.right ?? 0))).toBeLessThanOrEqual(
      1,
    );
    // El panel crece sobre el MISMO borde derecho y a ras del dock; nunca invade la columna de las herramientas
    expect(Math.abs((open.panel?.right ?? 0) - (closed.panel?.right ?? 0))).toBeLessThanOrEqual(1);
    expect(open.panel?.right ?? 0).toBeLessThanOrEqual((open.tools?.left ?? 0) + 1);
    expect(open.panel?.bottom ?? 0).toBeLessThanOrEqual((open.dock?.top ?? 0) - 1);
    // …y no se solapa con el buscador
    expect(open.panel?.top ?? 0).toBeGreaterThanOrEqual((open.search?.bottom ?? 0) - 1);
  });
});

/** Espera a que la maquetación deje de moverse (un cambio de columna del HUD tarda un fotograma). */
async function settledLayout(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

test.describe('HUD de Explorar: el foco del carrusel y del panel no se recorta (r2:F8, r2:N5; no necesita el mapa)', () => {
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    test(`${String(width)}×${String(height)}: con Tab, cada tarjeta enfocada queda ENTERA a la vista y el anillo de sus botones cabe`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await loadingHud(page);
      await page.locator('[data-hud-zone="carousel"] li a').first().focus();
      let checked = 0;
      for (let i = 0; i < 20; i++) {
        const state = await page.evaluate(() => {
          const el = document.activeElement;
          const card = el?.closest('li[data-destination]');
          // El que DESPLAZA: el ancestro más cercano con `overflow-x: auto` (el padre de la lista es un `<nav>` de ancho máximo)
          let body: Element | null = card?.parentElement ?? null;
          while (body && getComputedStyle(body).overflowX !== 'auto') body = body.parentElement;
          if (!el || !card || !body) return null;
          const c = card.getBoundingClientRect();
          const b = body.getBoundingClientRect();
          return {
            name: card.getAttribute('data-destination'),
            left: c.left - b.left,
            right: b.right - c.right,
          };
        });
        if (state) {
          checked += 1;
          expect(state.left, `${state.name ?? '?'}: borde izquierdo`).toBeGreaterThanOrEqual(-0.5);
          expect(state.right, `${state.name ?? '?'}: borde derecho`).toBeGreaterThanOrEqual(-0.5);
          expect(
            await focusRingClippedSideways(page.locator(':focus')),
            `${state.name ?? '?'}`,
          ).toEqual([]);
        }
        await page.keyboard.press('Tab');
      }
      expect(checked, 'se enfocaron las tarjetas y sus botones').toBeGreaterThanOrEqual(18);
    });
  }

  test('control: una tarjeta enfocada SIN que el carrusel la traiga a la vista queda cortada y el detector lo ve', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadingHud(page);
    // Con el carrusel en su origen, la cuarta tarjeta asoma por el borde derecho: la MISMA medida que usa la prueba de arriba
    // la da por cortada (sin que nadie la enfoque: al enfocarla, el carrusel la trae a la vista)
    const cut = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('li[data-destination="el-valle-de-anton"]');
      let body: Element | null = card?.parentElement ?? null;
      while (body && getComputedStyle(body).overflowX !== 'auto') body = body.parentElement;
      if (!body || !card) return null;
      body.scrollLeft = 0;
      return card.getBoundingClientRect().right - body.getBoundingClientRect().right;
    });
    expect(cut, 'la cuarta tarjeta asoma por el borde derecho').toBeGreaterThan(5);
  });
});

test.describe('HUD de Explorar: jerarquía tipográfica, estado de carga y eco del filtro (no necesita el mapa)', () => {
  test('el <h1> «Explorar Panamá» es el título MAYOR del carril: los rótulos de grupo son pequeños, en mayúsculas y en la fuente de texto (r1:V-21)', async ({
    page,
  }) => {
    await loadingHud(page);
    const sizes = await page.evaluate(() => {
      const h1 = getComputedStyle(document.querySelector('h1') as Element);
      const group = getComputedStyle(
        document.querySelector('[data-hud-group="filter"] > summary') as Element,
      );
      const carousel = getComputedStyle(
        document.querySelector('[data-hud-zone="carousel"] h2') as Element,
      );
      const px = (value: string) => Number.parseFloat(value);
      return {
        h1: px(h1.fontSize),
        group: px(group.fontSize),
        groupCase: group.textTransform,
        groupFamily: group.fontFamily,
        h1Family: h1.fontFamily,
        carousel: px(carousel.fontSize),
      };
    });
    expect(sizes.h1).toBeGreaterThanOrEqual(sizes.group * 1.6);
    expect(sizes.h1).toBeGreaterThanOrEqual(sizes.carousel * 1.6);
    expect(sizes.groupCase).toBe('uppercase');
    expect(sizes.groupFamily).not.toBe(sizes.h1Family);
  });

  test('el estado de carga lleva texto y una barra que se anima TRES veces (finito, < 5 s) y con movimiento reducido no se anima (r1:V-19, WCAG 2.2.2)', async ({
    page,
  }) => {
    await loadingHud(page);
    const status = page.locator('[data-map-status="loading"] [role="status"]');
    await expect(status).toHaveText('Cargando el mapa…', { timeout: 20_000 });
    const animation = () =>
      status.evaluate((el) => {
        const style = getComputedStyle(el, '::after');
        return {
          name: style.animationName,
          count: style.animationIterationCount,
          duration: style.animationDuration,
          delay: style.animationDelay,
        };
      });
    const moving = await animation();
    expect(moving.name).toMatch(/shimmer$/); // el módulo de CSS le añade un prefijo
    expect(moving.count).toBe('3');
    expect(Number.parseFloat(moving.duration) * Number(moving.count)).toBeLessThan(5);
    // Espera antes de moverse: una animación que corre mientras el mapa se dibuja le quita el turno (X4, ver MapStage.module.css)
    expect(Number.parseFloat(moving.delay)).toBeGreaterThanOrEqual(1.5);
    // Y sin degradados: el fondo del aviso, la pista y el relleno son colores planos (con WebGL por software retrasaban `ready`)
    const gradients = await status.evaluate((el) => {
      const overlay = el.closest('div');
      return [
        overlay ? getComputedStyle(overlay).backgroundImage : 'sin aviso',
        getComputedStyle(el, '::before').backgroundImage,
        getComputedStyle(el, '::after').backgroundImage,
      ];
    });
    expect(gradients).toEqual(['none', 'none', 'none']);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect((await animation()).name).toBe('none');
  });
});

test.describe('HUD de Explorar: axe en pantallas bajas (r2:F5, 2.5.8)', () => {
  for (const [width, height, path] of [
    [1280, 600, `${EXPLORE}?d=boquete`],
    [960, 480, EXPLORE],
  ] as const) {
    test(`${String(width)}×${String(height)}: axe target-size y 2.4.11 no ven nada tapado`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await loadingHud(page, path);
      const results = await new AxeBuilder({ page }).withRules(['target-size']).analyze();
      expect(
        results.violations.map(
          (v) =>
            `${v.id}: ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join(' | ')}`,
        ),
      ).toEqual([]);
      // 2.4.11 NO lo ve axe (`target-size` aprueba un control ENTERO tapado): se recorre con Tab y se mide en un navegador real
      const focus = await hiddenFocus(page, 60);
      expect(focus.checked, 'se recorrieron controles de verdad').toBeGreaterThan(10);
      expect(focus.hidden, 'ningún control enfocado queda ENTERO tapado').toEqual([]);
    });
  }
});

/** Cuántos destinos tienen su marcador (o su grupo) con el centro DENTRO del hueco libre del HUD, y cuáles. */
async function destinationsInSafeArea(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const safe = document.querySelector('[data-hud-safe]')?.getBoundingClientRect();
    if (!safe) return [];
    const keys: string[] = [];
    for (const button of document.querySelectorAll<HTMLElement>(
      'button[data-destination], button[data-cluster]',
    )) {
      const r = button.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < safe.left || x > safe.right || y < safe.top || y > safe.bottom) continue;
      const id =
        button.getAttribute('data-destination') ?? button.getAttribute('data-cluster') ?? '';
      keys.push(...id.split('+'));
    }
    return keys.sort();
  });
}

test.describe('HUD de Explorar: foco del lienzo, vista inicial y filtro con el mapa (r2:F3, r1:V-05, r1:V-07/08/09/16)', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  /** Cuántos píxeles de la página cambian al enfocar el lienzo con el TECLADO, y cuántos de ellos son del color del anillo de foco. */
  async function focusPixels(
    page: Page,
  ): Promise<{ changed: number; ring: number; outline: string; inside: boolean }> {
    const before = (await page.screenshot()).toString('base64');
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.tagName === 'CANVAS')) break;
    }
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      const style = el ? getComputedStyle(el) : null;
      return {
        tag: el?.tagName ?? '',
        visible: !!el?.matches(':focus-visible'),
        outline: style?.outline ?? '',
        offset: style?.outlineOffset ?? '',
      };
    });
    expect(focused.tag, 'el Tab llegó al lienzo').toBe('CANVAS');
    expect(focused.visible, ':focus-visible (teclado)').toBe(true);
    await page.waitForTimeout(300);
    const after = (await page.screenshot()).toString('base64');
    const result = await page.evaluate(
      async ({ a, b }) => {
        const decode = async (b64: string) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('sin contexto 2D');
          ctx.drawImage(bitmap, 0, 0);
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const [x, y] = await Promise.all([decode(a), decode(b)]);
        const focus = getComputedStyle(document.documentElement)
          .getPropertyValue('--color-focus')
          .trim();
        const target = [1, 3, 5].map((i) => Number.parseInt(focus.slice(i, i + 2), 16));
        let changed = 0;
        let ring = 0;
        for (let i = 0; i < x.length; i += 4) {
          const d =
            Math.abs((x[i] ?? 0) - (y[i] ?? 0)) +
            Math.abs((x[i + 1] ?? 0) - (y[i + 1] ?? 0)) +
            Math.abs((x[i + 2] ?? 0) - (y[i + 2] ?? 0));
          if (d > 60) {
            changed += 1;
            const near =
              Math.abs((y[i] ?? 0) - (target[0] ?? 0)) +
              Math.abs((y[i + 1] ?? 0) - (target[1] ?? 0)) +
              Math.abs((y[i + 2] ?? 0) - (target[2] ?? 0));
            if (near < 40) ring += 1;
          }
        }
        return { changed, ring };
      },
      { a: before, b: after },
    );
    return {
      ...result,
      outline: `${focused.outline} / ${focused.offset}`,
      inside: focused.offset.startsWith('-'),
    };
  }

  test('el lienzo del mapa recibe el foco de teclado con un indicador VISIBLE: un anillo interior del color de foco (prueba de píxeles; antes cambiaban 16 de 1 024 000)', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    const { changed, ring, outline, inside } = await focusPixels(page);
    // El perímetro del lienzo mide ≈ 4 000 px y el anillo 3 px (≈ 12 000 píxeles); el HUD tapa buena parte (el carril, el buscador,
    // el dock, las herramientas) y se miden ≈ 16 000 cambiados con el halo y ≈ 1 000 del color del anillo. Antes: 16 en total.
    expect(changed, `píxeles que cambian al enfocar (${outline})`).toBeGreaterThan(2000);
    expect(ring, 'y son del color del anillo de foco').toBeGreaterThan(500);
    expect(inside, 'el anillo se dibuja DENTRO de la caja (separación negativa)').toBe(true);
  });

  test('control: sin el indicador interior (el anillo global de fuera de la caja, que recorta el mapa) cambian unos pocos píxeles y la medida lo ve', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    await applyCss(
      page,
      '.maplibregl-canvas:focus-visible { outline: 3px solid var(--color-focus) !important; outline-offset: 2px !important; } .maplibregl-map::after { display: none !important; }',
    );
    const { changed } = await focusPixels(page);
    expect(changed, 'el defecto original: el anillo cae fuera y no se ve').toBeLessThan(500);
  });
});

test.describe('HUD de Explorar: vista inicial y reencuadre (r1:V-05; con el mapa)', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  // Mínimos MEDIDOS en el navegador (los nueve destinos son 3 grupos de 1 a 3: Canal, Casco Antiguo y Ciudad de Panamá van
  // juntos; Boquete y el volcán, juntos). `maxBounds` impide que quepan los nueve en ninguna pantalla de escritorio: Coiba,
  // al sur, queda siempre bajo el dock (`bestEffortFrame` y su prueba lo documentan). 1920×1080 era 5 antes del arreglo.
  for (const [width, height, atLeast] of [
    [1920, 1080, 7],
    [1440, 900, 5],
    [1280, 800, 5],
    [1024, 768, 4],
  ] as const) {
    test(`${String(width)}×${String(height)}: la vista inicial deja al menos ${String(atLeast)} de los nueve destinos dentro del hueco libre del HUD`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openMap(page, EXPLORE);
      const inside = await destinationsInSafeArea(page);
      expect(inside.length, `dentro del hueco: ${inside.join(', ')}`).toBeGreaterThanOrEqual(
        atLeast,
      );
      expect(inside.length, 'con maxBounds no caben los nueve').toBeLessThan(9);
    });
  }

  test('a 1920×1080 Bocas del Toro y Boquete ya NO quedan bajo el carril (antes: cubiertos e inertes) y se pueden tabular', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openMap(page, EXPLORE);
    for (const selector of [
      'button[data-destination="bocas-del-toro"]',
      'button[data-cluster*="boquete"]',
    ]) {
      const host = page.locator(`div:has(> ${selector})`);
      await expect(host, selector).toHaveJSProperty('inert', false);
      const free = await page.locator(selector).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return top?.closest('[data-map-status]') !== null;
      });
      expect(free, `${selector} sin nada encima`).toBe(true);
    }
  });

  test('al cambiar el tamaño de la ventana la vista de conjunto se vuelve a encuadrar en el hueco nuevo (sin que nadie la haya movido)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page, EXPLORE);
    const small = await destinationsInSafeArea(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect
      .poll(async () => (await destinationsInSafeArea(page)).length, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(7);
    expect((await destinationsInSafeArea(page)).length).toBeGreaterThan(small.length);
  });

  test('…pero NO si la persona ya movió el mapa: cambiar el tamaño conserva su cámara', async ({
    page,
  }) => {
    // Una carga completa del mapa con un navegador recién abierto (≈ 12 s con WebGL por software) y tres cambios de tamaño con su
    // espera: con los 30 s por defecto vencía 3 de 5 veces (solo por plazo; el control positivo añade dos esperas al original)
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page, EXPLORE);
    const framings = await watchFraming(page);
    // CONTROL: mientras nadie ha movido el mapa, cambiar el tamaño SÍ lo reencuadra (se ve en el canal síncrono de encuadres,
    // que no espera a `idle`); sin esto, «cero encuadres» más abajo podría ser un canal que no ve nada.
    await page.setViewportSize({ width: 1600, height: 900 });
    await expect.poll(framings, { timeout: 20_000 }).toBeGreaterThan(0);
    await mapCanvas(page).locator('canvas').focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
    await expect
      .poll(async () => (await mapState(page)).center[0], { timeout: 10_000 })
      .toBeLessThan(-80.2);
    const settledFramings = await framings();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1500);
    // NINGÚN encuadre pedido tras mover el mapa (esta aserción no depende de `idle`: con la guarda rota, `overview(0)` escribe
    // `data-flight-ms` en el acto)
    expect(await framings(), 'cambiar el tamaño tras mover el mapa NO pide ningún encuadre').toBe(
      settledFramings,
    );
    const after = await mapState(page);
    // La vista de conjunto a 1920×1080 está acercada (zoom ≈ 8,28, centro −81,03; 8,48): si se hubiera vuelto a encuadrar,
    // el zoom sería ese. Aquí se queda al zoom mínimo que `maxBounds` exige a ese lienzo (≈ 7,93) y el centro, clavado en la franja.
    expect(after.zoom).toBeLessThan(8.1);
    expect(Math.abs(after.center[1] - 8.3527)).toBeLessThan(0.02);
  });
});

test.describe('HUD de Explorar: panel, carril y avisos con el mapa (r1:V-07, V-08, V-09, V-16)', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  test('a 1024×768 con un destino elegido, abrir «Información del mapa» NO tapa la etiqueta del marcador ni se come el buscador', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openMap(page, `${EXPLORE}?d=casco-antiguo`);
    await expect.poll(() => markerInSafeArea(page, 'casco-antiguo')).toBe(true);
    const geometry = () =>
      page.evaluate(() => {
        const box = (el: Element | null | undefined) => {
          const r = el?.getBoundingClientRect();
          return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
        };
        const label = document.querySelector(
          'button[data-destination="casco-antiguo"] span:last-child',
        );
        const l = box(label);
        // Tres puntos de la etiqueta (cerca de cada extremo y el centro): el panel la tapaba por su lado derecho
        const covered = l
          ? [l.left + 3, (l.left + l.right) / 2, l.right - 3].some(
              (x) => document.elementFromPoint(x, (l.top + l.bottom) / 2)?.closest('aside') != null,
            )
          : true;
        return {
          search: box(document.querySelector('[data-hud-zone="search"]')),
          panel: box(document.querySelector('aside')),
          label: l,
          labelCovered: covered,
        };
      });
    const closed = await geometry();
    await panelToggle(page).click();
    await expect(panelToggle(page)).toHaveAttribute('aria-expanded', 'true');
    await settledLayout(page);
    const open = await geometry();
    expect(open.labelCovered, 'la etiqueta «Casco Antiguo» no queda bajo el panel').toBe(false);
    expect(Math.abs((open.search?.left ?? 0) - (closed.search?.left ?? 0))).toBeLessThanOrEqual(1);
    // El panel mide 16 rem (256 px) entre 56 y 80 rem y su contenido entero es alcanzable (desplaza por dentro)
    const body = await page.locator('aside').evaluate((el) => {
      const b = [...el.querySelectorAll('div')].find(
        (d) => getComputedStyle(d).overflowY === 'auto',
      );
      return b
        ? { scrollable: b.scrollHeight > b.clientHeight, overflowY: getComputedStyle(b).overflowY }
        : null;
    });
    expect(body?.overflowY).toBe('auto');
  });

  test('con «Capas» abierto el carril deja aire sobre la escala del mapa y, cuando desplaza, avisa de que hay más (la sombra del borde; r1:V-08)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page, EXPLORE);
    const cue = () =>
      page.locator('[data-hud-zone="rail"]').evaluate((el) => ({
        opacity: getComputedStyle(el, '::after').opacity,
        overflow: el.scrollHeight - el.clientHeight,
      }));
    // Con «Capas» y «Leyenda» plegadas el carril cabe entero: no hay nada más abajo y la sombra no se pinta
    const folded = await cue();
    expect(folded.overflow).toBeLessThanOrEqual(1);
    expect(folded.opacity).toBe('0');
    await openLayers(page);
    expect((await cue()).overflow).toBeGreaterThan(40);
    // La consulta de estado de desplazamiento se resuelve tras el diseño: se espera a que llegue
    await expect.poll(async () => (await cue()).opacity).toBe('1');
    // …y al llegar al final de la lista la sombra se va (nada atenúa la última fila)
    await page
      .locator('[data-hud-zone="rail"]')
      .evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect.poll(async () => (await cue()).opacity).toBe('0');
    // El carril termina ≥ 8 px sobre la escala del mapa (antes: 6 px)
    const gap = await page.evaluate(() => {
      const rail = document.querySelector('[data-hud-zone="rail"]')?.getBoundingClientRect();
      const scale = document.querySelector('.maplibregl-ctrl-scale')?.getBoundingClientRect();
      return rail && scale ? scale.top - rail.bottom : null;
    });
    expect(gap, 'distancia entre el carril y la escala').toBeGreaterThanOrEqual(8);
  });

  test('el aviso del relieve (AWS) usa la columna y el ancho del buscador, en dos líneas como mucho (r1:V-09)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await routeTerrain(page, 'ok');
    await openMap(page, EXPLORE);
    await page.getByRole('button', { name: 'Relieve en 3D' }).click();
    const notice = page.locator('[role="status"]', { hasText: 'Amazon Web Services' });
    await expect(notice).toBeVisible();
    const box = await notice.boundingBox();
    const search = await page.locator('[data-hud-zone="search"]').boundingBox();
    expect(box && search).toBeTruthy();
    expect(Math.abs((box?.x ?? 0) - (search?.x ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((box?.width ?? 0) - (search?.width ?? 0))).toBeLessThanOrEqual(2);
    expect(box?.height ?? 0, 'dos líneas: ≈ 62 px, no tres (≈ 98 px)').toBeLessThan(80);
  });
});

test.describe('HUD de Explorar: anillo de foco de los botones de área (r2:N5; con el mapa)', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  test('el anillo de foco de los botones de área a todo el ancho no se recorta a izquierda y derecha en el panel', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    await openAreasPanel(page);
    const buttons = page.locator('[data-area-id]');
    await expect(buttons.first()).toBeVisible({ timeout: 20_000 });
    expect(await buttons.count()).toBeGreaterThan(1);
    for (const index of [0, (await buttons.count()) - 1]) {
      const button = buttons.nth(index);
      await button.focus();
      expect(await focusRingClippedSideways(button), `botón ${String(index)}`).toEqual([]);
    }
  });

  test('control: con la lista sin su relleno (el defecto original) el detector SÍ ve el anillo recortado', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    await openAreasPanel(page);
    await expect(page.locator('[data-area-id]').first()).toBeVisible({ timeout: 20_000 });
    await applyCss(
      page,
      'ul:has(> li > [data-area-id]) { padding: 0 !important; margin: 0 !important; }',
    );
    const first = page.locator('[data-area-id]').first();
    await first.focus();
    expect((await focusRingClippedSideways(first)).length).toBeGreaterThan(0);
  });
});
