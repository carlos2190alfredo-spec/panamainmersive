import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { LOCALES, PATHS, type Locale } from './helpers';
import {
  MAP_DATA_PRESENT,
  MAP_DATA_SKIP_REASON,
  TERRAIN_HOST,
  flatTerrainTile,
  mapState,
  markerInSafeArea,
  openMap,
  routeTerrain,
} from './map-helpers';

/**
 * Revisión independiente de la entrega 5j, paso X2: semántica, honestidad y privacidad de Explorar. Cada prueba lleva el
 * hallazgo que fija (r0:F-01, r3:F-01…) y, salvo las del mapa, no necesita el mapa base (se le da un 404 para que no
 * consuma la CPU de WebGL por software); las que lo necesitan se OMITEN diciéndolo (`MAP_DATA_SKIP_REASON`).
 */
const EXPLORE = PATHS.explore.es;
const PMTILES = '**/data/panama-basemap.pmtiles';

/** Los textos REALES de un idioma (los de `messages/*.json`): las pruebas comparan con ellos, no con copias. */
const messages = (locale: Locale): Record<string, Record<string, unknown>> =>
  JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')) as Record<
    string,
    Record<string, unknown>
  >;
const text = (locale: Locale, namespace: string, key: string): string =>
  String(messages(locale)[namespace]?.[key]);

/** Abre Explorar sin mapa base y espera a las islas del HUD. */
async function openHud(page: Page, path: string = EXPLORE): Promise<void> {
  await page.route(PMTILES, (route) =>
    route.fulfill({ status: 404, body: 'sin mapa base en esta prueba' }),
  );
  await page.goto(path);
  await expect(page.locator('[data-hud-island]')).toHaveCount(4);
}

const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Buscar destinos' });
const announcer = (page: Page) => page.locator('[data-hud-island="status"] [role="status"]');
const threeD = (page: Page) => page.getByRole('button', { name: 'Relieve en 3D' });
const visibleKeys = (page: Page) =>
  page
    .locator('li[data-destination]:visible')
    .evaluateAll((lis) => lis.map((li) => li.getAttribute('data-destination')));

test.describe('la insignia de cobertura dice DE QUÉ es (r0:F-01; no necesita el mapa)', () => {
  for (const locale of LOCALES) {
    test(`(${locale}) cada tarjeta del carrusel lleva «Geometría» (texto visible) ANTES del estado`, async ({
      page,
    }) => {
      await openHud(page, PATHS.explore[locale]);
      const label = text(locale, 'Coverage', 'geometryLabel');
      const badges = page.locator('li[data-destination] [data-status-labelled]');
      await expect(badges).toHaveCount(9);
      // Una sola ida al navegador: por cada insignia, su rótulo, su estado y cómo se colocan
      const metrics = await badges.evaluateAll((nodes) =>
        nodes.map((node) => {
          const [labelEl, statusEl] = [...node.children];
          const l = labelEl?.getBoundingClientRect();
          const st = statusEl?.getBoundingClientRect();
          return {
            visible: node.getClientRects().length > 0,
            label: labelEl?.textContent?.trim() ?? '',
            first: node.firstElementChild === labelEl,
            status: statusEl?.textContent ?? '',
            fontSize: labelEl ? Number.parseFloat(getComputedStyle(labelEl).fontSize) : 0,
            above: (l?.bottom ?? 0) <= (st?.top ?? 0) + 1,
            beside: (l?.right ?? 0) <= (st?.left ?? 0) + 1,
          };
        }),
      );
      const states = Object.values(messages(locale).Coverage?.status as Record<string, string>);
      for (const badge of metrics) {
        expect(badge.visible, 'visible, no solo para lectores de pantalla').toBe(true);
        expect(badge.label).toBe(label);
        expect(badge.first, 'el rótulo va ANTES de la insignia en el DOM').toBe(true);
        expect(badge.fontSize, 'el rótulo se lee (≥ 11 px)').toBeGreaterThanOrEqual(11);
        // o está encima o está a su izquierda: nunca detrás ni sin sitio
        expect(badge.above || badge.beside).toBe(true);
        // el estado sigue siendo uno de los reales de ese idioma
        expect(
          states.some((state) => badge.status.includes(state)),
          `«${badge.status}»`,
        ).toBe(true);
      }
    });
  }

  test('el rótulo NO agranda la tarjeta: cabe en la altura del botón «Ver en el mapa» que comparte la fila', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHud(page);
    const sizes = await page
      .locator('li[data-destination]')
      .first()
      .evaluate((li) => {
        const badge = li.querySelector('[data-status-labelled]')?.getBoundingClientRect();
        const action = li.querySelector('button')?.getBoundingClientRect();
        return { badge: badge?.height ?? 0, action: action?.height ?? 0 };
      });
    expect(sizes.action).toBeGreaterThanOrEqual(44);
    expect(sizes.badge).toBeGreaterThan(0);
    expect(sizes.badge).toBeLessThanOrEqual(sizes.action);
  });

  test('la ficha destacada de Explorar también lo lleva; la tabla de la ficha del destino NO lo repite (su fila ya dice «Geometría»)', async ({
    page,
  }) => {
    await openHud(page, `${EXPLORE}?d=coiba`);
    const featured = page.locator('[data-hud-zone="featured"]');
    await expect(featured.locator('[data-status-labelled]')).toHaveCount(1);
    await expect(featured.locator('[data-status-labelled]')).toContainText('Geometría');
    await expect(featured.locator('[data-status-labelled]')).toContainText(/Parcial|Verificada/);
    await page.goto(PATHS.destination.es);
    await expect(page.locator('[data-status-labelled]')).toHaveCount(0);
    await expect(page.locator('[data-status]').first()).toBeVisible();
    await expect(page.getByRole('row', { name: /Geometría/ }).first()).toBeVisible();
  });
});

