"""Acceso de solo lectura a Overture Maps en S3 con poda por bbox sobre las estadísticas de los grupos de filas.

Seguridad (ADR-0009, docs/gis.md): solo se habla con la lista blanca de hosts; reintentos limitados;
nada se ejecuta ni se descomprime desde la fuente. La release está fijada en UN solo sitio.
"""
from __future__ import annotations

import time
import xml.etree.ElementTree as ET
from collections.abc import Callable, Iterator
from typing import Any
from urllib.parse import urlparse

import fsspec
import pyarrow.parquet as pq
import requests

RELEASE = "2026-09-23.1"
HOST = "https://overturemaps-us-west-2.s3.amazonaws.com/"
ALLOWED_HOSTS = frozenset({"overturemaps-us-west-2.s3.amazonaws.com"})
# Área de trabajo de Panamá (lon/lat). Valor de ingeniería para acotar extracciones; NO es un límite oficial.
PANAMA_BBOX = (-83.2, 6.9, -77.0, 9.8)
_S3_NS = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}

Row = dict[str, Any]


class RemoteFetchError(RuntimeError):
    """Respuesta inesperada de un host remoto (redirección, estado, tamaño desconocido)."""


def _check_host(url: str, allowed_hosts: frozenset[str] = ALLOWED_HOSTS) -> None:
    """Lista blanca anti-SSRF: solo https, sin credenciales en la URL, puerto 443 y un host explícitamente permitido."""
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise PermissionError(f"Esquema no permitido (solo https): {parsed.scheme!r}")
    if parsed.username or parsed.password:
        raise PermissionError("La URL no puede llevar credenciales")
    if parsed.port not in (None, 443):
        raise PermissionError(f"Puerto no permitido: {parsed.port}")
    if parsed.hostname not in allowed_hosts:
        raise PermissionError(f"Host no permitido (lista blanca anti-SSRF): {parsed.hostname}")


def open_remote(url: str, *, allowed_hosts: frozenset[str] = ALLOWED_HOSTS, scheme: str = "https") -> Any:
    """Abre un fichero remoto SIN seguir redirecciones (un host permitido podría redirigir a una dirección interna).

    fsspec sigue redirecciones por defecto y, con `allow_redirects=False`, devuelve un cuerpo vacío sin error; por eso
    se exige además un tamaño conocido (`Content-Length`): una 3xx lo deja en `None` y se rechaza.
    """
    _check_host(url, allowed_hosts)
    fs = fsspec.filesystem(scheme, allow_redirects=False)
    info = fs.info(url)
    if not isinstance(info.get("size"), int) or info["size"] <= 0:
        raise RemoteFetchError(f"Respuesta sin tamaño (¿redirección o error?): {url}")
    return fs.open(url, "rb", block_size=4 * 2**20)


def _retry(fn: Callable[[], Any], attempts: int = 3) -> Any:
    last: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as error:  # noqa: BLE001 - se relanza tras agotar los intentos
            last = error
            time.sleep(2**i)
    raise RuntimeError(f"Falló tras {attempts} intentos: {last}") from last


def list_keys(theme: str, typ: str, release: str = RELEASE) -> list[str]:
    url = f"{HOST}?list-type=2&prefix=release/{release}/theme={theme}/type={typ}/"
    _check_host(url)
    resp = _retry(lambda: requests.get(url, timeout=30, allow_redirects=False))
    if resp.status_code != 200:  # incluye 3xx: no se siguen redirecciones
        raise RemoteFetchError(f"Listado de Overture: HTTP {resp.status_code}")
    root = ET.fromstring(resp.content)
    keys = sorted(c.find("s:Key", _S3_NS).text for c in root.findall("s:Contents", _S3_NS))  # type: ignore[union-attr]
    if not keys:
        raise LookupError(f"Overture {release}: no hay ficheros para {theme}/{typ}")
    return keys


def _overlaps(row_group: Any, index: dict[str, int], bbox: tuple[float, float, float, float]) -> bool:
    def stat(name: str) -> tuple[float, float] | None:
        s = row_group.column(index[name]).statistics
        return (s.min, s.max) if s is not None and s.has_min_max else None

    xmin, xmax, ymin, ymax = stat("bbox.xmin"), stat("bbox.xmax"), stat("bbox.ymin"), stat("bbox.ymax")
    if not (xmin and xmax and ymin and ymax):
        return True  # sin estadísticas no se puede descartar
    return not (xmax[1] < bbox[0] or xmin[0] > bbox[2] or ymax[1] < bbox[1] or ymin[0] > bbox[3])


def iter_rows(
    theme: str,
    typ: str,
    columns: list[str],
    bbox: tuple[float, float, float, float] = PANAMA_BBOX,
    release: str = RELEASE,
) -> Iterator[Row]:
    """Filas de `theme/typ` cuyo bbox corta el `bbox` dado. Lee por HTTP Range solo los grupos de filas necesarios."""
    need = list(dict.fromkeys([*columns, "bbox"]))
    for key in list_keys(theme, typ, release):
        with open_remote(HOST + key) as handle:
            pf = pq.ParquetFile(handle)
            md = pf.metadata
            first = md.row_group(0)
            index = {first.column(i).path_in_schema: i for i in range(first.num_columns)}
            present = [c for c in need if c in pf.schema_arrow.names]
            for g in range(md.num_row_groups):
                if not _overlaps(md.row_group(g), index, bbox):
                    continue
                for row in pf.read_row_group(g, columns=present).to_pylist():
                    b = row["bbox"]
                    if b["xmax"] < bbox[0] or b["xmin"] > bbox[2] or b["ymax"] < bbox[1] or b["ymin"] > bbox[3]:
                        continue
                    yield row
