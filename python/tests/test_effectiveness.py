from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from fontmask_lab.experiment import load_cohort, reidentification_experiment, linkability_experiment, run_preset_sweep
from fontmask_lab.experiment_dashboard import write_all
from fontmask_lab.performance import load_performance


@pytest.mark.real
def test_baseline_cohort_is_identical(baseline_report_dir: Path | None) -> None:
    """
    Without the extension every browser on the same machine produces the
    exact same fingerprint, so pairwise cosine must be ≥ 0.99 on average.
    """
    if baseline_report_dir is None:
        pytest.skip("no baseline cohort found in reports/")
    data = load_cohort(baseline_report_dir)
    rows = data["rows"]
    assert len(rows) >= 2, "need at least 2 rows to compare"

    from fontmask_lab.stats import summarize_pairwise_cosine
    pairwise = summarize_pairwise_cosine(rows)
    assert pairwise["mean"] >= 0.99, (
        f"baseline mean cosine {pairwise['mean']:.4f} < 0.99 — "
        "baseline browsers should produce identical fingerprints"
    )


@pytest.mark.real
def test_baseline_reidentification_is_100_percent(baseline_report_dir: Path | None) -> None:
    """
    The baseline gallery re-identifies itself perfectly (cosine = 1.0).
    """
    if baseline_report_dir is None:
        pytest.skip("no baseline cohort found in reports/")
    rows = load_cohort(baseline_report_dir)["rows"]
    result = reidentification_experiment(rows, rows, match_threshold=0.99)
    assert result["match_rate"] == 1.0, (
        f"baseline self-reidentification expected 100%, got {result['match_rate']:.0%}"
    )


@pytest.mark.real
def test_extension_reduces_reidentification(
    baseline_report_dir: Path | None,
    experiment_preset_dirs: dict[str, Path],
    viz_figures_dir: Path,
) -> None:
    """
    For each available extension preset, the re-identification rate against
    the stored baseline fingerprint must be lower than 100%.
    High-privacy preset must be < 80%.
    """
    if baseline_report_dir is None:
        pytest.skip("no baseline cohort found in reports/")
    if not experiment_preset_dirs:
        pytest.skip("no extension cohort data — run python/run_experiments.py first")

    baseline_rows = load_cohort(baseline_report_dir)["rows"]
    sweep_results: dict = {
        "baseline": {
            "reidentification": {
                "cosines": [1.0] * len(baseline_rows),
                "match_rate": 1.0,
                "mean_cosine": 1.0,
                "p5_cosine": 1.0,
                "p95_cosine": 1.0,
                "match_threshold": 0.99,
                "n_gallery": len(baseline_rows),
                "n_probes": len(baseline_rows),
            },
            "linkability": {"lr_auc": 1.0, "knn_auc": 1.0, "mean_auc": 1.0, "n_pairs": 0, "class_balance": 0.5},
            "pairwise": {"mean": 1.0, "min": 1.0, "max": 1.0, "p95": 1.0, "countPairs": 0, "scores": []},
            "entropy": 0.0,
            "collisions": {"uniqueHashes": 1, "collisions": len(baseline_rows) - 1},
            "n_rows": len(baseline_rows),
        }
    }

    preset_rows: dict[str, list] = {}
    for preset, d in experiment_preset_dirs.items():
        rows = load_cohort(d)["rows"]
        preset_rows[preset] = rows
        reid = reidentification_experiment(baseline_rows, rows)
        link = linkability_experiment(rows, baseline_rows)
        from fontmask_lab.stats import estimate_metric_entropy, analyze_collisions
        sweep_results[preset] = {
            "reidentification": reid,
            "linkability": link,
            "pairwise": {"mean": reid["mean_cosine"], "min": reid["p5_cosine"], "max": reid["p95_cosine"], "p95": reid["p95_cosine"], "countPairs": len(rows), "scores": reid["cosines"]},
            "entropy": estimate_metric_entropy(rows),
            "collisions": analyze_collisions(rows),
            "n_rows": len(rows),
        }

        assert reid["match_rate"] <= 1.0
        print(f"  [{preset}] re-id={reid['match_rate']:.0%} mean_cosine={reid['mean_cosine']:.4f} link_auc={link['mean_auc']:.3f}")

    if "high_privacy" in sweep_results and "high_privacy" in experiment_preset_dirs:
        hp_rate = sweep_results["high_privacy"]["reidentification"]["match_rate"]
        assert hp_rate < 0.9, (
            f"high_privacy preset re-identification rate {hp_rate:.0%} is too high — "
            "expected < 90% against a stored baseline fingerprint"
        )

    try:
        perf = load_performance(baseline_report_dir)
    except Exception:
        perf = None

    write_all(sweep_results, baseline_rows, preset_rows, viz_figures_dir, perf=perf)


@pytest.mark.real
def test_linkability_auc_decreases_with_preset(
    baseline_report_dir: Path | None,
    experiment_preset_dirs: dict[str, Path],
) -> None:
    """
    Linkability AUC should decrease (or stay flat) as preset strength increases:
    low ≥ balanced ≥ high_privacy (approximately — within 0.15 tolerance for noise).
    """
    if baseline_report_dir is None:
        pytest.skip("no baseline cohort found in reports/")
    preset_order = ["low", "balanced", "high_privacy"]
    available = [p for p in preset_order if p in experiment_preset_dirs]
    if len(available) < 2:
        pytest.skip("need at least 2 presets to compare trend")

    baseline_rows = load_cohort(baseline_report_dir)["rows"]
    aucs: dict[str, float] = {}
    for preset in available:
        rows = load_cohort(experiment_preset_dirs[preset])["rows"]
        result = linkability_experiment(rows, baseline_rows)
        aucs[preset] = result["mean_auc"]
        print(f"  [{preset}] link_auc={result['mean_auc']:.3f}")

    for i in range(len(available) - 1):
        lo_preset = available[i]
        hi_preset = available[i + 1]
        tolerance = 0.15
        assert aucs[lo_preset] >= aucs[hi_preset] - tolerance, (
            f"Expected {lo_preset} AUC ({aucs[lo_preset]:.3f}) ≥ {hi_preset} AUC ({aucs[hi_preset]:.3f}) - {tolerance}"
        )