test.describe('la cabecera de Explorar no ofrece «Abrir el mapa» (r1:V-17; no necesita el mapa)', () => {
  const cta = (page: Page) => page.locator('header a', { hasText: 'Abrir el mapa' });

  test('a 1280 y 1440 px de ancho la llamada roja no se ve en Explorar, y sí en la portada (donde es la entrada al mapa)', async ({
    page,
  }) => {
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await openHud(page);
      await expect(cta(page), `Explorar a ${String(width)}`).toBeHidden();
      await expect(page.getByRole('link', { name: 'Abrir el mapa' })).toHaveCount(0);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PATHS.home.es);
    await expect(cta(page)).toBeVisible();
  });

  test('sigue la navegación: «Explorar» marcada como actual, la marca y el selector de idioma; ningún tabulable es la llamada', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHud(page);
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Explorar' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // el orden de tabulación de la cabecera: lo que se ve, sin el enlace oculto
    const tabbable = await page
      .locator('header')
      .evaluate((header) =>
        [...header.querySelectorAll<HTMLElement>('a[href], button, summary')]
          .filter(
            (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
          )
          .map((el) => (el.textContent ?? '').trim() || el.getAttribute('aria-label') || ''),
      );
    expect(tabbable.some((name) => name.includes('Abrir el mapa'))).toBe(false);
    expect(tabbable.some((name) => name.includes('Explorar'))).toBe(true);
    expect(tabbable.some((name) => name.includes('Destinos'))).toBe(true);
    expect(tabbable.some((name) => name.includes('Fuentes'))).toBe(true);
  });
});

