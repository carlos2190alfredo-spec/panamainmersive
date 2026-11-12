"""Silueta del istmo para la portada «Travesía» (ADR-0026).

Lee la tierra y la frontera del país del mapa base ya extraído (``data/build/basemap/{land,boundaries}.geojsonl``,
Overture Maps, derivado de OpenStreetMap, ODbL), aísla Panamá poligonizando el contorno del país, la simplifica y la
proyecta (equirectangular con corrección de latitud media) a un ``viewBox`` fijo. Con la MISMA proyección sitúa el ancla
de cada destino (``data/anchors/destination-anchors.json``). Escribe ``src/domains/tourism/isthmus.generated.json``:
la ruta SVG, el ``viewBox``, los puntos de cada destino y la procedencia. No inventa nada: si falta un archivo o la
frontera no separa a Panamá, falla.

Uso: ``.venv/bin/python -I pipelines/brand/make_isthmus.py`` (sin red) y después
``pnpm exec prettier --write src/domains/tourism/isthmus.generated.json`` (``pnpm format`` lo comprueba).
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from shapely.geometry import MultiLineString, Point, shape
from shapely.ops import polygonize, unary_union

ROOT = Path(__file__).resolve().parents[2]
LAND = ROOT / "data/build/basemap/land.geojsonl"
BOUNDARIES = ROOT / "data/build/basemap/boundaries.geojsonl"
ANCHORS = ROOT / "data/anchors/destination-anchors.json"
OUT = ROOT / "src/domains/tourism/isthmus.generated.json"

# Caja de trabajo: Panamá con un margen pequeño (grados).
WEST, SOUTH, EAST, NORTH = -83.1, 7.15, -77.15, 9.7
WIDTH = 1000.0  # ancho del viewBox; el alto sale de la proporción real
SIMPLIFY_DEG = 0.012  # ≈ 1,3 km: lo justo para una silueta de portada
MIN_ISLAND_KM2 = 25.0  # islas menores no se dibujan (no se ven a este tamaño)
PANAMA_CITY = Point(-79.534, 8.971)


def lines(path: Path):
    for raw in path.read_text(encoding="utf8").splitlines():
        if raw.strip():
            yield json.loads(raw)


def main() -> int:
    for p in (LAND, BOUNDARIES, ANCHORS):
        if not p.exists():
            print(f"falta {p.relative_to(ROOT)} (ejecuta pnpm data:build)", file=sys.stderr)
            return 2

    # La línea de frontera del país en Overture (`divisions`, subtype country) es el contorno COMPLETO, costas incluidas:
    # al poligonizarla salen el continente y cada isla de Panamá, sin Costa Rica ni Colombia. La capa de tierra se usa
    # solo como control (la pieza continental debe coincidir con ella).
    border_parts = []
    for f in lines(BOUNDARIES):
        if f["properties"].get("subtype") == "country":
            g = shape(f["geometry"])
            border_parts.extend(g.geoms if isinstance(g, MultiLineString) else [g])
    if not border_parts:
        print("no hay frontera de país en boundaries.geojsonl", file=sys.stderr)
        return 1
    polys = list(polygonize(unary_union(border_parts)))
    mainland = next((p for p in polys if p.contains(PANAMA_CITY)), None)
    if mainland is None:
        print("el contorno del país no contiene la Ciudad de Panamá", file=sys.stderr)
        return 1
    km2 = (111.32**2) * math.cos(math.radians(8.5))
    land = unary_union([shape(f["geometry"]) for f in lines(LAND)])
    # Control en UN sentido (r:D-06): el continente cae sobre tierra en ≥ 95 %. No detecta un contorno que haya PERDIDO un
    # trozo (lo que queda seguiría sobre tierra): para eso se imprime el área, que se revisa en el diff al regenerar.
    overlap = mainland.intersection(land).area / mainland.area
    if overlap < 0.95:
        print(f"el contorno y la capa de tierra no coinciden ({overlap:.1%})", file=sys.stderr)
        return 1
    keep = [p for p in polys if p is mainland or p.area * km2 >= MIN_ISLAND_KM2]
    panama = unary_union(keep).simplify(SIMPLIFY_DEG, preserve_topology=True)

    k = math.cos(math.radians((SOUTH + NORTH) / 2))
    scale = WIDTH / ((EAST - WEST) * k)
    height = round((NORTH - SOUTH) * scale, 1)

    def xy(lon: float, lat: float) -> tuple[float, float]:
        return round((lon - WEST) * k * scale, 1), round((NORTH - lat) * scale, 1)

    def ring(coords) -> str:
        pts = [xy(x, y) for x, y in coords]
        return "M" + "L".join(f"{x:g} {y:g}" for x, y in pts) + "Z"

    polys = panama.geoms if panama.geom_type == "MultiPolygon" else [panama]
    d = "".join(ring(p.exterior.coords) for p in polys)

    anchors = json.loads(ANCHORS.read_text(encoding="utf8"))
    points = {}
    for key, entry in sorted(anchors["destinations"].items()):
        a = entry["anchor"]
        x, y = xy(a["lon"], a["lat"])
        points[key] = {"x": x, "y": y, "lon": a["lon"], "lat": a["lat"]}

    out = {
        "viewBox": f"0 0 {WIDTH:g} {height:g}",
        "path": d,
        "points": points,
        "provenance": {
            "source": "contorno del país (data/build/basemap/boundaries.geojsonl, subtype country), contrastado con land.geojsonl; anclas de data/anchors",
            "attribution": anchors["attribution"],
            "license": "ODbL (datos derivados de OpenStreetMap vía Overture): derechos PROVISIONALES (L-01)",
            "release": anchors["release"],
            "simplify_deg": SIMPLIFY_DEG,
            "min_island_km2": MIN_ISLAND_KM2,
            "bbox": [WEST, SOUTH, EAST, NORTH],
            "generator": "pipelines/brand/make_isthmus.py",
        },
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(
        f"{OUT.relative_to(ROOT)}: {len(polys)} polígonos, {len(d)} caracteres de ruta, viewBox {out['viewBox']}, "
        f"continente ≈ {mainland.area * km2:,.0f} km² ({overlap:.1%} sobre tierra)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
