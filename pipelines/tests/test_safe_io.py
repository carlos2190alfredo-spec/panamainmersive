"""Entradas hostiles: rutas, enlaces, formatos, bombas de compresión y JSON peligroso (docs/security.md)."""
import gzip
import json
import os
from pathlib import Path

import pytest

from pipelines.lib import safe_io
from pipelines.lib.safe_io import UnsafeInputError, iter_jsonl, resolve_inside

LINE = json.dumps({"type": "Feature", "properties": {}, "geometry": None})


def write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


class TestRutas:
    def test_acepta_un_fichero_regular_dentro_del_directorio(self, tmp_path):
        f = write(tmp_path / "a.geojsonl", LINE)
        assert resolve_inside(tmp_path, "a.geojsonl") == f.resolve()

    def test_rechaza_dos_puntos(self, tmp_path):
        write(tmp_path / "a.geojsonl", LINE)
        with pytest.raises(UnsafeInputError, match=r"\.\."):
            resolve_inside(tmp_path, "sub/../a.geojsonl")

    def test_rechaza_ruta_absoluta_fuera(self, tmp_path):
        outside = write(tmp_path.parent / "fuera.geojsonl", LINE)
        base = tmp_path / "base"
        base.mkdir()
        with pytest.raises(UnsafeInputError, match="sale del directorio"):
            resolve_inside(base, str(outside))

    def test_rechaza_un_enlace_simbolico_que_escapa(self, tmp_path):
        base = tmp_path / "base"
        base.mkdir()
        secret = write(tmp_path / "secreto.geojsonl", LINE)
        (base / "enlace.geojsonl").symlink_to(secret)
        with pytest.raises(UnsafeInputError, match="sale del directorio"):
            resolve_inside(base, "enlace.geojsonl")

    def test_acepta_un_enlace_simbolico_que_apunta_dentro(self, tmp_path):
        real = write(tmp_path / "real.geojsonl", LINE)
        (tmp_path / "alias.geojsonl").symlink_to(real)
        assert resolve_inside(tmp_path, "alias.geojsonl") == real.resolve()

    def test_rechaza_directorios_y_ficheros_especiales(self, tmp_path):
        (tmp_path / "carpeta").mkdir()
        with pytest.raises(UnsafeInputError, match="no es un fichero regular"):
            resolve_inside(tmp_path, "carpeta")
        os.mkfifo(tmp_path / "tuberia.geojsonl")  # abrirla bloquearía: se rechaza por tipo, sin abrir
        with pytest.raises(UnsafeInputError, match="no es un fichero regular"):
            resolve_inside(tmp_path, "tuberia.geojsonl")

    def test_rechaza_byte_nulo_e_inexistentes(self, tmp_path):
        with pytest.raises(UnsafeInputError, match="nulo"):
            resolve_inside(tmp_path, "a\x00.geojsonl")
        with pytest.raises(UnsafeInputError, match="no existe"):
            resolve_inside(tmp_path, "nada.geojsonl")


class TestFormatos:
    def test_extension_no_admitida(self, tmp_path):
        f = write(tmp_path / "datos.kml", "<kml/>")
        with pytest.raises(UnsafeInputError, match="formato no admitido"):
            list(iter_jsonl(f))

    def test_xml_con_extension_de_geojsonl_se_rechaza_por_contenido(self, tmp_path):
        f = write(tmp_path / "trampa.geojsonl", '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>')
        with pytest.raises(UnsafeInputError, match="no parece GeoJSONL"):
            list(iter_jsonl(f))

    def test_zip_con_extension_de_geojsonl_se_rechaza(self, tmp_path):
        f = tmp_path / "zip.geojsonl"
        f.write_bytes(b"PK\x03\x04" + b"\x00" * 32)
        with pytest.raises(UnsafeInputError, match="no parece GeoJSONL"):
            list(iter_jsonl(f))

    def test_lee_lineas_validas_y_gz(self, tmp_path):
        plain = write(tmp_path / "a.geojsonl", LINE + "\n\n" + LINE + "\n")
        assert [r.line for r in iter_jsonl(plain)] == [1, 3]
        gz = tmp_path / "b.geojsonl.gz"
        gz.write_bytes(gzip.compress((LINE + "\n").encode()))
        assert [r.error for r in iter_jsonl(gz)] == [None]


class TestLimites:
    def test_bomba_de_compresion(self, tmp_path):
        bomb = tmp_path / "bomba.geojsonl.gz"
        payload = ("{" + " " * 1000 + "}\n").encode() * 6000  # ~6 MB descomprimidos, unos pocos KB comprimidos
        bomb.write_bytes(gzip.compress(payload))
        assert bomb.stat().st_size < 100_000
        with pytest.raises(UnsafeInputError, match="descompresión excesiva"):
            list(iter_jsonl(bomb, max_decompressed_bytes=1_000_000))

    def test_fichero_demasiado_grande(self, tmp_path):
        f = write(tmp_path / "a.geojsonl", LINE * 100)
        with pytest.raises(UnsafeInputError, match="tamaño máximo"):
            list(iter_jsonl(f, max_file_bytes=50))

    def test_linea_gigante(self, tmp_path):
        f = write(tmp_path / "a.geojsonl", '{"x": "' + "a" * 5000 + '"}\n')
        with pytest.raises(UnsafeInputError, match="supera el tamaño máximo"):
            list(iter_jsonl(f, max_line_bytes=1000))

    def test_demasiadas_lineas(self, tmp_path):
        f = write(tmp_path / "a.geojsonl", (LINE + "\n") * 50)
        with pytest.raises(UnsafeInputError, match="demasiadas líneas"):
            list(iter_jsonl(f, max_lines=10))


class TestJsonHostil:
    @pytest.mark.parametrize("constante", ["NaN", "Infinity", "-Infinity"])
    def test_constantes_no_estandar_van_a_cuarentena(self, tmp_path, constante):
        f = write(tmp_path / "a.geojsonl", '{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[' + constante + ',1]]]}}\n')
        (record,) = list(iter_jsonl(f))
        assert record.value is None and record.error and "json.invalid" in record.error

    @pytest.mark.parametrize("profundidad", [5_000, 300_000])
    def test_anidacion_extrema_no_derriba_el_proceso_y_acaba_en_cuarentena(self, tmp_path, profundidad):
        from pipelines.ingest.import_areas import classify

        f = write(tmp_path / "a.geojsonl", "{" + '"a":{' * profundidad + "}" * (profundidad + 1) + "\n")
        (record,) = list(iter_jsonl(f))
        if record.error:  # el analizador se negó (RecursionError → json.too_deep)
            assert record.error == "json.too_deep" or record.error.startswith("json.invalid")
        else:  # lo analizó: la validación posterior debe apartarlo sin recursión
            assert [status for status, _ in classify([record])] == ["quarantine"]

    def test_utf8_invalido_y_json_roto_son_errores_de_linea_no_del_fichero(self, tmp_path):
        f = tmp_path / "a.geojsonl"
        f.write_bytes(b'{"ok": 1}\n{"mal": \xff}\n{"roto":\n' + LINE.encode() + b"\n")
        records = list(iter_jsonl(f))
        assert [r.error is None for r in records] == [True, False, False, True]
        assert records[1].error == "json.not_utf8"


def test_los_topes_por_defecto_son_conservadores():
    assert safe_io.MAX_DECOMPRESSED_BYTES <= 2**30
    assert safe_io.MAX_LINE_BYTES <= 64 * 2**20
