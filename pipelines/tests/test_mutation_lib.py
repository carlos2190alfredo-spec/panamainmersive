"""
Pruebas de `scripts/mutation/lib.py`, la herramienta que decide si las pruebas del repositorio protegen de verdad lo que
dicen proteger. Una revisión independiente del CI encontró que podía dar «0 supervivientes» (código de salida 0) sin
haber probado nada: IDs inexistentes, mutaciones todas INVÁLIDAS, pruebas omitidas contadas como «muertes», un árbol
sucio que salía con el mismo código que «sobrevive alguna», y `git` fallando que se leía como «árbol limpio».

Códigos de salida (README de la herramienta): 0 todas muertas · 1 sobrevive alguna · 2 no se pudo evaluar (uso, árbol
sucio, base no verde) · 3 alguna mutación fue INVÁLIDA y por tanto no se evaluó.
"""

import importlib.util
import json
import signal
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "scripts" / "mutation" / "lib.py"
TARGET = "target.txt"


def git(cwd: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@example.org", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
    )


@pytest.fixture
def repo(tmp_path, monkeypatch):
    """Un repositorio git propio con un archivo a mutar, confirmado."""
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
    git(tmp_path, "init", "-q")
    (tmp_path / TARGET).write_text("x = 1\n", encoding="utf-8")
    git(tmp_path, "add", TARGET)
    git(tmp_path, "commit", "-q", "-m", "base")
    return tmp_path


@pytest.fixture
def lib(repo):
    spec = importlib.util.spec_from_file_location("mutation_lib_under_test", LIB)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ROOT = repo
    return module


def mutation(label="M1 x pasa a 2", old="x = 1", new="x = 2"):
    return (label, TARGET, old, new)


class Runner:
    """Un «conjunto de pruebas» falso: el estado de cada prueba depende del contenido del archivo."""

    def __init__(self, repo: Path, *, when_mutated):
        self.repo, self.when_mutated, self.calls = repo, when_mutated, 0

    def __call__(self):
        self.calls += 1
        mutated = "x = 1" not in (self.repo / TARGET).read_text(encoding="utf-8")
        return self.when_mutated if mutated else {"t1": "passed", "t2": "passed"}


KILLS = {"t1": "failed", "t2": "passed"}
SURVIVES = {"t1": "passed", "t2": "passed"}


def test_todas_muertas_sale_con_0(lib, repo):
    assert lib.main([mutation()], Runner(repo, when_mutated=KILLS), [], min_base=2) == 0


def test_un_superviviente_sale_con_1(lib, repo):
    assert lib.main([mutation()], Runner(repo, when_mutated=SURVIVES), [], min_base=2) == 1


def test_un_id_inexistente_no_da_un_verde_vacio(lib, repo):
    runner = Runner(repo, when_mutated=KILLS)
    code = lib.main([mutation()], runner, ["F99"], min_base=2)
    assert code == 2, "pedir una mutación que no existe NO puede salir con 0 («0 supervivientes»)"
    assert runner.calls == 0, "ni siquiera debe gastar minutos en la base"


def test_sin_mutaciones_que_evaluar_no_es_un_exito(lib, repo):
    assert lib.main([], Runner(repo, when_mutated=KILLS), [], min_base=2) == 2


def test_si_todas_las_mutaciones_son_invalidas_no_sale_con_0(lib, repo):
    inexistente = mutation(old="esto no está en el archivo")
    assert lib.main([inexistente], Runner(repo, when_mutated=KILLS), [], min_base=2) == 3


def test_invalida_y_muerta_sale_con_3_pero_un_superviviente_gana(lib, repo):
    invalida = mutation("M0 ancla rota", old="no existe")
    assert lib.main([invalida, mutation()], Runner(repo, when_mutated=KILLS), [], min_base=2) == 3
    assert lib.main([invalida, mutation()], Runner(repo, when_mutated=SURVIVES), [], min_base=2) == 1


def test_una_prueba_omitida_no_cuenta_como_muerte(lib, repo):
    """Si la mutación (o la infraestructura) hace que las pruebas se OMITAN, nada las mató: no se evaluó."""
    omitidas = {"t1": "skipped", "t2": "skipped"}
    assert lib.main([mutation()], Runner(repo, when_mutated=omitidas), [], min_base=2) == 3


def test_menos_pruebas_que_la_base_es_invalida(lib, repo):
    assert lib.main([mutation()], Runner(repo, when_mutated={"t1": "failed"}), [], min_base=2) == 3


def test_base_roja_sale_con_2(lib, repo):
    assert lib.main([mutation()], lambda: {"t1": "failed", "t2": "passed"}, [], min_base=2) == 2


