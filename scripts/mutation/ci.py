"""
Mutaciones de las correcciones de orquestación y CI (F4-17): guardas de `check:bundle`, presupuesto de omisiones de los
E2E, piezas comunes de los orquestadores (`e2e-run.ts`), clústeres de prueba (barrido, binarios, señales),
configuraciones de Playwright, `ci.yml`, `package.json` y la propia herramienta de mutación (`lib.py`).

Uso:  python3 scripts/mutation/ci.py [ID …]
Etiquetas: K = funciones de `bundle-scan.ts` · G = pegamento de `check-bundle.ts` · R = `e2e-report.ts` ·
S = `check-e2e-skips.ts` · N = `e2e-run.ts` · C = `pg-cluster.ts` (unitarias) · Q = `pg-cluster.ts` (señales, integración) ·
W = configuraciones de Playwright · Y = `ci.yml` · P = `package.json` · L = `lib.py` (contra pytest).

Cada grupo tiene su ejecutor: TypeScript contra la suite unitaria COMPLETA (las pruebas del pegamento lanzan los scripts
de verdad), los de señales contra su prueba de integración y `lib.py` contra pytest.
"""
import sys

from lib import ROOT, main, run_pytest, run_vitest

BS = "scripts/lib/bundle-scan.ts"
CB = "scripts/check-bundle.ts"
ER = "scripts/lib/e2e-report.ts"
CS = "scripts/check-e2e-skips.ts"
RN = "scripts/lib/e2e-run.ts"
PC = "tests/integration/pg-cluster.ts"
PW = "playwright.config.ts"
PWC = "playwright.content.config.ts"
PWD = "playwright.db.config.ts"
YML = ".github/workflows/ci.yml"
PKG = "package.json"
LIB = "scripts/mutation/lib.py"