test.describe('los créditos conservan su idioma (r2:F6, WCAG 3.1.2; no necesita el mapa)', () => {
  for (const locale of LOCALES) {
    test(`(${locale}) en el panel de información el crédito de OpenStreetMap y Overture es \`lang="en"\` y el resto del párrafo no`, async ({
      page,
    }) => {
      await openHud(page, PATHS.explore[locale]);
      const result = await page.evaluate(() => {
        const out: { text: string; lang: string | null }[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const value = node.textContent ?? '';
          if (!/contributors/.test(value)) continue; // el crédito literal en inglés (no un nombre propio dentro de una frase)
          const parent = node.parentElement;
          if (!parent || parent.closest('script, noscript')) continue;
          out.push({
            text: value.trim(),
            lang: parent.closest('[lang]')?.getAttribute('lang') ?? null,
          });
        }
        return out;
      });
      expect(result.length, 'hay créditos que comprobar').toBeGreaterThan(0);
      for (const node of result) {
        expect(node.lang, `«${node.text}» sin lang="en"`).toBe('en');
      }
      // …y el texto que los rodea sigue en el idioma de la interfaz (no todo el párrafo se marca como inglés)
      const intro = await page
        .locator('p', { hasText: /contributors/ })
        .first()
        .evaluate((p) => ({
          lang: p.closest('[lang]')?.getAttribute('lang') ?? null,
          marked: p.querySelectorAll('[lang]').length,
        }));
      expect(intro.lang).toBe(locale);
      expect(intro.marked).toBeGreaterThanOrEqual(1);
    });
  }
});

test.describe('el buscador de Explorar (r0:F-05, r3:N-02, r2:N3; no necesita el mapa)', () => {
  test('encuentra por palabras: «Valle Antón», «Canal Panamá» y «Bocas Toro» sin artículos y en cualquier orden', async ({
    page,
  }) => {
    await openHud(page);
    for (const [query, expected] of [
      ['Valle Antón', ['el-valle-de-anton']],
      ['Canal Panamá', ['panama-canal']],
      ['Bocas Toro', ['bocas-del-toro']],
      ['Toro Bocas', ['bocas-del-toro']],
      ['Barú', ['volcan-baru']],
      ['Santa Catalina', ['santa-catalina']],
    ] as const) {
      await searchBox(page).fill(query);
      await expect.poll(() => visibleKeys(page), { message: query }).toEqual(expected);
    }
  });

  test('«Casco Viejo» NO inventa una coincidencia (el registro dice que ese nombre es OTRO lugar) y lo dice por escrito', async ({
    page,
  }) => {
    await openHud(page);
    await searchBox(page).fill('Casco Viejo');
    await expect.poll(() => visibleKeys(page)).toEqual([]);
    await expect(page.locator('[data-filter-echo]')).toHaveText(
      'Ningún destino coincide con la búsqueda.',
    );
    // y la propia página avisa de que solo reconoce los nombres registrados
    await page.goto(PATHS.home.es);
    await expect(page.getByText(/no reconoce otros nombres de uso corriente/)).toBeAttached();
  });

  test('el campo limita lo que se escribe a 80 caracteres, igual que el de la portada (el campo de 100 000 ya no se traga la página)', async ({
    page,
  }) => {
    await openHud(page);
    await expect(searchBox(page)).toHaveAttribute('maxlength', '80');
    await searchBox(page).focus();
    await page.keyboard.insertText('x'.repeat(5000));
    expect(await searchBox(page).inputValue()).toHaveLength(80);
  });

  test('al escribir, el recuento se ANUNCIA una vez, con el resultado final, y no por cada letra (los lectores de pantalla recitaban cada cifra)', async ({
    page,
  }) => {
    await openHud(page);
    await announcer(page).evaluate((region) => {
      const spoken: string[] = [];
      (window as unknown as { __spoken: string[] }).__spoken = spoken;
      new MutationObserver(() => {
        const now = region.textContent ?? '';
        if (now !== '' && spoken.at(-1) !== now) spoken.push(now);
      }).observe(region, { childList: true, characterData: true, subtree: true });
    });
    await searchBox(page).focus();
    // «c», «ca», «can»…: cada letra cambia el recuento (con la espera de teclear a mano, ≈ 60 ms)
    await page.keyboard.type('canal', { delay: 60 });
    await expect(announcer(page)).toHaveText('1 destino coincide con la búsqueda.');
    await page.waitForTimeout(1000);
    const spoken = await page.evaluate(
      () => (window as unknown as { __spoken: string[] }).__spoken,
    );
    expect(spoken).toEqual(['1 destino coincide con la búsqueda.']);
    // el eco VISIBLE sí seguía cada pulsación (es aria-hidden: no se lee)
    await expect(page.locator('[data-filter-echo]')).toHaveText(
      '1 destino coincide con la búsqueda.',
    );
  });
});

