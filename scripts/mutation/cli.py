"""
Mutaciones del CLI `pnpm content:export` (argumentos, guardia de host, escritura atómica, códigos de salida) contra su
prueba de extremo a extremo (tests/integration/content-export-cli.test.ts). Uso:  python3 scripts/mutation/cli.py [ID …]
"""
import sys
from lib import main, run_vitest

ARGS = "scripts/content/export-args.ts"
TARGET = "scripts/db/target.ts"
CLI = "scripts/content/export-published.ts"
TESTS = ["tests/integration/content-export-cli.test.ts"]

MUTATIONS = [
    ("A1 parseo tolerante: ignora lo que no entiende", ARGS, "    strict: true,", "    strict: false,"),
    ("A2 --check y --dry-run a la vez se aceptan", ARGS, "if (values.check && values['dry-run']) {", "if (false) {"),
    ("G1 la guardia deja pasar cualquier host", TARGET, "const local = isLocalHost(host.toLowerCase());", "const local = true;"),
    ("G2 URL inválida con el código de «remota»", CLI, "process.exit(target.reason === 'invalid_url' ? 2 : 3);", "process.exit(3);"),
    ("W1 no limpia el temporal si falla el reemplazo", CLI, "      rmSync(tmp, { force: true });\n", ""),
    ("X1 las exclusiones no avisan con el código 4", CLI, "    process.exitCode = 4;", "    process.exitCode = 0;"),
]

if __name__ == "__main__":
    sys.exit(main(MUTATIONS, lambda: run_vitest("integration", TESTS), sys.argv[1:], min_base=10))
