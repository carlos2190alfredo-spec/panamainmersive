"""Sondeo: qué subtipos/clases/geometrías hay en base/land, base/water y base/land_use dentro del bbox de Panamá.

Uso: python -I pipelines/spikes/basemap_schema.py
Sirve para diseñar las capas del basemap SIN suponer el esquema (E-42).
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pipelines.lib import overture as ov  # noqa: E402

GEOM = {1: "Point", 2: "LineString", 3: "Polygon", 4: "MultiPoint", 5: "MultiLineString", 6: "MultiPolygon"}


def gtype(blob: bytes) -> str:
    order = "little" if blob[0] == 1 else "big"
    return GEOM.get(int.from_bytes(blob[1:5], order) % 1000, "?")


for theme, typ in (("base", "land"), ("base", "water"), ("base", "land_use")):
    counter: Counter[tuple] = Counter()
    sizes: Counter[str] = Counter()
    for row in ov.iter_rows(theme, typ, ["subtype", "class", "geometry"]):
        g = gtype(row["geometry"])
        counter[(row.get("subtype"), row.get("class"), g)] += 1
        sizes[g] += len(row["geometry"])
    print(f"\n== {theme}/{typ}  total={sum(counter.values())}  bytes por geometría={dict(sizes)}")
    for (sub, cls, g), n in counter.most_common(28):
        print(f"  {n:>7}  {str(sub):<14} {str(cls):<22} {g}")
