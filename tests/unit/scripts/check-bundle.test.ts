import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `scripts/check-bundle.ts` de punta a punta sobre un `.next` SINTÉTICO. Las funciones puras de `bundle-scan.ts` ya
 * tienen sus pruebas; esto vigila el PEGAMENTO que las convierte en un código de salida: una revisión independiente
 * demostró que la puerta podía dar «OK» sin medir nada (recurso con `?dpl=` → 0 KB, recurso ausente contado como 0,
 * `.mjs` sin escanear, presupuesto `NaN`), y nada comprobaba que el script, no solo sus piezas, lo impidiera.
 *
 * El árbol es de prueba (bytes de relleno), no una medición del producto.
 */
const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts/check-bundle.ts');
const TSX = pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href;

const PAGES = [
  'es.html',
  'es/explore.html',
  'es/destinations.html',
  'es/destinations/ciudad-de-panama.html',
  'es/sources.html',
  'de.html',
];

const page = (script = '<script src="/_next/static/chunks/main.js?dpl=abc" async></script>') =>
  `<html><head><link rel="stylesheet" href="/_next/static/css/app.css?dpl=abc">${script}</head><body></body></html>`;

const MANIFEST = {
  routes: {
    '/es/destinations/ciudad-de-panama': {
      initialRevalidateSeconds: 3600,
      srcRoute: '/[locale]/destinations/[slug]',
    },
    '/sitemap.xml': { initialRevalidateSeconds: 3600, srcRoute: '/sitemap.xml' },
  },
};

interface Tree {
  [relativePath: string]: string;
}

function healthyTree(): Tree {
  const tree: Tree = {
    // Relleno poco comprimible: que el tamaño gzip sea de varios KB y se vea en la tabla (no «0.0 KB»).
    '.next/static/chunks/main.js': `/*${randomBytes(6000).toString('base64')}*/`,
    '.next/static/chunks/map.js': '/* Wrong magic number */'.repeat(10),
    '.next/static/css/app.css': `/*${randomBytes(3000).toString('base64')}*/`,
    '.next/static/media/maplibre-gl.abc123.mjs': 'export default 1;'.repeat(50),
    '.next/static/media/maplibre-gl-worker.abc123.mjs': 'export default 2;'.repeat(50),
    '.next/prerender-manifest.json': JSON.stringify(MANIFEST),
  };
  for (const file of PAGES) tree[`.next/server/app/${file}`] = page();
  return tree;
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function materialize(tree: Tree): string {
  const dir = mkdtempSync(join(tmpdir(), 'pi-check-bundle-'));
  dirs.push(dir);
  for (const [path, contents] of Object.entries(tree)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  return dir;
}

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function run(dir: string, env: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', TSX, SCRIPT],
      { cwd: dir, env: { ...process.env, ...env }, timeout: 60_000 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : -1;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

describe('check-bundle (script completo)', () => {
  it('un build sano pasa y MIDE (los recursos con ?dpl= no dan 0 KB)', async () => {
    const result = await run(materialize(healthyTree()));
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/ficheros de cliente sin nombres/);
    const home = /^home\s+([\d.]+) KB\s+([\d.]+) KB/m.exec(result.stdout);
    expect(home, result.stdout).not.toBeNull();
    expect(Number(home?.[1])).toBeGreaterThan(0);
    expect(Number(home?.[2])).toBeGreaterThan(0);
  });

  it.each([
    ['.js', '.next/static/chunks/main.js'],
    ['.mjs (MapLibre se emite así)', '.next/static/media/maplibre-gl.abc123.mjs'],
    ['.css', '.next/static/css/app.css'],
  ])('un nombre solo-servidor en un %s del cliente FALLA', async (_label, file) => {
    const tree = healthyTree();
    tree[file] = `${tree[file] ?? ''}\n// DATABASE_URL`;
    const result = await run(materialize(tree));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL');
  });

  it('un recurso referenciado que no existe FALLA y se nombra (no cuenta como 0)', async () => {
    const tree = healthyTree();
    tree['.next/server/app/es.html'] = page(
      '<script src="/_next/static/chunks/main.js?dpl=abc"></script><script src="/_next/static/chunks/falta.js?dpl=abc"></script>',
    );
    const result = await run(materialize(tree));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('/_next/static/chunks/falta.js');
  });

  it('una página sin ninguna etiqueta <script src> FALLA (no es «0 KB dentro del presupuesto»)', async () => {
    const tree = healthyTree();
    tree['.next/server/app/es/sources.html'] = page('');
    const result = await run(materialize(tree));
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/fuentes.*<script src>/);
  });

  it('falta una de las páginas medidas FALLA', async () => {
    const tree = healthyTree();
    delete tree['.next/server/app/de.html'];
    const result = await run(materialize(tree));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('de.html');
  });

  it('superar el presupuesto de JS FALLA', async () => {
    const result = await run(materialize(healthyTree()), { JS_BUDGET_KB: '0.001' });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/JS .* KB > presupuesto/);
  });

  it('superar el presupuesto del mapa diferido FALLA', async () => {
    const result = await run(materialize(healthyTree()), { MAP_LAZY_BUDGET_KB: '0.001' });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/el mapa pesa/);
  });

  it.each(['2l0', '0', '-5', 'NaN'])(
    'un presupuesto no válido (JS_BUDGET_KB=%s) detiene la puerta con código 2',
    async (value) => {
      const result = await run(materialize(healthyTree()), { JS_BUDGET_KB: value });
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('JS_BUDGET_KB');
    },
  );

  it('no hay build: código 2 con el aviso', async () => {
    const result = await run(materialize({ 'vacio.txt': '' }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/pnpm build/);
  });

  it('sin ficheros de cliente que escanear FALLA (no es «0 ficheros sin secretos»)', async () => {
    const tree = healthyTree();
    for (const key of Object.keys(tree)) if (key.startsWith('.next/static/')) delete tree[key];
    tree['.next/static/.keep'] = '';
    const result = await run(materialize(tree));
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/ningún fichero de cliente/);
  });

  it('una ficha o un sitemap sin regeneración (revalidate) FALLA', async () => {
    const tree = healthyTree();
    tree['.next/prerender-manifest.json'] = JSON.stringify({
      routes: {
        ...MANIFEST.routes,
        '/sitemap.xml': { initialRevalidateSeconds: false, srcRoute: '/sitemap.xml' },
      },
    });
    const result = await run(materialize(tree));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('sitemap.xml');
  });

  it('sin .next/prerender-manifest.json FALLA', async () => {
    const tree = healthyTree();
    delete tree['.next/prerender-manifest.json'];
    const result = await run(materialize(tree));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('prerender-manifest.json');
  });

  it('menos de 3 ficheros del mapa diferido FALLA (¿cambió la forma de emitirlos?)', async () => {
    const tree = healthyTree();
    delete tree['.next/static/chunks/map.js'];
    const result = await run(materialize(tree));
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/activos del mapa/);
  });
});
