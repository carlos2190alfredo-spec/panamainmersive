"""Construye el basemap vectorial de Panamá (PMTiles) desde Overture y escribe su manifiesto de procedencia.

Uso:
  python -I pipelines/basemap/build_basemap.py                 # extrae, teselea, verifica y publica en public/data/
  python -I pipelines/basemap/build_basemap.py --verify-only   # solo verifica el artefacto ya construido

Diseño (docs/gis.md, ADR-0014):
- UNA sola fuente (Overture, release fijada en pipelines/lib/overture.py). Comprobado (E-42): `base/land` + `base/water`
  `ocean` cubren todo el bbox de trabajo; no hace falta Natural Earth.
- Todo se recorta al bbox de trabajo ANTES de teselear (un polígono oceánico sin recortar generaría millones de teselas).
  Las fronteras se calculan ANTES de recortar (si no, el borde del bbox aparecería como una línea falsa).
- Geometrías inválidas: aquí (solo para dibujar) se reparan con `make_valid` y se CUENTAN en el manifiesto.
  La geometría de destinos que va a la BD nunca se repara en silencio (docs/data-model.md).
- Determinista: filas ordenadas por ID, sin marcas de tiempo, versiones de herramientas registradas.
- Nada se inventa: los nombres por idioma solo existen si la fuente los trae (E-42: casi ninguno en Panamá).
- NO se usa `tippecanoe:minzoom/maxzoom` por entidad ni `--drop-*-as-needed` (E-42): con tippecanoe 2.49 el primero
  descartaba en silencio entre el 25 % y el 75 % de las entidades incluso a z14, y el segundo decide el descarte POR
  ZOOM y para TODAS las teselas. El rango de zoom se fija por CAPA (`-L{"minzoom":…}`) y las entidades se reparten en
  bandas (`water` / `water_detail`…). La conservación exacta a z14 se comprueba en `verify`.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import shutil
import subprocess
import sys
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import shapely
from mapbox_vector_tile import decode as mvt_decode
from pmtiles.reader import MmapSource, Reader, all_tiles
from pmtiles.tile import Compression, TileType
from shapely import wkb
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pipelines.lib import overture as ov  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "data/build/basemap"
PUBLIC = ROOT / "public/data"
ARTIFACT = "panama-basemap.pmtiles"
MANIFEST = "panama-basemap.manifest.json"
ANCHORS = ROOT / "data/anchors/destination-anchors.json"

MIN_ZOOM, MAX_ZOOM = 4, 14
BBOX = ov.PANAMA_BBOX
BOX = box(*BBOX)
LANGS = ("es", "en", "pt", "fr", "de")
M2_PER_DEG2 = (111_320.0**2) * math.cos(math.radians(9.0))  # área aproximada en m² para umbrales de zoom



# --------------------------------------------------------------------------- utilidades de geometría
def flatten(geom: shapely.Geometry) -> Iterator[shapely.Geometry]:
    if geom.geom_type.startswith("Multi") or geom.geom_type == "GeometryCollection":
        for part in geom.geoms:
            yield from flatten(part)
    else:
        yield geom


def only(geom: shapely.Geometry, kind: str) -> shapely.Geometry | None:
    """Conserva solo las partes de `kind` ('polygon'|'line'|'point'); None si no queda nada."""
    wanted = {"polygon": "Polygon", "line": "LineString", "point": "Point"}[kind]
    parts = [g for g in flatten(geom) if g.geom_type == wanted and not g.is_empty]
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0]
    return {"polygon": shapely.MultiPolygon, "line": shapely.MultiLineString, "point": shapely.MultiPoint}[kind](parts)


def round_coords(geom: shapely.Geometry) -> shapely.Geometry:
    return shapely.transform(geom, lambda a: np.round(a, 7))


def area_m2(geom: shapely.Geometry) -> float:
    return geom.area * M2_PER_DEG2




def primary(row: ov.Row) -> str | None:
    return (row.get("names") or {}).get("primary")


# --------------------------------------------------------------------------- capas
Props = dict[str, object]
Select = Callable[[ov.Row, shapely.Geometry], tuple[Props, shapely.Geometry] | None]
DETAIL_AREA_M2 = 0.5e6  # por debajo, el polígono va a la banda «detail» (solo zooms altos)
# Un píxel a z14 mide ≈0,6 m: un polígono menor de 1 m² es un artefacto de los datos (p. ej. una astilla de 0,3 m²
# en la costa de Colón) y tippecanoe lo descartaría igualmente. Se descarta AQUÍ, explícito y contado.
MIN_POLYGON_M2 = 1.0


@dataclass
class Layer:
    id: str
    theme: str
    type: str
    kind: str  # 'polygon' | 'line' | 'point'
    select: Select
    note: str
    zmin: int = MIN_ZOOM
    clip_after: bool = True  # False: la geometría derivada ya se recortó (fronteras)


def named(props: Props, name: str | None) -> Props:
    if name:
        props["name"] = name
    return props


def land_select(row: ov.Row, geom: shapely.Geometry) -> tuple[Props, shapely.Geometry] | None:
    if row.get("subtype") != "land":
        return None
    return {"class": row.get("class") or "land"}, geom


def ocean_select(row: ov.Row, geom: shapely.Geometry) -> tuple[Props, shapely.Geometry] | None:
    return ({}, geom) if row.get("subtype") == "ocean" else None


WATER_POLY_SUBTYPES = {"lake", "reservoir", "river", "water", "canal", "pond"}
WATER_EXCLUDED_CLASSES = {"swimming_pool", "wastewater", "fishpond", "salt_pond", "drain", "ditch", "basin", "water_storage"}


def water_select(detail: bool) -> Select:
    def select(row: ov.Row, geom: shapely.Geometry) -> tuple[Props, shapely.Geometry] | None:
        if row.get("subtype") not in WATER_POLY_SUBTYPES or row.get("class") in WATER_EXCLUDED_CLASSES:
            return None
        if (area_m2(geom) < DETAIL_AREA_M2) != detail:
            return None
        return named({"subtype": row["subtype"], "class": row.get("class") or row["subtype"]}, primary(row)), geom

    return select


def waterway_select(detail: bool) -> Select:
    def select(row: ov.Row, geom: shapely.Geometry) -> tuple[Props, shapely.Geometry] | None:
        sub, cls, name = row.get("subtype"), row.get("class"), primary(row)
        if sub == "canal" and cls == "canal":
            major = True
        elif sub == "river" and cls == "river":
            major = bool(name)
        elif sub == "stream" and cls == "stream":
            major = False
        else:
            return None
        if major == detail:
            return None
        return named({"subtype": sub, "class": cls}, name), geom

    return select


LANDCOVER_SUBTYPES = {"forest", "wetland", "sand", "reef"}


def landcover_select(detail: bool) -> Select:
    def select(row: ov.Row, geom: shapely.Geometry) -> tuple[Props, shapely.Geometry] | None:
        if row.get("subtype") not in LANDCOVER_SUBTYPES or (area_m2(geom) < DETAIL_AREA_M2) != detail:
            return None
        return {"subtype": row["subtype"]}, geom

    return select


def protected_select(row: ov.Row, geom: shapely.Geometry) -> tuple[Props, shapely.Geometry] | None:
    if row.get("subtype") != "protected":
        return None
    return named({"class": row.get("class") or "protected", "ovid": row["id"]}, primary(row)), geom


def boundary_select(row: ov.Row, geom: shapely.Geometry) -> tuple[Props, shapely.Geometry] | None:
    # Solo divisiones de Panamá en tierra (las marítimas son otra cosa y no se dibujan como frontera terrestre).
    if row.get("country") != "PA" or row.get("class") != "land" or row.get("subtype") not in ("country", "region", "county"):
        return None
    line = only(geom.boundary, "line")  # ANTES de recortar: el borde del bbox no es una frontera
    if line is None:
        return None
    clipped = only(shapely.intersection(line, BOX), "line")
    return ({"subtype": row["subtype"]}, clipped) if clipped is not None else None


def place_select(row: ov.Row, geom: shapely.Geometry) -> tuple[Props, shapely.Geometry] | None:
    if row.get("country") != "PA" or geom.geom_type != "Point":
        return None
    sub = row.get("subtype")
    if sub == "region":
        kind = "region"
    elif sub == "locality":
        kind = row.get("class") or "locality"
    else:
        return None
    name = primary(row)
    if not name:
        return None
    props: Props = {"kind": kind, "name": name, "ovid": row["id"]}
    common = dict((row.get("names") or {}).get("common") or [])
    for lang in LANGS:  # solo nombres que la FUENTE trae y que difieren del primario; jamás traducidos por nosotros
        if common.get(lang) and common[lang] != name:
            props[f"name_{lang}"] = common[lang]
    if row.get("population"):
        props["population"] = row["population"]
    prominence = (row.get("cartography") or {}).get("prominence")
    if prominence is not None:
        props["prominence"] = prominence
    return props, geom


# Columnas por fuente (las capas que comparten fuente se extraen en UNA lectura).
SOURCE_COLUMNS: dict[tuple[str, str], list[str]] = {
    ("base", "land"): ["id", "subtype", "class", "geometry"],
    ("base", "land_use"): ["id", "names", "subtype", "class", "geometry"],
    ("base", "water"): ["id", "names", "subtype", "class", "geometry"],
    ("divisions", "division_area"): ["id", "subtype", "class", "country", "geometry"],
    ("divisions", "division"): ["id", "names", "subtype", "class", "population", "country", "cartography", "geometry"],
}

LAYERS: list[Layer] = [
    Layer("land", "base", "land", "polygon", land_select, "base/land subtype=land (continente, islas, islotes)"),
    Layer("landcover", "base", "land", "polygon", landcover_select(False), "base/land forest|wetland|sand|reef, área ≥ 0,5 km²", zmin=8),
    Layer("landcover_detail", "base", "land", "polygon", landcover_select(True), "ídem, área < 0,5 km²", zmin=12),
    Layer("protected", "base", "land_use", "polygon", protected_select, "base/land_use subtype=protected (OSM, no oficial)"),
    Layer("boundaries", "divisions", "division_area", "line", boundary_select, "contorno de country|region|county de Panamá, clase land", clip_after=False),
    Layer("ocean", "base", "water", "polygon", ocean_select, "base/water subtype=ocean"),
    Layer("water", "base", "water", "polygon", water_select(False), "base/water polígonos (lago, embalse, río, canal, agua, estanque), área ≥ 0,5 km²", zmin=5),
    Layer("water_detail", "base", "water", "polygon", water_select(True), "ídem, área < 0,5 km²", zmin=10),
    Layer("waterway", "base", "water", "line", waterway_select(False), "base/water líneas: canal y río con nombre", zmin=7),
    Layer("waterway_detail", "base", "water", "line", waterway_select(True), "base/water líneas: río sin nombre y arroyo", zmin=10),
    Layer("places", "divisions", "division", "point", place_select, "divisions/division locality|region de Panamá"),
]


# --------------------------------------------------------------------------- extracción
def extract_all(layers: list[Layer], out_dir: Path) -> dict[str, dict[str, int]]:
    """Lee cada fuente UNA vez y reparte las filas entre las capas que la usan. Filas ordenadas por ID (determinista)."""
    stats = {l.id: {"rowsRead": 0, "selected": 0, "repaired": 0, "emptyAfterClip": 0, "subPixelDropped": 0, "written": 0} for l in layers}
    by_source: dict[tuple[str, str], list[Layer]] = {}
    for layer in layers:
        by_source.setdefault((layer.theme, layer.type), []).append(layer)
    for (theme, typ), group in by_source.items():
        print(f"  leyendo {theme}/{typ} → {', '.join(l.id for l in group)}", flush=True)
        rows = sorted(ov.iter_rows(theme, typ, SOURCE_COLUMNS[(theme, typ)]), key=lambda r: r["id"])
        handles = {l.id: (out_dir / f"{l.id}.geojsonl").open("w", encoding="utf-8") for l in group}
        try:
            for row in rows:
                geom = wkb.loads(row["geometry"])
                repaired = False
                if not geom.is_valid:
                    geom = shapely.make_valid(geom)
                    repaired = True
                for layer in group:
                    st = stats[layer.id]
                    st["rowsRead"] += 1
                    st["repaired"] += int(repaired)
                    picked = layer.select(row, geom)
                    if picked is None:
                        continue
                    props, g = picked
                    st["selected"] += 1
                    if layer.clip_after:
                        g = shapely.intersection(g, BOX)
                    g = only(g, layer.kind)
                    if g is None:
                        st["emptyAfterClip"] += 1
                        continue
                    if layer.kind == "polygon" and area_m2(g) < MIN_POLYGON_M2:
                        st["subPixelDropped"] += 1
                        continue
                    feature = {"type": "Feature", "properties": props, "geometry": json.loads(shapely.to_geojson(round_coords(g)))}
                    handles[layer.id].write(json.dumps(feature, ensure_ascii=False, separators=(",", ":")) + "\n")
                    st["written"] += 1
        finally:
            for h in handles.values():
                h.close()
    return stats


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def tippecanoe_args(layers: list[Layer], files: dict[str, Path], out: Path) -> list[str]:
    args = [
        "tippecanoe", "-o", str(out), "--force",
        f"-Z{MIN_ZOOM}", f"-z{MAX_ZOOM}",
        # -r1: sin adelgazamiento de puntos por zoom (el adelgazamiento lo hace el estilo con minzoom por clase).
        # NO se usa --drop-*-as-needed ni tippecanoe:minzoom por entidad (ver la cabecera y E-42).
        "-r1", "--no-tile-size-limit", "--no-feature-limit", "--no-tile-stats", "--read-parallel",
        "--name=Panamá Immersive — basemap",
        "--description=Basemap derivado de Overture Maps (OpenStreetMap). No contiene límites oficiales.",
        f"--attribution={ATTRIBUTION}",
    ]
    for layer in layers:
        args.append("-L" + json.dumps({"file": str(files[layer.id]), "layer": layer.id, "minzoom": layer.zmin, "maxzoom": MAX_ZOOM}))
    return args


def run_tippecanoe(layers: list[Layer], files: dict[str, Path], out: Path) -> tuple[list[str], str]:
    version = subprocess.run(["tippecanoe", "--version"], capture_output=True, text=True, check=False)
    args = tippecanoe_args(layers, files, out)
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return args, (version.stdout + version.stderr).strip()


def build_fid_archive(layers: list[Layer], files: dict[str, Path], out: Path) -> None:
    """Archivo de VERIFICACIÓN: las mismas capas y opciones con un `fid` por entidad, para comprobar la conservación
    exacta. No se publica (el identificador solo sirve para contar)."""
    fid_dir = BUILD / "fidcheck"
    fid_dir.mkdir(exist_ok=True)
    fid_files: dict[str, Path] = {}
    for layer in layers:
        if layer.id == "places":  # ya lleva `ovid`
            fid_files[layer.id] = files[layer.id]
            continue
        dst = fid_dir / f"{layer.id}.geojsonl"
        with files[layer.id].open(encoding="utf-8") as src, dst.open("w", encoding="utf-8") as fh:
            for n, line in enumerate(src):
                feature = json.loads(line)
                feature["properties"]["fid"] = n
                fh.write(json.dumps(feature, ensure_ascii=False, separators=(",", ":")) + "\n")
        fid_files[layer.id] = dst
    subprocess.run(tippecanoe_args(layers, fid_files, out), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


ATTRIBUTION = "© OpenStreetMap contributors, Overture Maps Foundation"


# --------------------------------------------------------------------------- verificación
def tile_xy(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def tile_lonlat(z: int, x: int, y: int, px: float, py: float, extent: int) -> tuple[float, float]:
    n = 2**z
    lon = (x + px / extent) / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1 - py / extent) / n))))
    return lon, lat


def verify(path: Path, fid_path: Path, layers: list[Layer]) -> dict[str, object]:
    expected_layers = [l.id for l in layers]
    result: dict[str, object] = {}
    problems: list[str] = []
    with path.open("rb") as fh:
        source = MmapSource(fh)
        reader = Reader(source)
        header = reader.header()
        meta = reader.metadata()
        if header["tile_type"] != TileType.MVT:
            problems.append(f"tile_type inesperado: {header['tile_type']}")
        if header["min_zoom"] > MIN_ZOOM or header["max_zoom"] != MAX_ZOOM:
            problems.append(f"zooms inesperados: {header['min_zoom']}–{header['max_zoom']}")
        declared = sorted(v["id"] for v in meta.get("vector_layers", []))
        if declared != sorted(expected_layers):
            problems.append(f"capas declaradas {declared} ≠ esperadas {sorted(expected_layers)}")

        def decode_tile(z: int, x: int, y: int) -> dict[str, dict] | None:
            data = reader.get(z, x, y)
            if data is None:
                return None
            return mvt_decode(gzip.decompress(data) if header["tile_compression"] == Compression.GZIP else data)

        # 1) cobertura completa: toda tesela z7 que toca el bbox existe y trae tierra u océano
        x0, y1 = tile_xy(BBOX[0], BBOX[1], 7)
        x1, y0 = tile_xy(BBOX[2], BBOX[3], 7)
        missing, checked = [], 0
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                checked += 1
                t = decode_tile(7, x, y)
                if t is None or not ({"land", "ocean"} & set(t)):
                    missing.append((7, x, y))
        if missing:
            problems.append(f"{len(missing)} teselas z7 sin tierra ni océano: {missing[:5]}")
        result["z7Tiles"] = {"checked": checked, "missing": len(missing)}

        # 2) cada ancla tiene su tesela z12/z14 con tierra y, si procede, su lugar dibujado donde dice el ancla
        anchors = json.loads(ANCHORS.read_text(encoding="utf-8"))["destinations"] if ANCHORS.exists() else {}
        anchor_report: dict[str, dict[str, object]] = {}
        for key, a in sorted(anchors.items()):
            lon, lat = a["anchor"]["lon"], a["anchor"]["lat"]
            entry: dict[str, object] = {}
            for z in (12, 14):
                x, y = tile_xy(lon, lat, z)
                t = decode_tile(z, x, y)
                entry[f"z{z}"] = sorted(t) if t else None
                if t is None or "land" not in t:
                    problems.append(f"{key}: la tesela z{z} del ancla no trae `land`")
            if a["anchor"]["method"] == "division_point":
                x, y = tile_xy(lon, lat, 14)
                t = decode_tile(14, x, y) or {}
                best = None
                for f in (t.get("places") or {}).get("features", []):
                    g = f["geometry"]
                    if g["type"] != "Point":
                        continue
                    flon, flat = tile_lonlat(14, x, y, g["coordinates"][0], g["coordinates"][1], (t["places"].get("extent") or 4096))
                    d_m = math.hypot((flon - lon) * 111_320 * math.cos(math.radians(lat)), (flat - lat) * 110_540)
                    if best is None or d_m < best[0]:
                        best = (d_m, f["properties"].get("name"))
                entry["placeDistanceM"] = round(best[0], 1) if best else None
                entry["placeName"] = best[1] if best else None
                if best is None or best[0] > 25:
                    problems.append(f"{key}: no hay un lugar dibujado a ≤25 m del ancla (z14): {best}")
            anchor_report[key] = entry
        result["anchors"] = anchor_report

        # 3) conservación de lugares: TODOS aparecen en TODOS los zooms (los puntos no desaparecen al alejar)
        places_file = BUILD / "places.geojsonl"
        want = {json.loads(line)["properties"]["ovid"] for line in places_file.read_text(encoding="utf-8").splitlines()}
        seen: dict[int, set[str]] = {z: set() for z in (5, 8, 10, 12, 14)}
        sizes: list[int] = []
        for (z, _x, _y), data in all_tiles(source):
            sizes.append(len(data))
            if z in seen:
                payload = gzip.decompress(data) if header["tile_compression"] == Compression.GZIP else data
                for feat in (mvt_decode(payload).get("places") or {}).get("features", []):
                    seen[z].add(feat["properties"]["ovid"])
        conservation: dict[str, dict[str, int]] = {}
        for z, got in seen.items():
            lost = want - got
            conservation[f"places z{z}"] = {"expected": len(want), "present": len(want & got), "lost": len(lost)}
            if lost:
                problems.append(f"z{z}: se perdieron {len(lost)} de {len(want)} lugares al teselear")
        result["placesConservation"] = conservation
        sizes.sort()
        result["tileBytesGzip"] = {"count": len(sizes), "median": sizes[len(sizes) // 2], "p99": sizes[int(len(sizes) * 0.99)], "max": sizes[-1]}

    # 4) conservación exacta a z14 del resto de capas (archivo de verificación con `fid`)
    if not fid_path.exists():
        problems.append("falta el archivo de verificación con fid: no se puede comprobar la conservación")
    else:
        totals: dict[str, int] = {}
        for layer in layers:
            if layer.id != "places":
                totals[layer.id] = sum(1 for _ in (BUILD / f"{layer.id}.geojsonl").open(encoding="utf-8"))
        found: dict[str, set[int]] = {layer_id: set() for layer_id in totals}
        with fid_path.open("rb") as fh:
            fsrc = MmapSource(fh)
            fheader = Reader(fsrc).header()
            for (z, _x, _y), data in all_tiles(fsrc):
                if z != MAX_ZOOM:
                    continue
                payload = gzip.decompress(data) if fheader["tile_compression"] == Compression.GZIP else data
                for layer_id, content in mvt_decode(payload).items():
                    if layer_id in found:
                        for feat in content["features"]:
                            found[layer_id].add(feat["properties"]["fid"])
        report14: dict[str, dict[str, int]] = {}
        for layer_id, total in totals.items():
            lost = total - len(found[layer_id])
            report14[layer_id] = {"expected": total, "present": len(found[layer_id]), "lost": lost}
            if lost:
                problems.append(f"{layer_id}: a z14 se perdieron {lost} de {total} entidades al teselear")
        result["conservationZ14"] = report14

    result["problems"] = problems
    result["header"] = {k: header[k] for k in ("min_zoom", "max_zoom", "min_lon_e7", "min_lat_e7", "max_lon_e7", "max_lat_e7")}
    return result


# --------------------------------------------------------------------------- principal
def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    target = BUILD / ARTIFACT
    fid_target = BUILD / "fidcheck.pmtiles"
    files = {layer.id: BUILD / f"{layer.id}.geojsonl" for layer in LAYERS}
    if "--verify-only" in sys.argv:
        report = verify(target, fid_target, LAYERS)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        raise SystemExit(1 if report["problems"] else 0)

    stats_file = BUILD / "extract-stats.json"
    reuse = "--reuse-extract" in sys.argv
    cached = json.loads(stats_file.read_text(encoding="utf-8")) if reuse and stats_file.exists() else None
    if reuse and (cached is None or cached.get("release") != ov.RELEASE or any(not f.exists() for f in files.values())):
        raise SystemExit("--reuse-extract: no hay una extracción previa válida de esta release; ejecuta sin la opción")
    print(f"Overture {ov.RELEASE}: {'reutilizando la extracción previa de' if reuse else 'extrayendo'} {len(LAYERS)} capas en bbox {BBOX} …", flush=True)
    stats = cached["layers"] if cached else extract_all(LAYERS, BUILD)
    if not reuse:
        stats_file.write_text(json.dumps({"release": ov.RELEASE, "layers": stats}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    layer_report = [{"id": l.id, "source": f"{l.theme}/{l.type}", "rule": l.note, "minzoom": l.zmin, **stats[l.id]} for l in LAYERS]
    for r in layer_report:
        print(f"  {r['id']:<16} {r}", flush=True)

    print("Teselando (tippecanoe) …", flush=True)
    args, tippecanoe_version = run_tippecanoe(LAYERS, files, target)
    print("Archivo de verificación con fid …", flush=True)
    build_fid_archive(LAYERS, files, fid_target)
    report = verify(target, fid_target, LAYERS)
    print(json.dumps({"verification": report}, ensure_ascii=False, indent=2))
    if report["problems"]:
        raise SystemExit("La verificación del basemap FALLÓ; no se publica.")

    manifest = {
        "schemaVersion": 1,
        "artifact": ARTIFACT,
        "sourceClass": "osm_derived",
        "release": ov.RELEASE,
        "license": "ODbL (datos derivados de OpenStreetMap vía Overture) — PROVISIONAL: no leída en la fuente primaria",
        "attribution": ATTRIBUTION,
        "disclaimer": "Cartografía de referencia derivada de OpenStreetMap. No contiene límites oficiales ni geometrías de destinos.",
        "bbox": list(BBOX),
        "zoom": {"min": MIN_ZOOM, "max": MAX_ZOOM},
        "layers": layer_report,
        "tippecanoe": {"version": tippecanoe_version, "args": [a for a in args[3:] if not a.startswith("-L")]},
        "bytes": target.stat().st_size,
        "sha256": sha256(target),
        "verification": {k: v for k, v in report.items() if k != "problems"},
    }
    (BUILD / MANIFEST).write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    PUBLIC.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(target, PUBLIC / ARTIFACT)
    shutil.copyfile(BUILD / MANIFEST, PUBLIC / MANIFEST)
    print(f"OK → public/data/{ARTIFACT} ({manifest['bytes'] / 1e6:.1f} MB, sha256 {str(manifest['sha256'])[:12]}…)")


if __name__ == "__main__":
    main()
