"""Lugares cercanos sin verificar (ADR-0027 A2): qué entra, qué no y que la puerta de verificación muerde. Sin red."""
import copy
import json
from pathlib import Path

import pytest

from pipelines.places import build_places as bp

ROOT = Path(__file__).resolve().parents[2]
CONFIG = json.loads((ROOT / "pipelines/places/places.config.json").read_text(encoding="utf-8"))
ANCHOR = {"lat": 8.77637, "lon": -82.43482}
ANCHORS = {key: {"anchor": ANCHOR} for key in CONFIG["radiusKm"]}


def place(n: int, **overrides):
    """Un lugar válido a ≈ n × 100 m al norte del ancla (Boquete)."""
    record = {
        "id": f"00000000-0000-4000-8000-{n:012d}",
        "lon": ANCHOR["lon"],
        "lat": ANCHOR["lat"] + n * 0.0009,
        "name": f"Lugar {n}",
        "confidence": 0.9,
        "category": "hotel",
        "root": "lodging",
        "status": None,
        "sources": [["Overture", "CDLA-Permissive-2.0"], ["meta", "CDLA-Permissive-2.0"]],
        "updated": "2026-08-01",
        "countries": ["PA"],
    }
    record.update(overrides)
    return record


def boquete(records):
    doc, reasons = bp.build(records, CONFIG, ANCHORS)
    return doc["destinations"]["boquete"]["groups"], reasons


def test_las_columnas_pedidas_no_incluyen_contactos():
    # La privacidad empieza en lo que se pide a la fuente: ni teléfonos, ni correos, ni redes, ni webs.
    assert not {"phones", "emails", "socials", "websites", "brand"} & set(bp.COLUMNS)


def test_del_registro_de_overture_solo_se_guarda_lo_necesario():
    row = {
        "id": "00000000-0000-4000-8000-000000000001",
        "bbox": {"xmin": -82.4, "xmax": -82.4, "ymin": 8.7, "ymax": 8.7},
        "names": {"primary": "Café"},
        "confidence": 0.8,
        "taxonomy": {"primary": "cafe", "hierarchy": ["food_and_drink", "cafe"]},
        "operating_status": None,
        "sources": [{"dataset": "meta", "license": "CDLA-Permissive-2.0", "update_time": "2026-05-04T10:00:00Z"}],
        "addresses": [{"country": "PA", "freeform": "Calle 1, casa de alguien"}],
        "phones": ["+507 6000 0000"],
        "emails": ["persona@example.org"],
    }
    record = bp.extract_record(row)
    text = json.dumps(record)
    assert "6000" not in text and "example.org" not in text and "Calle 1" not in text
    assert record["countries"] == ["PA"] and record["updated"] == "2026-05-04"


def test_un_lugar_valido_entra_con_su_tipo_distancia_y_fuente():
    groups, _ = boquete([place(3)])
    [p] = groups["lodging"]["places"]
    assert p["kind"] == "hotel" and 290 < p["distanceM"] < 310
    assert p["sources"] == [
        {"dataset": "Overture", "license": "CDLA-Permissive-2.0"},
        {"dataset": "meta", "license": "CDLA-Permissive-2.0"},
    ]


@pytest.mark.parametrize(
    "override, reason",
    [
        ({"confidence": 0.59}, "confidence"),
        ({"confidence": None}, "confidence"),
        ({"status": "permanently_closed"}, "closed"),
        ({"status": "temporarily_closed"}, "closed"),
        ({"countries": ["PA", "CR"]}, "country"),
        ({"category": "holiday_rental_home"}, "excluded:holiday_rental_home"),
        ({"category": "historic_site"}, "category"),
        ({"category": "dentist"}, "category"),
        ({"name": "  ​ "}, "name"),
        ({"name": "x" * 121}, "name"),
        ({"sources": [["Yelp", "CDLA-Permissive-2.0"]]}, "source"),
        ({"sources": [["meta", "proprietary"]]}, "source"),
        ({"sources": []}, "source"),
        ({"id": "no-es-un-uuid"}, "id"),
    ],
)
def test_lo_que_incumple_una_regla_no_entra_y_se_cuenta(override, reason):
    groups, reasons = boquete([place(1, **override)])
    assert all(not g["places"] and g["total"] == 0 for g in groups.values())
    assert reasons[reason] == 1


def test_sin_direccion_se_admite_y_el_umbral_es_inclusivo():
    groups, _ = boquete([place(1, countries=[], confidence=CONFIG["minConfidence"])])
    assert groups["lodging"]["total"] == 1


def test_los_restaurantes_por_sufijo_y_el_grupo_sale_del_tipo():
    groups, _ = boquete([place(1, category="peruvian_restaurant"), place(2, category="scuba_diving_center")])
    assert groups["food"]["places"][0]["kind"] == "restaurant"
    assert groups["activities"]["places"][0]["kind"] == "water"


