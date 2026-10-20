"""Sondeo: ¿los polígonos `ocean` de Overture (base/water) cubren el mar de Panamá y excluyen la tierra? (E-42)

Puntos de comprobación APROXIMADOS (conocimiento general), solo para validar el diseño del basemap.
Uso: python -I pipelines/spikes/ocean_coverage.py
"""
from __future__ import annotations

import sys
from pathlib import Path

from shapely import wkb
from shapely.geometry import Point
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pipelines.lib import overture as ov  # noqa: E402

oceans = [wkb.loads(r["geometry"]) for r in ov.iter_rows("base", "water", ["subtype", "geometry"]) if r.get("subtype") == "ocean"]
tree = STRtree(oceans)
print(f"polígonos ocean: {len(oceans)}  área total (°²): {sum(g.area for g in oceans):.2f}")

SEA = {
    "Golfo de Panamá": (-79.3, 8.2), "Caribe frente a Colón": (-79.9, 9.7), "Golfo de Chiriquí": (-82.2, 7.9),
    "Golfo de Montijo": (-81.0, 7.65), "Pacífico al sur de Coiba": (-81.8, 6.95), "Caribe frente a Bocas": (-82.0, 9.7),
    "Golfo de San Miguel": (-78.2, 8.35), "Bahía de Panamá cerca de la ciudad": (-79.45, 8.88),
}
LAND = {
    "Boquete": (-82.437, 8.78), "Ciudad de Panamá": (-79.52, 8.98), "El Valle": (-80.126, 8.601), "Volcán Barú": (-82.543, 8.808),
    "Santiago de Veraguas": (-80.98, 8.1), "Isla Colón (Bocas)": (-82.24, 9.34), "Santa Catalina": (-81.267, 8.14),
    "Isla de Coiba": (-81.75, 7.45), "David": (-82.43, 8.43), "Colón": (-79.9, 9.36), "Panamá Viejo (zona del Canal)": (-79.59, 9.0),
}
def inside(x: float, y: float) -> bool:
    p = Point(x, y)
    return any(oceans[i].covers(p) for i in tree.query(p))

print("\nMAR (debe estar dentro de `ocean`):")
for n, (x, y) in SEA.items(): print(f"  {n:<36} {'DENTRO' if inside(x, y) else 'FUERA  ← hueco'}")
print("\nTIERRA (debe estar FUERA de `ocean`):")
for n, (x, y) in LAND.items(): print(f"  {n:<36} {'FUERA' if not inside(x, y) else 'DENTRO ← error'}")
