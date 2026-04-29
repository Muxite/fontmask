from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from fontmask_lab.numeric_document import format_metrics_document
from fontmask_lab.stats import (
    analyze_collisions,
    build_correlation_matrix,
    estimate_metric_entropy,
    summarize_pairwise_cosine,
)

HIST_BINS = 18
FIGURE_DPI = 120
FIGURE_PATHS = [
    "01_pairwise_similarity_hist.png",
    "02_corr_heatmap.png",
    "04_entropy_by_feature.png",
    "05_ecdf_neighbor_distance.png",
    "06_collision_rate_vs_n.png",
]


def _style_axes(ax: matplotlib.axes.Axes) -> None:
    ax.set_facecolor("#070b11")
    for spine in ax.spines.values():
        spine.set_color("#2a3340")
    ax.tick_params(colors="#e9eef5")
    ax.xaxis.label.set_color("#e9eef5")
    ax.yaxis.label.set_color("#e9eef5")
    ax.title.set_color("#e9eef5")


def write_dashboard(report_directory: Path) -> None:
    cohort_path = report_directory / "cohort.json"
    raw = json.loads(cohort_path.read_text(encoding="utf-8"))
    rows = raw["rows"]
    generated_at = raw.get("generatedAt")
    pairwise = summarize_pairwise_cosine(rows)
    entropy = estimate_metric_entropy(rows)
    collisions = analyze_collisions(rows)
    corr = build_correlation_matrix(rows)
    figures_dir = report_directory / "figures"
    figures_dir.mkdir(parents=True, exist_ok=True)
    scores: list[float] = list(pairwise["scores"])

    fig, ax = plt.subplots(figsize=(9.6, 5.4), facecolor="#070b11")
    _style_axes(ax)
    ax.hist(scores, bins=HIST_BINS, color="#4dabf7", edgecolor="#1b2230")
    ax.set_title("Pairwise cosine similarities")
    ax.set_xlabel("pairwise_cosine")
    fig.savefig(
        figures_dir / FIGURE_PATHS[0],
        format="png",
        dpi=FIGURE_DPI,
        facecolor="#070b11",
        edgecolor="none",
        bbox_inches="tight",
    )
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(7.2, 7.2), facecolor="#070b11")
    _style_axes(ax)
    im = ax.imshow(corr, cmap="viridis", aspect="auto", vmin=0, vmax=1)
    ax.set_title("Cosine sketch")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.savefig(
        figures_dir / FIGURE_PATHS[1],
        format="png",
        dpi=FIGURE_DPI,
        facecolor="#070b11",
        edgecolor="none",
        bbox_inches="tight",
    )
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(9.6, 5.4), facecolor="#070b11")
    _style_axes(ax)
    ax.bar(
        ["unique", "collisions"],
        [collisions["uniqueHashes"], collisions["collisions"]],
        color="#ff6b6b",
        edgecolor="#1b2230",
    )
    ax.set_title(f"Unique vs collisions (entropy {entropy:.3f})")
    fig.savefig(
        figures_dir / FIGURE_PATHS[2],
        format="png",
        dpi=FIGURE_DPI,
        facecolor="#070b11",
        edgecolor="none",
        bbox_inches="tight",
    )
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(9.6, 5.4), facecolor="#070b11")
    _style_axes(ax)
    sorted_scores = sorted(scores)
    n = len(sorted_scores)
    if n > 0:
        ys = [(idx + 1) / n for idx in range(n)]
        ax.step(sorted_scores, ys, where="post", color="#4dabf7", linewidth=1.5)
    ax.set_title("ECDF cosine")
    ax.set_xlabel("ecdf_cosine")
    fig.savefig(
        figures_dir / FIGURE_PATHS[3],
        format="png",
        dpi=FIGURE_DPI,
        facecolor="#070b11",
        edgecolor="none",
        bbox_inches="tight",
    )
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(9.6, 5.4), facecolor="#070b11")
    _style_axes(ax)
    ax.bar(
        ["mean", "p95"],
        [pairwise["mean"], pairwise["p95"]],
        color="#ffa94d",
        edgecolor="#1b2230",
    )
    ax.set_title(f"Collision pairs {pairwise['countPairs']}")
    fig.savefig(
        figures_dir / FIGURE_PATHS[4],
        format="png",
        dpi=FIGURE_DPI,
        facecolor="#070b11",
        edgecolor="none",
        bbox_inches="tight",
    )
    plt.close(fig)

    metrics_body = format_metrics_document(
        rows=rows,
        pairwise=pairwise,
        entropy=entropy,
        collisions=collisions,
        correlation_matrix=corr,
        cohort_generated_at=generated_at,
        hist_bins=HIST_BINS,
    )
    (report_directory / "metrics.txt").write_text(metrics_body, encoding="utf-8")

    summary_payload = {
        "collisions": collisions,
        "pairwise": pairwise,
        "entropy": entropy,
        "figurePaths": FIGURE_PATHS,
        "metricsDocument": "metrics.txt",
        "figureFormat": "png",
        "figureDpi": FIGURE_DPI,
    }
    (report_directory / "summary.json").write_text(
        json.dumps(summary_payload, indent=2),
        encoding="utf-8",
    )
    index_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Fontmask cohort report</title>
</head>
<body style="background:#070b11;color:#e9eef5;font-family:Inter, sans-serif;">
  <h1>Fontmask cohort</h1>
  <p><a href="./metrics.txt" style="color:#71b6ff">metrics.txt</a> (full numeric dump)</p>
  <h2>Figures (matplotlib PNG)</h2>
  <ul>{"".join(
        f'<li><a href="./figures/{name}" style="color:#71b6ff">{name}</a></li>'
        for name in FIGURE_PATHS
    )}</ul>
</body>
</html>"""
    (report_directory / "index.html").write_text(index_html, encoding="utf-8")


def cli_main() -> None:
    if len(sys.argv) < 2:
        sys.stderr.write("usage: python -m fontmask_lab <report_dir>\n")
        raise SystemExit(2)
    write_dashboard(Path(sys.argv[1]).resolve())
