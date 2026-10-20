"""Evaluador de derechos del pipeline: lee EL MISMO documento que TypeScript (`data/rights/policies.json`).

Política por defecto: denegar. `provisional` solo permite fuera de producción (docs/provider-rights.md).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
POLICIES_FILE = ROOT / "data/rights/policies.json"
ENVIRONMENTS = ("development", "staging", "production")
ACTIONS = ("display", "combine", "cache", "download", "transform", "redistribute", "offline", "aiProcess")


class RightsDenied(PermissionError):
    pass


@dataclass(frozen=True)
class Policy:
    subject: str
    status: str
    allowed: tuple[str, ...]


def load_policies(path: Path = POLICIES_FILE) -> list[Policy]:
    doc: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("schema") != 1:
        raise ValueError("versión de esquema de políticas desconocida")
    policies = [Policy(p["subject"], p["status"], tuple(p["allowed"])) for p in doc["policies"]]
    for policy in policies:
        if policy.status not in ("verified", "provisional"):
            raise ValueError(f"estado de política inválido: {policy.status}")
        if any(a not in ACTIONS for a in policy.allowed):
            raise ValueError(f"acción desconocida en {policy.subject}")
    if len({p.subject for p in policies}) != len(policies):
        raise ValueError("política repetida")
    return policies


def require(policies: list[Policy], subject: str, actions: list[str], env: str) -> None:
    """Lanza `RightsDenied` si ALGUNA acción no está permitida para esa fuente en ese entorno."""
    if env not in ENVIRONMENTS:
        raise RightsDenied(f"entorno desconocido: {env!r}")
    policy = next((p for p in policies if p.subject == subject), None)
    if policy is None:
        raise RightsDenied(f"{subject}: sin política de derechos (deny-by-default)")
    for action in actions:
        if action not in policy.allowed:
            raise RightsDenied(f"{subject}: la acción «{action}» no está permitida")
    if policy.status != "verified" and env == "production":
        raise RightsDenied(f"{subject}: política provisional; no se admite en producción")