def test_arbol_sucio_sale_con_2_no_con_1(lib, repo, capsys):
    """`sys.exit("mensaje")` sale con 1: el mismo código que «sobrevive alguna». Un árbol sucio no es un superviviente."""
    (repo / TARGET).write_text("x = 1  # sin guardar\n", encoding="utf-8")
    runner = Runner(repo, when_mutated=KILLS)
    with pytest.raises(SystemExit) as raised:
        lib.main([mutation()], runner, [], min_base=2)
    assert raised.value.code == 2
    assert runner.calls == 0
    assert TARGET in capsys.readouterr().err, "el mensaje va a stderr y nombra el archivo"


def test_un_archivo_sin_confirmar_tambien_cuenta_como_sucio(lib, repo):
    (repo / "nuevo.txt").write_text("x = 1\n", encoding="utf-8")
    with pytest.raises(SystemExit) as raised:
        lib.require_clean(["nuevo.txt"])
    assert raised.value.code == 2


def test_si_git_falla_no_se_lee_como_arbol_limpio(lib, tmp_path_factory, monkeypatch):
    """Fuera de un repositorio `git status` falla (128) con la salida vacía: antes eso se tomaba por «limpio»."""
    fuera = tmp_path_factory.mktemp("sin-git")
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(fuera.parent))
    (fuera / TARGET).write_text("x = 1\n", encoding="utf-8")
    lib_module = importlib.util.module_from_spec(importlib.util.spec_from_file_location("m", LIB))
    lib_module.__spec__.loader.exec_module(lib_module)
    lib_module.ROOT = fuera
    with pytest.raises(SystemExit) as raised:
        lib_module.require_clean([TARGET])
    assert raised.value.code == 2


def test_importar_la_biblioteca_no_instala_manejadores_de_senal():
    """Los manejadores solo se necesitan al mutar; instalarlos al importar rompe Ctrl+C de quien la importe (pytest)."""
    antes = signal.getsignal(signal.SIGINT)
    spec = importlib.util.spec_from_file_location("mutation_lib_import_only", LIB)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert signal.getsignal(signal.SIGINT) is antes


def test_main_deja_los_manejadores_de_senal_como_los_encontro(lib, repo):
    antes = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
    lib.main([mutation()], Runner(repo, when_mutated=KILLS), [], min_base=2)
    assert {sig: signal.getsignal(sig) for sig in antes} == antes


def test_el_archivo_se_restaura_aunque_el_runner_falle(lib, repo):
    def roto():
        if "x = 1" not in (repo / TARGET).read_text(encoding="utf-8"):
            raise RuntimeError("el runner murió con el archivo mutado")
        return {"t1": "passed", "t2": "passed"}

    with pytest.raises(RuntimeError):
        lib.main([mutation()], roto, [], min_base=2)
    assert (repo / TARGET).read_text(encoding="utf-8") == "x = 1\n"


