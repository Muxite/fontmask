from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

OUTPUT_ROOT = Path(__file__).resolve().parent / "output"
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
REPORTS_DIR = REPO_ROOT / "reports"


@pytest.fixture(scope="session")
def session_output_dir() -> Path:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_ROOT / "session_regiment"
    path.mkdir(parents=True, exist_ok=True)
    return path


@pytest.fixture
def rng() -> np.random.Generator:
    return np.random.default_rng()


@pytest.fixture
def tmp_cohort_path(tmp_path: Path) -> Path:
    return tmp_path / "cohort.json"


@pytest.fixture(scope="session")
def baseline_report_dir() -> Path | None:
    """
    Finds the newest baseline report directory in reports/.

    :returns: Path if found, None otherwise (tests marked real will skip).
    """
    candidates: list[tuple[float, Path]] = []
    for d in REPORTS_DIR.glob("*/"):
        perf_path = d / "performance.json"
        if not perf_path.is_file():
            continue
        try:
            perf = json.loads(perf_path.read_text(encoding="utf-8"))
            if perf.get("mode") == "baseline":
                candidates.append((perf_path.stat().st_mtime, d))
        except Exception:
            continue
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


@pytest.fixture(scope="session")
def experiment_preset_dirs() -> dict[str, Path]:
    """
    Finds experiment cohort directories produced by run_experiments.py.

    :returns: mapping preset_name → Path (only for presets where cohort.json exists).
    """
    found: dict[str, Path] = {}
    for preset in ("low", "balanced", "high_privacy"):
        d = REPORTS_DIR / f"experiment-{preset}"
        if (d / "cohort.json").is_file():
            found[preset] = d
    return found


@pytest.fixture(scope="session")
def viz_figures_dir() -> Path:
    """
    Returns the packages/viz/figures/ directory, creating it if needed.

    :returns: Path to the figures output directory.
    """
    p = REPO_ROOT / "packages" / "viz" / "figures"
    p.mkdir(parents=True, exist_ok=True)
    return p
