"""Sondeo de homonimias (corrige E-23): dónde están realmente «El Valle» y «Casco Viejo/Antiguo».

Uso: python -I pipelines/spikes/homonyms.py
Resuelve la provincia de cada hallazgo por CONTENCIÓN en los polígonos `region` (no por el campo `region`
de la fila, que sirve de contraste).
"""
from __future__ import annotations

import sys
from pathlib import Path

from shapely import wkb

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pipelines.lib import overture as ov  # noqa: E402

COLS = ["id", "names", "subtype", "class", "region", "geometry"]


def name_of(row: ov.Row) -> str:
    return (row.get("names") or {}).get("primary") or ""


regions = [
    (name_of(r), wkb.loads(r["geometry"]))
    for r in ov.iter_rows("divisions", "division_area", COLS)
    if r.get("subtype") == "region" and r.get("country") != "x"
]


def province(geom) -> str:
    p = geom.representative_point()
    hits = [n for n, g in regions if g.covers(p)]
    return " | ".join(hits) or "(fuera de las provincias terrestres)"


def show(theme: str, typ: str, wanted: tuple[str, ...]) -> None:
    for row in ov.iter_rows(theme, typ, COLS):
        n = name_of(row)
        if n.casefold() in wanted:
            g = wkb.loads(row["geometry"])
            p = g.representative_point()
            print(f"{theme}/{typ:<14} {n!r:<18} subtipo={row.get('subtype')}/{row.get('class')} region_campo={row.get('region')} "
                  f"punto=({p.x:.4f},{p.y:.4f}) provincia_por_contención={province(g)} id={row['id']}")


print(f"Overture {ov.RELEASE}")
show("divisions", "division_area", ("el valle", "el valle de antón", "casco antiguo", "casco viejo", "san felipe"))
show("base", "land_use", ("casco viejo", "casco antiguo"))
show("base", "infrastructure", ("casco viejo", "casco antiguo"))
