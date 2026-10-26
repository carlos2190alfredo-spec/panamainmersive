import { expect, test, type Page } from '@playwright/test';
import { hiddenFocus } from './a11y-probes';
import { PATHS } from './helpers';
import {
  MAP_DATA_PRESENT,
  MAP_DATA_SKIP_REASON,
  mapCanvas,
  markerInSafeArea,
  openLayers,
  openMap,
  safeBox,
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
    // Especificación independiente de la implementación: un marcador es inalcanzable si NINGUNO de nueve puntos de su caja
    // cae sobre el mapa sin nada encima (o si está fuera de la pantalla); lo que lo tapa puede ser un panel o la cabecera.
    const mismatches = () =>
      page.evaluate(() => {
        const out: string[] = [];
        for (const b of document.querySelectorAll<HTMLElement>(
          'button[data-destination], button[data-cluster]',
        )) {
          const r = b.getBoundingClientRect();
          let probes = 0;
          let free = 0;
          for (const fx of [0.1, 0.5, 0.9]) {
            for (const fy of [0.1, 0.5, 0.9]) {
              const x = r.left + r.width * fx;
              const y = r.top + r.height * fy;
              if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
              probes += 1;
              const top = document.elementFromPoint(x, y);
              if (top?.closest('[data-map-status]')) free += 1;
            }
          }
          const expected = probes === 0 || free === 0;
          const name = b.getAttribute('data-destination') ?? b.getAttribute('data-cluster') ?? '?';
          if (b.parentElement?.inert !== expected) {
            out.push(
              `${name}: inert=${String(b.parentElement?.inert)} esperado=${String(expected)}`,
            );
          }
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
