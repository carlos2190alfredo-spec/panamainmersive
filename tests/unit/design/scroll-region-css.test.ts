import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flatten, valueOf } from './css-flat';

/**
 * Contrato de CSS de ScrollRegion (r1:V-14): las sombras que avisan de que una tabla se desplaza. Lo que se vigila es lo
 * que, si cambia, quita el aviso sin que ninguna otra prueba lo note: que solo se pinten cuando el componente lo pide
 * (`data-more-*`), que no tapen ni capturen nada (`pointer-events: none`, sin texto), que no dependan de un color suelto
 * y que sin JavaScript haya un aviso por defecto solo en pantallas estrechas.
 */
const CSS = readFileSync(join(process.cwd(), 'src/components/ScrollRegion.module.css'), 'utf8');
const rules = flatten(CSS);

describe('ScrollRegion.module.css', () => {
  it('las sombras son los dos pseudo-elementos del CONTENEDOR (no se desplazan con la región), ocultos por defecto y sin eventos', () => {
    expect(valueOf(rules, '.root', 'position')).toBe('relative');
    const both = rules.find((r) => r.selector === '.root::before, .root::after');
    expect(both).toBeDefined();
    const d = Object.fromEntries((both?.declarations ?? []).map((x) => [x.prop, x.value]));
    expect(d['display']).toBe('none');
    expect(d['pointer-events']).toBe('none');
    expect(d['position']).toBe('absolute');
    expect(d['content']).toBe("''");
  });

  it('cada sombra solo se muestra cuando queda contenido por ese lado (el componente pone `data-more-start` / `data-more-end`)', () => {
    const shown = rules.find(
      (r) =>
        r.selector === '.root[data-more-start]::before, .root[data-more-end]::after' &&
        r.context.length === 0,
    );
    expect(
      Object.fromEntries((shown?.declarations ?? []).map((x) => [x.prop, x.value]))['display'],
    ).toBe('block');
  });

  it('sin JavaScript (nadie calcula nada) hay un aviso por el final, solo en pantallas estrechas y solo mientras no hay `data-ready`', () => {
    const noScript = rules.find((r) => r.selector === '.root:not([data-ready])::after');
    expect(noScript?.context.join(' ')).toContain('(scripting: none)');
    expect(noScript?.context.join(' ')).toContain('(max-width: 47.99rem)');
    expect(noScript?.declarations.find((d) => d.prop === 'display')?.value).toBe('block');
  });

  it('con colores forzados no se pintan (los degradados no se ven y la región sigue siendo enfocable)', () => {
    const forced = rules.filter((r) => r.context.join(' ').includes('(forced-colors: active)'));
    expect(forced.length).toBeGreaterThan(0);
    for (const r of forced)
      expect(r.declarations.find((d) => d.prop === 'display')?.value).toBe('none');
  });

  it('el color sale de la tinta del tema (o del borde de vidrio): ni un literal de color', () => {
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(valueOf(rules, '.root', '--scroll-shade')).toBe('var(--glass-edge)');
    expect(valueOf(rules, '.root', '--scroll-shade', '@supports')).toContain('var(--color-ink)');
  });

  it('solo propiedades lógicas y la región conserva su desplazamiento propio', () => {
    expect(valueOf(rules, '.scroll', 'overflow-x')).toBe('auto');
    expect(CSS).not.toMatch(
      /(?:^|[\s;{])(?:left|right|top|bottom|width|height|margin-left|margin-right)\s*:/m,
    );
  });
});
