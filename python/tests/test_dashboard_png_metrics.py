from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from fontmask_lab.dashboard import FIGURE_PATHS, write_dashboard
from fontmask_lab.synthetic import inject_collision_pairs, random_cohort

from tests.support_utils import write_cohort_json


def test_dashboard_writes_only_png_and_metrics_txt(tmp_path: Path) -> None:
    rng = np.random.default_rng(424242)
    rows = random_cohort(rng, 45, distribution="heavy")
    cohort_file = tmp_path / "cohort.json"
    write_cohort_json(cohort_file, rows)
    write_dashboard(tmp_path)
    fig_dir = tmp_path / "figures"
    for name in FIGURE_PATHS:
        assert name.endswith(".png")
        fp = fig_dir / name
        assert fp.is_file()
        assert fp.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
    metrics = tmp_path / "metrics.txt"
    assert metrics.is_file()
    body = metrics.read_text(encoding="utf-8")
    assert "pairwisePairCount" in body
    assert "histogram" in body.lower()
    assert "correlation submatrix" in body.lower()
    svg_any = list(fig_dir.glob("*.svg"))
    assert svg_any == []
    summary = tmp_path / "summary.json"
    assert '"figureFormat": "png"' in summary.read_text(encoding="utf-8")


def test_session_regiment_large_cohort(session_output_dir: Path) -> None:
    rng = np.random.default_rng(777888)
    rows = random_cohort(rng, 140, distribution="mixed")
    dup = inject_collision_pairs(rows, rng, n_duplicate_payloads=25)
    bundle = session_output_dir / "large_run"
    bundle.mkdir(parents=True, exist_ok=True)
    write_cohort_json(bundle / "cohort.json", dup)
    write_dashboard(bundle)
    for name in FIGURE_PATHS:
        assert (bundle / "figures" / name).is_file()
    assert (bundle / "metrics.txt").stat().st_size > 5_000