def test_fuera_del_radio_no_entra_aunque_sea_valido():
    # 3 km de radio en Boquete: 35 × 90 m ≈ 3,5 km queda fuera.
    groups, _ = boquete([place(35)])
    assert groups["lodging"]["total"] == 0


def test_nombre_limpio_sin_bidi_ni_anchura_cero_y_sin_recortar():
    groups, _ = boquete([place(1, name="Hotel‮  Sol​\nPlaya ")])
    assert groups["lodging"]["places"][0]["name"] == "Hotel Sol Playa"


def test_del_mas_cercano_al_mas_lejano_con_tope_y_total():
    records = [place(n) for n in range(28, 0, -1)]  # el más lejano, a ≈ 2,8 km: todos dentro de los 3 km de Boquete
    groups, _ = boquete(records)
    places = groups["lodging"]["places"]
    assert groups["lodging"]["total"] == 28
    assert len(places) == CONFIG["perGroupLimit"]
    assert [p["distanceM"] for p in places] == sorted(p["distanceM"] for p in places)
    assert places[0]["name"] == "Lugar 1"


def test_un_id_repetido_cuenta_una_vez():
    groups, reasons = boquete([place(1), place(1, name="Otro")])
    assert groups["lodging"]["total"] == 1 and reasons["id"] == 1


def test_es_determinista():
    records = [place(n, category=c) for n, c in enumerate(["hotel", "bar", "museum", "cafe", "hostel"], start=1)]
    a, _ = bp.build(records, CONFIG, ANCHORS)
    b, _ = bp.build(list(reversed(records)), CONFIG, ANCHORS)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def test_radios_y_destinos_deben_coincidir():
    with pytest.raises(bp.PlacesError):
        bp.build([], CONFIG, {**ANCHORS, "nuevo-destino": {"anchor": ANCHOR}})


def test_la_salida_valida_pasa_la_puerta():
    doc, _ = bp.build([place(n) for n in range(1, 5)], CONFIG, ANCHORS)
    assert bp.verify(doc, CONFIG, ANCHORS) == []


@pytest.mark.parametrize(
    "tamper, expected",
    [
        (lambda p, b: p.update(phones=["+507 6000 0000"]), "clave prohibida"),
        (lambda p, b: p.update(confidence=0.3), "confianza"),
        (lambda p, b: p.update(kind="bar"), "fuera del grupo"),
        (lambda p, b: p.update(lat=p["lat"] + 1), "fuera del radio"),
        (lambda p, b: p.update(name="Hotel‮"), "nombre sin limpiar"),
        (lambda p, b: p.update(sources=[{"dataset": "Yelp", "license": "CC0-1.0"}]), "lista cerrada"),
        (lambda p, b: p.update(distanceM=p["distanceM"] + 500), "distancia"),
        (lambda p, b: b.update(total=0), "tope"),
    ],
)
def test_la_puerta_muerde(tamper, expected):
    doc, _ = bp.build([place(n) for n in range(1, 5)], CONFIG, ANCHORS)
    bad = copy.deepcopy(doc)
    block = bad["destinations"]["boquete"]["groups"]["lodging"]
    tamper(block["places"][0], block)
    problems = bp.verify(bad, CONFIG, ANCHORS)
    assert any(expected in p for p in problems), problems


def test_la_puerta_exige_orden_por_distancia():
    doc, _ = bp.build([place(n) for n in range(1, 5)], CONFIG, ANCHORS)
    bad = copy.deepcopy(doc)
    places = bad["destinations"]["boquete"]["groups"]["lodging"]["places"]
    places.reverse()
    assert any("ordenado" in p for p in bp.verify(bad, CONFIG, ANCHORS))


def test_no_escribe_si_no_pasa_la_puerta(tmp_path):
    doc, _ = bp.build([place(1)], CONFIG, ANCHORS)
    doc["status"] = "verified"
    out = tmp_path / "nearby.json"
    out.write_text("anterior", encoding="utf-8")
    with pytest.raises(bp.PlacesError):
        bp.write_verified(doc, CONFIG, ANCHORS, out)
    assert out.read_text(encoding="utf-8") == "anterior"


def test_el_archivo_versionado_pasa_la_puerta():
    out = ROOT / "data/places/nearby-places.json"
    anchors = json.loads((ROOT / "data/anchors/destination-anchors.json").read_text(encoding="utf-8"))["destinations"]
    assert bp.verify(json.loads(out.read_text(encoding="utf-8")), CONFIG, anchors) == []


def test_toda_categoria_admitida_tiene_tipo_de_un_grupo_y_ninguna_excluida_esta_admitida():
    kinds = {k for ks in CONFIG["groups"].values() for k in ks}
    assert set(CONFIG["kinds"].values()) | set(CONFIG["suffixKinds"].values()) <= kinds
    assert not set(CONFIG["excluded"]) & set(CONFIG["kinds"])
