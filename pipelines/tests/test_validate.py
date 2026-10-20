"""La validación NO repara: lo inválido se informa. Cada prueba busca un riesgo real (docs/gis.md §1)."""
import copy
import re
from pathlib import Path

import pytest

from pipelines.ingest.validate import MAX_VERTICES, WORKING_AREA, validate_polygonal_geometry

ROOT = Path(__file__).resolve().parents[2]


def square(lon=-79.5, lat=8.9, size=0.01):
    return {
        "type": "Polygon",
        "coordinates": [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]],
    }


def codes(geometry):
    return [i.code for i in validate_polygonal_geometry(geometry)]


def test_un_poligono_valido_pasa():
    assert codes(square()) == []


def test_multipoligono_valido_pasa():
    multi = {"type": "MultiPolygon", "coordinates": [square()["coordinates"], square(-80.0, 8.5)["coordinates"]]}
    assert codes(multi) == []


@pytest.mark.parametrize("geometry", [None, [], "texto", 42, {"coordinates": []}])
def test_geometria_ausente_o_mal_formada(geometry):
    assert codes(geometry) == ["geometry.missing"] or codes(geometry) == ["geometry.type_not_allowed"]


@pytest.mark.parametrize("gtype", ["Point", "LineString", "MultiPoint", "GeometryCollection", "Feature"])
def test_solo_se_admiten_poligonos(gtype):
    assert codes({"type": gtype, "coordinates": [0, 0]}) == ["geometry.type_not_allowed"]


def test_corbatin_es_invalido_y_NO_se_repara():
    bowtie = {"type": "Polygon", "coordinates": [[[-79.5, 8.9], [-79.4, 8.8], [-79.4, 8.9], [-79.5, 8.8], [-79.5, 8.9]]]}
    before = copy.deepcopy(bowtie)
    assert codes(bowtie) == ["geometry.invalid"]
    assert bowtie == before  # la entrada no se modifica


def test_anillo_sin_cerrar():
    ring = [[-79.5, 8.9], [-79.4, 8.9], [-79.4, 9.0], [-79.5, 9.0]]
    assert "geometry.ring_not_closed" in codes({"type": "Polygon", "coordinates": [ring + [[-79.45, 8.95]]]})


def test_anillo_demasiado_corto():
    assert codes({"type": "Polygon", "coordinates": [[[-79.5, 8.9], [-79.4, 8.9], [-79.5, 8.9]]]}) == ["geometry.ring_too_short"]


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_coordenadas_no_finitas(bad):
    geometry = square()
    geometry["coordinates"][0][1] = [bad, 8.9]
    assert codes(geometry) == ["geometry.coordinates_not_finite"]


@pytest.mark.parametrize("position", [[True, 8.9], ["-79.5", 8.9], [None, 8.9], [-79.5], [-79.5, 8.9, 100.0]])
def test_posiciones_mal_formadas_o_con_altura(position):
    geometry = square()
    geometry["coordinates"][0][1] = position
    assert codes(geometry) == ["geometry.bad_position"]


def test_ejes_invertidos_se_detectan():
    # (lat, lon) en lugar de (lon, lat): un error clásico que el CHECK de la BD también atraparía.
    swapped = {"type": "Polygon", "coordinates": [[[8.9, -79.5], [8.91, -79.5], [8.91, -79.49], [8.9, -79.49], [8.9, -79.5]]]}
    assert codes(swapped) == ["geometry.axis_order_swapped"]


def test_fuera_de_rango_geografico():
    assert codes(square(lon=200.0)) == ["geometry.out_of_range"]
    assert codes(square(lat=95.0)) == ["geometry.out_of_range"]


def test_fuera_del_area_de_trabajo_de_panama():
    assert codes(square(lon=-3.7, lat=40.4)) == ["geometry.outside_working_area"]  # Madrid


def test_tope_de_vertices_se_aplica_antes_de_construir_nada():
    n = MAX_VERTICES + 50
    ring = [[-79.5 + i * 1e-9, 8.9] for i in range(n)] + [[-79.5, 8.9]]
    assert codes({"type": "Polygon", "coordinates": [ring]}) == ["geometry.too_many_vertices"]


def test_anidacion_hostil_no_agota_la_pila():
    deep: list = [0.0, 0.0]
    for _ in range(50_000):
        deep = [deep]
    assert codes({"type": "Polygon", "coordinates": deep})  # se rechaza por forma, sin RecursionError


def test_poligono_vacio():
    assert codes({"type": "Polygon", "coordinates": []})
    assert codes({"type": "MultiPolygon", "coordinates": []})


def test_area_de_trabajo_coincide_con_el_CHECK_de_la_base_de_datos():
    sql = (ROOT / "db/migrations/0002_sources_and_geography.sql").read_text(encoding="utf-8")
    match = re.search(r"st_makeenvelope\(\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*4326\)", sql)
    assert match, "no se encontró geometry_in_working_area en la migración"
    assert tuple(float(v) for v in match.groups()) == WORKING_AREA
