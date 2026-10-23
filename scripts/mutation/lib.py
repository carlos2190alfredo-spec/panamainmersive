"""
Pruebas de mutación del repositorio (solo biblioteca estándar de Python; ver README.md).

Una mutación cambia a propósito UNA pieza de código y comprueba que alguna prueba falla. Si ninguna falla, la
garantía que esa pieza daba NO está protegida por las pruebas. Reglas que este módulo impone (cada una nació de un
error real durante la Fase 4):
  · la base debe estar VERDE antes de mutar (una base roja «mata» cualquier mutación sin probar nada);
  · el ancla debe existir EXACTAMENTE una vez (si el formateador cambió el texto, la mutación no se aplica);
  · una mutación que rompe algo más (la migración no aplica, no compila) corre menos pruebas que la base y se marca
    INVÁLIDA: no cuenta ni como muerta ni como superviviente;
  · el archivo se restaura SIEMPRE (también ante Ctrl+C) y el árbol debe estar limpio para poder recuperarlo con git;
  · «0 supervivientes» solo se afirma si se EVALUÓ algo: un ID inexistente, una mutación inválida o una prueba omitida
    no pueden terminar en código 0.

Códigos de salida: 0 todas muertas · 1 sobrevive alguna · 2 no se pudo evaluar (uso, árbol sucio, `git` o base no
verde) · 3 alguna mutación fue INVÁLIDA (no se evaluó) y ninguna sobrevivió.
"""
import atexit
import json
import os
import signal
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ElementTree
from pathlib import Path

EXIT_SURVIVORS = 1
EXIT_NOT_EVALUATED = 2
EXIT_INVALID = 3

ROOT = Path(__file__).resolve().parents[2]
_originals: dict[Path, str] = {}


def _restore_all() -> None:
    for path, text in list(_originals.items()):
        path.write_text(text, encoding="utf-8")
        _originals.pop(path, None)


atexit.register(_restore_all)


def _abort(message: str) -> None:
    """Termina con «no se pudo evaluar». `sys.exit("texto")` saldría con 1, el código de «sobrevive alguna»."""
    print(message, file=sys.stderr)
    sys.exit(EXIT_NOT_EVALUATED)


def _on_signal(signum: int, _frame) -> None:
    sys.exit(128 + signum)  # `atexit` restaura los archivos


def require_clean(paths: list[str]) -> None:
    """Ningún archivo a mutar puede tener cambios sin guardar: si el proceso muriera, `git checkout` los recupera."""
    try:
        out = subprocess.run(["git", "status", "--porcelain", "--", *paths], cwd=ROOT, capture_output=True, text=True)
    except OSError as error:
        _abort(f"No se pudo ejecutar git ({error}): sin él no se sabe si se podrá recuperar lo que se muta.")
    if out.returncode != 0:
        # Fuera de un repositorio, `git status` falla con la salida vacía: eso NO es «árbol limpio».
        _abort(f"`git status` falló (código {out.returncode}); sin él no se sabe si el árbol está limpio:\n{out.stderr.strip()}")
    if out.stdout.strip():
        _abort("Hay cambios sin comprometer en archivos que se van a mutar; compromételos o guárdalos:\n" + out.stdout)


