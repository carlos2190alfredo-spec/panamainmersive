"""Manifiesto de una versión importada: procedencia, licencia, derechos, recuentos y hashes."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

SCHEMA = 1
KEYS_FILE = Path(__file__).with_name("manifest-keys.json")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def expected_keys() -> dict[str, list[str]]:
    return json.loads(KEYS_FILE.read_text(encoding="utf-8"))


def check_manifest_shape(manifest: dict[str, Any]) -> None:
    """Contrato con el cargador de TypeScript: las mismas claves en ambos lados (lo comprueba una prueba)."""
    keys = expected_keys()
    if sorted(manifest) != sorted(keys["top"]):
        raise ValueError(f"claves del manifiesto inesperadas: {sorted(manifest)}")
    if sorted(manifest["counts"]) != sorted(keys["counts"]):
        raise ValueError(f"claves de recuentos inesperadas: {sorted(manifest['counts'])}")
    for name in ("valid", "quarantine"):
        if sorted(manifest["files"][name]) != sorted(keys["file"]):
            raise ValueError(f"claves de fichero inesperadas en {name}")
