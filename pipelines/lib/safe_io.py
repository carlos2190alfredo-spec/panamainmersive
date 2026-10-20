"""Lectura segura de ficheros de entrada del pipeline (docs/gis.md §3, docs/security.md).

Amenazas cubiertas: rutas con `..`, absolutas o enlaces simbólicos que escapan del directorio permitido, ficheros
especiales, formatos no admitidos (XML/KML y ZIP se rechazan por contenido, no solo por extensión), bombas de
descompresión (tope de bytes DESCOMPRIMIDOS), líneas gigantes, demasiadas líneas, JSON con `NaN`/`Infinity` y
anidación excesiva.
"""
from __future__ import annotations

import gzip
import json
import os
import stat
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

MAX_FILE_BYTES = 512 * 1024 * 1024
MAX_DECOMPRESSED_BYTES = 1024 * 1024 * 1024
MAX_LINE_BYTES = 32 * 1024 * 1024
MAX_LINES = 500_000
SUPPORTED_SUFFIXES = (".geojsonl", ".geojsonl.gz")


class UnsafeInputError(ValueError):
    """La entrada no es segura o no es un formato admitido: se rechaza ENTERA, no se intenta aprovechar."""


def resolve_inside(base: Path, candidate: str | os.PathLike[str]) -> Path:
    """Devuelve la ruta real de `candidate` SOLO si es un fichero regular dentro de `base`."""
    raw = os.fspath(candidate)
    if "\x00" in raw:
        raise UnsafeInputError("ruta con byte nulo")
    path = Path(raw)
    if ".." in path.parts:
        raise UnsafeInputError("la ruta contiene «..»")
    root = base.resolve(strict=True)
    try:
        resolved = (path if path.is_absolute() else root / path).resolve(strict=True)  # sigue enlaces simbólicos
    except FileNotFoundError as error:
        raise UnsafeInputError(f"no existe: {raw}") from error
    if not resolved.is_relative_to(root):
        raise UnsafeInputError("la ruta sale del directorio permitido")
    if not stat.S_ISREG(resolved.stat().st_mode):
        raise UnsafeInputError("no es un fichero regular")
    return resolved


def _reject_constant(name: str) -> Any:
    raise ValueError(f"constante JSON no permitida: {name}")


@dataclass(frozen=True)
class Record:
    line: int
    value: Any | None
    error: str | None


def iter_jsonl(
    path: Path,
    *,
    max_file_bytes: int = MAX_FILE_BYTES,
    max_decompressed_bytes: int = MAX_DECOMPRESSED_BYTES,
    max_line_bytes: int = MAX_LINE_BYTES,
    max_lines: int = MAX_LINES,
) -> Iterator[Record]:
    """Itera un GeoJSONL (opcionalmente .gz). Un fallo de ESTRUCTURA del fichero lanza; un fallo de UNA línea se
    devuelve como `Record(error=…)` para que vaya a cuarentena sin detener el resto."""
    name = path.name.lower()
    if not name.endswith(SUPPORTED_SUFFIXES):
        raise UnsafeInputError(f"formato no admitido (solo {', '.join(SUPPORTED_SUFFIXES)})")
    if path.stat().st_size > max_file_bytes:
        raise UnsafeInputError("el fichero supera el tamaño máximo")

    opener = gzip.open if name.endswith(".gz") else open
    total = 0
    with opener(path, "rb") as handle:  # type: ignore[operator]
        head = handle.peek(16)[:16].lstrip()  # type: ignore[union-attr]
        if head[:1] != b"{":
            raise UnsafeInputError("el contenido no parece GeoJSONL (¿XML/KML, ZIP u otro formato?)")
        lineno = 0
        while True:
            chunk = handle.readline(max_line_bytes + 1)
            if not chunk:
                return
            lineno += 1
            total += len(chunk)
            if total > max_decompressed_bytes:
                raise UnsafeInputError("descompresión excesiva (posible bomba de compresión)")
            if lineno > max_lines:
                raise UnsafeInputError("demasiadas líneas")
            if len(chunk) > max_line_bytes:
                raise UnsafeInputError(f"línea {lineno}: supera el tamaño máximo")
            if not chunk.strip():
                continue
            try:
                yield Record(lineno, json.loads(chunk.decode("utf-8"), parse_constant=_reject_constant), None)
            except RecursionError:
                yield Record(lineno, None, "json.too_deep")
            except UnicodeDecodeError:
                yield Record(lineno, None, "json.not_utf8")
            except (json.JSONDecodeError, ValueError) as error:
                yield Record(lineno, None, f"json.invalid: {error}"[:200])