def run_vitest(project: str, files: list[str] | None = None) -> dict[str, str]:
    """Ejecuta Vitest con reportero JSON y devuelve {nombre completo de la prueba: estado}."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "result.json"
        cmd = ["npx", "vitest", "run", "--project", project, *(files or []), "--reporter=json", f"--outputFile={out}"]
        try:
            subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=1800)
        except (subprocess.TimeoutExpired, OSError) as error:
            # Sin resultados: la base no se da por válida y una mutación queda INVÁLIDA (no es una muerte).
            print(f"AVISO: Vitest no terminó ({type(error).__name__}).", file=sys.stderr)
            return {}
        if not out.exists():
            return {}
        try:
            data = json.loads(out.read_text(encoding="utf-8"))
            return {
                f"{Path(f['name']).name} › {t['fullName']}": t["status"]
                for f in data["testResults"]
                for t in f["assertionResults"]
            }
        except (ValueError, KeyError, TypeError) as error:
            print(f"AVISO: el informe de Vitest no se pudo leer ({type(error).__name__}).", file=sys.stderr)
            return {}


def run_pytest(files: list[str]) -> dict[str, str]:
    """Ejecuta pytest (el de `.venv` si existe) con informe JUnit y devuelve {prueba: estado}, como `run_vitest`."""
    venv_python = ROOT / ".venv" / "bin" / "python"
    python = str(venv_python) if venv_python.exists() else sys.executable
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "result.xml"
        cmd = [python, "-I", "-m", "pytest", *files, "-q", "-p", "no:cacheprovider", f"--junitxml={out}"]
        try:
            subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=600)
        except (subprocess.TimeoutExpired, OSError) as error:
            print(f"AVISO: pytest no terminó ({type(error).__name__}).", file=sys.stderr)
            return {}
        if not out.exists():
            return {}
        try:
            cases = list(ElementTree.parse(out).getroot().iter("testcase"))
        except ElementTree.ParseError:
            print("AVISO: el informe de pytest no se pudo leer.", file=sys.stderr)
            return {}
    results: dict[str, str] = {}
    for case in cases:
        if case.find("failure") is not None or case.find("error") is not None:
            status = "failed"
        elif case.find("skipped") is not None:
            status = "skipped"
        else:
            status = "passed"
        results[f"{case.get('classname')} › {case.get('name')}"] = status
    return results


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
    """`mutations`: (etiqueta, archivo, ancla, reemplazo[, 'reloj']). Devuelve el código de salida (ver arriba)."""
    known = {m[0].split()[0] for m in mutations}
    unknown = [s for s in selection if s not in known]
    if unknown:
        print(f"No existe(n) la(s) mutación(es): {', '.join(unknown)}. Disponibles: {', '.join(sorted(known))}", file=sys.stderr)
        return EXIT_NOT_EVALUATED
    chosen = [m for m in mutations if not selection or m[0].split()[0] in selection]
    if not chosen:
        print("No hay ninguna mutación que evaluar.", file=sys.stderr)
        return EXIT_NOT_EVALUATED
    previous = {sig: signal.signal(sig, _on_signal) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        return _evaluate(chosen, runner, min_base)
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def _evaluate(chosen, runner, min_base: int) -> int:
    require_clean(sorted({m[1] for m in chosen}))
    base = runner()
    red = [t for t, s in base.items() if s != "passed"]
    print(f"BASE: {len(base)} pruebas, {len(red)} rojas")
    if red or len(base) < min_base:
        print("La base debe ser verde y completa antes de mutar:", red[:3])
        return EXIT_NOT_EVALUATED
    survivors, clock, invalid, killed_labels = [], [], [], []
    for item in chosen:
        label, path, old, new = item[:4]
        clock_dependent = len(item) > 4 and item[4] == "reloj"
        try:
            res = mutate_and_run(path, old, new, runner)
        except AnchorError as error:
            print(f"INVÁLIDA   {label}: {error}")
            invalid.append(label)
            continue
        if len(res) < len(base):
            print(f"INVÁLIDA   {label}: solo corrieron {len(res)} de {len(base)} pruebas (la mutación rompió algo más)")
            invalid.append(label)
            continue
        omitted = [t for t, s in res.items() if s not in ("passed", "failed")]
        if omitted:
            # Una prueba omitida no «mata»: si la infraestructura falló, todas las mutaciones parecerían muertas.
            print(f"INVÁLIDA   {label}: {len(omitted)} pruebas omitidas o pendientes (no se evaluaron)")
            invalid.append(label)
            continue
        killed = [t for t, s in res.items() if s == "failed"]
        print(f"{'MATA     ' if killed else 'SOBREVIVE'}  {label}  ({len(killed)} pruebas fallan)")
        if killed:
            killed_labels.append(label)
        else:
            (clock if clock_dependent else survivors).append(label)
    for label in clock:
        print(f"AVISO (depende del reloj, no se puede falsear `now()`): {label}")
    print(f"\nMATAN: {len(killed_labels)} · SOBREVIVEN: {len(survivors)} · INVÁLIDAS: {len(invalid)}")
    for label in survivors:
        print("  - sobrevive:", label)
    for label in invalid:
        print("  - inválida (no evaluada):", label)
    if survivors:
        return EXIT_SURVIVORS
    return EXIT_INVALID if invalid else 0
