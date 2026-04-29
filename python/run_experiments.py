"""
Orchestration script for fontmask effectiveness experiments.

Usage:
    python python/run_experiments.py [--count N] [--skip-collect] [--presets low,balanced,high_privacy]

Steps:
  1. Locate the newest baseline cohort in reports/.
  2. For each requested preset, run the cohort CLI via subprocess (extension mode).
  3. Run reidentification + linkability experiments across all presets.
  4. Write all matplotlib figures to packages/viz/figures/.
  5. Write packages/viz/figures/index.html.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
VIZ_FIGURES = REPO_ROOT / "packages" / "viz" / "figures"
REPORTS_DIR = REPO_ROOT / "reports"
LAB_COHORT_JS = REPO_ROOT / "lab" / "dist" / "cli" / "cohort.js"
EXTENSION_DIR = REPO_ROOT / "extension"

ALL_PRESETS = ["low", "balanced", "high_privacy"]


def find_newest_baseline() -> Path | None:
    """
    Scans reports/ for the most recently modified directory that contains a
    baseline performance.json.

    :returns: Path to the baseline report directory, or None if not found.
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


def run_cohort(preset: str, count: int, report_dir: Path) -> None:
    """
    Invokes the Node.js cohort CLI to collect an extension cohort for a preset.

    :param preset: masking preset id (low, balanced, high_privacy).
    :param count: number of browser samples to collect.
    :param report_dir: directory to write cohort.json and performance.json into.
    """
    report_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        "node",
        str(LAB_COHORT_JS),
        "--preset", preset,
        "--extension", str(EXTENSION_DIR),
        "--count", str(count),
        "--no-plots",
        "--report", str(report_dir),
    ]
    print(f"  running cohort: preset={preset} count={count} -> {report_dir.name}")
    result = subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  [WARN] cohort failed for preset={preset}:\n{result.stderr.strip()}", file=sys.stderr)
    else:
        print(f"  done: {preset}")


def write_index_html(figures_dir: Path, figure_paths: list[Path], generated_at: str) -> None:
    """
    Writes a simple HTML index listing all generated figures.

    :param figures_dir: directory containing the PNG files.
    :param figure_paths: list of figure file paths.
    :param generated_at: ISO timestamp string for the report header.
    """
    items = "".join(
        f'<li><a href="{p.name}" style="color:#71b6ff">{p.name}</a>'
        f'<br><img src="{p.name}" style="max-width:640px;margin:8px 0 16px;border:1px solid #1c2535"/></li>'
        for p in figure_paths
        if p.is_file()
    )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Fontmask experiment figures</title></head>
<body style="background:#070b11;color:#e9eef5;font-family:Inter,sans-serif;padding:24px">
  <h1>Fontmask classifier experiment</h1>
  <p>Generated: {generated_at}</p>
  <ul style="list-style:none;padding:0">{items}</ul>