TS_MUTATIONS = [
    # --- bundle-scan.ts: presupuestos, rutas y medición --------------------------------------------------------
    ("K1 un presupuesto de 0 es válido", BS, "!Number.isFinite(value) || value <= 0", "!Number.isFinite(value) || value < 0"),
    ("K2 un presupuesto NaN o infinito es válido", BS, "!Number.isFinite(value) || value <= 0", "value <= 0"),
    ("K3 presupuesto vacío no usa el de por defecto", BS, "if (raw === undefined || raw === '') return fallback;", "if (raw === undefined) return fallback;"),
    ("K4 assetPath no quita la consulta ?dpl=", BS, "url.replace(/[?#].*$/, '')", "url.replace(/#.*$/, '')"),
    ("K5 assetPath no quita el prefijo /_next/", BS, ".replace(/^\\/_next\\//, '')", ".replace(/^\\/__next\\//, '')"),
    ("K6 un recurso ausente no se informa", BS, "    else missing.push(url);", "    else bytes += 0;"),
    ("K7 una página sin <script src> no es un problema", BS, "if (assets.js.length === 0) {", "if (false) {"),
    ("K8 un JS medido en 0 bytes no es un problema", BS, "if (js.bytes === 0) problems.push(", "if (false) problems.push("),
    ("K9 un CSS medido en 0 bytes no es un problema", BS, "if (css.bytes === 0) problems.push(", "if (false) problems.push("),
    ("K10 un CSS ausente no se informa", BS, "[...js.missing, ...css.missing]", "[...js.missing]"),
    ("K11 los .mjs no se escanean en busca de secretos", BS, "/\\.(js|mjs|css|map|html|json)$/", "/\\.(js|css|map|html|json)$/"),
    # --- check-bundle.ts: el pegamento que convierte las guardas en un código de salida -------------------------
    ("G1 los problemas de una página no hacen fallar", CB, "  if (problems.length > 0) failed = true;\n", ""),
    ("G2 cero ficheros de cliente no es un fallo", CB, "if (clientFiles.length === 0) {", "if (false) {"),
    ("G3 el escaneo de secretos vuelve a ignorar .mjs", CB, "walk(join(NEXT, 'static'), CLIENT_TEXT_FILES)", "walk(join(NEXT, 'static'), /\\.(js|css|map|html|json)$/)"),
    ("G4 el presupuesto de JS vuelve a ser Number() (NaN)", CB, "const JS_BUDGET_KB = budget('JS_BUDGET_KB', 210);", "const JS_BUDGET_KB = Number(process.env.JS_BUDGET_KB ?? 210);"),
    ("G5 el presupuesto del mapa vuelve a ser Number() (NaN)", CB, "const MAP_LAZY_BUDGET_KB = budget('MAP_LAZY_BUDGET_KB', 500);", "const MAP_LAZY_BUDGET_KB = Number(process.env.MAP_LAZY_BUDGET_KB ?? 500);"),
    ("G6 un presupuesto inválido sale con 0", CB, "    console.error(`FALLO: ${error instanceof Error ? error.message : String(error)}`);\n    process.exit(2);", "    console.error(`FALLO: ${error instanceof Error ? error.message : String(error)}`);\n    process.exit(0);"),
    ("G7 sin build sale con 0", CB, "antes de `pnpm check:bundle`.');\n  process.exit(2);", "antes de `pnpm check:bundle`.');\n  process.exit(0);"),
    ("G8 superar el presupuesto de JS no falla", CB, "  if (js > JS_BUDGET_KB) {", "  if (false) {"),
    ("G9 superar el presupuesto de CSS no falla", CB, "  if (css > CSS_BUDGET_KB) {", "  if (false) {"),
    ("G10 menos de 3 ficheros del mapa no falla", CB, "if (lazyFiles.length < 3) {", "if (lazyFiles.length < 0) {"),
    ("G11 superar el presupuesto del mapa no falla", CB, "if (lazyKb > MAP_LAZY_BUDGET_KB) {", "if (false) {"),
    ("G12 un problema de regeneración (ISR) no falla", CB, "  if (isrProblems.length > 0) failed = true;\n", ""),
    ("G13 `failed` no se traduce en un código de salida", CB, "if (failed) process.exit(1);", "if (failed) process.exit(0);"),
    # --- e2e-report.ts: presupuesto de omisiones ---------------------------------------------------------------
    ("R1 una ejecución sin pruebas que pasen no es un problema", ER, "if (summary.expected === 0) {", "if (false) {"),
    ("R2 los fallos no son un problema", ER, "if (summary.unexpected > 0) problems.push(", "if (false) problems.push("),
    ("R3 las intermitentes no son un problema", ER, "if (summary.flaky > 0) {", "if (false) {"),
    ("R4 los errores globales no son un problema", ER, "if (summary.errors > 0)", "if (false)"),
    ("R5 el presupuesto admite una omitida de más", ER, "if (summary.skipped > options.maxSkipped) {", "if (summary.skipped > options.maxSkipped + 1) {"),
    ("R6 un `stats` incoherente no es un problema", ER, "if (summary.statsMismatch !== null)", "if (false)"),
    ("R7 un presupuesto vacío se acepta como 0", ER, "!/^\\d+$/.test(raw.trim())", "!/^\\d*$/.test(raw.trim())"),
    ("R8 las suites anidadas no se recorren", ER, "      visit(child);", "      void child;"),
    ("R9 las omitidas no se cuentan", ER, "} else if (status === 'skipped') {", "} else if (status === 'skippedX') {"),
    ("R10 el motivo de la omisión no se lee", ER, "annotation.type === 'skip' &&", "annotation.type === 'skipX' &&"),
    # --- check-e2e-skips.ts: pegamento del verificador -----------------------------------------------------------
    ("S1 el verificador sale siempre con 0", CS, "return problems.length > 0 ? 1 : 0;", "return 0;"),
    ("S2 un argumento desconocido sale con 0", CS, "      return 2;\n    }\n  }\n\n  let maxSkipped", "      return 0;\n    }\n  }\n\n  let maxSkipped"),
    ("S3 `--max-skipped=N` se ignora", CS, "rawBudget = arg.slice('--max-skipped='.length);", "rawBudget = rawBudget;"),
    ("S4 la ruta por defecto del informe cambia", CS, "const DEFAULT_REPORT = 'test-results/e2e-report.json';", "const DEFAULT_REPORT = 'test-results/report.json';"),
    # --- e2e-run.ts: piezas comunes de los orquestadores --------------------------------------------------------
    ("N1 CI=false cuenta como CI", RN, "value !== '0' && value !== 'false'", "value !== '0'"),
    ("N2 omitir nunca falla en CI", RN, "  return isCi(env)\n", "  return false\n"),
    ("N3 en CI omitir sale con 0", RN, "? { exitCode: 1, message:", "? { exitCode: 0, message:"),
    ("N4 un puerto pedido y ocupado se acepta", RN, "if (!(await isPortFree(port))) {", "if (false) {"),
    ("N5 un puerto inválido se acepta", RN, "if (!Number.isInteger(port) || port < 1 || port > 65_535) {", "if (false) {"),
    ("N6 el servidor propio caído no se detecta al empezar", RN, "  while (Date.now() < deadline) {\n    if (exited !== undefined) fail();", "  while (Date.now() < deadline) {"),
    ("N7 el servidor propio caído no se detecta tras responder", RN, "      if (response.ok) {\n        if (exited !== undefined) fail();", "      if (response.ok) {"),
    ("N8 la limpieza ante señal puede ejecutarse dos veces", RN, "      if (running) return;\n", ""),
    ("N9 SIGINT sale con 0", RN, "['SIGINT', 130],", "['SIGINT', 0],"),
    ("N10 SIGTERM sale con 0", RN, "['SIGTERM', 143],", "['SIGTERM', 0],"),
    ("N11 la salida del servidor se descarta", RN, "stdio: ['ignore', fd, fd],", "stdio: 'ignore',"),
    ("N12 stopGroup mata solo al líder, no al grupo", RN, "process.kill(-child.pid, signal);", "process.kill(child.pid, signal);"),
    ("N13 el build no se detiene al agotar el plazo", RN, "      stopGroup(child);\n    }, options.timeoutMs);", "    }, options.timeoutMs);"),
    ("N14 un puerto ocupado se da por libre", RN, "server.once('error', () => {\n      resolve(false);", "server.once('error', () => {\n      resolve(true);"),
    # --- pg-cluster.ts: barrido y selección de binarios (unitarias) -----------------------------------------------
    ("C1 el barrido ignora la edad mínima", PC, "      if (age < maxAge) continue;\n", ""),
    ("C2 el barrido mata a quien reutilizó el pid", PC, "const isOurs = line !== null && line.includes(dir);", "const isOurs = line !== null;"),
    ("C3 el barrido mata un clúster vivo y reciente", PC, "          if (age < staleRunning) continue; // vivo y no tan viejo: podría ser una ejecución lenta\n", ""),
    ("C4 el barrido no detiene al postmaster viejo", PC, "          process.kill(pid, 'SIGQUIT'); // parada inmediata del postmaster\n", ""),
    ("C5 el barrido no reconoce los clústeres", PC, "const isCluster = name.startsWith('pi-pg-');", "const isCluster = name.startsWith('pi-xx-');"),
    ("C6 el barrido ignora los registros de servidor", PC, "if (!isCluster && !name.startsWith('pi-e2e-server-')) continue;", "if (!isCluster) continue;"),
    ("C7 se prefiere la versión de PostgreSQL más antigua", PC, ".sort((a, b) => Number(b) - Number(a));", ".sort((a, b) => Number(a) - Number(b));"),
    ("C8 no se exige PostGIS al elegir la versión", PC, "existsSync(join(shareRoot, v, 'extension', 'postgis.control')),", "true,"),
    ("C9 PI_PG_BIN_DIR sin initdb se acepta", PC, "if (existsSync(join(override, 'initdb'))) return override;", "return override;"),
    ("C10 PI_PG_BIN_DIR vacío se toma como una ruta", PC, "if (override !== undefined && override !== '') {", "if (override !== undefined) {"),
    ("C11 sin PostGIS cae al initdb del PATH", PC, "installedWithoutPostgis = installed.length > 0;", "installedWithoutPostgis = false;"),
    # --- Playwright: configuraciones ----------------------------------------------------------------------------
    ("W1 principal: test.only permitido en CI", PW, "  forbidOnly: !!process.env.CI,", "  forbidOnly: false,"),
    ("W2 principal: flaky no falla en CI", PW, "  failOnFlakyTests: !!process.env.CI,", "  failOnFlakyTests: false,"),
    ("W3 contenido: test.only permitido en CI", PWC, "  forbidOnly: !!process.env.CI,", "  forbidOnly: false,"),
    ("W4 contenido: flaky no falla en CI", PWC, "  failOnFlakyTests: !!process.env.CI,", "  failOnFlakyTests: false,"),
    ("W5 con BD: test.only permitido en CI", PWD, "  forbidOnly: !!process.env.CI,", "  forbidOnly: false,"),
    ("W6 con BD: flaky no falla en CI", PWD, "  failOnFlakyTests: !!process.env.CI,", "  failOnFlakyTests: false,"),
    ("W7 principal: sin reintento en CI", PW, "retries: process.env.CI ? 1 : 0,", "retries: 0,"),
    ("W8 principal: sin informe JSON en CI", PW, "? [['list'], ['json', { outputFile: 'test-results/e2e-report.json' }]]", "? [['list']]"),
    # --- ci.yml (guardas textuales) -----------------------------------------------------------------------------
    ("Y1 el job de contenido sin timeout", YML, "    name: E2E de la ficha con contenido verificado (PostgreSQL temporal → exportación → build → Next)\n    runs-on: ubuntu-24.04\n    timeout-minutes: 30\n", "    name: E2E de la ficha con contenido verificado (PostgreSQL temporal → exportación → build → Next)\n    runs-on: ubuntu-24.04\n"),
    ("Y2 el job de tipos y pruebas sin timeout", YML, "    name: Tipos, lint, formato y pruebas unitarias\n    runs-on: ubuntu-24.04\n    timeout-minutes: 20\n", "    name: Tipos, lint, formato y pruebas unitarias\n    runs-on: ubuntu-24.04\n"),
    ("Y3 main también cancela la ejecución en curso", YML, "cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}", "cancel-in-progress: true"),
    ("Y4 ci-ok no espera al job de contenido", YML, "needs: [check, pipelines, integration, e2e, e2e-content]", "needs: [check, pipelines, integration, e2e]"),
    ("Y5 ci-ok no se ejecuta siempre", YML, "    if: ${{ always() }}\n", ""),
    ("Y6 ci-ok acepta un job omitido", YML, " || contains(needs.*.result, 'skipped') }}", " }}"),
    ("Y7 el presupuesto de omisiones no se ejecuta", YML, "        run: pnpm check:e2e-skips\n", "        run: echo omitido\n"),
    ("Y8 las trazas de E2E se suben siempre (también en verde)", YML, "        if: failure()\n        uses: actions/upload-artifact@v4\n        with:\n          name: e2e-test-results\n", "        uses: actions/upload-artifact@v4\n        with:\n          name: e2e-test-results\n"),
    ("Y9 las trazas del job de contenido fallan si no hay ninguna", YML, "          name: e2e-content-test-results\n          path: test-results/\n          if-no-files-found: ignore\n", "          name: e2e-content-test-results\n          path: test-results/\n"),
    ("Y10 el job de contenido no imprime la versión de PostgreSQL", YML, "          /usr/lib/postgresql/16/bin/postgres --version\n      - run: pnpm test:e2e:content\n", "      - run: pnpm test:e2e:content\n"),
    ("Y11 el job de E2E no imprime la versión de Chromium/Playwright", YML, "          pnpm exec playwright --version\n      - run: pnpm build\n", "      - run: pnpm build\n"),
    ("Y12 el nombre del job de E2E vuelve a prometer cobertura total", YML, "    name: Build, presupuesto de bundle y E2E (mapa base NO generado en CI; sus pruebas se omiten con presupuesto)\n", "    name: Compilación, presupuesto de bundle, E2E y accesibilidad\n"),
    # --- package.json ----------------------------------------------------------------------------------------------
    ("P1 typecheck sin los tipos de rutas", PKG, '"typecheck": "next typegen && tsc --noEmit",', '"typecheck": "tsc --noEmit",'),
    ("P2 lint sin los tipos de rutas", PKG, '"lint": "next typegen && eslint .",', '"lint": "eslint .",'),
    ("P3 el E2E de contenido vuelve al CLI de tsx", PKG, '"test:e2e:content": "node --import tsx scripts/e2e-content.ts",', '"test:e2e:content": "tsx scripts/e2e-content.ts",'),
    ("P4 el E2E con BD vuelve al CLI de tsx", PKG, '"test:e2e:db": "node --import tsx scripts/e2e-db.ts",', '"test:e2e:db": "tsx scripts/e2e-db.ts",'),
    ("P5 check sin el lint", PKG, '"check": "pnpm typecheck && pnpm lint && pnpm format && pnpm test",', '"check": "pnpm typecheck && pnpm format && pnpm test",'),
    ("P6 el verificador de omisiones vuelve al CLI de tsx", PKG, '"check:e2e-skips": "node --import tsx scripts/check-e2e-skips.ts",', '"check:e2e-skips": "tsx scripts/check-e2e-skips.ts",'),
]

