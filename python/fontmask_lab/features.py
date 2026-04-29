from __future__ import annotations

from typing import Any

import numpy as np


def vectorize_cohort(rows: list[dict[str, Any]]) -> np.ndarray:
    """
    Converts cohort rows into a float64 matrix.

    :param rows: list of cohort row dicts each containing a 'payload' key.
    :returns: ndarray of shape (N, D) where D is the union of all feature keys.
    """
    from fontmask_lab.stats import vectorize_payload

    vecs = [vectorize_payload(r["payload"]) for r in rows]
    if not vecs:
        return np.empty((0, 0), dtype=np.float64)
    max_dim = max(len(v) for v in vecs)
    out = np.zeros((len(vecs), max_dim), dtype=np.float64)
    for i, v in enumerate(vecs):
        out[i, : len(v)] = v
    return out


def gallery_probe_cosines(
    gallery: np.ndarray,
    probes: np.ndarray,
) -> np.ndarray:
    """
    Computes the maximum cosine similarity between each probe and any gallery vector.

    :param gallery: ndarray shape (G, D) — stored fingerprints.
    :param probes: ndarray shape (P, D) — new visit fingerprints.
    :returns: ndarray shape (P,) of best-match cosine scores.
    """
    if gallery.size == 0 or probes.size == 0:
        return np.zeros(len(probes), dtype=np.float64)

    g_dim = gallery.shape[1]
    p_dim = probes.shape[1]
    max_dim = max(g_dim, p_dim)

    def _pad(arr: np.ndarray, d: int) -> np.ndarray:
        if arr.shape[1] == d:
            return arr
        pad = np.zeros((arr.shape[0], d - arr.shape[1]), dtype=np.float64)
        return np.hstack([arr, pad])

    g = _pad(gallery, max_dim)
    p = _pad(probes, max_dim)

    g_norms = np.linalg.norm(g, axis=1, keepdims=True)
    p_norms = np.linalg.norm(p, axis=1, keepdims=True)
    g_norms[g_norms == 0] = 1.0
    p_norms[p_norms == 0] = 1.0
    g_unit = g / g_norms
    p_unit = p / p_norms
    sims = p_unit @ g_unit.T
    return sims.max(axis=1)


def pairwise_feature_matrix(
    vecs_a: np.ndarray,
    vecs_b: np.ndarray,
) -> np.ndarray:
    """
    Builds a feature matrix for pairwise classification.

    Each feature row = [cosine_sim, l2_dist, mean_abs_diff, max_abs_diff].

    :param vecs_a: ndarray shape (N, D).
    :param vecs_b: ndarray shape (N, D).
    :returns: ndarray shape (N, 4).
    """
    n = len(vecs_a)
    if n == 0:
        return np.empty((0, 4), dtype=np.float64)

    max_dim = max(vecs_a.shape[1], vecs_b.shape[1])

    def _pad(arr: np.ndarray, d: int) -> np.ndarray:
        if arr.shape[1] == d:
            return arr
        pad = np.zeros((arr.shape[0], d - arr.shape[1]), dtype=np.float64)
        return np.hstack([arr, pad])

    a = _pad(vecs_a, max_dim)
    b = _pad(vecs_b, max_dim)

    a_norms = np.linalg.norm(a, axis=1)
    b_norms = np.linalg.norm(b, axis=1)
    dots = np.sum(a * b, axis=1)
    denom = a_norms * b_norms
    denom[denom == 0] = 1.0
    cosines = dots / denom

    diffs = a - b
    l2 = np.linalg.norm(diffs, axis=1)
    abs_diff = np.abs(diffs)
    mean_abs = abs_diff.mean(axis=1)
    max_abs = abs_diff.max(axis=1)

    return np.column_stack([cosines, l2, mean_abs, max_abs])


def build_labeled_pairs(
    same_rows: list[dict[str, Any]],
    diff_rows: list[dict[str, Any]],
    *,
    max_pairs: int = 2000,
    rng: np.random.Generator | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Creates balanced same-source/cross-source pairs for binary linkability classification.

    :param same_rows: rows from one cohort (same underlying browser config).
    :param diff_rows: rows from another cohort (different config or baseline).
    :param max_pairs: cap on total pairs to avoid O(N^2) explosion.
    :param rng: optional seeded generator for reproducibility.
    :returns: (feature_matrix shape (M, 4), labels shape (M,) with 1=same 0=diff).
    """
    if rng is None:
        rng = np.random.default_rng(42)

    same_vecs = vectorize_cohort(same_rows)
    diff_vecs = vectorize_cohort(diff_rows)

    same_pairs: list[tuple[int, int]] = []
    for i in range(len(same_rows)):
        for j in range(i + 1, len(same_rows)):
            same_pairs.append((i, j))

    diff_pairs: list[tuple[int, int]] = []
    for i in range(len(same_rows)):
        for j in range(len(diff_rows)):
            diff_pairs.append((i, j))

    half = max_pairs // 2
    if len(same_pairs) > half:
        idx = rng.choice(len(same_pairs), size=half, replace=False)
        same_pairs = [same_pairs[k] for k in idx]
    if len(diff_pairs) > half:
        idx = rng.choice(len(diff_pairs), size=half, replace=False)
        diff_pairs = [diff_pairs[k] for k in idx]

    rows_a: list[np.ndarray] = []
    rows_b: list[np.ndarray] = []
    labels: list[int] = []

    for i, j in same_pairs:
        rows_a.append(same_vecs[i])
        rows_b.append(same_vecs[j])
        labels.append(1)

    for i, j in diff_pairs:
        rows_a.append(same_vecs[i])
        rows_b.append(diff_vecs[j])
        labels.append(0)

    if not rows_a:
        return np.empty((0, 4), dtype=np.float64), np.empty(0, dtype=np.int32)

    max_dim = max(v.shape[0] for v in rows_a + rows_b)

    def _pad1d(v: np.ndarray, d: int) -> np.ndarray:
        if len(v) == d:
            return v
        out = np.zeros(d, dtype=np.float64)
        out[: len(v)] = v
        return out

    a_mat = np.vstack([_pad1d(v, max_dim) for v in rows_a])
    b_mat = np.vstack([_pad1d(v, max_dim) for v in rows_b])
    feat = pairwise_feature_matrix(a_mat, b_mat)
    return feat, np.array(labels, dtype=np.int32)