</body>
</html>"""
    (figures_dir / "index.html").write_text(html, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run fontmask effectiveness experiments")
    parser.add_argument("--count", type=int, default=16, help="browser samples per preset")
    parser.add_argument("--skip-collect", action="store_true", help="skip running Playwright cohorts")
    parser.add_argument(
        "--presets",
        default=",".join(ALL_PRESETS),
        help="comma-separated preset list",
    )
    args = parser.parse_args()

    presets = [p.strip() for p in args.presets.split(",") if p.strip()]

    sys.path.insert(0, str(Path(__file__).parent))
    from fontmask_lab.experiment import load_cohort, run_preset_sweep
    from fontmask_lab.experiment_dashboard import write_all
    from fontmask_lab.performance import load_performance

    print("=== fontmask experiment pipeline ===")

    baseline_dir = find_newest_baseline()
    if baseline_dir is None:
        print("[ERROR] No baseline cohort found in reports/. Run `pnpm cohort:baseline` first.")
        sys.exit(1)
    print(f"baseline: {baseline_dir.name}")

    if not args.skip_collect:
        if not LAB_COHORT_JS.is_file():
            print("[ERROR] lab/dist/cli/cohort.js not found. Run `pnpm build` first.")
            sys.exit(1)
        if not (EXTENSION_DIR / "manifest.json").is_file():
            print("[ERROR] extension/manifest.json not found. Run `pnpm build:extension` first.")
            sys.exit(1)
        print(f"\ncollecting {args.count} samples for each of: {presets}")
        for preset in presets:
            report_dir = REPORTS_DIR / f"experiment-{preset}"
            run_cohort(preset, args.count, report_dir)

    print("\nloading cohort data...")
    baseline_data = load_cohort(baseline_dir)
    baseline_rows = baseline_data["rows"]

    preset_dirs: dict[str, Path] = {}
    preset_rows: dict[str, list] = {}
    for preset in presets:
        d = REPORTS_DIR / f"experiment-{preset}"
        cohort_file = d / "cohort.json"
        if not cohort_file.is_file():
            print(f"  [WARN] missing {cohort_file} — skipping {preset}")
            continue
        preset_dirs[preset] = d
        preset_rows[preset] = load_cohort(d)["rows"]
        print(f"  {preset}: {len(preset_rows[preset])} rows")

    if not preset_dirs:
        print("[ERROR] No extension cohort data found. Run without --skip-collect.")
        sys.exit(1)

    print("\nrunning experiments...")
    sweep_results: dict = {"baseline": {
        "reidentification": {"cosines": [1.0] * len(baseline_rows), "match_rate": 1.0, "mean_cosine": 1.0, "p5_cosine": 1.0, "p95_cosine": 1.0, "match_threshold": 0.99, "n_gallery": len(baseline_rows), "n_probes": len(baseline_rows)},
        "linkability": {"lr_auc": 1.0, "knn_auc": 1.0, "mean_auc": 1.0, "n_pairs": 0, "class_balance": 0.5},
        "pairwise": {"mean": 1.0, "min": 1.0, "max": 1.0, "p95": 1.0, "countPairs": 0, "scores": []},
        "entropy": 0.0,
        "collisions": {"uniqueHashes": 1, "collisions": len(baseline_rows) - 1},
        "n_rows": len(baseline_rows),
    }}
    preset_results = run_preset_sweep(baseline_dir, preset_dirs)
    sweep_results.update(preset_results)

    for preset, res in sweep_results.items():
        reid = res["reidentification"]
        link = res["linkability"]
        print(f"  [{preset}] re-id={reid['match_rate']:.0%}  cosine_mean={reid['mean_cosine']:.4f}  link_auc={link['mean_auc']:.3f}  entropy={res['entropy']:.3f}")

    perf: dict | None = None
    try:
        perf = load_performance(baseline_dir)
    except Exception:
        pass

    print(f"\nwriting figures -> {VIZ_FIGURES}")
    VIZ_FIGURES.mkdir(parents=True, exist_ok=True)
    written = write_all(sweep_results, baseline_rows, preset_rows, VIZ_FIGURES, perf=perf)
    generated_at = datetime.now(timezone.utc).isoformat()
    write_index_html(VIZ_FIGURES, written, generated_at)
    print(f"wrote {len(written)} figures + index.html")

    result_path = REPORTS_DIR / "experiment-results.json"
    clean_results = {
        k: {
            "reidentification": {sk: sv for sk, sv in v["reidentification"].items() if sk != "cosines"},
            "linkability": v["linkability"],
            "entropy": v["entropy"],
            "collisions": v["collisions"],
            "n_rows": v["n_rows"],
        }
        for k, v in sweep_results.items()
    }
    result_path.write_text(json.dumps(clean_results, indent=2), encoding="utf-8")
    print(f"results JSON -> {result_path}")
    print("\ndone.")


if __name__ == "__main__":
    main()
