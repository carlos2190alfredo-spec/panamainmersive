"""Importación controlada de áreas (docs/gis.md §3, ADR-0015).

    python -I pipelines/ingest/import_areas.py --dataset overture-protected-areas [--target-env development]

Etapas: extraer → comprobar DERECHOS → escribir bruto → leer con límites de seguridad → CUARENTENA/validar (sin
reparar) → normalizar → deduplicar → publicar una VERSIÓN (`valid.geojsonl`, `quarantine.jsonl`, `manifest.json`).
La carga a PostGIS la hace `scripts/db/import-areas.ts`, que vuelve a verificar hash, derechos y geometría.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import shapely
from shapely import wkb

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pipelines.ingest import manifest as mf  # noqa: E402
from pipelines.ingest import normalize as nm  # noqa: E402
from pipelines.ingest import rights  # noqa: E402
from pipelines.ingest.validate import RULES_VERSION, WORKING_AREA, MAX_VERTICES, validate_polygonal_geometry  # noqa: E402
from pipelines.lib import overture as ov  # noqa: E402
from pipelines.lib import safe_io  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATASETS = json.loads((Path(__file__).with_name("datasets.json")).read_text(encoding="utf-8"))
ANCHORS = ROOT / "data/anchors/destination-anchors.json"
COLUMNS = ["id", "names", "subtype", "class", "wikidata", "geometry"]
POLYGONAL = ("Polygon", "MultiPolygon")


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


# --------------------------------------------------------------------------- extracción (Overture)
def _feature(
    row: dict[str, Any], theme: str, typ: str, kind_overrides: dict[str, str] | None = None
) -> tuple[dict[str, Any] | None, bool]:
    """(feature, es_poligonal). Los no poligonales se CUENTAN y se omiten: un punto no es un área."""
    geom = wkb.loads(row["geometry"])
    if geom.geom_type not in POLYGONAL:
        return None, False
    kind = nm.kind_for(theme, typ, row.get("subtype"), row.get("class")) or (kind_overrides or {}).get(row["id"])
    local, by_locale = nm.names_from_row(row)
    props: dict[str, Any] = {
        "overture_id": row["id"],
        "kind": kind,
        "source_theme": theme,
        "source_type": typ,
        "subtype": row.get("subtype"),
        "class": row.get("class"),
        "name_local": local,
        "names": by_locale,
    }
    if row.get("wikidata"):
        props["wikidata"] = row["wikidata"]
    return {"type": "Feature", "id": row["id"], "geometry": json.loads(shapely.to_geojson(geom)), "properties": props}, True


def extract(dataset_id: str) -> tuple[list[dict[str, Any]], int, list[dict[str, str]]]:
    """Devuelve (features ordenados por ID, nº de no poligonales omitidos, enlaces destino↔entidad)."""
    cfg = DATASETS[dataset_id]["extract"]
    features: list[dict[str, Any]] = []
    skipped = 0
    links: list[dict[str, str]] = []
    if "subtype" in cfg:
        for row in ov.iter_rows(cfg["theme"], cfg["type"], COLUMNS):
            if row.get("subtype") != cfg["subtype"]:
                continue
            feature, polygonal = _feature(row, cfg["theme"], cfg["type"])
            if feature is None:
                skipped += 1
            else:
                features.append(feature)
    else:
        overrides = DATASETS[dataset_id].get("kindOverrides", {})
        wanted: dict[tuple[str, str], dict[str, set[str]]] = {}
        for key, entry in json.loads(ANCHORS.read_text(encoding="utf-8"))["destinations"].items():
            for source in [*entry["sources"], *entry["corroboration"]]:
                if source.get("id"):
                    wanted.setdefault((source["theme"], source["type"]), {}).setdefault(source["id"], set()).add(key)
        for (theme, typ), ids in sorted(wanted.items()):
            for row in ov.iter_rows(theme, typ, COLUMNS):
                if row["id"] not in ids:
                    continue
                feature, polygonal = _feature(row, theme, typ, overrides)
                if feature is None:
                    skipped += 1
                    continue
                features.append(feature)
                for destination in sorted(ids[row["id"]]):
                    links.append({
                        "destinationKey": destination,
                        "overtureId": row["id"],
                        "role": "context",  # decisión editorial pendiente: nunca `primary` por defecto (E-41)
                        "evidence": "Entidad de referencia derivada de Overture; NO es el límite del destino (E-41).",
                    })
    features.sort(key=lambda f: f["id"])
    links.sort(key=lambda link: (link["destinationKey"], link["overtureId"]))
    return features, skipped, links


# --------------------------------------------------------------------------- cuarentena, normalización, dedupe
def _geometry_hash(geometry: dict[str, Any]) -> str:
    return hashlib.sha256(canonical(geometry).encode()).hexdigest()


def classify(records: Iterable[safe_io.Record]) -> Iterator[tuple[str, dict[str, Any]]]:
    """('valid'|'quarantine', objeto). Nada se repara: lo que no pasa se explica y se aparta."""
    for record in records:
        if record.error or not isinstance(record.value, dict) or record.value.get("type") != "Feature":
            yield "quarantine", {"line": record.line, "issues": [{"code": record.error or "feature.not_a_feature"}]}
            continue
        feature = record.value
        issues = [
            *validate_polygonal_geometry(feature.get("geometry")),
            *nm.validate_properties(feature.get("properties")),
        ]
        if issues:
            props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
            yield "quarantine", {
                "line": record.line,
                "overture_id": props.get("overture_id") if isinstance(props.get("overture_id"), str) else None,
                "issues": [{"code": i.code, "detail": i.detail} for i in issues],
            }
        else:
            yield "valid", feature


def deduplicate(valid: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Quita IDs repetidos y geometrías idénticas del MISMO tipo; los descartados se listan, no se pierden."""
    kept: list[dict[str, Any]] = []
    dropped: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    seen_geometry: dict[tuple[str, str], str] = {}
    for feature in sorted(valid, key=lambda f: f["properties"]["overture_id"]):
        props = feature["properties"]
        oid = props["overture_id"]
        if oid in seen_ids:
            dropped.append({"overture_id": oid, "issues": [{"code": "duplicate.id", "detail": ""}]})
            continue
        key = (props["kind"], _geometry_hash(feature["geometry"]))
        if key in seen_geometry:
            dropped.append({"overture_id": oid, "issues": [{"code": "duplicate.geometry", "detail": f"igual que {seen_geometry[key]}"}]})
            continue
        seen_ids.add(oid)
        seen_geometry[key] = oid
        kept.append(feature)
    return kept, dropped


