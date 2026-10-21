import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Un `var(--token)` que no existe NO da error en ningún sitio: el navegador descarta la declaración en silencio
 * (un botón sin fondo, un texto sin color). Esta prueba exige que todo token usado sin valor de reserva esté
 * declarado en algún CSS del proyecto.
 */
const ROOT = new URL('../../', import.meta.url).pathname;

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return path.endsWith('.css') ? [path] : [];
  });
}

describe('tokens CSS', () => {
  const files = cssFiles(join(ROOT, 'src'));
  const sources = files.map((file) => ({ file, text: readFileSync(file, 'utf8') }));
  const declared = new Set(
    sources.flatMap(({ text }) =>
      [...text.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1] ?? ''),
    ),
  );

  it('hay CSS que revisar y los tokens base están declarados', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(declared.size).toBeGreaterThan(40);
    expect(declared.has('--color-accent')).toBe(true);
  });

  it('todo `var(--token)` sin valor de reserva usa un token que existe', () => {
    const missing: string[] = [];
    for (const { file, text } of sources) {
      for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) {
        const token = m[1] ?? '';
        if (!declared.has(token)) missing.push(`${file.slice(ROOT.length)}: ${token}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('control positivo: detectaría un token inexistente', () => {
    const sample = '.a { color: var(--color-no-existe); }';
    const used = [...sample.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)].map((m) => m[1] ?? '');
    expect(used.filter((t) => !declared.has(t))).toEqual(['--color-no-existe']);
  });
});
