"""El pipeline completo sobre entradas sintéticas con casos adversos conocidos."""
import json
from pathlib import Path

import pytest

from pipelines.ingest import import_areas as ia
from pipelines.ingest import manifest as mf

ROOT = Path(__file__).resolve().parents[2]


def feature(oid, lon=-79.5, lat=8.9, *, kind="locality", name="Lugar", size=0.01, geometry=None):
    return {
        "type": "Feature",
        "id": oid,
        "geometry": geometry
        or {"type": "Polygon", "coordinates": [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]]},
        "properties": {"overture_id": oid, "kind": kind, "name_local": name, "names": {}},
    }


def uuid(n):
    return f"{n:08x}-0000-4000-8000-000000000000"


@pytest.fixture
def run(tmp_path):
    def _run(features, **kw):
        return ia.ingest(features, dataset_id="overture-protected-areas", release="2026-09-23.1", out_dir=tmp_path / "v",
                         retrieved_at="2026-10-20T00:00:00Z", **kw), tmp_path / "v"
    return _run


def test_separa_validos_cuarentena_y_duplicados_sin_reparar_nada(run):
    bowtie = {"type": "Polygon", "coordinates": [[[-79.5, 8.9], [-79.4, 8.8], [-79.4, 8.9], [-79.5, 8.8], [-79.5, 8.9]]]}
    swapped = {"type": "Polygon", "coordinates": [[[8.9, -79.5], [8.91, -79.5], [8.91, -79.49], [8.9, -79.49], [8.9, -79.5]]]}
    features = [
        feature(uuid(1)),
        feature(uuid(2), lon=-80.0),
        feature(uuid(3), geometry=bowtie),
        feature(uuid(4), geometry=swapped),
        feature(uuid(2), lon=-80.0),                  # mismo ID repetido
        feature(uuid(5), lon=-79.5),                  # misma geometría que uuid(1)
        {**feature(uuid(6)), "properties": {"overture_id": "x", "kind": "locality"}},  # ID no UUID
    ]
    manifest, out = run(features)
    assert manifest["counts"] == {"read": 7, "skippedNotPolygonal": 0, "duplicates": 2, "quarantined": 3, "valid": 2}
    valid = [json.loads(l) for l in (out / "valid.geojsonl").read_text().splitlines()]
    assert [f["properties"]["overture_id"] for f in valid] == [uuid(1), uuid(2)]
    assert bowtie not in [f["geometry"] for f in valid]            # el corbatín NO se «arregló»: se apartó
    quarantine = [json.loads(l) for l in (out / "quarantine.jsonl").read_text().splitlines()]
    reasons = {q.get("overture_id"): [i["code"] for i in q["issues"]] for q in quarantine}
    assert reasons[uuid(3)] == ["geometry.invalid"]
    assert reasons[uuid(4)] == ["geometry.axis_order_swapped"]
    assert reasons["x"] == ["properties.bad_id"]
    assert reasons[uuid(2)] == ["duplicate.id"] or "duplicate.id" in sum(reasons.values(), [])
    assert manifest["validation"]["repairs"] == 0


def test_los_hashes_del_manifiesto_son_verificables_y_el_resultado_es_determinista(run, tmp_path):
    features = [feature(uuid(2), lon=-80.0), feature(uuid(1))]
    first, out = run(features)
    assert first["contentSha256"] == first["files"]["valid"]["sha256"] == mf.sha256_file(out / "valid.geojsonl")
    assert first["files"]["valid"]["bytes"] == (out / "valid.geojsonl").stat().st_size
    second = ia.ingest(list(reversed(features)), dataset_id="overture-protected-areas", release="2026-09-23.1",
                       out_dir=tmp_path / "w", retrieved_at="2026-10-20T00:00:00Z")
    assert second["contentSha256"] == first["contentSha256"]       # el orden de entrada no cambia el contenido


def test_el_manifiesto_cumple_el_contrato_con_el_cargador_de_typescript(run):
    manifest, _ = run([feature(uuid(1))])
    mf.check_manifest_shape(manifest)
    keys = json.loads((ROOT / "pipelines/ingest/manifest-keys.json").read_text())
    assert sorted(manifest) == sorted(keys["top"])
    assert manifest["license"]["rightsStatus"] in ("verified", "provisional")


def test_solo_se_enlazan_destinos_con_entidades_validas(run):
    links = [
        {"destinationKey": "boquete", "overtureId": uuid(1), "role": "context", "evidence": "e"},
        {"destinationKey": "coiba", "overtureId": uuid(9), "role": "context", "evidence": "e"},   # no existe/no válida
    ]
    manifest, _ = run([feature(uuid(1))], links=links)
    assert [l["overtureId"] for l in manifest["links"]] == [uuid(1)]


def test_una_entrada_enorme_de_un_poligono_no_pasa_el_tope(run):
    ring = [[-79.5 + i * 1e-9, 8.9] for i in range(300_000)] + [[-79.5, 8.9]]
    huge = feature(uuid(1), geometry={"type": "Polygon", "coordinates": [ring]})
    manifest, _ = run([huge])
    assert manifest["counts"]["valid"] == 0 and manifest["counts"]["quarantined"] == 1
