from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np


def load_performance(report_dir: Path) -> dict[str, Any]:
    """
    Reads performance.json from a report directory.

    :param report_dir: directory containing performance.json.
    :returns: parsed performance record dict.
    """
    return json.loads((report_dir / "performance.json").read_text(encoding="utf-8"))


def per_sample_stats(perf: dict[str, Any]) -> dict[str, float]:
    """
    Computes per-sample timing statistics from a performance record.

    :param perf: performance record as loaded by load_performance.
    :returns: dict with mean/p50/p95/max for goto_ms, collect_ms, total_ms.
    """
    rows = perf.get("rows") or []
    goto = np.array([r["gotoMs"] for r in rows if r.get("gotoMs") is not None], dtype=np.float64)
    collect = np.array(
        [r["collectMs"] for r in rows if r.get("collectMs") is not None], dtype=np.float64
    )
    total = np.array(
        [r["iterationMsTotal"] for r in rows if r.get("iterationMsTotal") is not None],
        dtype=np.float64,
    )

    def _stats(arr: np.ndarray, prefix: str) -> dict[str, float]:
        if arr.size == 0:
            return {f"{prefix}_mean": 0.0, f"{prefix}_p50": 0.0, f"{prefix}_p95": 0.0, f"{prefix}_max": 0.0}
        return {
            f"{prefix}_mean": float(arr.mean()),
            f"{prefix}_p50": float(np.percentile(arr, 50)),
            f"{prefix}_p95": float(np.percentile(arr, 95)),
            f"{prefix}_max": float(arr.max()),
        }

    out: dict[str, float] = {}
    out.update(_stats(goto, "goto_ms"))
    out.update(_stats(collect, "collect_ms"))
    out.update(_stats(total, "total_ms"))
    out["samples_per_second"] = float(perf.get("samplesPerSecond", 0.0))
    out["elapsed_total_ms"] = float(perf.get("elapsedMsTotal", 0.0))
    return out


def overhead_ratio(baseline_perf: dict[str, Any], ext_perf: dict[str, Any]) -> float:
    """
    Estimates the extension's overhead as a ratio of per-sample average times.

    Values above 1.0 mean the extension is slower; below 1.0 means faster (unlikely).

    :param baseline_perf: performance record from a baseline (no extension) run.
    :param ext_perf: performance record from an extension run.
    :returns: ratio extension_avg_ms / baseline_avg_ms.
    """
    base_avg = baseline_perf.get("perSampleAvgMs") or 1.0
    ext_avg = ext_perf.get("perSampleAvgMs") or 1.0
    return ext_avg / max(base_avg, 1e-6)
