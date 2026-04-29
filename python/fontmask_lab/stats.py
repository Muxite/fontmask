from __future__ import annotations

import math
from typing import Any


def vectorize_payload(payload: dict[str, Any]) -> list[float]:
    widths = sorted(payload.get("measureTextWidths") or {})
    phantom = sorted(payload.get("phantomProbeMetrics") or {})
    width_vals = [float((payload.get("measureTextWidths") or {}).get(k, 0)) for k in widths]
    phantom_vals = [float((payload.get("phantomProbeMetrics") or {}).get(k, 0)) for k in phantom]
    hits = payload.get("fontsCheckHits") or []
    return [*width_vals, *phantom_vals, float(len(hits))]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    length = max(len(left), len(right))
    dot = 0.0
    ln = 0.0
    rn = 0.0
    for idx in range(length):
        l = left[idx] if idx < len(left) else 0.0
        r = right[idx] if idx < len(right) else 0.0
        dot += l * r
        ln += l * l
        rn += r * r
    if ln == 0 or rn == 0:
        return 0.0
    return dot / (math.sqrt(ln) * math.sqrt(rn))


def summarize_pairwise_cosine(rows: list[dict[str, Any]]) -> dict[str, Any]:
    vectors = [vectorize_payload(r["payload"]) for r in rows]
    scores: list[float] = []
    for outer in range(len(rows)):
        for inner in range(outer + 1, len(rows)):
            scores.append(cosine_similarity(vectors[outer], vectors[inner]))
    scores.sort()
    n = len(scores)
    mean = 0.0 if n == 0 else sum(scores) / n
    p95 = (
        0.0
        if n == 0
        else scores[int(0.95 * (n - 1))]
    )
    return {
        "scores": scores,
        "mean": mean,
        "min": scores[0] if scores else 0.0,
        "max": scores[-1] if scores else 0.0,
        "p95": p95,
        "countPairs": n,
    }


def analyze_collisions(rows: list[dict[str, Any]]) -> dict[str, int]:
    tally: dict[str, int] = {}
    for row in rows:
        h = row["hashHex"]
        tally[h] = tally.get(h, 0) + 1
    collisions = sum(1 for c in tally.values() if c > 1)
    return {"uniqueHashes": len(tally), "collisions": collisions}


def estimate_metric_entropy(rows: list[dict[str, Any]]) -> float:
    if not rows:
        return 0.0
    buckets: dict[str, int] = {}
    for row in rows:
        vector = vectorize_payload(row["payload"])
        label = "|".join(f"{v:.4f}" for v in vector)
        buckets[label] = buckets.get(label, 0) + 1
    total = len(rows)
    entropy = 0.0
    for count in buckets.values():
        p = count / total
        entropy -= p * math.log2(p)
    return entropy


def build_correlation_matrix(rows: list[dict[str, Any]]) -> list[list[float]]:
    vectors = [vectorize_payload(r["payload"]) for r in rows]
    size = min(len(vectors), 12)
    grid: list[list[float]] = []
    for outer in range(size):
        line: list[float] = []
        for inner in range(size):
            line.append(cosine_similarity(vectors[outer], vectors[inner]))
        grid.append(line)
    return grid