test.describe('«Cambiar de idioma conserva…» dice lo que de verdad conserva (r0:F-02; no necesita el mapa)', () => {
  test('conserva destino y capas; el filtro por tipo y la búsqueda NO viajan, y el texto del menú no promete lo contrario', async ({
    page,
  }) => {
    await openHud(page, `${EXPLORE}?d=coiba&l=protectedAreas,boundaries`);
    await page.getByRole('button', { name: /^Localidad/ }).click();
    await expect(page.getByRole('button', { name: /^Localidad/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await searchBox(page).fill('catalina');
    await page.locator('summary').first().click();
    await expect(page.locator('#locale-help')).toHaveText(text('es', 'Language', 'help'));
    await expect(page.locator('#locale-help')).not.toContainText(/filtro/i);
    await page.getByRole('link', { name: 'English' }).click();
    await expect(page).toHaveURL(/\/en\/explore\?d=coiba&l=protectedAreas(,|%2C)boundaries$/);
    // lo que la frase NO promete se pierde, y así debe ser (privacidad: no va a la URL)
    await expect(page.getByRole('button', { name: /^All/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('searchbox', { name: 'Search destinations' })).toHaveValue('');
    await expect(page.locator('li[data-destination]:visible')).toHaveCount(9);
  });

  test('los cinco idiomas dicen «destino, vista del mapa y capas» y ninguno nombra filtros', () => {
    for (const locale of LOCALES) {
      expect(text(locale, 'Language', 'help'), locale).not.toMatch(/filtr|filter/i);
    }
    const home = messages('es').Home as { principles: { languages: { body: string } } };
    expect(home.principles.languages.body).not.toMatch(/lo que estabas viendo/);
  });
});

test.describe('el aviso de privacidad de «Relieve en 3D» llega ANTES de pulsar (r3:F-01; con el mapa)', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  test('el botón se describe con «Amazon Web Services recibirá tu IP»; el aviso se ve al pasar el cursor o enfocar, Escape lo descarta y NO se pide nada a AWS hasta pulsar', async ({
    page,
  }) => {
    // Es una secuencia larga con el mapa dibujado (cursor, Escape, teclado, una espera fija de 1,2 s y el relieve pedido): en
    // la suite completa con tres trabajadores tardó 27,6 s de los 30 s por defecto y, en otra pasada, venció dos veces.
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const terrain = await routeTerrain(page, 'ok');
    await openMap(page, `${EXPLORE}?d=boquete`);
    await expect(threeD(page)).toBeEnabled();
    const notice = page.locator('[data-tool-notice="threeD"]');
    // la descripción accesible SIEMPRE está (también para quien no pasa el cursor)
    await expect(threeD(page)).toHaveAccessibleDescription(/Amazon Web Services.*dirección IP/);
    await expect(notice).toBeHidden(); // y no estorba a la vista hasta que se pide
    // cursor
    await threeD(page).hover();
    await expect(notice).toBeVisible();
    const box = await notice.boundingBox();
    const button = await threeD(page).boundingBox();
    if (!box || !button) throw new Error('sin cajas');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(button.x + 1); // a la izquierda del botón: no lo tapa
    // WCAG 1.4.13: el cursor puede pasar sobre el aviso sin que se cierre
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(notice).toBeVisible();
    // …y Escape lo descarta mientras dure ese cursor; al volver a entrar se rearma
    await page.keyboard.press('Escape');
    await expect(notice).toBeHidden();
    await page.mouse.move(40, 500);
    await threeD(page).hover();
    await expect(notice).toBeVisible();
    // teclado
    await page.mouse.move(40, 500);
    await expect(notice).toBeHidden();
    await threeD(page).focus();
    await expect(notice).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(notice).toBeHidden();
    // hasta aquí NI UN byte a AWS
    await page.waitForTimeout(1200);
    expect(terrain.requests, 'antes de pulsar').toEqual([]);
    // pulsar: se pide el relieve, el aviso previo se retira y el de estado (el de siempre) lo sustituye
    await threeD(page).click();
    // El estado del botón lo lee de la URL (`history.pushState` → `useSearchParams`), que llega a React con retraso cuando la
    // CPU está ocupada por el WebGL por software: 5 s no bastaron en una pasada completa (`aria-pressed` seguía sin ponerse).
    await expect(threeD(page)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
    await expect.poll(() => terrain.requests.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(page.getByText('Con una capa de relieve activa')).toBeVisible();
    await page.mouse.move(40, 500);
    await expect(notice).toBeHidden();
  });

  test('apagar «Relieve en 3D» enseguida tras encenderlo, con la máquina lenta, NO deja que el mapa siga pidiendo teselas a AWS DESPUÉS de apagarlo (r3:F-02)', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    // Cada petición a AWS con su instante (como `routeTerrain`, pero con la hora)
    const tile = flatTerrainTile();
    const requests: { at: number; url: string }[] = [];
    await page.route(`https://${TERRAIN_HOST}/**`, async (route) => {
      requests.push({ at: Date.now(), url: route.request().url() });
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
        body: tile,
      });
    });
    await openMap(page, `${EXPLORE}?d=boquete`);
    await expect(threeD(page)).toBeEnabled();
    // El instante en que la PÁGINA atiende cada pulsación del 3D (no cuando Playwright la envía: con la máquina cargada el
    // clic tarda cientos de ms en atenderse, y medir desde el envío contaba como «tardías» peticiones ya hechas)
    await page.evaluate(() => {
      const times: number[] = [];
      (window as unknown as { __clicks: number[] }).__clicks = times;
      document.addEventListener(
        'click',
        (event) => {
          if (event.target instanceof Element && event.target.closest('button[aria-pressed]')) {
            times.push(performance.timeOrigin + performance.now());
          }
        },
        true,
      );
    });
    // Máquina lenta: el render de React con la URL nueva llega con retraso (≈ 0,5–1 s medido) y, mientras tanto, el relieve
    // seguía encendido en el mapa (y la cámara bajando) pidiendo teselas que ya nadie quería
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    const late: string[] = [];
    for (let cycle = 0; cycle < 6; cycle++) {
      await threeD(page).click();
      await page.waitForTimeout(150);
      await threeD(page).click();
      const offAt = await page.evaluate(
        () => (window as unknown as { __clicks: number[] }).__clicks.at(-1) ?? 0,
      );
      await page.waitForTimeout(1500);
      for (const request of requests)
        if (request.at > offAt)
          late.push(`ciclo ${String(cycle)}: +${String(request.at - offAt)} ms ${request.url}`);
      requests.length = 0;
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await expect(threeD(page)).toHaveAttribute('aria-pressed', 'false');
    expect(
      late,
      'peticiones a AWS DESPUÉS de que la página atendiera la pulsación que lo apaga',
    ).toEqual([]);
  });
});

test.describe('los destinos se reconocen sin pasar el cursor y la etiqueta emergente se puede descartar (r1:V-15, r2:N4; con el mapa)', () => {
  test.skip(!MAP_DATA_PRESENT, MAP_DATA_SKIP_REASON);

  interface Probe {
    key: string;
    inert: boolean;
    pressed: boolean;
    labelShown: boolean;
    labelAuto: boolean;
    box: [number, number, number, number];
    label: [number, number, number, number];
  }

  const probe = (page: Page): Promise<Probe[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button[data-destination]')].map((button) => {
        const label = button.querySelector<HTMLElement>(':scope > span:last-child');
        const b = button.getBoundingClientRect();
        const l = label?.getBoundingClientRect();
        return {
          key: button.dataset.destination ?? '',
          inert: button.closest('[inert]') !== null,
          pressed: button.getAttribute('aria-pressed') === 'true',
          labelShown: label ? getComputedStyle(label).clipPath === 'none' : false,
          labelAuto: button.hasAttribute('data-label-visible'),
          box: [b.left, b.top, b.right, b.bottom] as [number, number, number, number],
          label: [l?.left ?? 0, l?.top ?? 0, l?.right ?? 0, l?.bottom ?? 0] as [
            number,
            number,
            number,
            number,
          ],
        };
      }),
    );

  const overlap = (
    a: [number, number, number, number],
    b: [number, number, number, number],
  ): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

  // A 1920×1080 y no a 1440×900: con el ancla de Santa Catalina corregida (E-106) la vista inicial a 1440 solo deja UN
  // marcador suelto en el hueco libre (El Valle; Santa Catalina quedó bajo el dock, con Coiba) y estas dos pruebas necesitan dos.
  test('a 1920×1080 varios marcadores muestran su nombre solos, dentro del hueco libre y sin tapar ningún otro botón ni etiqueta', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openMap(page, EXPLORE);
    await expect
      .poll(async () => (await probe(page)).filter((p) => p.labelAuto).length, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(2);
    const markers = await probe(page);
    const shown = markers.filter((p) => p.labelShown);
    expect(shown.length).toBeGreaterThanOrEqual(2);
    const safe = await page.locator('[data-hud-safe]').boundingBox();
    if (!safe) throw new Error('sin hueco libre');
    const clusters = await page.evaluate(() =>
      [...document.querySelectorAll('button[data-cluster]')].map((b) => {
        const r = b.getBoundingClientRect();
        return [r.left, r.top, r.right, r.bottom] as [number, number, number, number];
      }),
    );
    for (const marker of shown) {
      expect(marker.inert, `${marker.key}: un marcador inerte no muestra nada`).toBe(false);
      // dentro del hueco libre
      expect(marker.label[0], `${marker.key} izquierda`).toBeGreaterThanOrEqual(safe.x - 1);
      expect(marker.label[2], `${marker.key} derecha`).toBeLessThanOrEqual(safe.x + safe.width + 1);
      expect(marker.label[1], `${marker.key} arriba`).toBeGreaterThanOrEqual(safe.y - 1);
      expect(marker.label[3], `${marker.key} abajo`).toBeLessThanOrEqual(safe.y + safe.height + 1);
      // sin tapar ningún OTRO botón (marcador suelto ni grupo)
      for (const other of markers) {
        if (other.key === marker.key || other.inert) continue;
        expect(overlap(marker.label, other.box), `${marker.key} tapa a ${other.key}`).toBe(false);
      }
      for (const cluster of clusters) {
        expect(overlap(marker.label, cluster), `${marker.key} tapa un grupo`).toBe(false);
      }
    }
    // y nunca dos etiquetas encima una de otra
    for (const a of shown) {
      for (const b of shown) {
        if (a.key < b.key) expect(overlap(a.label, b.label), `${a.key} / ${b.key}`).toBe(false);
      }
    }
    // los que no tienen sitio NO muestran su nombre solos (siguen teniéndolo al pasar el cursor): ninguna etiqueta a medias
    for (const marker of markers.filter((p) => !p.labelShown)) {
      expect(marker.labelAuto, `${marker.key}: sin sitio, sin etiqueta`).toBe(false);
    }
  });

  test('buscar «Panamá» (dos destinos a 6 km) vuela hasta ellos: AMBOS marcadores quedan dentro del hueco libre (antes el mapa acababa en el océano con los dos a 9 000 px)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page, EXPLORE);
    await searchBox(page).fill('Panamá');
    await expect(page.locator('li[data-destination]:visible')).toHaveCount(2);
    await expect.poll(() => markerInSafeArea(page, 'panama-city'), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => markerInSafeArea(page, 'panama-canal'), { timeout: 30_000 }).toBe(true);
    // y es un acercamiento, no el mapa del país
    await expect
      .poll(async () => (await mapState(page)).zoom, { timeout: 30_000 })
      .toBeGreaterThan(11);
  });

  test('Escape descarta la etiqueta que solo se ve por el cursor (1.4.13) y al volver a entrar reaparece; la que se ve por tener sitio no se toca', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 }); // ver la prueba anterior
    await openMap(page, EXPLORE);
    await expect
      .poll(async () => (await probe(page)).filter((p) => p.labelAuto && !p.inert).length, {
        timeout: 20_000,
      })
      .toBeGreaterThanOrEqual(2);
    // La maquetación de etiquetas se repite en cada `idle` del mapa, al cambiar de tamaño una zona del HUD (llegan sus islas) y
    // al llegar la tipografía, y cada pasada REESCRIBE `data-label-visible`: si una llega después de quitárselo a un marcador
    // (abajo), se lo devuelve. Medido a 1920×1080: cinco pasadas en 1,6 s tras `ready`. Se espera a 1,5 s sin ninguna.
    await page.evaluate(() => {
      const w = window as typeof window & { __labelsAt?: number };
      w.__labelsAt = performance.now();
      new MutationObserver(() => {
        w.__labelsAt = performance.now();
      }).observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-label-visible'],
      });
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              performance.now() -
              ((window as typeof window & { __labelsAt?: number }).__labelsAt ?? 0),
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(1_500);
    const [first, second] = (await probe(page)).filter((p) => p.labelAuto && !p.inert);
    if (!first || !second) throw new Error('sin dos etiquetas automáticas');
    const marker = page.locator(`button[data-destination="${first.key}"]`);
    const label = marker.locator(':scope > span:last-child');
    const clip = (locator: typeof label) => locator.evaluate((el) => getComputedStyle(el).clipPath);
    // Un marcador SIN sitio para su etiqueta (lo que pasa cuando otro botón o etiqueta estorba) = sin `data-label-visible`:
    // se le quita ese atributo a este (la medida solo se repite al mover el mapa o al cambiar el tamaño, y la prueba no hace nada de eso)
    await marker.evaluate((el) => {
      el.removeAttribute('data-label-visible');
    });
    await page.mouse.move(700, 450); // fuera de cualquier marcador
    expect(await clip(label), 'sin sitio y sin cursor: oculta').not.toBe('none');
    // emergente: el cursor la muestra
    await marker.hover();
    await expect.poll(() => clip(label)).toBe('none');
    // Escape la descarta MIENTRAS DURE el cursor (1.4.13: descartable sin mover el cursor ni el foco)
    await page.keyboard.press('Escape');
    await expect.poll(() => clip(label), { message: 'Escape la descarta' }).not.toBe('none');
    await expect(marker).toHaveAttribute('data-label-dismissed', '');
    // sale y vuelve a entrar: se rearma y reaparece
    await page.mouse.move(700, 450);
    await marker.hover();
    await expect.poll(() => clip(label)).toBe('none');
    await expect(marker).not.toHaveAttribute('data-label-dismissed', '');
    // la etiqueta que se ve por TENER SITIO no es emergente: Escape con el cursor encima no la oculta
    const other = page.locator(`button[data-destination="${second.key}"]`);
    const otherLabel = other.locator(':scope > span:last-child');
    await other.hover();
    await page.keyboard.press('Escape');
    expect(await clip(otherLabel)).toBe('none');
    await expect(other).not.toHaveAttribute('data-label-dismissed', '');
  });

  test('los créditos del propio mapa (el control de MapLibre) llevan `lang="en"` en cada fragmento de texto (r2:F6)', async ({
    page,
  }) => {
    await openMap(page, EXPLORE);
    const nodes = await page.evaluate(() => {
      const inner = document.querySelector('.maplibregl-ctrl-attrib-inner');
      const out: { text: string; lang: string | null }[] = [];
      if (!inner) return out;
      const walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const value = (node.textContent ?? '').trim();
        if (value === '' || value === '|') continue;
        out.push({
          text: value,
          lang: node.parentElement?.closest('[lang]')?.getAttribute('lang') ?? null,
        });
      }
      return out;
    });
    expect(nodes.length, 'el control de créditos tiene texto').toBeGreaterThan(0);
    for (const node of nodes) expect(node.lang, `«${node.text}»`).toBe('en');
  });
});
