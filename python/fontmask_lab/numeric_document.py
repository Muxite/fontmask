from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import numpy as np


def _pct(arr: np.ndarray, q: float) -> float:
    if arr.size == 0:
        return 0.0
    return float(np.percentile(arr, q))


def _histogram_lines(values: list[float], bins: int) -> list[str]:
    if not values:
        return ["  (no values)"]
    arr = np.asarray(values, dtype=np.float64)
    counts, edges = np.histogram(arr, bins=bins)
    lines = []
    for idx, count in enumerate(counts):
        lo = edges[idx]
        hi = edges[idx + 1]
        lines.append(f"  [{lo:12.6g}, {hi:12.6g}) : {int(count)}")
    return lines


def format_metrics_document(
    *,
    rows: list[dict[str, Any]],
    pairwise: dict[str, Any],
    entropy: float,
    collisions: dict[str, int],
    correlation_matrix: list[list[float]],
    cohort_generated_at: str | None,
    hist_bins: int,
) -> str:
    scores: list[float] = list(pairwise.get("scores") or [])
    arr = np.asarray(scores, dtype=np.float64)
    lines: list[str] = []
    lines.append("Fontmask cohort — numeric report")
    lines.append(f"documentUtc: {datetime.now(timezone.utc).isoformat()}")
    if cohort_generated_at:
        lines.append(f"cohortJson.generatedAt: {cohort_generated_at}")
    lines.append("")
    lines.append("--- cohort ---")
    lines.append(f"rowCount: {len(rows)}")
    lines.append(f"pairwisePairCount: {pairwise.get('countPairs', 0)}")
    lines.append("")
    lines.append("--- collisions & entropy ---")
    lines.append(f"uniqueHashes: {collisions['uniqueHashes']}")
    lines.append(f"collisionBucketCount: {collisions['collisions']}")
    lines.append(f"shannonEntropyBits (discretized vectors): {entropy:.10g}")
    lines.append("")
    lines.append("--- pairwise cosine (ordered samples, full list may be huge) ---")
    lines.append(f"mean: {pairwise.get('mean', 0.0):.10g}")
    lines.append(f"min: {pairwise.get('min', 0.0):.10g}")
    lines.append(f"max: {pairwise.get('max', 0.0):.10g}")
    lines.append(f"p95 (match TS index rule): {pairwise.get('p95', 0.0):.10g}")
    if arr.size:
        lines.append(f"stdDev: {float(arr.std(ddof=0)):.10g}")
        lines.append(f"percentile_p01: {_pct(arr, 1):.10g}")
        lines.append(f"percentile_p05: {_pct(arr, 5):.10g}")
        lines.append(f"percentile_p10: {_pct(arr, 10):.10g}")
        lines.append(f"percentile_p25: {_pct(arr, 25):.10g}")
        lines.append(f"percentile_p50: {_pct(arr, 50):.10g}")
        lines.append(f"percentile_p75: {_pct(arr, 75):.10g}")
        lines.append(f"percentile_p90: {_pct(arr, 90):.10g}")
        lines.append(f"percentile_p99: {_pct(arr, 99):.10g}")
        lines.append(f"sampleVariance: {float(arr.var(ddof=0)):.10g}")
    lines.append("")
    lines.append(f"--- histogram ({hist_bins} bins, pairwise cosine) ---")
    lines.extend(_histogram_lines(scores, hist_bins))
    lines.append("")
    lines.append("--- correlation submatrix (min(n,12); cosine kernel) ---")
    if correlation_matrix:
        dim = len(correlation_matrix)
        lines.append(f"matrixSide: {dim}")
        flat = np.asarray(correlation_matrix, dtype=np.float64).ravel()
        lines.append(f"cellMin: {float(flat.min()):.10g}")
        lines.append(f"cellMax: {float(flat.max()):.10g}")
        lines.append(f"cellMean: {float(flat.mean()):.10g}")
        lines.append("rows:")
        for ri, row in enumerate(correlation_matrix):
            row_s = " ".join(f"{v:8.5f}" for v in row)
            lines.append(f"  [{ri}] {row_s}")
    else:
        lines.append("(empty)")
    lines.append("")
    lines.append("--- raw pairwise scores (truncate if extremely long) ---")
    max_list = 5000
    if len(scores) <= max_list:
        lines.append(json.dumps(scores, indent=2))
    else:
        head = scores[:2000]
        tail = scores[-2000:]
        lines.append(f"(truncated; showing first {len(head)} and last {len(tail)} of {len(scores)})")
        lines.append("head:")
        lines.append(json.dumps(head, indent=2))
        lines.append("tail:")
        lines.append(json.dumps(tail, indent=2))
    lines.append("")
    return "\n".join(lines) + "\n"
