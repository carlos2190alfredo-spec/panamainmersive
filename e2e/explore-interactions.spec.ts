import { expect, test, type Page } from '@playwright/test';
import { PATHS, watchPage } from './helpers';
import {
  MAP_DATA_PRESENT,
  MAP_DATA_SKIP_REASON,
  TERRAIN_HOST,
  mapState,
  markerInSafeArea,
  openLayers,
  openMap,
  routeTerrain,
  watchFraming,
} from './map-helpers';
import { isolatedTest } from './isolated-browser';

/**
 * Interacciones del HUD de Explorar (ADR-0025 §8): filtro por tipo, buscador y herramientas del mapa («Relieve en 3D» y
 * «Capas y leyenda»). Son ISLAS de cliente en un chunk diferido: se espera a que lleguen (`[data-hud-island]`).
 *
 * Lo que se vigila, además de que funcionen: que sean UNA vez cada una (selectores únicos de toda la suite), que el filtro
 * y la búsqueda NO toquen la URL, que el destino seleccionado nunca desaparezca, que el resultado de la búsqueda sea el
 * carrusel (no una segunda lista), que el relieve de terceros sea opt-in de verdad (cero peticiones a AWS hasta pulsar) y
 * que nada de lo que no existe (ubicación, pantalla completa, «Destacado», cuentas…) aparezca.
 *
 * Las que no necesitan el mapa base no se omiten nunca; las que sí lo necesitan se omiten diciéndolo.
 */
const EXPLORE = PATHS.explore.es;

/**
 * Abre Explorar y espera a las islas del HUD. Estas pruebas no necesitan el mapa dibujado: se le quita el mapa base (404)
 * para que no consuma la CPU de WebGL por software mientras se prueba el filtro y el buscador (lo que sí lo necesita lleva
 * `openMap`, y se omite sin el archivo).
 */
async function openHud(page: Page, path: string = EXPLORE): Promise<void> {
  await page.route('**/data/panama-basemap.pmtiles', (route) =>
    route.fulfill({ status: 404, body: 'sin mapa base en esta prueba' }),
  );
  await page.goto(path);
  // Las cuatro islas llegan tras hidratar y React hidrata por turnos: con la CPU ocupada (tres trabajadores, WebGL por
  // software) la cuarta llegó más de 5 s tarde (3 de 4, dos intentos seguidos). No es un defecto del HUD: es el plazo.
  await expect(page.locator('[data-hud-island]')).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator('li[data-destination] button')).toHaveCount(9);
}

/** Tarjetas del carrusel que SE VEN (las demás siguen en el DOM, con `hidden`). */
const cards = (page: Page) => page.locator('li[data-destination]:visible');
const visibleKeys = async (page: Page): Promise<(string | null)[]> =>
  cards(page).evaluateAll((lis) => lis.map((li) => li.getAttribute('data-destination')));
const chip = (page: Page, name: RegExp) => page.getByRole('button', { name });
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Buscar destinos' });
/** La región `aria-live` del recuento (solo para lectores de pantalla) y su eco visible mientras hay filtro. */
const announcer = (page: Page) => page.locator('[data-hud-island="status"] [role="status"]');
const echo = (page: Page) => page.locator('[data-filter-echo]');
const tools = (page: Page) => page.getByRole('group', { name: 'Herramientas del mapa' });
const threeD = (page: Page) => page.getByRole('button', { name: 'Relieve en 3D' });
/** Plazo (ms) para que `data-pitch` refleje la inclinación: lo fija `idle`, lento con WebGL por software (ver la prueba de «Relieve en 3D»). */
const PITCH_SETTLE_MS = 45_000;
const layersTool = (page: Page) => page.getByRole('button', { name: 'Capas y leyenda' });
const search = (page: Page) => new URL(page.url()).search;

