"""Spike (ADR-0027): ¿cuántos lugares de Overture Places hay en cada destino y con qué calidad aparente?

Dos pasos:

    extract <salida.jsonl>                 lee places/place de la release fijada en pipelines/lib/overture.py, recortado
                                           a PANAMA_BBOX, y escribe UNA línea por lugar SIN datos de contacto (solo si
                                           los tiene: has_phone, has_email…). La salida NO se versiona (repo público).
    summarize <entrada.jsonl> <resumen.json>  agrega por destino (encuadre `bounds` de data/anchors/destination-anchors.json)
                                           y por grupo de categorías. Solo cifras agregadas: es lo que se puede publicar.

Es un SONDEO, no el pipeline: no publica nada, no relaciona por nombre y el encuadre de un destino NO es su límite (es
el bbox de la entidad de Overture elegida por ID para encuadrar la cámara). Un lugar dentro del encuadre no «pertenece»
al destino: el recuento es un orden de magnitud para decidir si la fuente sirve, no un catálogo.
"""
from __future__ import annotations

import json
import math
import statistics
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pipelines.lib import overture as ov  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ANCHORS = ROOT / "data/anchors/destination-anchors.json"

COLUMNS = [
    "id",
    "confidence",
    "names",
    "basic_category",
    "taxonomy",
    "operating_status",
    "sources",
    "websites",
    "phones",
    "emails",
    "socials",
    "addresses",
]

# Grupos del producto. Alojamiento y comida: raíz de la taxonomía (`taxonomy.hierarchy[0]`, release 2026-09-23.1).
# Actividades: una lista CERRADA de categorías primarias de interés turístico, elegida mirando la distribución real de
# Panamá (no hay una raíz «atracciones»: están repartidas entre deportes, geografía, cultura y transporte). Propuesta del
# sondeo, sin validar. `historic_site` se cuenta APARTE: 1 216 en Panamá, demasiados para tomarlos sin revisar.
ACTIVITY_PRIMARIES = frozenset(
    {
        "tour_operator", "sightseeing_tour_agency", "boat_tour", "bus_tour", "atv_rental_tour",
        "scuba_diving_center", "scuba_diving_instruction", "diving_center", "snorkeling", "surfing", "sky_diving",
        "fishing_charter", "canoe_and_kayak_hire_service", "boat_rental_and_training",
        "hiking_trail", "mountain_bike_trail", "national_park", "nature_reserve", "beach", "waterfall", "hot_springs",
        "botanical_garden", "island", "museum", "history_museum", "art_museum", "science_museum", "aviation_museum",
        "zoo", "aquarium", "amusement_park", "water_park", "atv_recreation_park", "monument", "cultural_center",
        "lighthouse", "castle", "palace", "historic_mission",
    }
)  # fmt: skip
GROUPS: dict[str, dict[str, frozenset[str]]] = {
    "lodging": {"roots": frozenset({"lodging"}), "primaries": frozenset()},
    "food_and_drink": {"roots": frozenset({"food_and_drink"}), "primaries": frozenset()},
    "activities": {"roots": frozenset(), "primaries": ACTIVITY_PRIMARIES},
    "historic_site_unreviewed": {"roots": frozenset(), "primaries": frozenset({"historic_site"})},
}


def _first_root(taxonomy: dict | None) -> str | None:
    hierarchy = (taxonomy or {}).get("hierarchy") or []
    return hierarchy[0] if hierarchy else None


def extract(out: Path) -> int:
    count = 0
    with out.open("w", encoding="utf-8") as handle:
        for row in ov.iter_rows("places", "place", COLUMNS):
            b = row["bbox"]
            sources = row.get("sources") or []
            countries = {a.get("country") for a in (row.get("addresses") or []) if a}
            record = {
                "id": row["id"],
                "lon": (b["xmin"] + b["xmax"]) / 2,
                "lat": (b["ymin"] + b["ymax"]) / 2,
                "name": ((row.get("names") or {}).get("primary") or ""),
                "confidence": row.get("confidence"),
                "basic_category": row.get("basic_category"),
                "taxonomy_primary": (row.get("taxonomy") or {}).get("primary"),
                "taxonomy_root": _first_root(row.get("taxonomy")),
                "operating_status": row.get("operating_status"),
                "datasets": sorted({s.get("dataset") for s in sources if s and s.get("dataset")}),
                "licenses": sorted({s.get("license") for s in sources if s and s.get("license")}),
                "update_time": max((s.get("update_time") or "" for s in sources if s), default=""),
                "has_website": bool(row.get("websites")),
                "has_phone": bool(row.get("phones")),
                "has_email": bool(row.get("emails")),
                "has_social": bool(row.get("socials")),
                "countries": sorted(c for c in countries if c),
            }
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1
    return count


