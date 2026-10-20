"""Deriva ancla y encuadre de cada destino desde entidades de Overture elegidas POR ID (no por nombre).

Uso:  python -I pipelines/anchors/derive_anchors.py
Salida: data/anchors/destination-anchors.json (determinista: sin marcas de tiempo)

El script NO decide qué entidad representa un destino: eso está en anchors.config.json (decisión humana,
revisable). Aquí solo se (1) recuperan esas entidades, (2) se comprueba que son lo esperado
(nombre, subtipo, región) y que la corroboración espacial se cumple, y (3) se calcula punto y bbox.
Cualquier discrepancia aborta: nunca se escribe una referencia no verificada.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from shapely import wkb
from shapely.geometry import shape  # noqa: F401  (documenta la dependencia)

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pipelines.lib import overture as ov  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CONFIG = json.loads((ROOT / "pipelines/anchors/anchors.config.json").read_text(encoding="utf-8"))
OUT = ROOT / "data/anchors/destination-anchors.json"

COLUMNS = ["id", "names", "subtype", "class", "region", "country", "wikidata", "geometry", "division_id"]


def primary(row: ov.Row) -> str | None:
    return (row.get("names") or {}).get("primary")


def describe(row: ov.Row, role: str, theme: str, typ: str) -> dict:
    geom = wkb.loads(row["geometry"])
    return {
        "role": role,
        "release": ov.RELEASE,
        "theme": theme,
        "type": typ,
        "id": row["id"],
        "name": primary(row),
        "subtype": row.get("subtype"),
        "region": row.get("region"),
        "wikidata": row.get("wikidata"),
        "geometryType": geom.geom_type,
    }


def check_expect(row: ov.Row, expect: dict, label: str) -> None:
    for field, want in expect.items():
        got = primary(row) if field == "name" else row.get(field)
        if got != want:
            raise SystemExit(f"[{label}] {field}: se esperaba {want!r} pero el ID {row['id']} es {got!r}")


def fetch(wanted: dict[tuple[str, str], set[str]], matches: list[dict], canal: bool) -> dict:
    """Una pasada por tipo: recoge las entidades pedidas por ID, las pedidas por coincidencia exacta y las líneas del Canal."""
    found: dict[tuple[str, str, str], ov.Row] = {}
    matched: dict[int, ov.Row] = {}
    canal_rows: list[ov.Row] = []
    for (theme, typ), ids in wanted.items():
        for row in ov.iter_rows(theme, typ, COLUMNS):
            if row["id"] in ids:
                found[(theme, typ, row["id"])] = row
            for i, m in enumerate(matches):
                if (m["theme"], m["type"]) == (theme, typ) and all(
                    (primary(row) if k == "name" else row.get(k)) == v for k, v in m["match"].items()
                ):
                    matched[i] = row
            if canal and (theme, typ) == ("base", "water") and primary(row) == "Canal de Panamá" and row.get("subtype") == "canal":
                canal_rows.append(row)
    return {"found": found, "matched": matched, "canal": canal_rows}


def bbox_of(row: ov.Row) -> list[float]:
    return [round(v, 4) for v in wkb.loads(row["geometry"]).bounds]


def main() -> None:
    # 1) Recopilar qué hay que pedir
    wanted: dict[tuple[str, str], set[str]] = {}
    matches: list[dict] = []
    need_canal = False

    def want(ref: dict) -> None:
        wanted.setdefault((ref["theme"], ref["type"]), set()).add(ref["id"])

    for key, d in CONFIG["destinations"].items():
        want(d["anchor"])
        b = d.get("bounds")
        if isinstance(b, dict) and b.get("union") == "canal-lines":
            need_canal = True
            wanted.setdefault(("base", "water"), set())
        elif isinstance(b, dict) and b.get("id"):
            want(b)
        elif isinstance(b, dict) and b.get("match"):
            matches.append({"theme": b["theme"], "type": b["type"], "match": b["match"], "for": key})
            wanted.setdefault((b["theme"], b["type"]), set())
        for c in d.get("corroboration", []):
            want(c)

    print(f"Overture {ov.RELEASE}: leyendo {', '.join(f'{t}/{y}' for t, y in wanted)} …", flush=True)
    data = fetch(wanted, matches, need_canal)
    found, matched, canal_rows = data["found"], data["matched"], data["canal"]

    # Un polígono (sobre todo multiparte) no tiene por qué tener su punto representativo en el centro del lugar:
    # Overture enlaza cada `division_area` con su punto `division` por `division_id` (relación por ID, no por nombre).
    division_ids = {
        row["division_id"]
        for (theme, typ, _), row in found.items()
        if (theme, typ) == ("divisions", "division_area") and row.get("division_id")
    }
    division_points: dict[str, ov.Row] = {}
    if division_ids:
        for row in ov.iter_rows("divisions", "division", COLUMNS):
            if row["id"] in division_ids:
                division_points[row["id"]] = row

    # 2) Calcular y verificar
    out: dict = {}
    for key, d in CONFIG["destinations"].items():
        ref = d["anchor"]
        row = found.get((ref["theme"], ref["type"], ref["id"]))
        if row is None:
            raise SystemExit(f"[{key}] no se encontró el ancla {ref['id']} en {ref['theme']}/{ref['type']}")
        check_expect(row, ref.get("expect", {}), key)
        geom = wkb.loads(row["geometry"])
        sources = [describe(row, "anchor", ref["theme"], ref["type"])]
        point_row = division_points.get(row.get("division_id") or "")
        if geom.geom_type == "Point":
            lon, lat, method = geom.x, geom.y, "point"
        elif point_row is not None and wkb.loads(point_row["geometry"]).geom_type == "Point" and geom.covers(wkb.loads(point_row["geometry"])):
            pt = wkb.loads(point_row["geometry"])
            lon, lat, method = pt.x, pt.y, "division_point"
            sources.append(describe(point_row, "anchor_point", "divisions", "division"))
        else:
            p = geom.representative_point()  # siempre DENTRO del polígono (el centroide puede caer fuera)
            lon, lat, method = p.x, p.y, "representative_point"
        if not (ov.PANAMA_BBOX[0] <= lon <= ov.PANAMA_BBOX[2] and ov.PANAMA_BBOX[1] <= lat <= ov.PANAMA_BBOX[3]):
            raise SystemExit(f"[{key}] ancla fuera del área de trabajo de Panamá: {lon}, {lat}")

        b = d.get("bounds")
        if b == "anchor":
            bounds = bbox_of(row) if geom.geom_type != "Point" else None
        elif isinstance(b, dict) and b.get("union") == "canal-lines":
            if not canal_rows:
                raise SystemExit(f"[{key}] no se encontraron las líneas del Canal")
            boxes = [bbox_of(r) for r in canal_rows]
            bounds = [min(x[0] for x in boxes), min(x[1] for x in boxes), max(x[2] for x in boxes), max(x[3] for x in boxes)]
            sources.append({"role": "bounds", "release": ov.RELEASE, "theme": "base", "type": "water", "name": "Canal de Panamá", "count": len(canal_rows), "geometryType": "LineString", "ids": sorted(r["id"] for r in canal_rows)})
        elif isinstance(b, dict) and b.get("id"):
            brow = found[(b["theme"], b["type"], b["id"])]
            check_expect(brow, b.get("expect", {}), f"{key}/bounds")
            bounds = bbox_of(brow)
            sources.append(describe(brow, "bounds", b["theme"], b["type"]))
        elif isinstance(b, dict) and b.get("match"):
            idx = next(i for i, m in enumerate(matches) if m["for"] == key)
            brow = matched.get(idx)
            if brow is None:
                raise SystemExit(f"[{key}] no se encontró el encuadre por {b['match']}")
            bounds = bbox_of(brow)
            sources.append(describe(brow, "bounds", b["theme"], b["type"]))
        else:
            bounds = None

        corroboration = []
        for c in d.get("corroboration", []):
            crow = found.get((c["theme"], c["type"], c["id"]))
            if crow is None:
                raise SystemExit(f"[{key}] no se encontró la corroboración {c['id']}")
            check_expect(crow, c.get("expect", {}), f"{key}/corroboración")
            cgeom = wkb.loads(crow["geometry"])
            ok = bool(c.get("mustBeWithinAnchor")) and geom.covers(cgeom)
            if c.get("mustBeWithinAnchor") and not ok:
                raise SystemExit(f"[{key}] la corroboración «{primary(crow)}» NO cae dentro del ancla: identidad no corroborada")
            corroboration.append({**describe(crow, "corroboration", c["theme"], c["type"]), "withinAnchor": ok})

        if bounds is not None and not (bounds[0] <= lon <= bounds[2] and bounds[1] <= lat <= bounds[3]):
            raise SystemExit(f"[{key}] el ancla no está dentro de su propio encuadre")
        out[key] = {
            "anchor": {"lon": round(lon, 5), "lat": round(lat, 5), "method": method},
            "bounds": bounds,
            "defaultZoom": d["defaultZoom"],
            "sources": sources,
            "corroboration": corroboration,
            **({"note": d["note"]} if "note" in d else {}),
        }
        print(f"  {key:<18} ancla=({lon:.4f}, {lat:.4f}) {method:<20} encuadre={bounds}", flush=True)

    doc = {
        "release": ov.RELEASE,
        "sourceClass": "osm_derived",
        "license": "ODbL (datos derivados de OpenStreetMap vía Overture) — PROVISIONAL, no leída en la fuente primaria",
        "attribution": "© OpenStreetMap contributors, Overture Maps Foundation",
        "disclaimer": "Puntos de referencia de ubicación derivados de OpenStreetMap. NO son límites oficiales ni geometrías de los destinos.",
        "destinations": out,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"OK → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