class TestRunVitest:
    def test_un_plazo_agotado_no_se_propaga_como_excepcion(self, lib, monkeypatch):
        def agotado(*args, **kwargs):
            raise subprocess.TimeoutExpired(cmd="vitest", timeout=1)

        monkeypatch.setattr(lib.subprocess, "run", agotado)
        assert lib.run_vitest("unit") == {}

    def test_un_json_truncado_no_se_propaga_como_excepcion(self, lib, monkeypatch):
        def escribe_basura(cmd, **kwargs):
            salida = next(a for a in cmd if a.startswith("--outputFile=")).split("=", 1)[1]
            Path(salida).write_text('{"testResults": [', encoding="utf-8")
            return subprocess.CompletedProcess(cmd, 1)

        monkeypatch.setattr(lib.subprocess, "run", escribe_basura)
        assert lib.run_vitest("unit") == {}

    def test_lee_estado_por_prueba(self, lib, monkeypatch):
        def escribe_resultado(cmd, **kwargs):
            salida = next(a for a in cmd if a.startswith("--outputFile=")).split("=", 1)[1]
            Path(salida).write_text(
                json.dumps(
                    {
                        "testResults": [
                            {
                                "name": "/r/tests/a.test.ts",
                                "assertionResults": [{"fullName": "suite uno", "status": "passed"}],
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            return subprocess.CompletedProcess(cmd, 0)

        monkeypatch.setattr(lib.subprocess, "run", escribe_resultado)
        assert lib.run_vitest("unit") == {"a.test.ts › suite uno": "passed"}


def test_una_seleccion_mezclada_con_un_id_inexistente_se_rechaza_entera(lib, repo):
    """`M1` existe y `F99` no: ejecutar solo `M1` e ignorar `F99` en silencio daría un «0» que no es lo que se pidió."""
    runner = Runner(repo, when_mutated=KILLS)
    assert lib.main([mutation()], runner, ["M1", "F99"], min_base=2) == 2
    assert runner.calls == 0


def test_una_base_incompleta_no_permite_mutar(lib, repo):
    """Una base verde pero con menos pruebas que `min_base` (¿se omitió un archivo?) no demuestra nada."""
    runner = Runner(repo, when_mutated=KILLS)
    assert lib.main([mutation()], runner, [], min_base=5) == 2
    assert runner.calls == 1, "solo la base: no se muta nada"
    assert (repo / TARGET).read_text(encoding="utf-8") == "x = 1\n"


def test_un_ancla_duplicada_es_invalida(lib, repo):
    (repo / TARGET).write_text("x = 1\nx = 1\n", encoding="utf-8")
    git(repo, "commit", "-q", "-am", "dos veces")
    assert lib.main([mutation()], Runner(repo, when_mutated=KILLS), [], min_base=2) == 3


class TestEquivalentes:
    def test_una_equivalente_justificada_no_hace_fallar(self, lib, repo, capsys):
        m = mutation() + ("equivalente", "una segunda barrera ya cubre este caso")
        assert lib.main([m], Runner(repo, when_mutated=SURVIVES), [], min_base=2) == 0
        assert "una segunda barrera ya cubre este caso" in capsys.readouterr().out

    def test_sin_justificacion_escrita_cuenta_como_superviviente(self, lib, repo):
        assert lib.main([mutation() + ("equivalente",)], Runner(repo, when_mutated=SURVIVES), [], min_base=2) == 1
        assert lib.main([mutation() + ("equivalente", "  ")], Runner(repo, when_mutated=SURVIVES), [], min_base=2) == 1

    def test_si_una_marcada_equivalente_muere_no_pasa_nada(self, lib, repo):
        m = mutation() + ("equivalente", "justificación")
        assert lib.main([m], Runner(repo, when_mutated=KILLS), [], min_base=2) == 0


class TestSenales:
    """README: «los archivos se restauran siempre, también con Ctrl+C». Se comprueba con un proceso real y una señal real."""

    SCRIPT = """
import importlib.util, pathlib, sys, time
spec = importlib.util.spec_from_file_location("m", sys.argv[1])
lib = importlib.util.module_from_spec(spec); spec.loader.exec_module(lib)
root = pathlib.Path(sys.argv[2]); lib.ROOT = root
target = root / "target.txt"
def runner():
    if "x = 1" not in target.read_text():
        (root / "mutado").write_text("1")  # aviso: el archivo ya está mutado
        time.sleep(60)
    return {"t1": "passed", "t2": "passed"}
sys.exit(lib.main([("M1 x", "target.txt", "x = 1", "x = 2")], runner, [], min_base=2))
"""

    @pytest.mark.parametrize(("senal", "codigo"), [(signal.SIGINT, 130), (signal.SIGTERM, 143)])
    def test_restaura_el_archivo_y_sale_con_128_mas_la_senal(self, repo, senal, codigo):
        import time

        proc = subprocess.Popen([sys.executable, "-c", self.SCRIPT, str(LIB), str(repo)])
        try:
            deadline = time.time() + 30
            while not (repo / "mutado").exists():
                assert time.time() < deadline and proc.poll() is None, "el proceso no llegó a mutar"
                time.sleep(0.05)
            proc.send_signal(senal)
            assert proc.wait(timeout=30) == codigo
        finally:
            if proc.poll() is None:
                proc.kill()
        assert (repo / TARGET).read_text(encoding="utf-8") == "x = 1\n"


class TestRunPytest:
    JUNIT = (
        '<testsuites><testsuite>'
        '<testcase classname="a.B" name="ok"/>'
        '<testcase classname="a.B" name="roja"><failure message="x"/></testcase>'
        '<testcase classname="a.B" name="rota"><error message="x"/></testcase>'
        '<testcase classname="a.B" name="omitida"><skipped/></testcase>'
        "</testsuite></testsuites>"
    )

    def test_traduce_el_informe_junit_a_estados(self, lib, monkeypatch):
        def escribe(cmd, **kwargs):
            salida = next(a for a in cmd if a.startswith("--junitxml=")).split("=", 1)[1]
            Path(salida).write_text(self.JUNIT, encoding="utf-8")
            return subprocess.CompletedProcess(cmd, 1)

        monkeypatch.setattr(lib.subprocess, "run", escribe)
        assert lib.run_pytest(["x.py"]) == {
            "a.B › ok": "passed",
            "a.B › roja": "failed",
            "a.B › rota": "failed",
            "a.B › omitida": "skipped",
        }

    def test_un_plazo_agotado_o_un_informe_ilegible_dan_un_resultado_vacio(self, lib, monkeypatch):
        def agotado(*args, **kwargs):
            raise subprocess.TimeoutExpired(cmd="pytest", timeout=1)

        monkeypatch.setattr(lib.subprocess, "run", agotado)
        assert lib.run_pytest(["x.py"]) == {}

        def basura(cmd, **kwargs):
            salida = next(a for a in cmd if a.startswith("--junitxml=")).split("=", 1)[1]
            Path(salida).write_text("<testsuites", encoding="utf-8")
            return subprocess.CompletedProcess(cmd, 1)

        monkeypatch.setattr(lib.subprocess, "run", basura)
        assert lib.run_pytest(["x.py"]) == {}