test.describe('filtro por tipo (no necesita el mapa)', () => {
  test('ofrece «Todos» y un botón por cada tipo REAL con su recuento (suman los nueve)', async ({
    page,
  }) => {
    await openHud(page);
    const expected = [
      ['all', 'Todos 9 destinos'],
      ['city', 'Ciudad 1 destino'],
      ['historic_district', 'Distrito histórico 1 destino'],
      ['infrastructure', 'Infraestructura 1 destino'],
      ['locality', 'Localidad 3 destinos'],
      ['volcano', 'Volcán 1 destino'],
      ['archipelago', 'Archipiélago 1 destino'],
      ['island', 'Isla 1 destino'],
    ] as const;
    // En este orden y SOLO estos: «todos» más los siete tipos que existen en el registro
    await expect(page.locator('[data-kind-filter]')).toHaveCount(expected.length);
    for (const [index, [kind, name]] of expected.entries()) {
      const button = page.locator('[data-kind-filter]').nth(index);
      await expect(button).toHaveAttribute('data-kind-filter', kind);
      await expect(button).toHaveAccessibleName(name);
    }
    // Su nombre accesible lleva la frase completa del recuento; «Todos» arranca elegido
    await expect(chip(page, /^Localidad 3 destinos$/)).toHaveAttribute('aria-pressed', 'false');
    await expect(chip(page, /^Todos 9 destinos$/)).toHaveAttribute('aria-pressed', 'true');
    // Cada botón mide al menos 44 px (objetivo táctil del proyecto)
    for (const box of await page.locator('[data-kind-filter]').all()) {
      expect((await box.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    // Sin filtro el DOM es el de siempre: nueve tarjetas, ninguna oculta, y ningún eco ni anuncio
    expect(await visibleKeys(page)).toHaveLength(9);
    await expect(page.locator('li[data-destination][hidden]')).toHaveCount(0);
    await expect(echo(page)).toHaveCount(0);
    await expect(announcer(page)).toHaveText('');
  });

  test('elegir un tipo deja en el carrusel SOLO lo que coincide, lo anuncia y no toca la URL; volver a pulsarlo o «Todos» lo quitan', async ({
    page,
  }) => {
    await openHud(page);
    await chip(page, /^Localidad 3 destinos$/).click();
    expect(await visibleKeys(page)).toEqual(['el-valle-de-anton', 'boquete', 'santa-catalina']);
    // Las otras seis siguen en el DOM (ocultas): el carrusel no cambia de estructura, y sigue habiendo UN enlace por tarjeta
    await expect(page.locator('li[data-destination]')).toHaveCount(9);
    await expect(page.locator('li[data-destination] a')).toHaveCount(9);
    await expect(page.getByRole('button', { name: /^Ver en el mapa: / })).toHaveCount(3);
    await expect(chip(page, /^Localidad 3 destinos$/)).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, /^Todos 9 destinos$/)).toHaveAttribute('aria-pressed', 'false');
    // Se anuncia (lector de pantalla) y se ve (eco); es estado local: la URL no cambia
    await expect(announcer(page)).toHaveText('Se muestran 3 destinos.');
    await expect(echo(page)).toHaveText('Se muestran 3 destinos.');
    expect(search(page)).toBe('');

    // Volver a pulsar el tipo elegido lo quita
    await chip(page, /^Localidad 3 destinos$/).click();
    expect(await visibleKeys(page)).toHaveLength(9);
    await expect(announcer(page)).toHaveText('Se muestran 9 destinos.');
    await expect(echo(page)).toHaveCount(0);

    // Elegir otro tipo REEMPLAZA, no suma; «Todos» lo deshace
    await chip(page, /^Volcán 1 destino$/).click();
    await chip(page, /^Isla 1 destino$/).click();
    expect(await visibleKeys(page)).toEqual(['coiba']);
    await expect(announcer(page)).toHaveText('Se muestra 1 destino.');
    await chip(page, /^Todos 9 destinos$/).click();
    expect(await visibleKeys(page)).toHaveLength(9);
    expect(search(page)).toBe('');
  });

  test('el destino SELECCIONADO nunca se oculta aunque no coincida (y no cuenta como coincidencia); al quitarlo, se va con el filtro', async ({
    page,
  }) => {
    await openHud(page, `${EXPLORE}?d=coiba`);
    await expect(page.locator('#selected-destination-name')).toHaveText('Coiba');
    await chip(page, /^Volcán 1 destino$/).click();
    expect(await visibleKeys(page)).toEqual(['volcan-baru', 'coiba']);
    // El recuento es el de los que COINCIDEN con el filtro (1), no el de las tarjetas que se ven
    await expect(announcer(page)).toHaveText('Se muestra 1 destino.');
    await expect(page.locator('#selected-destination-name')).toBeVisible();
    await expect(
      page
        .locator('li[data-destination="coiba"]')
        .getByRole('button', { name: /Ver en el mapa: Coiba/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    // Quitar la selección: Coiba ya no coincide y desaparece
    await page.getByRole('button', { name: 'Quitar la selección', exact: true }).click();
    await expect.poll(() => visibleKeys(page)).toEqual(['volcan-baru']);
    // Elegir un destino que no coincide (desde la URL, por Atrás/Adelante o un enlace) lo MUESTRA
    await page.evaluate(() => {
      window.history.pushState(null, '', `${window.location.pathname}?d=boquete`);
    });
    await expect.poll(() => visibleKeys(page)).toEqual(['boquete', 'volcan-baru']);
  });

  test('los destinos del carrusel siguen siendo UN enlace y UN botón cada uno con el filtro puesto, y el recuento del título no miente', async ({
    page,
  }) => {
    await openHud(page);
    await chip(page, /^Ciudad 1 destino$/).click();
    await expect(page.locator('li[data-destination]:visible a')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Ciudad de Panamá' })).toBeVisible();
    // El título conserva su recuento total (es un dato del registro); lo filtrado lo dice el eco
    await expect(page.getByRole('heading', { name: /^Destinos/ })).toContainText('(9 destinos)');
  });
});

test.describe('carrusel y estado del filtro (no necesita el mapa)', () => {
  test('las flechas anterior y siguiente desplazan la lista (objetivos de 44 px) y siguen a la lista filtrada', async ({
    page,
  }) => {
    // Con movimiento reducido el desplazamiento es inmediato (sin animación): la prueba no depende de cuánto tarde el equipo
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHud(page);
    const next = page.getByRole('button', { name: 'Destinos siguientes' });
    const previous = page.getByRole('button', { name: 'Destinos anteriores' });
    for (const arrow of [next, previous]) {
      const box = await arrow.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    const scroller = page.locator('[data-hud-zone="carousel"] ul').locator('xpath=..');
    const left = () => scroller.evaluate((el) => el.scrollLeft);
    // El desplazamiento es suave: se espera a que la posición deje de cambiar antes de medirla
    const settled = async (): Promise<number> => {
      let last = -1;
      await expect
        .poll(
          async () => {
            const now = await left();
            const same = now === last;
            last = now;
            return same;
          },
          { intervals: [250], timeout: 10_000 },
        )
        .toBe(true);
      return last;
    };
    // Tras pulsar una flecha la posición cambia (con retraso) y luego se asienta: se espera lo uno y lo otro
    const press = async (arrow: typeof next): Promise<number> => {
      const before = await left();
      await arrow.click();
      await expect.poll(left, { timeout: 10_000 }).not.toBe(before);
      return settled();
    };
    expect(await left()).toBeLessThan(10); // el primer destino queda alineado al inicio (con su holgura de 4 px)
    const first = await press(next);
    expect(first).toBeGreaterThan(100);
    const second = await press(next);
    expect(second).toBeGreaterThan(first);
    expect(await press(previous)).toBeLessThan(second);
    for (let i = 0; i < 4 && (await left()) >= 10; i++) await press(previous);
    expect(await left()).toBeLessThan(10);
    // Una lista nueva (filtrada) empieza por el principio aunque la anterior estuviera desplazada
    expect(await press(next)).toBeGreaterThan(100);
    await chip(page, /^Archipiélago 1 destino$/).click();
    await expect.poll(left).toBeLessThan(10);
    expect(await visibleKeys(page)).toEqual(['bocas-del-toro']);
  });

  test('el filtro NO sobrevive a la visita: al volver a Explorar están los nueve y «Todos» elegido', async ({
    page,
  }) => {
    await openHud(page);
    await chip(page, /^Localidad 3 destinos$/).click();
    await searchBox(page).fill('val');
    expect(await visibleKeys(page)).toEqual(['el-valle-de-anton']);
    await page.getByRole('banner').getByRole('link', { name: 'Destinos' }).click();
    await expect(page).toHaveURL(/\/es\/destinos$/);
    await page.goBack();
    await expect(page.locator('[data-hud-island]')).toHaveCount(4);
    await expect(chip(page, /^Todos 9 destinos$/)).toHaveAttribute('aria-pressed', 'true');
    await expect(searchBox(page)).toHaveValue('');
    expect(await visibleKeys(page)).toHaveLength(9);
  });
});

test.describe('buscador (no necesita el mapa)', () => {
  test('es UN solo role=search con etiqueta visible y nombre propio, y el campo es un buscador', async ({
    page,
  }) => {
    await openHud(page);
    await expect(page.getByRole('search')).toHaveCount(1);
    await expect(page.getByRole('search')).toHaveAccessibleName('Búsqueda de destinos');
    await expect(searchBox(page)).toBeVisible();
    await expect(searchBox(page)).toHaveAttribute('type', 'search');
    await expect(page.locator('label', { hasText: 'Buscar destinos' })).toBeVisible();
    await expect(searchBox(page)).toHaveAttribute('placeholder', 'Nombre del destino');
    expect((await searchBox(page).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    // No hay una segunda lista de resultados: el resultado ES el carrusel
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(page.getByRole('option')).toHaveCount(0);
  });

  test('encuentra sin acentos ni mayúsculas; el resultado ES el carrusel filtrado y se anuncia', async ({
    page,
  }) => {
    await openHud(page);
    await searchBox(page).fill('BARÚ');
    expect(await visibleKeys(page)).toEqual(['volcan-baru']);
    await expect(page.getByRole('button', { name: /^Ver en el mapa: / })).toHaveCount(1);
    await expect(announcer(page)).toHaveText('1 destino coincide con la búsqueda.');
    await expect(echo(page)).toHaveText('1 destino coincide con la búsqueda.');
    expect(search(page)).toBe(''); // estado local: ni `q` ni nada en la URL

    await searchBox(page).fill('volcan baru');
    expect(await visibleKeys(page)).toEqual(['volcan-baru']);
    // Varias coincidencias, en el orden del registro y con el plural
    await searchBox(page).fill('ca');
    const keys = await visibleKeys(page);
    expect(keys.length).toBeGreaterThan(1);
    expect(keys).toEqual(
      [
        'panama-city',
        'casco-antiguo',
        'panama-canal',
        'el-valle-de-anton',
        'boquete',
        'volcan-baru',
        'bocas-del-toro',
        'santa-catalina',
        'coiba',
      ].filter((k) => keys.includes(k)),
    );
    await expect(announcer(page)).toHaveText(
      `${String(keys.length)} destinos coinciden con la búsqueda.`,
    );
  });

  test('encuentra por el nombre en OTRO idioma que el de la interfaz, y por clave (nunca por nombre)', async ({
    page,
  }) => {
    await openHud(page); // interfaz en español
    await searchBox(page).fill('Panamakanal'); // alemán
    expect(await visibleKeys(page)).toEqual(['panama-canal']);
    await searchBox(page).fill('panama canal'); // inglés
    expect(await visibleKeys(page)).toContain('panama-canal');

    await openHud(page, PATHS.explore.en);
    await page.getByRole('searchbox', { name: 'Search destinations' }).fill('baru');
    expect(await visibleKeys(page)).toEqual(['volcan-baru']);
    await expect(announcer(page)).toHaveText('1 destination matches the search.');

    await openHud(page, PATHS.explore.de);
    await page.getByRole('searchbox', { name: 'Reiseziele suchen' }).fill('Cañon'); // sin coincidencias
    expect(await visibleKeys(page)).toEqual([]);
    await expect(announcer(page)).toHaveText('Kein Reiseziel passt zur Suche.');
    await page.getByRole('searchbox', { name: 'Reiseziele suchen' }).fill('kanal');
    expect(await visibleKeys(page)).toEqual(['panama-canal']);
  });

  test('Enter con UN resultado lo selecciona (`?d=`); con varios o ninguno no hace nada', async ({
    page,
  }) => {
    await openHud(page);
    await searchBox(page).fill('ca');
    await searchBox(page).press('Enter');
    expect(search(page)).toBe('');
    await searchBox(page).fill('zzz');
    await searchBox(page).press('Enter');
    expect(search(page)).toBe('');

    await searchBox(page).fill('volcan');
    await searchBox(page).press('Enter');
    await expect(page).toHaveURL(/[?&]d=volcan-baru(&|$)/);
    await expect(page.locator('#selected-destination-name')).toHaveText('Volcán Barú');
    // El filtro sigue (el destino elegido es el único resultado) y la tarjeta queda marcada
    await expect(page.getByRole('button', { name: 'Ver en el mapa: Volcán Barú' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('Escape y el botón de borrar vacían el campo y devuelven los nueve; sin texto no hay botón', async ({
    page,
  }) => {
    await openHud(page);
    const clear = page.getByRole('button', { name: 'Borrar la búsqueda' });
    await expect(clear).toHaveCount(0);
    await searchBox(page).fill('boq');
    expect(await visibleKeys(page)).toEqual(['boquete']);
    await expect(clear).toBeVisible();
    expect((await clear.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    await searchBox(page).press('Escape');
    await expect(searchBox(page)).toHaveValue('');
    expect(await visibleKeys(page)).toHaveLength(9);
    await expect(announcer(page)).toHaveText('Se muestran 9 destinos.'); // también se anuncia al vaciar
    await expect(clear).toHaveCount(0);

    await searchBox(page).fill('isla');
    await clear.click();
    await expect(searchBox(page)).toHaveValue('');
    await expect(searchBox(page)).toBeFocused(); // el foco vuelve al campo
    expect(await visibleKeys(page)).toHaveLength(9);
  });

  test('se combina con el tipo (intersección) y «ningún resultado» se dice por escrito', async ({
    page,
  }) => {
    await openHud(page);
    await chip(page, /^Localidad 3 destinos$/).click();
    await searchBox(page).fill('val');
    expect(await visibleKeys(page)).toEqual(['el-valle-de-anton']);
    await chip(page, /^Volcán 1 destino$/).click();
    expect(await visibleKeys(page)).toEqual([]);
    await expect(announcer(page)).toHaveText('Ningún destino coincide con el filtro.');
    await expect(echo(page)).toHaveText('Ningún destino coincide con el filtro.');
    // Al escribir de nuevo, el mensaje es el de la búsqueda
    await searchBox(page).fill('zzz');
    await expect(echo(page)).toHaveText('Ningún destino coincide con la búsqueda.');
    await expect(page.locator('li[data-destination]:visible')).toHaveCount(0);
    // Una consulta sin caracteres útiles NO es «ningún resultado»
    await chip(page, /^Todos 9 destinos$/).click();
    await searchBox(page).fill('¡¡');
    expect(await visibleKeys(page)).toHaveLength(9);
    await expect(echo(page)).toHaveCount(0);
  });

  test('con el teclado: Tab llega del buscador al carril, se escribe, Enter elige y Espacio pulsa un tipo', async ({
    page,
  }) => {
    await openHud(page);
    await searchBox(page).focus();
    await page.keyboard.type('boq');
    expect(await visibleKeys(page)).toEqual(['boquete']);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/[?&]d=boquete(&|$)/);
    // Borrar (Tab → botón de borrar, Espacio) y seguir con Tab hasta el primer tipo
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Borrar la búsqueda' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(searchBox(page)).toHaveValue('');
    await searchBox(page).focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-hud-group="filter"] > summary')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(chip(page, /^Todos 9 destinos$/)).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(chip(page, /^Localidad 3 destinos$/)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(chip(page, /^Localidad 3 destinos$/)).toHaveAttribute('aria-pressed', 'true');
    expect(await visibleKeys(page)).toEqual(['el-valle-de-anton', 'boquete', 'santa-catalina']);
    await page.keyboard.press('Enter'); // Enter también activa el botón: lo vuelve a quitar
    await expect(chip(page, /^Localidad 3 destinos$/)).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('herramientas del mapa', () => {
  test('son un grupo con dos botones de 44 px; no hay ubicación ni pantalla completa (ADR-0025 §9)', async ({
    page,
  }) => {
    await openHud(page);
    await expect(tools(page)).toBeVisible();
    for (const button of [threeD(page), layersTool(page)]) {
      const box = await button.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    // El texto visible del 3D está CONTENIDO en su nombre accesible (WCAG 2.5.3)
    await expect(threeD(page)).toHaveText('3D');
    await expect(threeD(page)).toHaveAccessibleName(/3D/);
    await expect(threeD(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(layersTool(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.getByRole('button', { name: /ubicaci|pantalla completa|location|fullscreen/i }),
    ).toHaveCount(0);
    // Y lo que el producto NO tiene no aparece (no hay datos, curaduría ni cuentas)
    const text = (await page.locator('main').innerText()).toLowerCase();
    for (const forbidden of [
      'destacado',
      'iniciar sesión',
      'planifica tu viaje',
      'valoraci',
      'reseñ',
      'clima',
      'audioguía',
      'realidad aumentada',
      'hospedaje',
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });

  test('«Capas y leyenda» despliega y pliega los dos grupos (aria-expanded), sigue a sus resúmenes y trae las capas a la vista', async ({
    page,
  }) => {
    await openHud(page);
    // Plegadas por defecto: sus casillas y la leyenda no se ven (el filtro por tipo ocupa el carril)
    await expect(page.getByRole('checkbox', { name: 'Áreas protegidas' })).toBeHidden();
    await expect(page.getByRole('region', { name: 'Leyenda' })).toBeHidden();
    await layersTool(page).click();
    await expect(layersTool(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('checkbox', { name: 'Áreas protegidas' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Leyenda' })).toBeVisible();
    // El carril se desplaza hasta «Capas» (suave, salvo movimiento reducido): el grupo cae DENTRO del carril, no cortado por abajo
    await expect
      .poll(
        async () => {
          const [rail, group] = await Promise.all([
            page.locator('[data-hud-zone="rail"]').boundingBox(),
            page.locator('#hud-group-layers > summary').boundingBox(),
          ]);
          return (
            group !== null &&
            rail !== null &&
            group.y >= rail.y - 1 &&
            group.y + group.height <= rail.y + rail.height + 1
          );
        },
        { timeout: 10_000 },
      )
      .toBe(true);
    await layersTool(page).click();
    await expect(layersTool(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('checkbox', { name: 'Áreas protegidas' })).toBeHidden();

    // Si la persona abre «Capas» con su propio resumen, el botón lo refleja
    await page.locator('#hud-group-layers > summary').click();
    await expect(layersTool(page)).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#hud-group-layers > summary').click();
    await expect(layersTool(page)).toHaveAttribute('aria-expanded', 'false');
    // Con teclado: Enter y Espacio
    await layersTool(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('checkbox', { name: 'Áreas protegidas' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox', { name: 'Áreas protegidas' })).toBeHidden();
  });

  isolatedTest(
    'el aviso de terceros es UNO solo y se ve aunque el grupo «Capas» esté plegado (también al venir en el enlace)',
    async ({ page }) => {
      await routeTerrain(page, 'ok'); // sin salir a AWS de verdad
      await page.goto(`${EXPLORE}?l=protectedAreas,hillshade`);
      await expect(page.locator('[data-map-status]')).toHaveCount(1);
      const notice = page.getByText(
        'Con una capa de relieve activa, Amazon Web Services recibe tu dirección IP',
      );
      await expect(notice).toHaveCount(1);
      await expect(notice).toBeVisible();
      await expect(page.locator('#hud-group-layers')).not.toHaveAttribute('open', '');
      // Es un aviso de estado (role=status), no una alerta
      await expect(
        page.getByRole('status').filter({ hasText: 'Con una capa de relieve activa' }),
      ).toHaveCount(1);
    },
  );
});

test.describe('herramientas del mapa: «Relieve en 3D» con el mapa dibujado', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  isolatedTest(
    'es OPT-IN: sin pulsar, cero peticiones a AWS; al pulsar pide el relieve, escribe `l`, inclina, avisa y se puede apagar',
    async ({ page }) => {
      test.setTimeout(120_000); // el relieve en 3D con WebGL por software es lento
      const watch = watchPage(page);
      const terrain = await routeTerrain(page, 'ok');
      await openMap(page, `${EXPLORE}?d=boquete`);
      await openLayers(page);
      await expect(threeD(page)).toBeEnabled();
      await expect(threeD(page)).toHaveAttribute('aria-pressed', 'false');
      await page.waitForTimeout(1500);
      expect(terrain.requests, 'antes de pulsar: ni un byte a AWS').toEqual([]);
      const notice = page.getByText('Con una capa de relieve activa');
      await expect(notice).toHaveCount(0);
      const before = await mapState(page);
      expect(before.pitch).toBeLessThan(5);

      await threeD(page).click();
      await expect(threeD(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(
        /[?&]l=protectedAreas,boundaries,places,waterways,landcover,hillshade,terrain3d(&|$)/,
      );
      await expect(page).toHaveURL(/[?&]d=boquete(&|$)/); // el destino se conserva
      // Se pide el relieve (solo ahora), con el aviso visible y UNO solo
      await expect.poll(() => terrain.requests.length, { timeout: 20_000 }).toBeGreaterThan(0);
      for (const url of terrain.requests) {
        expect(url).toMatch(new RegExp(`^https://${TERRAIN_HOST}/terrarium/\\d+/\\d+/\\d+\\.png$`));
      }
      await expect(notice).toHaveCount(1);
      await expect(notice).toBeVisible();
      // La casilla «Relieve en 3D» y la de sombreado reflejan lo mismo (una sola fuente: la URL)
      await expect(page.getByRole('checkbox', { name: 'Relieve en 3D' })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Sombreado del relieve' })).toBeChecked();
      // El mapa se inclina (≈ 55°). `data-pitch` se actualiza en `idle`, que con WebGL por software y relieve tarda ≈ 9–11 s en
      // una máquina en reposo (medido, 12 pulsaciones intercaladas contra el build anterior: misma latencia; no es un efecto del
      // HUD). 20 s dejaba un margen de 2× que bajo carga (otra tarea en marcha) se agotaba: el `pitch` «seguía en 0».
      await expect
        .poll(async () => (await mapState(page)).pitch, { timeout: PITCH_SETTLE_MS })
        .toBeGreaterThan(45);
      await expect(page.locator('[data-map-status]')).toHaveAttribute('data-map-status', 'ready');

      // Apagar: vuelve el mapa plano, desaparece el aviso y la URL deja las capas como estaban (el botón había añadido el sombreado)
      await threeD(page).click();
      await expect(threeD(page)).toHaveAttribute('aria-pressed', 'false');
      await expect(page).toHaveURL(
        /[?&]l=protectedAreas,boundaries,places,waterways,landcover(&|$)/,
      );
      await expect(page.getByRole('checkbox', { name: 'Sombreado del relieve' })).not.toBeChecked();
      await expect(notice).toHaveCount(0);
      await expect
        .poll(async () => (await mapState(page)).pitch, { timeout: PITCH_SETTLE_MS })
        .toBeLessThan(5);
      expect(await watch.violations()).toEqual([]);
      expect(watch.errors).toEqual([]);
    },
  );

  isolatedTest(
    'si el sombreado ya estaba activo (lo eligió la persona), apagar el 3D lo CONSERVA',
    async ({ page }) => {
      await routeTerrain(page, 'ok');
      await openMap(page, `${EXPLORE}?l=protectedAreas,boundaries,hillshade`);
      await threeD(page).click();
      await expect(page).toHaveURL(/[?&]l=protectedAreas,boundaries,hillshade,terrain3d(&|$)/);
      await threeD(page).click();
      await expect(page).toHaveURL(/[?&]l=protectedAreas,boundaries,hillshade(&|$)/);
      await expect(threeD(page)).toHaveAttribute('aria-pressed', 'false');
    },
  );

  isolatedTest(
    'con movimiento reducido el cabeceo es inmediato (sin animación) y también llega a ≈ 55°',
    async ({ page }) => {
      test.setTimeout(90_000); // el plazo de `data-pitch` (PITCH_SETTLE_MS) es mayor que el de 30 s por defecto
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await routeTerrain(page, 'ok');
      await openMap(page, EXPLORE);
      await threeD(page).click();
      await expect
        .poll(async () => (await mapState(page)).pitch, { timeout: PITCH_SETTLE_MS })
        .toBeGreaterThan(45);
    },
  );

  isolatedTest(
    'mientras el mapa carga el 3D está apagado y no pide nada; la persona lo activa cuando el mapa está listo',
    async ({ page }) => {
      const terrain = await routeTerrain(page, 'ok');
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/data/panama-basemap.pmtiles', async (route) => {
        await gate;
        await route.continue();
      });
      await page.goto(EXPLORE);
      await expect(page.locator('[data-hud-island]')).toHaveCount(4);
      await expect(page.locator('[data-map-status]')).toHaveAttribute('data-map-status', 'loading');
      await expect(threeD(page)).toBeDisabled();
      await expect(layersTool(page)).toBeEnabled(); // no depende del mapa
      release();
      await expect(page.locator('[data-map-status="ready"]')).toBeVisible({ timeout: 60_000 });
      await expect(threeD(page)).toBeEnabled();
      expect(terrain.requests).toEqual([]);
    },
  );
});

test.describe('filtro por tipo con el mapa dibujado', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  const markers = (page: Page) =>
    page.evaluate(() => ({
      destinations: [...document.querySelectorAll('button[data-destination]')]
        .map((b) => b.getAttribute('data-destination'))
        .sort(),
      clusters: [...document.querySelectorAll('button[data-cluster]')]
        .map((b) => b.getAttribute('data-cluster'))
        .sort(),
    }));

  test('los marcadores siguen al filtro: salen los de los demás tipos y los grupos se recalculan; «Todos» los devuelve', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    await expect(page.locator('[data-hud-island]')).toHaveCount(4);
    const all = await markers(page);
    expect(all.clusters.length, 'control: en la vista inicial hay grupos').toBeGreaterThan(0);

    await chip(page, /^Localidad 3 destinos$/).click();
    await expect
      .poll(async () => (await markers(page)).destinations)
      .toEqual(['boquete', 'el-valle-de-anton', 'santa-catalina']);
    // Las tres localidades ya no se agrupan con el resto: no queda ningún grupo
    expect((await markers(page)).clusters).toEqual([]);

    await chip(page, /^Volcán 1 destino$/).click();
    await expect.poll(async () => (await markers(page)).destinations).toEqual(['volcan-baru']);

    await chip(page, /^Todos 9 destinos$/).click();
    await expect.poll(async () => markers(page)).toEqual(all);
  });

  test('el destino seleccionado conserva su marcador aunque el filtro lo excluya; y la búsqueda también filtra el mapa', async ({
    page,
  }) => {
    await openMap(page, `${EXPLORE}?d=coiba`);
    await expect(page.locator('[data-hud-island]')).toHaveCount(4);
    await chip(page, /^Volcán 1 destino$/).click();
    await expect
      .poll(async () => (await markers(page)).destinations)
      .toEqual(['coiba', 'volcan-baru']);
    await expect(page.locator('button[data-destination="coiba"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Búsqueda: «boq» deja Boquete (y el seleccionado)
    await chip(page, /^Todos 9 destinos$/).click();
    await searchBox(page).fill('boq');
    await expect.poll(async () => (await markers(page)).destinations).toEqual(['boquete', 'coiba']);
    await searchBox(page).press('Escape');
    await expect
      .poll(
        async () =>
          (await markers(page)).destinations.length + (await markers(page)).clusters.length,
      )
      .toBeGreaterThan(2);
  });

  test('elegir un destino filtrado desde el buscador lo encuadra dentro del hueco libre (Enter)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMap(page, EXPLORE);
    await expect(page.locator('[data-hud-island]')).toHaveCount(4);
    await searchBox(page).fill('coiba');
    await searchBox(page).press('Enter');
    await expect(page).toHaveURL(/[?&]d=coiba(&|$)/);
    await expect(page.locator('button[data-destination="coiba"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect
      .poll(async () => (await mapState(page)).zoom, { timeout: 20_000 })
      .toBeGreaterThan(8);
  });
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('no hay buscador, filtro ni herramientas (serían controles sin función); la lista de enlaces sigue entera', async ({
    page,
  }) => {
    await page.goto(EXPLORE);
    await expect(page.locator('li[data-destination] a')).toHaveCount(9);
    await expect(page.locator('[data-hud-island]')).toHaveCount(0);
    await expect(page.getByRole('search')).toHaveCount(0);
    await expect(page.locator('[data-kind-filter]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Relieve en 3D' })).toHaveCount(0);
    await expect(page.getByRole('button')).toHaveCount(0);
    // Las zonas vacías no dejan huecos fantasma: el grupo del filtro y la zona del buscador se retiran
    await expect(page.locator('[data-hud-group="filter"]')).toBeHidden();
    await expect(page.locator('[data-hud-zone="search"]')).toBeHidden();
  });
});

test.describe('el mapa muestra los resultados del filtro y de la búsqueda (r1:V-05; con el mapa)', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  /** ¿El marcador (o el grupo que lo contiene) está dentro del hueco libre del HUD? */
  const inSafeArea = (page: Page, key: string) =>
    page.evaluate((destination) => {
      const safe = document.querySelector('[data-hud-safe]')?.getBoundingClientRect();
      const button = document.querySelector<HTMLElement>(
        `button[data-destination="${destination}"], button[data-cluster*="${destination}"]`,
      );
      const r = button?.getBoundingClientRect();
      if (!safe || !r) return false;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      return x >= safe.left && x <= safe.right && y >= safe.top && y <= safe.bottom;
    }, key);

  test('elegir «Volcán» vuela hasta el volcán y su marcador queda DENTRO del hueco libre (antes el mapa no se movía y el único marcador que quedaba estaba bajo el carril)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page, EXPLORE);
    expect(await inSafeArea(page, 'volcan-baru'), 'de partida está bajo el carril').toBe(false);
    await chip(page, /^Volcán 1 destino$/).click();
    await expect.poll(() => inSafeArea(page, 'volcan-baru'), { timeout: 15_000 }).toBe(true);
    await expect(page.locator('button[data-destination="volcan-baru"]')).toHaveCount(1);
    // El filtro es estado local: la URL sigue sin `d` (no seleccionó nada) aunque la cámara se haya movido
    await expect.poll(() => new URL(page.url()).searchParams.get('d')).toBeNull();
  });

  test('«Todos» devuelve la vista de conjunto; una búsqueda SIN resultados no mueve la cámara', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page, EXPLORE);
    const framings = await watchFraming(page);
    const overview = await mapState(page);
    await chip(page, /^Isla 1 destino$/).click();
    await expect
      .poll(async () => (await mapState(page)).zoom, { timeout: 15_000 })
      .toBeGreaterThan(overview.zoom + 0.5);
    await chip(page, /^Todos 9 destinos$/).click();
    await expect
      .poll(async () => Math.abs((await mapState(page)).zoom - overview.zoom), { timeout: 15_000 })
      .toBeLessThan(0.1);
    // CONTROL: el filtro y «Todos» SÍ piden encuadres (el canal síncrono de `watchFraming` los ve)
    expect(await framings(), 'el filtro y «Todos» encuadran').toBeGreaterThanOrEqual(2);
    // Sin resultados la cámara se queda donde está: ningún encuadre pedido (no depende de `idle`, que con WebGL por software
    // llega tarde) y, ya asentada, la misma cámara
    const before = await mapState(page);
    const framed = await framings();
    await searchBox(page).fill('zzzq');
    await expect(echo(page)).toHaveText('Ningún destino coincide con la búsqueda.');
    await page.waitForTimeout(1200);
    expect(await framings(), 'una búsqueda sin resultados NO pide ningún encuadre').toBe(framed);
    expect(await mapState(page)).toEqual(before);
  });

  test('con un destino elegido, quitar el filtro devuelve la cámara a ESE destino (no al conjunto)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page, `${EXPLORE}?d=boquete`);
    await expect.poll(() => markerInSafeArea(page, 'boquete'), { timeout: 15_000 }).toBe(true);
    const framed = await mapState(page);
    // «Isla» deja Coiba (y el destino elegido, que nunca se oculta): la cámara vuela a lo que queda a la vista
    await chip(page, /^Isla 1 destino$/).click();
    await expect
      .poll(async () => (await mapState(page)).center[0], { timeout: 15_000 })
      .not.toBeCloseTo(framed.center[0], 1);
    // «Todos»: vuelve a Boquete, que sigue elegido (no al conjunto del país)
    await chip(page, /^Todos 9 destinos$/).click();
    await expect.poll(() => markerInSafeArea(page, 'boquete'), { timeout: 15_000 }).toBe(true);
    await expect
      .poll(async () => Math.abs((await mapState(page)).zoom - framed.zoom), { timeout: 15_000 })
      .toBeLessThan(0.2);
  });
});

test.describe('el eco del filtro tiene su sitio y no mueve el carrusel (r1:V-06; no necesita el mapa)', () => {
  test('con un destino elegido, escribir en el buscador no cambia la altura del carrusel y el eco cabe en dos líneas SIN guiones', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHud(page, `${EXPLORE}?d=casco-antiguo`);
    // Sin mapa base el HUD crece UNA línea cuando se sabe que el mapa no está: el carrusel añade «El mapa no está disponible…»
    // (≈ 3 s tras cargar, cuando falla la cabecera del PMTiles). Medir antes de eso hacía que, con la máquina ocupada y el
    // `fill` tardando, la altura «cambiara con la búsqueda» (602 → 580 px) siendo el aviso del mapa. Se espera a él primero.
    await expect(page.locator('#destinations-map-unavailable')).toBeVisible({ timeout: 30_000 });
    const dockTop = () =>
      page
        .locator('[data-hud-zone="carousel"]')
        .evaluate((el) => Math.round(el.getBoundingClientRect().top));
    const before = await dockTop();
    for (const query of ['bo', 'zzzq']) {
      await searchBox(page).fill(query);
      await expect(echo(page)).toBeVisible();
      const geometry = await echo(page).evaluate((el) => {
        const style = getComputedStyle(el);
        const lineHeight = Number.parseFloat(style.lineHeight);
        return {
          lines: Math.round(el.getBoundingClientRect().height / lineHeight),
          hyphens: style.hyphens,
          text: el.textContent ?? '',
        };
      });
      expect(geometry.lines, `«${geometry.text}» en líneas`).toBeLessThanOrEqual(2);
      expect(geometry.hyphens).toBe('manual');
      expect(await dockTop(), `el carrusel no cambia de alto con «${query}»`).toBe(before);
    }
  });
});
