from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler

from fontmask_lab.features import (
    build_labeled_pairs,
    gallery_probe_cosines,
    vectorize_cohort,
)
from fontmask_lab.stats import (
    analyze_collisions,
    estimate_metric_entropy,
    summarize_pairwise_cosine,
)


def load_cohort(report_dir: Path) -> dict[str, Any]:
    """
    Reads cohort.json from a report directory.

    :param report_dir: path containing cohort.json.
    :returns: parsed JSON dict with keys rows, preset, generatedAt.
    """
    return json.loads((report_dir / "cohort.json").read_text(encoding="utf-8"))


def reidentification_experiment(
    baseline_rows: list[dict[str, Any]],
    probe_rows: list[dict[str, Any]],
    *,
    match_threshold: float = 0.99,
) -> dict[str, Any]:
    """
    Tests whether a stored baseline fingerprint (gallery) can re-identify masked probes.

    The match_threshold determines when a probe is considered 'matched' to the gallery.
    With no masking, baseline widths are identical so cosine = 1.0 → 100% match rate.
    Effective masking pushes cosine below the threshold.

    :param baseline_rows: gallery fingerprints (typically from an unmasked cohort).
    :param probe_rows: probe fingerprints (from extension cohort).
    :param match_threshold: cosine similarity above which a probe is matched.
    :returns: dict with cosines, match_rate, mean_cosine, p5_cosine, p95_cosine.
    """
    gallery = vectorize_cohort(baseline_rows)
    probes = vectorize_cohort(probe_rows)
    cosines = gallery_probe_cosines(gallery, probes)
    matched = int(np.sum(cosines >= match_threshold))
    return {
        "cosines": cosines.tolist(),
        "match_rate": matched / max(len(probe_rows), 1),
        "mean_cosine": float(cosines.mean()),
        "p5_cosine": float(np.percentile(cosines, 5)),
        "p95_cosine": float(np.percentile(cosines, 95)),
        "match_threshold": match_threshold,
        "n_gallery": len(baseline_rows),
        "n_probes": len(probe_rows),
    }


def linkability_experiment(
    same_rows: list[dict[str, Any]],
    diff_rows: list[dict[str, Any]],
    *,
    rng: np.random.Generator | None = None,
    cv_folds: int = 5,
) -> dict[str, Any]:
    """
    Trains a pairwise classifier to distinguish same-source from cross-source fingerprint pairs.

    AUC near 0.5 means the classifier is guessing → masking is effective.
    AUC near 1.0 means pairs are trivially separable → masking is ineffective.

    :param same_rows: cohort rows from the same configuration (e.g. same preset cohort).
    :param diff_rows: cohort rows from a different configuration (e.g. baseline).
    :param rng: optional seeded generator for reproducibility.
    :param cv_folds: number of folds for cross-validated AUC estimation.
    :returns: dict with lr_auc, knn_auc, mean_auc, n_pairs, class_balance.
    """
    if rng is None:
        rng = np.random.default_rng(42)

    features, labels = build_labeled_pairs(same_rows, diff_rows, rng=rng)
    n = len(labels)
    if n < 10:
        return {
            "lr_auc": 0.5,
            "knn_auc": 0.5,
            "mean_auc": 0.5,
            "n_pairs": n,
            "class_balance": 0.5,
            "error": "too_few_pairs",
        }

    class_balance = float(labels.mean())

    scaler = StandardScaler()
    X = scaler.fit_transform(features)

    from sklearn.model_selection import StratifiedKFold

    skf = StratifiedKFold(n_splits=min(cv_folds, n // 2), shuffle=True, random_state=0)
    lr_aucs: list[float] = []
    knn_aucs: list[float] = []

    for train_idx, test_idx in skf.split(X, labels):
        X_tr, X_te = X[train_idx], X[test_idx]
        y_tr, y_te = labels[train_idx], labels[test_idx]

        if len(np.unique(y_te)) < 2:
            continue

        lr = LogisticRegression(max_iter=500, random_state=0)
        lr.fit(X_tr, y_tr)
        lr_aucs.append(float(roc_auc_score(y_te, lr.predict_proba(X_te)[:, 1])))

        knn = KNeighborsClassifier(n_neighbors=min(5, len(X_tr)))
        knn.fit(X_tr, y_tr)
        knn_aucs.append(float(roc_auc_score(y_te, knn.predict_proba(X_te)[:, 1])))

    lr_auc = float(np.mean(lr_aucs)) if lr_aucs else 0.5
    knn_auc = float(np.mean(knn_aucs)) if knn_aucs else 0.5

    return {
        "lr_auc": lr_auc,
        "knn_auc": knn_auc,
        "mean_auc": (lr_auc + knn_auc) / 2,
        "n_pairs": n,
        "class_balance": class_balance,
    }


def run_preset_sweep(
    baseline_dir: Path,
    preset_dirs: dict[str, Path],
    *,
    match_threshold: float = 0.99,
) -> dict[str, dict[str, Any]]:
    """
    Runs reidentification and linkability experiments across all presets.

    :param baseline_dir: directory containing the unmasked baseline cohort.json.
    :param preset_dirs: mapping preset_name → report directory.
    :param match_threshold: cosine threshold for reidentification matching.
    :returns: dict preset_name → {reidentification, linkability, pairwise, entropy, collisions}.
    """
    baseline = load_cohort(baseline_dir)
    baseline_rows = baseline["rows"]
    results: dict[str, dict[str, Any]] = {}

    for preset, d in preset_dirs.items():
        cohort = load_cohort(d)
        probe_rows = cohort["rows"]

        reid = reidentification_experiment(
            baseline_rows, probe_rows, match_threshold=match_threshold
        )
        link = linkability_experiment(probe_rows, baseline_rows)
        pairwise = summarize_pairwise_cosine(probe_rows)
        entropy = estimate_metric_entropy(probe_rows)
        collisions = analyze_collisions(probe_rows)

        results[preset] = {
            "reidentification": reid,
            "linkability": link,
            "pairwise": pairwise,
            "entropy": entropy,
            "collisions": collisions,
            "n_rows": len(probe_rows),
        }

    return results
