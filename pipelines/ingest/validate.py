"""Validación geométrica de entrada (docs/gis.md §1). NO REPARA: lo que no pasa va a cuarentena con su motivo.

Comprueba estructura antes de construir nada con shapely (una entrada hostil no debe poder agotar memoria o pila),
coordenadas finitas y en rango, orden de ejes (lon, lat), área de trabajo de Panamá (la misma que el CHECK de la
BD), anillos cerrados y de longitud mínima, tope de vértices y validez topológica (`ST_IsValid`).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from shapely.geometry import shape
from shapely.validation import explain_validity

# Debe coincidir con el CHECK `geometry_in_working_area` de la migración 0002 (una prueba lo comprueba).
WORKING_AREA = (-85.0, 5.0, -75.0, 11.0)  # oeste, sur, este, norte
MAX_VERTICES = 250_000
MAX_RINGS = 20_000
ALLOWED_TYPES = ("Polygon", "MultiPolygon")
RULES_VERSION = 1


@dataclass(frozen=True)
class Issue:
    code: str
    detail: str = ""


def _walk_rings(geometry: dict[str, Any]) -> list[list[Any]] | Issue:
    """Aplana Polygon/MultiPolygon a una lista de anillos, de forma ITERATIVA y comprobando la forma."""
    coords = geometry.get("coordinates")
    if not isinstance(coords, list):
        return Issue("geometry.no_coordinates")
    polygons = [coords] if geometry["type"] == "Polygon" else coords
    if not isinstance(polygons, list):
        return Issue("geometry.bad_structure")
    rings: list[list[Any]] = []
    for polygon in polygons:
        if not isinstance(polygon, list) or not polygon:
            return Issue("geometry.bad_structure", "polígono vacío o mal formado")
        for ring in polygon:
            if not isinstance(ring, list):
                return Issue("geometry.bad_structure", "anillo mal formado")
            rings.append(ring)
            if len(rings) > MAX_RINGS:
                return Issue("geometry.too_many_rings", f"> {MAX_RINGS}")
    return rings


def validate_polygonal_geometry(geometry: Any) -> list[Issue]:
    if not isinstance(geometry, dict):
        return [Issue("geometry.missing")]
    gtype = geometry.get("type")
    if gtype not in ALLOWED_TYPES:
        return [Issue("geometry.type_not_allowed", str(gtype)[:40])]
    rings = _walk_rings(geometry)
    if isinstance(rings, Issue):
        return [rings]

    vertices = 0
    xs: list[float] = []
    ys: list[float] = []
    issues: list[Issue] = []
    for ring in rings:
        if len(ring) < 4:
            issues.append(Issue("geometry.ring_too_short", f"{len(ring)} posiciones"))
            continue
        for position in ring:
            vertices += 1
            if vertices > MAX_VERTICES:
                return [Issue("geometry.too_many_vertices", f"> {MAX_VERTICES}")]
            if (
                not isinstance(position, list)
                or len(position) != 2
                or any(isinstance(v, bool) or not isinstance(v, (int, float)) for v in position)
            ):
                return [Issue("geometry.bad_position", "se esperaba [lon, lat]")]
            x, y = float(position[0]), float(position[1])
            if not (math.isfinite(x) and math.isfinite(y)):
                return [Issue("geometry.coordinates_not_finite")]
            xs.append(x)
            ys.append(y)
        if ring[0] != ring[-1]:
            issues.append(Issue("geometry.ring_not_closed"))
    if not xs:
        return issues or [Issue("geometry.empty")]
    if issues:
        return issues

    if min(xs) < -180 or max(xs) > 180 or min(ys) < -90 or max(ys) > 90:
        return [Issue("geometry.out_of_range", "lon fuera de ±180 o lat fuera de ±90")]
    west, south, east, north = WORKING_AREA
    # Ejes invertidos (lat, lon): longitudes plausibles como latitudes de Panamá y viceversa.
    if south <= min(xs) and max(xs) <= north and west <= min(ys) and max(ys) <= east:
        return [Issue("geometry.axis_order_swapped", "parece [lat, lon]; GeoJSON es [lon, lat]")]
    if min(xs) < west or max(xs) > east or min(ys) < south or max(ys) > north:
        return [Issue("geometry.outside_working_area", "fuera del área de trabajo de Panamá")]

    # Solo ahora se construye la geometría (ya acotada); sin reparación: lo inválido NO se arregla.
    geom = shape(geometry)
    if geom.is_empty:
        return [Issue("geometry.empty")]
    if not geom.is_valid:
        return [Issue("geometry.invalid", explain_validity(geom)[:200])]
    if geom.area <= 0:
        return [Issue("geometry.zero_area")]
    return []