# Señales de los clústeres: solo las cubre la prueba de integración (lanza un proceso real y le envía SIGINT/SIGTERM).
SIGNAL_MUTATIONS = [
    ("Q1 `stop` falla si el postmaster ya murió", PC, "      if (postmasterAlive()) run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);", "      run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);", "equivalente", "run/runAsync capturan la salida de pg_ctl y el `catch` posterior ya tolera el fallo si el postmaster no vive (`if (postmasterAlive()) throw error`): la comprobación previa solo evita lanzar un proceso, el comportamiento observable es el mismo"),
    ("Q2 `stopAsync` falla si el postmaster ya murió", PC, "      if (postmasterAlive()) await runAsync('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);", "      await runAsync('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);", "equivalente", "run/runAsync capturan la salida de pg_ctl y el `catch` posterior ya tolera el fallo si el postmaster no vive (`if (postmasterAlive()) throw error`): la comprobación previa solo evita lanzar un proceso, el comportamiento observable es el mismo"),
    ("Q3 el clúster no atiende las señales por defecto", PC, "if (options.handleSignals ?? true) {", "if (options.handleSignals ?? false) {"),
]

# La herramienta de mutación contra su propia suite.
LIB_MUTATIONS = [
    ("L1 un ID inexistente se acepta", LIB, "    if unknown:\n", "    if False:\n"),
    ("L2 sin mutaciones se da por buena", LIB, "    if not chosen:\n", "    if False:\n"),
    ("L3 la base roja no impide mutar", LIB, "    if red or len(base) < min_base:", "    if len(base) < min_base:"),
    ("L4 una base incompleta no impide mutar", LIB, "    if red or len(base) < min_base:", "    if red:"),
    ("L5 una prueba omitida cuenta como muerte", LIB, '        omitted = [t for t, s in res.items() if s not in ("passed", "failed")]', "        omitted = []"),
    ("L6 todas INVÁLIDAS sale con 0", LIB, "    return EXIT_INVALID if invalid else 0", "    return 0"),
    ("L7 un superviviente sale con 0", LIB, "        return EXIT_SURVIVORS", "        return 0"),
    ("L8 `git` fallando se lee como árbol limpio", LIB, "    if out.returncode != 0:", "    if False:"),
    ("L9 «no se pudo evaluar» sale con el código de «sobrevive»", LIB, "    sys.exit(EXIT_NOT_EVALUATED)", "    sys.exit(1)"),
    ("L10 menos pruebas que la base no es INVÁLIDA", LIB, "        if len(res) < len(base):", "        if False:"),
    ("L11 un plazo agotado de Vitest se propaga", LIB, "        except (subprocess.TimeoutExpired, OSError) as error:\n            # Sin resultados", "        except OSError as error:\n            # Sin resultados"),
    ("L12 los manejadores de señal no se restauran", LIB, "            signal.signal(sig, handler)", "            pass"),
    ("L13 un ancla duplicada se acepta", LIB, "    if original.count(old) != 1:", "    if original.count(old) < 1:"),
    ("L14 ante una señal el proceso sale con 0", LIB, "    sys.exit(128 + signum)", "    sys.exit(0)"),
]

