/**
 * `pnpm perf:vitals [--runs N] [--json <ruta>]` — línea base de rendimiento de las páginas públicas (docs/performance.md).
 *
 * Mide sobre el build de producción (`next start`), en Chromium con **móvil emulado** (Pixel 5), **CPU ×4** y **red de
 * 10 Mbps / 100 ms RTT** (CDP), con contexto nuevo (caché fría) en cada pasada. Informa la MEDIANA y el rango de N
 * pasadas de FCP, LCP, CLS (ventanas de sesión), TBT aproximado, bytes transferidos (comprimidos) y, en Explorar, el
 * tiempo hasta que el mapa está listo.
 *
 * LO QUE NO ES (y se imprime): no es hardware real ni la red de referencia; la CPU de este equipo no es la de un
 * Android de gama media (se informa una calibración); el mapa se dibuja con WebGL por software (SwiftShader), así que
 * su tiempo NO es representativo. No mide INP (requiere interacción real) ni FPS. No es una puerta: no afirma
 * cumplimiento, solo da números con su contexto.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { chromium, devices, type Browser } from '@playwright/test';
import { launchOptions } from '../../e2e/launch-options';
import { PATHS } from '../../e2e/helpers';
import { exitWith, pickPort, startServer, waitForServer, withTermination } from '../lib/e2e-run';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = Math.max(1, Number(value('--runs') ?? 5));
const JSON_OUT = value('--json');

const CPU_THROTTLE = 4;
const NETWORK = {
  latency: 100,
  downloadThroughput: (10 * 1024 * 1024) / 8,
  uploadThroughput: (10 * 1024 * 1024) / 8,
};

interface Target {
  readonly name: string;
  readonly path: string;
  readonly map?: boolean;
}
const TARGETS: readonly Target[] = [
  { name: 'Inicio (es)', path: PATHS.home.es },
  { name: 'Destinos (es)', path: PATHS.destinations.es },
  { name: 'Ficha de destino (es)', path: PATHS.destination.es },
  { name: 'Ficha de destino (de)', path: PATHS.destination.de },
  { name: 'Fuentes (es)', path: PATHS.sources.es },
  { name: 'Explorar (es)', path: PATHS.explore.es, map: true },
];

const INIT_SCRIPT = `(() => {
  const p = { fcp: null, lcp: null, shifts: [], longtasks: [], mapReady: null };
  window.__perf = p;
  const observe = (type, fn) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch (e) {} };
  observe('paint', (e) => { if (e.name === 'first-contentful-paint') p.fcp = e.startTime; });
  observe('largest-contentful-paint', (e) => { p.lcp = e.startTime; });
  observe('layout-shift', (e) => { if (!e.hadRecentInput) p.shifts.push([e.startTime, e.value]); });
  observe('longtask', (e) => { p.longtasks.push([e.startTime, e.duration]); });
  const check = () => { if (p.mapReady === null && document.querySelector('[data-map-status="ready"]')) p.mapReady = performance.now(); };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-map-status'] });
})();`;

interface Raw {
  fcp: number | null;
  lcp: number | null;
  shifts: [number, number][];
  longtasks: [number, number][];
  mapReady: number | null;
}
interface Sample {
  fcp: number | null;
  lcp: number | null;
  cls: number;
  tbt: number;
  kb: number;
  requests: number;
  mapReady: number | null;
}

/** CLS como lo define web.vitals: la mayor ventana de sesión (huecos < 1 s, duración < 5 s). */
function cumulativeLayoutShift(shifts: [number, number][]): number {
  let best = 0;
  let windowValue = 0;
  let windowStart = 0;
  let last = 0;
  for (const [t, v] of shifts) {
    if (windowValue > 0 && (t - last > 1000 || t - windowStart > 5000)) {
      best = Math.max(best, windowValue);
      windowValue = 0;
    }
    if (windowValue === 0) windowStart = t;
    windowValue += v;
    last = t;
  }
  return Math.max(best, windowValue);
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const range = (xs: number[]): [number, number] => [Math.min(...xs), Math.max(...xs)];

async function main(): Promise<number> {
  if (!existsSync(join(ROOT, '.next/BUILD_ID'))) {
    console.log(
      '\nOMITIDA (no ejecutada): falta el build. Ejecuta `SITE_ENV=development pnpm build`.\n',
    );
    return 0;
  }
  const mapData = existsSync(join(ROOT, 'public/data/panama-basemap.pmtiles'));
  // Puerto libre elegido por el sistema (o el de PERF_PORT, que debe estarlo) y servidor PROPIO verificado: el mismo
  // criterio que los orquestadores de pruebas (scripts/lib/e2e-run.ts).
  const port = await pickPort(process.env.PERF_PORT);
  const server = startServer(
    process.execPath,
    [join(ROOT, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port)],
    { cwd: ROOT, env: { ...process.env, SITE_ENV: 'development' } },
  );
  // Una sola limpieza (servidor Y navegador) aunque la pidan a la vez una señal y el `finally`; sin ella, Ctrl+C dejaba
  // `next start` huérfano y, si fallaba el arranque del navegador, también.
  let opened: Browser | undefined;
  let cleaning: Promise<void> | undefined;
  const cleanup = (): Promise<void> =>
    (cleaning ??= (async () => {
      server.stop();
      await opened?.close();
    })());
  return withTermination(cleanup, async () => {
    const browser = await chromium.launch(launchOptions);
    opened = browser;
    await waitForServer(`http://localhost:${String(port)}/api/health`, 60_000, server);

    // Calibración: tiempo de un bucle fijo SIN limitación de CPU (da la escala de esta máquina).
    const cal = await browser.newPage();
    const calibrationMs = await cal.evaluate(() => {
      const start = performance.now();
      let x = 0;
      for (let i = 0; i < 50_000_000; i++) x += i % 7;
      return Math.round(performance.now() - start + (x < 0 ? 1 : 0));
    });
    await cal.close();

    const results: {
      target: string;
      runs: number;
      fcp: number[];
      lcp: number[];
      cls: number[];
      tbt: number[];
      kb: number[];
      requests: number[];
      mapReady: number[];
      note?: string;
    }[] = [];

    for (const target of TARGETS) {
      if (target.map && !mapData) {
        results.push({
          target: target.name,
          runs: 0,
          fcp: [],
          lcp: [],
          cls: [],
          tbt: [],
          kb: [],
          requests: [],
          mapReady: [],
          note: 'OMITIDA: falta public/data/panama-basemap.pmtiles',
        });
        continue;
      }
      const samples: Sample[] = [];
      for (let run = 0; run < RUNS; run++) {
        const context = await browser.newContext({ ...devices['Pixel 5'] });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETWORK });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
        let bytes = 0;
        let requests = 0;
        cdp.on('Network.loadingFinished', (e: { encodedDataLength: number }) => {
          bytes += e.encodedDataLength;
          requests += 1;
        });
        await page.addInitScript(INIT_SCRIPT);
        await page.goto(`http://localhost:${String(port)}${target.path}`, { waitUntil: 'load' });
        if (target.map) {
          await page
            .waitForFunction(
              () => (window as unknown as { __perf: Raw }).__perf.mapReady !== null,
              null,
              { timeout: 90_000 },
            )
            .catch(() => undefined);
        }
        await page.waitForLoadState('networkidle').catch(() => undefined);
        await page.waitForTimeout(2500); // deja asentar LCP y los cambios tardíos
        const raw = await page.evaluate(() => (window as unknown as { __perf: Raw }).__perf);
        const tbt = raw.longtasks
          .filter(([t]) => raw.fcp !== null && t >= raw.fcp)
          .reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0);
        samples.push({
          fcp: raw.fcp,
          lcp: raw.lcp,
          cls: cumulativeLayoutShift(raw.shifts),
          tbt,
          kb: bytes / 1024,
          requests,
          mapReady: raw.mapReady,
        });
        await context.close();
      }
      const nums = (pick: (s: Sample) => number | null) =>
        samples.map(pick).filter((v): v is number => v !== null);
      results.push({
        target: target.name,
        runs: samples.length,
        fcp: nums((s) => s.fcp),
        lcp: nums((s) => s.lcp),
        cls: nums((s) => s.cls),
        tbt: nums((s) => s.tbt),
        kb: nums((s) => s.kb),
        requests: nums((s) => s.requests),
        mapReady: nums((s) => s.mapReady),
      });
    }

    const version = browser.version();
    const fmt = (xs: number[], digits = 0, unit = '') =>
      xs.length === 0
        ? '—'
        : `${median(xs).toFixed(digits)}${unit} (${range(xs)[0].toFixed(digits)}–${range(xs)[1].toFixed(digits)})`;
    console.log(
      `\nLínea base de rendimiento · ${RUNS} pasadas por página · mediana (mín–máx) · caché fría`,
    );
    console.log(
      `Chromium ${version} · Pixel 5 emulado · CPU ×${CPU_THROTTLE} · red ${(NETWORK.downloadThroughput * 8) / 1024 / 1024} Mbps / ${NETWORK.latency} ms RTT`,
    );
    console.log(
      `Equipo: ${cpus()[0]?.model ?? '?'} ×${cpus().length} · calibración (50 M iteraciones sin limitar): ${calibrationMs} ms · Node ${process.version}\n`,
    );
    console.log(
      '| Página | FCP (ms) | LCP (ms) | CLS | TBT≈ (ms) | Transferido (KB) | Peticiones | Mapa listo (ms) |',
    );
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of results) {
      if (r.note) {
        console.log(`| ${r.target} | ${r.note} |  |  |  |  |  |  |`);
        continue;
      }
      console.log(
        `| ${r.target} | ${fmt(r.fcp)} | ${fmt(r.lcp)} | ${fmt(r.cls, 3)} | ${fmt(r.tbt)} | ${fmt(r.kb)} | ${fmt(r.requests)} | ${fmt(r.mapReady)} |`,
      );
    }
    console.log(
      '\nLÍMITES: emulado, no es hardware ni red reales; la CPU de este equipo no es la de un Android de gama media; el mapa usa WebGL por software (SwiftShader) y su tiempo NO es representativo; TBT es aproximado (tareas largas desde FCP); no se mide INP ni FPS. No es una puerta ni afirma cumplimiento.',
    );
    if (JSON_OUT) {
      writeFileSync(
        JSON_OUT,
        `${JSON.stringify({ runs: RUNS, chromium: version, cpuThrottle: CPU_THROTTLE, network: NETWORK, calibrationMs, node: process.version, results }, null, 2)}\n`,
      );
      console.log(`\nResultados en bruto: ${JSON_OUT}`);
    }
    return 0;
  });
}

exitWith(main);
