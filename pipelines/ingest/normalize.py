"""Normalización al esquema de importación y validación de propiedades (docs/gis.md §3).

Las áreas se identifican por su ID de origen (`overture_id`), NUNCA por el nombre. Los nombres por idioma solo
existen si la fuente los trae: no se traducen topónimos.
"""
from __future__ import annotations

import re
from typing import Any

from pipelines.ingest.validate import Issue

LOCALES = ("es", "en", "pt", "fr", "de")
AREA_KINDS = (
    "country", "region", "county", "locality", "protected_area", "island",
    "water_body", "historic_district", "infrastructure", "editorial_area",
)
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
WIKIDATA = re.compile(r"^Q[1-9][0-9]{0,12}$")
CONTROL = re.compile(r"[\x00-\x1f\x7f]")
MAX_NAME = 300

KIND_BY_SOURCE: dict[tuple[str, str, str], str] = {
    ("base", "land_use", "protected"): "protected_area",
    ("divisions", "division_area", "country"): "country",
    ("divisions", "division_area", "region"): "region",
    ("divisions", "division_area", "county"): "county",
    ("divisions", "division_area", "locality"): "locality",
}


def kind_for(theme: str, typ: str, subtype: str | None, cls: str | None) -> str | None:
    if (theme, typ) == ("base", "land") and subtype == "land" and cls in ("island", "islet"):
        return "island"
    return KIND_BY_SOURCE.get((theme, typ, subtype or ""))


def _clean_name(value: Any) -> str | None:
    return value if isinstance(value, str) and 0 < len(value) <= MAX_NAME and not CONTROL.search(value) else None


def validate_properties(props: Any) -> list[Issue]:
    if not isinstance(props, dict):
        return [Issue("properties.missing")]
    issues: list[Issue] = []
    oid = props.get("overture_id")
    if not (isinstance(oid, str) and UUID.match(oid)):
        issues.append(Issue("properties.bad_id", "overture_id debe ser un UUID"))
    if props.get("kind") not in AREA_KINDS:
        issues.append(Issue("properties.bad_kind", str(props.get("kind"))[:40]))
    if "name_local" in props and props["name_local"] is not None and _clean_name(props["name_local"]) is None:
        issues.append(Issue("properties.bad_name", "name_local vacío, largo o con caracteres de control"))
    names = props.get("names", {})
    if not isinstance(names, dict):
        issues.append(Issue("properties.bad_names"))
    else:
        for locale, name in names.items():
            if locale not in LOCALES or _clean_name(name) is None:
                issues.append(Issue("properties.bad_names", f"{str(locale)[:10]}"))
    wikidata = props.get("wikidata")
    if wikidata is not None and not (isinstance(wikidata, str) and WIKIDATA.match(wikidata)):
        issues.append(Issue("properties.bad_wikidata"))
    return issues


def names_from_row(row: dict[str, Any]) -> tuple[str | None, dict[str, str]]:
    """Nombre local + nombres por idioma QUE LA FUENTE TRAE (y que difieren del local)."""
    names = row.get("names") or {}
    local = _clean_name(names.get("primary"))
    common = dict(names.get("common") or [])
    by_locale = {
        loc: common[loc]
        for loc in LOCALES
        if _clean_name(common.get(loc)) is not None and common[loc] != local
    }
    return local, by_locale
