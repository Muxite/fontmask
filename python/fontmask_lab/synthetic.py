from __future__ import annotations

import hashlib
import json
from typing import Any

import numpy as np


def stable_hash_hex(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def random_payload(
    rng: np.random.Generator,
    *,
    n_width_keys: int,
    n_phantom_keys: int,
    width_scale: float = 200.0,
    phantom_scale: float = 100.0,
    n_hits: int | None = None,
) -> dict[str, Any]:
    if n_hits is None:
        n_hits = int(rng.integers(0, min(n_phantom_keys + 1, 12)))
    widths = {
        f"w{k}": float(rng.normal(width_scale, width_scale * 0.05))
        for k in range(n_width_keys)
    }
    phantoms = {
        f"PhantomMask Mono {k}": float(rng.lognormal(4.0, 0.15))
        for k in range(n_phantom_keys)
    }
    hits = [f"PhantomMask Mono {k}" for k in range(n_hits)]
    return {
        "measureTextWidths": widths,
        "phantomProbeMetrics": phantoms,
        "fontsCheckHits": hits,
    }


def cohort_row(
    row_id: int,
    payload: dict[str, Any],
    *,
    label_prefix: str = "syn",
    preset: str = "balanced",
) -> dict[str, Any]:
    return {
        "id": row_id,
        "label": f"{label_prefix}-{row_id}",
        "payload": payload,
        "hashHex": stable_hash_hex(payload),
        "enginePreset": preset,
    }


def random_cohort(
    rng: np.random.Generator,
    n_rows: int,
    *,
    width_keys_range: tuple[int, int] = (3, 9),
    phantom_keys_range: tuple[int, int] = (2, 8),
    distribution: str = "mixed",
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for idx in range(n_rows):
        lo_w, hi_w = width_keys_range
        lo_p, hi_p = phantom_keys_range
        nw = int(rng.integers(lo_w, hi_w + 1))
        n_phant = int(rng.integers(lo_p, hi_p + 1))
        if distribution == "uniform":
            pay = random_payload(rng, n_width_keys=nw, n_phantom_keys=n_phant, width_scale=150.0)
        elif distribution == "heavy":
            pay = random_payload(
                rng,
                n_width_keys=nw,
                n_phantom_keys=n_phant,
                width_scale=float(rng.gamma(2.0, 40.0)),
                phantom_scale=120.0,
            )
        else:
            pay = random_payload(rng, n_width_keys=nw, n_phantom_keys=n_phant)
        rows.append(cohort_row(idx + 1, pay))
    return rows


def inject_collision_pairs(
    rows: list[dict[str, Any]],
    rng: np.random.Generator,
    n_duplicate_payloads: int,
) -> list[dict[str, Any]]:
    out = list(rows)
    if len(out) < 2 or n_duplicate_payloads <= 0:
        return out
    for _ in range(n_duplicate_payloads):
        src_idx = int(rng.integers(0, len(out)))
        template = json.loads(json.dumps(out[src_idx]["payload"]))
        new_row = cohort_row(len(out) + 1, template, label_prefix="dup")
        out.append(new_row)
    return out
