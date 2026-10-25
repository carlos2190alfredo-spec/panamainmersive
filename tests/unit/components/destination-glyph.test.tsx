import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DestinationGlyph } from '@/components/DestinationGlyph';
import { DESTINATION_KINDS, DESTINATIONS } from '@/domains/tourism/destinations';

/**
 * Los siete pictogramas son iconografía DECORATIVA por tipo de destino: `aria-hidden`, sin `<title>` (sería texto en JSX
 * y el nombre ya está en la tarjeta), sin `style=""` (CSP) y sin colores propios (heredan `currentColor`).
 */
const render = (kind: (typeof DESTINATION_KINDS)[number]): string =>
  renderToStaticMarkup(<DestinationGlyph kind={kind} className="g" />);

describe('DestinationGlyph', () => {
  it('hay un pictograma por cada tipo del registro (y todos los tipos se usan)', () => {
    expect(DESTINATION_KINDS).toHaveLength(7);
    expect(new Set(DESTINATIONS.map((d) => d.kind))).toEqual(new Set(DESTINATION_KINDS));
  });

  it.each(DESTINATION_KINDS)(
    '«%s»: decorativo, sin título, sin estilos en línea y sin imagen',
    (kind) => {
      const html = render(kind);
      expect(html.startsWith('<svg ')).toBe(true);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('focusable="false"');
      expect(html).toContain(`data-glyph="${kind}"`);
      expect(html).toContain('class="g"');
      expect(html).not.toMatch(/<(title|desc|text|image|foreignObject|style|script|use)\b/i);
      expect(html).not.toMatch(/\sstyle\s*=/i);
      expect(html).not.toMatch(/\saria-label(ledby)?\s*=/i);
      expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i); // ningún color literal
      expect(html).toContain('currentColor');
      expect((html.match(/<path\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
    },
  );

  it('cada tipo tiene su propio dibujo (no hay dos iguales)', () => {
    const drawings = DESTINATION_KINDS.map((k) => render(k).replace(/data-glyph="[^"]*"/, ''));
    expect(new Set(drawings).size).toBe(DESTINATION_KINDS.length);
  });

  it('la parte de acento usa la clase del módulo (toma --glyph-accent del contenedor)', () => {
    for (const kind of DESTINATION_KINDS) expect(render(kind)).toMatch(/<g class="[^"]*accent/);
    const css = readFileSync(
      join(process.cwd(), 'src/components/DestinationGlyph.module.css'),
      'utf8',
    );
    expect(css).toMatch(/\.accent\s*\{[^}]*color:\s*var\(--glyph-accent,\s*currentcolor\)/);
  });

  it('el componente no contiene un `<title>` ni texto: lo vigila también la prueba global de textos', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/DestinationGlyph.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '') // comentarios de bloque
      .replace(/^\s*\/\/.*$/gm, ''); // comentarios de línea
    expect(source).not.toMatch(/<title\b/);
  });
});
