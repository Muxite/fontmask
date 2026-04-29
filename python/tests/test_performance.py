from __future__ import annotations

from pathlib import Path

import pytest

from fontmask_lab.performance import load_performance, per_sample_stats
from fontmask_lab.experiment_dashboard import write_performance_scatter


@pytest.mark.real
def test_performance_json_exists(baseline_report_dir: Path | None) -> None:
    """
    The baseline report must contain a performance.json file.
    """
    if baseline_report_dir is None:
        pytest.skip("no baseline cohort found in reports/")
    assert (baseline_report_dir / "performance.json").is_file()


@pytest.mark.real
def test_all_samples_within_sanity_bounds(baseline_report_dir: Path | None) -> None:
    """
    Every sample must complete within 30 seconds.
    goto_ms and collect_ms must both be positive finite values.
    """
    if baseline_report_dir is None:
        pytest.skip("no baseline cohort found in reports/")
    perf = load_performance(baseline_report_dir)
    rows = perf.get("rows") or []
    assert len(rows) > 0, "performance.json contains no row records"
    for row in rows:
        total = row.get("iterationMsTotal")
        assert total is not None and total > 0
        assert total < 30_000, f"sample {row['id']} took {total:.0f} ms — exceeds 30 s sanity limit"
        goto = row.get("gotoMs")
        collect = row.get("collectMs")
        assert goto is not None and goto > 0
        assert collect is not None and collect > 0


@pytest.mark.real
def test_per_sample_stats_computed(baseline_report_dir: Path | None) -> None:
    """
    per_sample_stats must return finite positive values for all expected keys.
    """
    if baseline_report_dir is None:
        pytest.skip("no baseline cohort found in reports/")
    perf = load_performance(baseline_report_dir)
    stats = per_sample_stats(perf)
    for key in ("goto_ms_mean", "goto_ms_p95", "collect_ms_mean", "total_ms_mean", "total_ms_p95"):
        assert key in stats, f"missing key {key}"
        assert stats[key] > 0, f"{key} = {stats[key]} is not positive"


@pytest.mark.real
def test_performance_figure_written(
    baseline_report_dir: Path | None,
    viz_figures_dir: Path,
) -> None:
    """
    write_performance_scatter must produce a valid PNG file.
    """
    if baseline_report_dir is None:
        pytest.skip("no baseline cohort found in reports/")
    perf = load_performance(baseline_report_dir)
    out = write_performance_scatter(perf, viz_figures_dir, label="baseline")
    assert out.is_file()
    assert out.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n", "output is not a valid PNG"