def write_lines(path: Path, items: Iterable[Any]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for item in items:
            handle.write(canonical(item) + "\n")


def ingest(
    features: list[dict[str, Any]],
    *,
    dataset_id: str,
    release: str,
    out_dir: Path,
    skipped_not_polygonal: int = 0,
    links: list[dict[str, str]] | None = None,
    retrieved_at: str | None = None,
) -> dict[str, Any]:
    """Aplica las etapas 3–7 a una lista de features BRUTAS y escribe la versión. Reutilizable con cualquier fuente."""
    cfg = DATASETS[dataset_id]
    out_dir.mkdir(parents=True, exist_ok=True)
    raw = out_dir / "raw.geojsonl"
    write_lines(raw, features)

    valid: list[dict[str, Any]] = []
    quarantine: list[dict[str, Any]] = []
    read = 0
    for status, obj in classify(safe_io.iter_jsonl(safe_io.resolve_inside(out_dir, "raw.geojsonl"))):
        read += 1
        (valid if status == "valid" else quarantine).append(obj)
    invalid_count = len(quarantine)
    kept, dropped = deduplicate(valid)
    quarantine.extend(dropped)

    valid_path, quarantine_path = out_dir / "valid.geojsonl", out_dir / "quarantine.jsonl"
    write_lines(valid_path, kept)
    write_lines(quarantine_path, quarantine)
    kept_ids = {f["properties"]["overture_id"] for f in kept}
    manifest: dict[str, Any] = {
        "schema": mf.SCHEMA,
        "dataset": dataset_id,
        "release": release,
        "retrievedAt": retrieved_at or datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": cfg["source"],
        "license": {**cfg["license"], "rightsStatus": _status(cfg)},
        "validation": {
            "rulesVersion": RULES_VERSION,
            "workingArea": list(WORKING_AREA),
            "maxVertices": MAX_VERTICES,
            "repairs": 0,  # NUNCA se repara en silencio: lo inválido va a cuarentena
        },
        "counts": {
            "read": read,
            "skippedNotPolygonal": skipped_not_polygonal,
            "duplicates": len(dropped),
            "quarantined": invalid_count,
            "valid": len(kept),
        },
        "files": {
            "valid": {"name": valid_path.name, "bytes": valid_path.stat().st_size, "sha256": mf.sha256_file(valid_path)},
            "quarantine": {"name": quarantine_path.name, "bytes": quarantine_path.stat().st_size, "sha256": mf.sha256_file(quarantine_path)},
        },
        "contentSha256": mf.sha256_file(valid_path),
        "publishable": bool(cfg.get("publishable", False)),
        "links": [link for link in (links or []) if link["overtureId"] in kept_ids],
    }
    mf.check_manifest_shape(manifest)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifest


def _status(cfg: dict[str, Any]) -> str:
    policy = next(p for p in rights.load_policies() if p.subject == cfg["rightsSubject"])
    return policy.status


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset", required=True, choices=sorted(DATASETS))
    parser.add_argument("--target-env", default="development", choices=rights.ENVIRONMENTS)
    parser.add_argument("--out-root", default=str(ROOT / "data/build/ingest"))
    args = parser.parse_args()

    cfg = DATASETS[args.dataset]
    # DERECHOS ANTES DE EXTRAER: sin derechos no se descarga ni se transforma nada.
    rights.require(rights.load_policies(), cfg["rightsSubject"], cfg["actions"], args.target_env)
    print(f"Derechos OK para «{cfg['rightsSubject']}» en {args.target_env} (política {_status(cfg)}).", flush=True)

    features, skipped, links = extract(args.dataset)
    out_dir = Path(args.out_root) / args.dataset / ov.RELEASE
    manifest = ingest(features, dataset_id=args.dataset, release=ov.RELEASE, out_dir=out_dir,
                      skipped_not_polygonal=skipped, links=links)
    print(json.dumps(manifest["counts"], ensure_ascii=False))
    print(f"OK → {out_dir.relative_to(ROOT)} (sha256 {manifest['contentSha256'][:12]}…)")


if __name__ == "__main__":
    main()