def _group_of(record: dict) -> str | None:
    for name, rule in GROUPS.items():
        if record.get("taxonomy_root") in rule["roots"] or record.get("taxonomy_primary") in rule["primaries"]:
            return name
    return None


def _inside(record: dict, bounds: list[float]) -> bool:
    return bounds[0] <= record["lon"] <= bounds[2] and bounds[1] <= record["lat"] <= bounds[3]


# Radio de SONDEO alrededor del ancla (no es un límite ni un área de influencia): hace comparables los destinos, porque
# los encuadres miden de 0,8 km (Casco Antiguo) a 90 km (Bocas del Toro) y Ciudad de Panamá no tiene encuadre.
PROBE_RADIUS_KM = 5.0


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(a))


def _breakdown(records: list[dict]) -> dict:
    return {
        "all": _quality(records),
        "groups": {g: _quality([r for r in records if _group_of(r) == g]) for g in GROUPS},
    }


def _quality(records: list[dict]) -> dict:
    if not records:
        return {"n": 0}
    conf = [r["confidence"] for r in records if isinstance(r.get("confidence"), (int, float))]
    return {
        "n": len(records),
        "confidence_median": round(statistics.median(conf), 3) if conf else None,
        "share_confidence_ge_0_9": round(sum(c >= 0.9 for c in conf) / len(conf), 3) if conf else None,
        # Sin estado de funcionamiento no se sabe si sigue abierto (en 2026-09-23.1 casi nunca lo trae).
        "share_status_known": round(sum(r.get("operating_status") is not None for r in records) / len(records), 3),
        "share_website": round(sum(r["has_website"] for r in records) / len(records), 3),
        "share_with_personal_contact": round(sum(r["has_phone"] or r["has_email"] for r in records) / len(records), 3),
        "datasets": dict(Counter(d for r in records for d in r["datasets"]).most_common()),
        "licenses": dict(Counter(lic for r in records for lic in r["licenses"]).most_common()),
    }


def summarize(src: Path, out: Path) -> dict:
    records = [json.loads(line) for line in src.open(encoding="utf-8")]
    anchors = json.loads(ANCHORS.read_text(encoding="utf-8"))["destinations"]
    summary: dict = {
        "release": ov.RELEASE,
        "area": "PANAMA_BBOX (rectángulo de ingeniería, no límite oficial)",
        "bbox_total": len(records),
        "with_pa_address": sum("PA" in r["countries"] for r in records),
        "panama_roots": dict(Counter(r.get("taxonomy_root") for r in records).most_common(25)),
        "destinations": {},
    }
    for key, entry in sorted(anchors.items()):
        bounds = entry.get("bounds")
        anchor = entry["anchor"]
        near = [r for r in records if _km(anchor["lat"], anchor["lon"], r["lat"], r["lon"]) <= PROBE_RADIUS_KM]
        summary["destinations"][key] = {
            "anchor": [anchor["lon"], anchor["lat"]],
            "radius_km": PROBE_RADIUS_KM,
            "radius": _breakdown(near),
            "bounds": bounds,
            "in_bounds": _breakdown([r for r in records if _inside(r, bounds)]) if bounds else None,
        }
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return summary


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "extract":
        n = extract(Path(argv[1]))
        print(f"{n} lugares escritos en {argv[1]}")
        return 0
    if len(argv) >= 3 and argv[0] == "summarize":
        summary = summarize(Path(argv[1]), Path(argv[2]))
        print(f"Rectángulo de Panamá: {summary['bbox_total']} lugares; resumen en {argv[2]}")
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
