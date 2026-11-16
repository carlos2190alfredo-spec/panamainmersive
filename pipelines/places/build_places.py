"""Lugares cercanos SIN VERIFICAR de cada destino, desde Overture Places (ADR-0027 A2).

Uso:
    python -I pipelines/places/build_places.py extract   # red: Overture → data/build/places/places_pa.jsonl (no se versiona)
    python -I pipelines/places/build_places.py build     # sin red: extracto → data/places/nearby-places.json (verificado)
    python -I pipelines/places/build_places.py verify    # sin red: comprueba el archivo versionado contra la configuración

Qué decide quién:
  - `places.config.json` (decisión humana, revisable): radio por destino, confianza mínima, categorías admitidas y su tipo,
    las excluidas, el tope por grupo y las listas cerradas de proveedores y licencias.
  - Este script solo calcula y VERIFICA. Lo que no cumple una regla no entra (y se cuenta en el informe); nada se repara ni
    se inventa. Un lugar se relaciona con un destino por la DISTANCIA a su ancla (clave estable), nunca por nombre.

Privacidad (el repositorio es PÚBLICO): de Overture solo se piden las columnas necesarias. Teléfonos, correos, redes
sociales y webs NO se leen; de las direcciones solo se lee el país (para descartar lugares de Costa Rica y Colombia) y no
se guarda. El extracto queda en `data/build/` (ignorado por git).

Determinista: sin marcas de tiempo; mismo extracto y misma configuración → mismo archivo.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import tempfile
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "pipelines/places/places.config.json"
ANCHORS_PATH = ROOT / "data/anchors/destination-anchors.json"
EXTRACT_PATH = ROOT / "data/build/places/places_pa.jsonl"
OUT_PATH = ROOT / "data/places/nearby-places.json"

SCHEMA = 1
GROUPS = ("activities", "food", "lodging")
# Columnas de Overture que se piden. NO están phones, emails, socials, websites ni brand (ver arriba).
COLUMNS = ["id", "confidence", "names", "taxonomy", "operating_status", "sources", "addresses"]
FORBIDDEN_KEYS = frozenset({"phones", "phone", "emails", "email", "socials", "websites", "website", "addresses", "address"})
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
EARTH_RADIUS_KM = 6371.0088


class PlacesError(RuntimeError):
    """La salida no cumple la configuración: no se escribe."""


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def clean_name(raw: object, max_length: int) -> str | None:
    """Nombre como TEXTO: NFC, sin caracteres de control ni de formato (bidi, anchura cero), espacios colapsados.

    Devuelve None si queda vacío o es más largo que el máximo: no se recorta (un nombre recortado es otro nombre).
    """
    if not isinstance(raw, str):
        return None
    text = unicodedata.normalize("NFC", raw)
    # Primero los espacios (un salto de línea es espacio Y control: borrado sin más, pegaba dos palabras), luego lo invisible.
    text = "".join(" " if ch.isspace() else ch for ch in text)
    text = "".join(ch for ch in text if unicodedata.category(ch) not in ("Cc", "Cf"))
    text = re.sub(r" {2,}", " ", text).strip()
    if not text or len(text) > max_length:
        return None
    return text


def kind_of(category: object, config: dict) -> str | None:
    if not isinstance(category, str):
        return None
    if category in config["excluded"]:
        return None
    if category in config["kinds"]:
        return config["kinds"][category]
    for suffix, kind in config["suffixKinds"].items():
        if category.endswith(suffix):
            return kind
    return None


def group_of(kind: str, config: dict) -> str:
    for group, kinds in config["groups"].items():
        if kind in kinds:
            return group
    raise PlacesError(f"El tipo {kind!r} no pertenece a ningún grupo (places.config.json)")


# --- extract (red) ---------------------------------------------------------------------------------------------------


def extract_record(row: dict) -> dict:
    """Lo único que se guarda de una fila de Overture (sin contactos; del domicilio, solo el país)."""
    b = row["bbox"]
    taxonomy = row.get("taxonomy") or {}
    hierarchy = taxonomy.get("hierarchy") or []
    pairs = sorted(
        {
            (s.get("dataset"), s.get("license"))
            for s in (row.get("sources") or [])
            if s and isinstance(s.get("dataset"), str) and isinstance(s.get("license"), str)
        }
    )
    updated = max((str(s.get("update_time") or "")[:10] for s in (row.get("sources") or []) if s), default="")
    return {
        "id": row["id"],
        "lon": (b["xmin"] + b["xmax"]) / 2,
        "lat": (b["ymin"] + b["ymax"]) / 2,
        "name": (row.get("names") or {}).get("primary"),
        "confidence": row.get("confidence"),
        "category": taxonomy.get("primary"),
        "root": hierarchy[0] if hierarchy else None,
        "status": row.get("operating_status"),
        "sources": [list(p) for p in pairs],
        "updated": updated if DATE.match(updated) else None,
        "countries": sorted({a.get("country") for a in (row.get("addresses") or []) if a and a.get("country")}),
    }


def extract(out: Path = EXTRACT_PATH) -> int:
    sys.path.insert(0, str(ROOT))
    from pipelines.lib import overture as ov  # noqa: PLC0415 - solo este paso necesita red y pyarrow

    config = load_json(CONFIG_PATH)
    if ov.RELEASE != config["release"]:
        raise PlacesError(f"Release de Overture {ov.RELEASE} ≠ {config['release']} (places.config.json)")
    out.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with out.open("w", encoding="utf-8") as handle:
        for row in ov.iter_rows("places", "place", COLUMNS):
            handle.write(json.dumps(extract_record(row), ensure_ascii=False) + "\n")
            count += 1
    return count


# --- build (sin red) -------------------------------------------------------------------------------------------------


def build(records: list[dict], config: dict, anchors: dict) -> tuple[dict, Counter]:
    """Selecciona, ordena y recorta. Devuelve el documento y los motivos de exclusión (para el informe)."""
    if set(config["radiusKm"]) != set(anchors):
        raise PlacesError(f"Radios {sorted(config['radiusKm'])} ≠ destinos del ancla {sorted(anchors)}")
    datasets, licenses = set(config["datasets"]), set(config["licenses"])
    excluded_statuses = set(config["excludedStatuses"])
    countries = set(config["countries"])
    reasons: Counter = Counter()
    usable: list[dict] = []
    seen: set[str] = set()
    for r in records:
        rid = r.get("id")
        if not isinstance(rid, str) or not UUID.match(rid) or rid in seen:
            reasons["id"] += 1
            continue
        seen.add(rid)
        if r.get("status") in excluded_statuses:
            reasons["closed"] += 1
            continue
        if any(c not in countries for c in r.get("countries") or []):
            reasons["country"] += 1
            continue
        if r.get("category") in config["excluded"]:
            reasons[f"excluded:{r['category']}"] += 1
            continue
        kind = kind_of(r.get("category"), config)
        if kind is None:
            reasons["category"] += 1
            continue
        conf = r.get("confidence")
        if not isinstance(conf, (int, float)) or conf < config["minConfidence"]:
            reasons["confidence"] += 1
            continue
        name = clean_name(r.get("name"), config["maxNameLength"])
        if name is None:
            reasons["name"] += 1
            continue
        sources = [tuple(p) for p in r.get("sources") or []]
        if not sources or any(d not in datasets or lic not in licenses for d, lic in sources):
            reasons["source"] += 1
            continue
        lon, lat = r.get("lon"), r.get("lat")
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lon, lat)):
            reasons["geometry"] += 1
            continue
        usable.append({**r, "name": name, "kind": kind, "group": group_of(kind, config), "sources": sources})

    limit = config["perGroupLimit"]
    destinations: dict[str, dict] = {}
    for key in sorted(anchors):
        anchor = anchors[key]["anchor"]
        radius = config["radiusKm"][key]
        near: dict[str, list[dict]] = {g: [] for g in GROUPS}
        for r in usable:
            km = haversine_km(anchor["lat"], anchor["lon"], r["lat"], r["lon"])
            if km <= radius:
                near[r["group"]].append({**r, "distanceM": round(km * 1000)})
        groups = {}
        for g in GROUPS:
            ordered = sorted(near[g], key=lambda p: (p["distanceM"], p["id"]))
            groups[g] = {
                "total": len(ordered),
                "places": [
                    {
                        "id": p["id"],
                        "name": p["name"],
                        "kind": p["kind"],
                        "lon": round(p["lon"], 5),
                        "lat": round(p["lat"], 5),
                        "distanceM": p["distanceM"],
                        "confidence": round(float(p["confidence"]), 2),
                        "sourceUpdated": p.get("updated"),
                        "sources": [{"dataset": d, "license": lic} for d, lic in p["sources"]],
                    }
                    for p in ordered[:limit]
                ],
            }
        destinations[key] = {
            "anchor": [anchor["lon"], anchor["lat"]],
            "radiusKm": radius,
            "groups": groups,
        }
    doc = {
        "schema": SCHEMA,
        "release": config["release"],
        "source": "Overture Maps Foundation, places/place",
        "status": "unverified",
        "minConfidence": config["minConfidence"],
        "perGroupLimit": limit,
        "destinations": destinations,
    }
    return doc, reasons


def verify(doc: dict, config: dict, anchors: dict) -> list[str]:
    """Puerta de verificación: cada regla de la configuración, comprobada sobre la SALIDA (no sobre el código que la hizo)."""
    problems: list[str] = []
    if doc.get("schema") != SCHEMA:
        problems.append(f"schema {doc.get('schema')!r} ≠ {SCHEMA}")
    if doc.get("release") != config["release"]:
        problems.append("release distinta de la configuración")
    if doc.get("status") != "unverified":
        problems.append("los lugares deben declararse «unverified»")
    if set(doc.get("destinations", {})) != set(anchors):
        problems.append("destinos distintos de los del ancla")
    kinds_by_group = config["groups"]
    datasets, licenses = set(config["datasets"]), set(config["licenses"])

    def walk(value: Any, where: str) -> None:
        if isinstance(value, dict):
            for k, v in value.items():
                if k in FORBIDDEN_KEYS:
                    problems.append(f"{where}: clave prohibida {k!r} (datos de contacto)")
                walk(v, f"{where}.{k}")
        elif isinstance(value, list):
            for i, v in enumerate(value):
                walk(v, f"{where}[{i}]")

    walk(doc, "$")
    for key, entry in doc.get("destinations", {}).items():
        anchor = anchors.get(key, {}).get("anchor")
        radius = config["radiusKm"].get(key)
        if anchor is None or entry.get("radiusKm") != radius or entry.get("anchor") != [anchor["lon"], anchor["lat"]]:
            problems.append(f"{key}: ancla o radio distintos de la configuración")
            continue
        for group in GROUPS:
            block = entry.get("groups", {}).get(group)
            if not isinstance(block, dict):
                problems.append(f"{key}.{group}: falta el grupo")
                continue
            places = block.get("places", [])
            if len(places) > config["perGroupLimit"] or block.get("total", -1) < len(places):
                problems.append(f"{key}.{group}: recuento o tope incoherentes")
            last = -1
            for p in places:
                tag = f"{key}.{group}.{p.get('id')}"
                if not isinstance(p.get("id"), str) or not UUID.match(p["id"]):
                    problems.append(f"{tag}: id no es un UUID")
                if p.get("kind") not in kinds_by_group[group]:
                    problems.append(f"{tag}: tipo {p.get('kind')!r} fuera del grupo")
                if clean_name(p.get("name"), config["maxNameLength"]) != p.get("name"):
                    problems.append(f"{tag}: nombre sin limpiar")
                if not isinstance(p.get("confidence"), (int, float)) or p["confidence"] < config["minConfidence"]:
                    problems.append(f"{tag}: confianza por debajo del mínimo")
                km = haversine_km(anchor["lat"], anchor["lon"], p.get("lat", 0), p.get("lon", 0))
                if km > radius + 0.001:
                    problems.append(f"{tag}: fuera del radio ({km:.3f} km > {radius})")
                if abs(round(km * 1000) - p.get("distanceM", -1)) > 2:
                    problems.append(f"{tag}: distancia declarada incoherente")
                if p.get("distanceM", -1) < last:
                    problems.append(f"{tag}: no está ordenado por distancia")
                last = p.get("distanceM", -1)
                srcs = p.get("sources") or []
                if not srcs or any(s.get("dataset") not in datasets or s.get("license") not in licenses for s in srcs):
                    problems.append(f"{tag}: proveedor o licencia fuera de la lista cerrada")
                updated = p.get("sourceUpdated")
                if updated is not None and not (isinstance(updated, str) and DATE.match(updated)):
                    problems.append(f"{tag}: fecha de la fuente mal formada")
    return problems


def write_verified(doc: dict, config: dict, anchors: dict, out: Path = OUT_PATH) -> None:
    problems = verify(doc, config, anchors)
    if problems:
        raise PlacesError("La salida no pasa la verificación:\n  " + "\n  ".join(problems[:50]))
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    # Escritura atómica: o el archivo nuevo entero y verificado, o el anterior intacto.
    fd, tmp = tempfile.mkstemp(dir=out.parent, prefix=".nearby-places.", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)
    os.replace(tmp, out)


def read_extract(path: Path) -> list[dict]:
    if not path.is_file():
        raise PlacesError(f"No existe {path}: ejecuta antes `pnpm data:places -- extract` (necesita red)")
    return [json.loads(line) for line in path.open(encoding="utf-8") if line.strip()]


def report(doc: dict, reasons: Counter) -> str:
    lines = [f"Overture {doc['release']} · confianza ≥ {doc['minConfidence']} · tope {doc['perGroupLimit']} por grupo"]
    for key, entry in doc["destinations"].items():
        counts = " · ".join(
            f"{g} {len(entry['groups'][g]['places'])}/{entry['groups'][g]['total']}" for g in GROUPS
        )
        lines.append(f"  {key:<18} {entry['radiusKm']:>5} km  {counts}")
    lines.append("Excluidos: " + ", ".join(f"{k} {v}" for k, v in sorted(reasons.items())))
    return "\n".join(lines)


def anchor_destinations() -> dict:
    return load_json(ANCHORS_PATH)["destinations"]


def main(argv: list[str]) -> int:
    command = argv[0] if argv else ""
    try:
        if command == "extract" and len(argv) == 1:
            print(f"{extract()} lugares en {EXTRACT_PATH.relative_to(ROOT)} (no se versiona)")
            return 0
        if command == "build" and len(argv) == 1:
            config, anchors = load_json(CONFIG_PATH), anchor_destinations()
            doc, reasons = build(read_extract(EXTRACT_PATH), config, anchors)
            write_verified(doc, config, anchors)
            print(report(doc, reasons))
            print(f"Escrito y verificado: {OUT_PATH.relative_to(ROOT)}")
            return 0
        if command == "verify" and len(argv) == 1:
            problems = verify(load_json(OUT_PATH), load_json(CONFIG_PATH), anchor_destinations())
            for p in problems:
                print(p, file=sys.stderr)
            print("OK" if not problems else f"{len(problems)} problemas")
            return 0 if not problems else 1
    except PlacesError as error:
        print(error, file=sys.stderr)
        return 1
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
