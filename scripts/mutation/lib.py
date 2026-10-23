"""
Pruebas de mutación del repositorio (solo biblioteca estándar de Python; ver README.md).

Una mutación cambia a propósito UNA pieza de código y comprueba que alguna prueba falla. Si ninguna falla, la
garantía que esa pieza daba NO está protegida por las pruebas. Reglas que este módulo impone (cada una nació de un
error real durante la Fase 4):
  · la base debe estar VERDE antes de mutar (una base roja «mata» cualquier mutación sin probar nada);
  · el ancla debe existir EXACTAMENTE una vez (si el formateador cambió el texto, la mutación no se aplica);
  · una mutación que rompe algo más (la migración no aplica, no compila) corre menos pruebas que la base y se marca
    INVÁLIDA: no cuenta ni como muerta ni como superviviente;
  · el archivo se restaura SIEMPRE (también ante Ctrl+C) y el árbol debe estar limpio para poder recuperarlo con git.
"""
import atexit
import json
import os
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_originals: dict[Path, str] = {}


def _restore_all() -> None:
    for path, text in list(_originals.items()):
        path.write_text(text, encoding="utf-8")
        _originals.pop(path, None)


atexit.register(_restore_all)
for _sig in (signal.SIGINT, signal.SIGTERM):
    signal.signal(_sig, lambda *_: sys.exit(130))


def require_clean(paths: list[str]) -> None:
    """Ningún archivo a mutar puede tener cambios sin guardar: si el proceso muriera, `git checkout` los recupera."""
    out = subprocess.run(["git", "status", "--porcelain", "--", *paths], cwd=ROOT, capture_output=True, text=True)
    if out.stdout.strip():
        sys.exit("Hay cambios sin comprometer en archivos que se van a mutar; compromételos o guárdalos:\n" + out.stdout)


def run_vitest(project: str, files: list[str] | None = None) -> dict[str, str]:
    """Ejecuta Vitest con reportero JSON y devuelve {nombre completo de la prueba: estado}."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "result.json"
        cmd = ["npx", "vitest", "run", "--project", project, *(files or []), "--reporter=json", f"--outputFile={out}"]
        subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=1800)
        if not out.exists():
            return {}
        data = json.loads(out.read_text(encoding="utf-8"))
    return {
        f"{Path(f['name']).name} › {t['fullName']}": t["status"]
        for f in data["testResults"]
        for t in f["assertionResults"]
    }


def mutate_and_run(path: str, old: str, new: str, runner) -> dict[str, str]:
    full = ROOT / path
    original = full.read_text(encoding="utf-8")
    if original.count(old) != 1:
        raise AnchorError(f"el ancla aparece {original.count(old)} veces (¿cambió el formato?)")
    mutated = original.replace(old, new, 1)
    if mutated == original:
        raise AnchorError("la mutación no cambia nada")
    _originals[full] = original
    full.write_text(mutated, encoding="utf-8")
    try:
        return runner()
    finally:
        full.write_text(original, encoding="utf-8")
        _originals.pop(full, None)


class AnchorError(Exception):
    pass


def main(mutations, runner, selection: list[str], *, min_base: int) -> int:
    """`mutations`: (etiqueta, archivo, ancla, reemplazo[, 'reloj']). Devuelve el código de salida (1 si sobreviven)."""
    chosen = [m for m in mutations if not selection or m[0].split()[0] in selection]
    require_clean(sorted({m[1] for m in chosen}))
    base = runner()
    red = [t for t, s in base.items() if s != "passed"]
    print(f"BASE: {len(base)} pruebas, {len(red)} rojas")
    if red or len(base) < min_base:
        print("La base debe ser verde y completa antes de mutar:", red[:3])
        return 2
    survivors, clock = [], []
    for item in chosen:
        label, path, old, new = item[:4]
        clock_dependent = len(item) > 4 and item[4] == "reloj"
        try:
            res = mutate_and_run(path, old, new, runner)
        except AnchorError as error:
            print(f"INVÁLIDA   {label}: {error}")
            continue
        if len(res) < len(base):
            print(f"INVÁLIDA   {label}: solo corrieron {len(res)} de {len(base)} pruebas (la mutación rompió algo más)")
            continue
        killed = [t for t, s in res.items() if s != "passed"]
        print(f"{'MATA     ' if killed else 'SOBREVIVE'}  {label}  ({len(killed)} pruebas fallan)")
        if not killed:
            (clock if clock_dependent else survivors).append(label)
    for label in clock:
        print(f"AVISO (depende del reloj, no se puede falsear `now()`): {label}")
    print(f"\nSOBREVIVEN: {len(survivors)}")
    for label in survivors:
        print("  -", label)
    return 1 if survivors else 0