GROUPS = [
    (TS_MUTATIONS, lambda: run_vitest("unit"), 900),
    (SIGNAL_MUTATIONS, lambda: run_vitest("integration", ["tests/integration/cluster-signals.test.ts"]), 2),
    (LIB_MUTATIONS, lambda: run_pytest(["pipelines/tests/test_mutation_lib.py"]), 20),
]


def ids(mutations) -> set[str]:
    return {m[0].split()[0] for m in mutations}


def run() -> int:
    selection = sys.argv[1:]
    known = set().union(*(ids(g[0]) for g in GROUPS))
    unknown = [s for s in selection if s not in known]
    if unknown:
        print(f"No existe(n) la(s) mutación(es): {', '.join(unknown)}. Disponibles: {', '.join(sorted(known))}", file=sys.stderr)
        return 2
    code = 0
    for mutations, runner, min_base in GROUPS:
        chosen = [s for s in selection if s in ids(mutations)]
        if selection and not chosen:
            continue
        result = main(mutations, runner, chosen, min_base=min_base)
        # Prioridad: 2 (no se pudo evaluar) > 1 (sobrevive alguna) > 3 (inválidas) > 0.
        order = {0: 0, 3: 1, 1: 2, 2: 3}
        if order.get(result, 3) > order.get(code, 3):
            code = result
    return code


if __name__ == "__main__":
    sys.exit(run())
