import type { Page } from '@playwright/test';

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

/** Pulsa Tab `tabs` veces y devuelve cuántos elementos enfocados se comprobaron y cuáles quedaron ENTERAMENTE tapados. */
export async function hiddenFocus(
  page: Page,
  tabs: number,
): Promise<{ checked: number; hidden: string[] }> {
  const hidden: string[] = [];
  let checked = 0;
  for (let i = 0; i < tabs; i++) {
    await page.keyboard.press('Tab');
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
