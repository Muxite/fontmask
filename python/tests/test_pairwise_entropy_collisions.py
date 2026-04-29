from __future__ import annotations

import numpy as np
import pytest

from fontmask_lab.stats import (
    analyze_collisions,
    cosine_similarity,
    estimate_metric_entropy,
    summarize_pairwise_cosine,
    vectorize_payload,
)
from fontmask_lab.synthetic import (
    cohort_row,
    inject_collision_pairs,
    random_cohort,
    random_payload,
    stable_hash_hex,
)

_DIST_TAG = {"mixed": 11, "uniform": 17, "heavy": 29}


@pytest.mark.parametrize("n_rows", [4, 24, 64, 128])
@pytest.mark.parametrize("dist", ["mixed", "uniform", "heavy"])
@pytest.mark.parametrize("seed", [0, 42, 888])
def test_pairwise_scales_expected_pair_count(n_rows: int, dist: str, seed: int) -> None:
    rng = np.random.default_rng(seed + n_rows * 31 + _DIST_TAG[dist])
    rows = random_cohort(rng, n_rows, distribution=dist)
    summary = summarize_pairwise_cosine(rows)
    expected_pairs = n_rows * (n_rows - 1) // 2
    assert summary["countPairs"] == expected_pairs
    assert len(summary["scores"]) == expected_pairs
    assert summary["min"] <= summary["mean"] <= summary["max"]


@pytest.mark.parametrize("seed", range(30))
def test_entropy_monotone_under_duplication(seed: int) -> None:
    rng = np.random.default_rng(seed)
    base = random_cohort(rng, 24, distribution="mixed")
    dup = inject_collision_pairs(base, rng, n_duplicate_payloads=18)
    e0 = estimate_metric_entropy(base)
    e1 = estimate_metric_entropy(dup)
    assert e1 <= e0 + 1e-9


def test_entropy_identical_rows_single_bucket() -> None:
    pay = random_payload(np.random.default_rng(1), n_width_keys=4, n_phantom_keys=3)
    h = stable_hash_hex(pay)
    rows = [
        {"id": 1, "label": "a", "payload": pay, "hashHex": h, "enginePreset": "balanced"},
        {"id": 2, "label": "b", "payload": pay, "hashHex": h, "enginePreset": "balanced"},
    ]
    assert estimate_metric_entropy(rows) == 0.0


@pytest.mark.parametrize("seed", range(20))
def test_collision_counts_track_duplicates(seed: int) -> None:
    rng = np.random.default_rng(500 + seed)
    base = random_cohort(rng, 40, distribution="uniform")
    dup = inject_collision_pairs(base, rng, n_duplicate_payloads=12)
    c0 = analyze_collisions(base)
    c1 = analyze_collisions(dup)
    assert c1["uniqueHashes"] <= c0["uniqueHashes"] + 12
    assert c1["collisions"] >= c0["collisions"]


def test_legacy_close_vectors_remain_similar() -> None:
    payload_a = {
        "measureTextWidths": {"16px system-ui": 120.4},
        "phantomProbeMetrics": {"PhantomMask Mono 0": 60.0},
        "fontsCheckHits": ["PhantomMask Mono 0"],
    }
    payload_b = {
        "measureTextWidths": {"16px system-ui": 121.1},
        "phantomProbeMetrics": {"PhantomMask Mono 0": 60.0},
        "fontsCheckHits": ["PhantomMask Mono 0"],
    }
    va = vectorize_payload(payload_a)
    vb = vectorize_payload(payload_b)
    assert cosine_similarity(va, vb) > 0.9


def test_legacy_two_row_single_pair() -> None:
    rows = [
        {"payload": {"measureTextWidths": {"a": 1.0}, "phantomProbeMetrics": {}, "fontsCheckHits": []}},
        {"payload": {"measureTextWidths": {"a": 1.1}, "phantomProbeMetrics": {}, "fontsCheckHits": []}},
    ]
    summary = summarize_pairwise_cosine(rows)
    assert summary["countPairs"] == 1
    assert len(summary["scores"]) == 1


def test_pairwise_invariants_random_payloads() -> None:
    rng = np.random.default_rng(2026)
    rows = []
    for idx in range(50):
        pay = random_payload(rng, n_width_keys=5, n_phantom_keys=4)
        rows.append(cohort_row(idx + 1, pay))
    sp = summarize_pairwise_cosine(rows)
    for score in sp["scores"]:
        assert -1.0 - 1e-9 <= score <= 1.0 + 1e-9
