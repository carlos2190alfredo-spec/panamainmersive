import type { Locator, Page } from '@playwright/test';

/**
 * Criterios de WCAG 2.2 AA que axe NO puede comprobar (necesitan un navegador con maquetación real): 1.4.12 Espaciado
 * del texto y 2.4.11 Foco no oculto (mínimo, nuevo en 2.2). Cada uno lleva una prueba de CONTROL: sin ella un detector
 * que no mide nada daría un verde igual. `<style>` y `style=""` los prohíbe la CSP (`style-src 'self'`): se inyecta una
 * hoja CONSTRUIDA, que no es markup y sí se admite.
 */
export const TEXT_SPACING_CSS =
  '*{line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important}p{margin-bottom:2em !important}';

export async function applyCss(page: Page, css: string): Promise<void> {
  await page.evaluate((text) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }, css);
}

/** Elementos con texto que RECORTAN su contenido (overflow hidden/clip y el contenido no cabe en la caja). */
export async function clippedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('canvas, .maplibregl-map, svg')) continue; // el lienzo del mapa recorta por diseño
      const style = getComputedStyle(el);
      const clipY = ['hidden', 'clip'].includes(style.overflowY);
      const clipX = ['hidden', 'clip'].includes(style.overflowX);
      if (!clipX && !clipY) continue;
      const box = el.getBoundingClientRect();
      const text = (el.textContent ?? '').trim();
      if (box.width < 4 || box.height < 4 || text === '') continue; // utilidades solo para lectores de pantalla
      if (
        (clipY && el.scrollHeight > el.clientHeight + 1) ||
        (clipX && el.scrollWidth > el.clientWidth + 1)
      ) {
        out.push(`${el.tagName} «${text.slice(0, 30)}»`);
      }
    }
    return out;
  });
}

/**
 * Pulsa Tab (o `Shift+Tab`: r:A11Y-1, hacia atrás el destino queda ENCIMA y el navegador lo alinea arriba, bajo lo que esté
 * pegado) `tabs` veces y devuelve cuántos elementos enfocados se comprobaron y cuáles quedaron ENTERAMENTE tapados.
 */
export async function hiddenFocus(
  page: Page,
  tabs: number,
  key: 'Tab' | 'Shift+Tab' = 'Tab',
): Promise<{ checked: number; hidden: string[] }> {
  const hidden: string[] = [];
  let checked = 0;
  for (let i = 0; i < tabs; i++) {
    await page.keyboard.press(key);
    const result = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return null;
      let probes = 0;
      let visible = 0;
      let cover = '';
      for (const fx of [0.1, 0.5, 0.9]) {
        for (const fy of [0.1, 0.5, 0.9]) {
          const x = box.left + box.width * fx;
          const y = box.top + box.height * fy;
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
          probes += 1;
          const top = document.elementFromPoint(x, y);
          if (top && (el.contains(top) || top.contains(el))) visible += 1;
          else if (top && cover === '')
            cover = `${top.tagName}.${String(top.className).split(' ')[0] ?? ''}`;
        }
      }
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName)
        .trim()
        .slice(0, 30);
      const map =
        document.querySelector('[data-map-status]')?.getAttribute('data-map-status') ?? '-';
      return {
        probes,
        visible,
        name: `${el.tagName} «${name}» (arriba ${String(Math.round(box.top))}) tapado por ${cover} · mapa: ${map}`,
      };
    });
    if (result === null || result.probes === 0) continue;
    checked += 1;
    if (result.visible === 0) hidden.push(result.name);
  }
  return { checked, hidden };
}

/**
 * Controles del HUD y nativos del mapa que se TAPAN entre sí (r2:F5: con poca altura o texto agrandado la píldora «Información
 * del mapa» cubría «Relieve en 3D» y «Capas y leyenda»). Mide la parte VISIBLE de cada control (recorta por los ancestros
 * que desplazan: los chips del carril que quedan fuera de su panel no cuentan) y excluye los marcadores del lienzo, que un
 * panel puede tapar por diseño y salen entonces de la tabulación (`inert`). Devuelve una línea por cada par solapado.
 */
export async function controlOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = 'button, a[href], summary, input, select, [role="button"]';
    const controls = [...document.querySelectorAll(selector)].filter((el) => {
      if (el.closest('header, footer')) return false;
      if (el.matches('button[data-destination], button[data-cluster]')) return false;
      if (!el.closest('[data-hud], [data-map-status]')) return false;
      if (el.closest('[inert]')) return false;
      const box = el.getBoundingClientRect();
      return box.width >= 4 && box.height >= 4 && el.checkVisibility();
    });
    const visible = (el: Element) => {
      const box = el.getBoundingClientRect();
      let { left, top, right, bottom } = box;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const style = getComputedStyle(p);
        // `display: contents` (el cuerpo de la hoja en escritorio) no tiene caja: su rectángulo es 0 × 0 y no recorta nada
        if (style.display === 'contents') continue;
        const clipX = style.overflowX !== 'visible';
        const clipY = style.overflowY !== 'visible';
        if (!clipX && !clipY) continue;
        const b = p.getBoundingClientRect();
        if (clipX) {
          left = Math.max(left, b.left);
          right = Math.min(right, b.right);
        }
        if (clipY) {
          top = Math.max(top, b.top);
          bottom = Math.min(bottom, b.bottom);
        }
      }
      return { left, top, right, bottom };
    };
    const name = (el: Element) =>
      (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 32);
    const out: string[] = [];
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i];
        const b = controls[j];
        if (!a || !b || a.contains(b) || b.contains(a)) continue;
        const ra = visible(a);
        const rb = visible(b);
        const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ox > 1 && oy > 1) {
          out.push(
            `«${name(a)}» × «${name(b)}»: ${String(Math.round(ox))}×${String(Math.round(oy))} px`,
          );
        }
      }
    }
    return out;
  });
}

/**
 * Qué ancestros que desplazan RECORTAN POR LOS LADOS el anillo de foco del elemento (r2:N5). El anillo del proyecto mide ≈ 8 px
 * (contorno de 3 px + separación de 2 px + halo de 5 px) y una caja con `overflow` lo recorta si el elemento llega a su borde:
 * los botones de área a todo el ancho lo perdían a izquierda y derecha. Solo el eje horizontal: en el vertical lo que se ve
 * depende de cuánto se haya desplazado la lista. Devuelve una línea por cada ancestro que lo recorta.
 */
export async function focusRingClippedSideways(target: Locator, ring = 8): Promise<string[]> {
  return target.evaluate((node, ringPx) => {
    const box = node.getBoundingClientRect();
    const out: string[] = [];
    for (let p = node.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const style = getComputedStyle(p);
      // `display: contents` (el cuerpo de la hoja en escritorio) no tiene caja: no recorta nada
      if (style.overflowX === 'visible' || style.display === 'contents') continue;
      const b = p.getBoundingClientRect();
      if (box.left - ringPx < b.left - 0.5 || box.right + ringPx > b.right + 0.5) {
        out.push(
          `${p.tagName.toLowerCase()}.${String(p.className).split(' ')[0] ?? ''} recorta el anillo: elemento ${String(Math.round(box.left))}–${String(Math.round(box.right))}, caja ${String(Math.round(b.left))}–${String(Math.round(b.right))}`,
        );
      }
    }
    return out;
  }, ring);
}
