from __future__ import annotations

from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

_BG = "#070b11"
_FG = "#e9eef5"
_GRID = "#1c2535"
_PALETTE = ["#4dabf7", "#ff6b6b", "#ffa94d", "#69db7c", "#da77f2", "#74c0fc"]

FIGURE_DPI = 120
PRESET_ORDER = ["baseline", "low", "balanced", "high_privacy"]
PRESET_LABELS = {
    "baseline": "Baseline\n(no ext)",
    "low": "Low",
    "balanced": "Balanced",
    "high_privacy": "High Privacy",
}


def _style(ax: matplotlib.axes.Axes) -> None:
    ax.set_facecolor(_BG)
    for spine in ax.spines.values():
        spine.set_color(_GRID)
    ax.tick_params(colors=_FG, labelsize=9)
    ax.xaxis.label.set_color(_FG)
    ax.yaxis.label.set_color(_FG)
    ax.title.set_color(_FG)
    ax.grid(True, color=_GRID, linewidth=0.5, alpha=0.6)


def _save(fig: matplotlib.figure.Figure, path: Path) -> None:
    fig.savefig(path, format="png", dpi=FIGURE_DPI, facecolor=_BG, edgecolor="none", bbox_inches="tight")
    plt.close(fig)


def write_reidentification_bar(
    sweep_results: dict[str, dict[str, Any]],
    figures_dir: Path,
) -> Path:
    """
    Horizontal bar chart of gallery-to-probe re-identification rate per preset.

    :param sweep_results: output of experiment.run_preset_sweep.
    :param figures_dir: directory to write the PNG into.
    :returns: path to the written file.
    """
    presets = [p for p in PRESET_ORDER if p in sweep_results]
    labels = [PRESET_LABELS.get(p, p) for p in presets]
    rates = [sweep_results[p]["reidentification"]["match_rate"] for p in presets]

    fig, ax = plt.subplots(figsize=(8, 3.6), facecolor=_BG)
    _style(ax)
    colors = [_PALETTE[i % len(_PALETTE)] for i in range(len(presets))]
    bars = ax.barh(labels, rates, color=colors, edgecolor=_GRID, height=0.55)
    for bar, rate in zip(bars, rates):
        ax.text(
            min(rate + 0.02, 0.98),
            bar.get_y() + bar.get_height() / 2,
            f"{rate:.0%}",
            va="center",
            ha="left",
            color=_FG,
            fontsize=10,
            fontweight="bold",
        )
    ax.set_xlim(0, 1.12)
    ax.set_xlabel("Re-identification rate")
    ax.set_title("Gallery → Probe Re-identification Rate per Preset")
    ax.axvline(0.5, color="#ff6b6b", linestyle="--", linewidth=1, alpha=0.7, label="random (50%)")
    ax.legend(facecolor=_BG, edgecolor=_GRID, labelcolor=_FG, fontsize=8)
    out = figures_dir / "reid_rate_bar.png"
    _save(fig, out)
    return out


def write_noise_vs_accuracy(
    sweep_results: dict[str, dict[str, Any]],
    figures_dir: Path,
) -> Path:
    """
    Dual-axis line plot: re-id rate and linkability AUC vs masking preset strength.

    :param sweep_results: output of experiment.run_preset_sweep.
    :param figures_dir: directory to write the PNG into.
    :returns: path to the written file.
    """
    offset_map = {"baseline": 0.0, "low": 0.006, "balanced": 0.02, "high_privacy": 0.04}
    presets = [p for p in PRESET_ORDER if p in sweep_results]
    xs = [offset_map.get(p, 0.0) for p in presets]
    reid_rates = [sweep_results[p]["reidentification"]["match_rate"] for p in presets]
    aucs = [sweep_results[p]["linkability"]["mean_auc"] for p in presets]

    fig, ax1 = plt.subplots(figsize=(9, 4.5), facecolor=_BG)
    _style(ax1)

    ax1.plot(xs, reid_rates, "o-", color=_PALETTE[0], linewidth=2, markersize=7, label="Re-id rate")
    ax1.set_xlabel("measureTextMaxOffsetPx")
    ax1.set_ylabel("Re-identification rate", color=_PALETTE[0])
    ax1.tick_params(axis="y", labelcolor=_PALETTE[0])
    ax1.set_ylim(-0.05, 1.15)

    ax2 = ax1.twinx()
    ax2.set_facecolor(_BG)
    ax2.plot(xs, aucs, "s--", color=_PALETTE[1], linewidth=2, markersize=7, label="Linkability AUC")
    ax2.set_ylabel("Linkability AUC", color=_PALETTE[1])
    ax2.tick_params(axis="y", labelcolor=_PALETTE[1], colors=_FG)
    ax2.spines["right"].set_color(_GRID)
    ax2.set_ylim(0.4, 1.1)
    ax2.axhline(0.5, color=_PALETTE[1], linestyle=":", linewidth=1, alpha=0.5)

    lines1, lbl1 = ax1.get_legend_handles_labels()
    lines2, lbl2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, lbl1 + lbl2, facecolor=_BG, edgecolor=_GRID, labelcolor=_FG, fontsize=9, loc="upper right")
    ax1.set_title("Noise Strength vs Classifier Performance")

    out = figures_dir / "noise_vs_accuracy.png"
    _save(fig, out)
    return out


def write_cosine_violin(
    sweep_results: dict[str, dict[str, Any]],
    figures_dir: Path,
) -> Path:
    """
    Violin plot of gallery-probe cosine similarity distribution per preset.

    :param sweep_results: output of experiment.run_preset_sweep.
    :param figures_dir: directory to write the PNG into.
    :returns: path to the written file.
    """
    presets = [p for p in PRESET_ORDER if p in sweep_results]
    labels = [PRESET_LABELS.get(p, p) for p in presets]
    data = [sweep_results[p]["reidentification"]["cosines"] for p in presets]

    fig, ax = plt.subplots(figsize=(9, 5), facecolor=_BG)
    _style(ax)

    parts = ax.violinplot(data, positions=range(len(presets)), showmedians=True, showextrema=True)
    for i, pc in enumerate(parts["bodies"]):
        pc.set_facecolor(_PALETTE[i % len(_PALETTE)])
        pc.set_alpha(0.7)
        pc.set_edgecolor(_FG)
    parts["cmedians"].set_color(_FG)
    parts["cmins"].set_color(_GRID)
    parts["cmaxes"].set_color(_GRID)
    parts["cbars"].set_color(_GRID)

    ax.set_xticks(range(len(presets)))
    ax.set_xticklabels(labels)
    ax.axhline(0.99, color="#ff6b6b", linestyle="--", linewidth=1, alpha=0.8, label="match threshold (0.99)")
    ax.set_ylabel("Gallery-probe cosine similarity")
    ax.set_title("Cosine Similarity Distribution: Gallery → Probe")
    ax.set_ylim(min(min(d) for d in data if d) - 0.02, 1.05)
    ax.legend(facecolor=_BG, edgecolor=_GRID, labelcolor=_FG, fontsize=8)
    out = figures_dir / "cosine_violin.png"
    _save(fig, out)
    return out


def write_roc_curves(
    sweep_results: dict[str, dict[str, Any]],
    baseline_rows: list[dict[str, Any]],
    preset_rows: dict[str, list[dict[str, Any]]],
    figures_dir: Path,
) -> Path:
    """
    ROC curves for linkability classifiers, one curve per preset.

    :param sweep_results: output of experiment.run_preset_sweep (for AUC labels).
    :param baseline_rows: rows from the baseline cohort (used as diff_rows).
    :param preset_rows: mapping preset_name → list of cohort rows.
    :param figures_dir: directory to write the PNG into.
    :returns: path to the written file.
    """
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_curve
    from sklearn.preprocessing import StandardScaler

    from fontmask_lab.features import build_labeled_pairs

    fig, ax = plt.subplots(figsize=(7, 6), facecolor=_BG)
    _style(ax)

    presets = [p for p in PRESET_ORDER if p in preset_rows and p != "baseline"]

    for i, preset in enumerate(presets):
        color = _PALETTE[i % len(_PALETTE)]
        same_rows = preset_rows[preset]
        features, labels = build_labeled_pairs(same_rows, baseline_rows)
        if len(np.unique(labels)) < 2 or len(labels) < 10:
            continue
        scaler = StandardScaler()
        X = scaler.fit_transform(features)
        lr = LogisticRegression(max_iter=500, random_state=0)
        lr.fit(X, labels)
        scores = lr.predict_proba(X)[:, 1]
        fpr, tpr, _ = roc_curve(labels, scores)
        auc = sweep_results.get(preset, {}).get("linkability", {}).get("lr_auc", 0.5)
        ax.plot(fpr, tpr, color=color, linewidth=2, label=f"{PRESET_LABELS.get(preset, preset)} (AUC={auc:.3f})")

    ax.plot([0, 1], [0, 1], "--", color=_GRID, linewidth=1, label="Random (AUC=0.50)")
    ax.set_xlabel("False positive rate")
    ax.set_ylabel("True positive rate")
    ax.set_title("Linkability ROC Curves (Logistic Regression)")
    ax.legend(facecolor=_BG, edgecolor=_GRID, labelcolor=_FG, fontsize=8, loc="lower right")
    out = figures_dir / "linkability_roc.png"
    _save(fig, out)
    return out


def write_performance_scatter(
    perf: dict[str, Any],
    figures_dir: Path,
    *,
    label: str = "",
) -> Path:
    """
    Scatter plot of per-sample goto_ms and collect_ms timing.

    :param perf: performance record from load_performance.
    :param figures_dir: directory to write the PNG into.
    :param label: optional label for the chart title.
    :returns: path to the written file.
    """
    rows = perf.get("rows") or []
    ids = [r["id"] for r in rows]
    gotos = [r.get("gotoMs", 0) for r in rows]
    collects = [r.get("collectMs", 0) for r in rows]

    fig, ax = plt.subplots(figsize=(9, 4.5), facecolor=_BG)
    _style(ax)

    ax.scatter(ids, gotos, color=_PALETTE[0], s=60, label="goto_ms", zorder=3)
    ax.scatter(ids, collects, color=_PALETTE[1], s=60, label="collect_ms", zorder=3)
    ax.set_xlabel("Sample index")
    ax.set_ylabel("Time (ms)")
    title = f"Per-sample timing{(' — ' + label) if label else ''}"
    ax.set_title(title)
    ax.legend(facecolor=_BG, edgecolor=_GRID, labelcolor=_FG, fontsize=9)
    out = figures_dir / "performance_timing.png"
    _save(fig, out)
    return out


def write_summary_table(
    sweep_results: dict[str, dict[str, Any]],
    figures_dir: Path,
) -> Path:
    """
    Writes a matplotlib table figure summarising all preset metrics in one view.

    :param sweep_results: output of experiment.run_preset_sweep.
    :param figures_dir: directory to write the PNG into.
    :returns: path to the written file.
    """
    presets = [p for p in PRESET_ORDER if p in sweep_results]
    col_labels = ["Preset", "Re-id rate", "Mean cosine", "Link AUC", "Entropy", "Unique hashes"]
    rows = []
    for p in presets:
        res = sweep_results[p]
        reid = res["reidentification"]
        link = res["linkability"]
        rows.append([
            PRESET_LABELS.get(p, p),
            f"{reid['match_rate']:.0%}",
            f"{reid['mean_cosine']:.4f}",
            f"{link['mean_auc']:.3f}",
            f"{res['entropy']:.3f}",
            str(res["collisions"]["uniqueHashes"]),
        ])

    fig, ax = plt.subplots(figsize=(10, 2 + 0.45 * len(rows)), facecolor=_BG)
    _style(ax)
    ax.axis("off")

    tbl = ax.table(
        cellText=rows,
        colLabels=col_labels,
        cellLoc="center",
        loc="center",
    )
    tbl.auto_set_font_size(False)
    tbl.set_fontsize(10)
    tbl.scale(1, 1.5)
    for (row_idx, col_idx), cell in tbl.get_celld().items():
        cell.set_facecolor(_BG if row_idx > 0 else "#1c2535")
        cell.set_edgecolor(_GRID)
        cell.set_text_props(color=_FG)

    ax.set_title("Experiment Summary", color=_FG, pad=8)
    out = figures_dir / "summary_table.png"
    _save(fig, out)
    return out


def write_all(
    sweep_results: dict[str, dict[str, Any]],
    baseline_rows: list[dict[str, Any]],
    preset_rows: dict[str, list[dict[str, Any]]],
    figures_dir: Path,
    perf: dict[str, Any] | None = None,
) -> list[Path]:
    """
    Generates all experiment matplotlib figures into figures_dir.

    :param sweep_results: output of experiment.run_preset_sweep.
    :param baseline_rows: raw rows from the baseline cohort.
    :param preset_rows: mapping preset_name → list of raw cohort rows.
    :param figures_dir: directory to write PNGs into (created if missing).
    :param perf: optional performance record for timing scatter.
    :returns: list of written file paths.
    """
    figures_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    written.append(write_reidentification_bar(sweep_results, figures_dir))
    written.append(write_noise_vs_accuracy(sweep_results, figures_dir))
    written.append(write_cosine_violin(sweep_results, figures_dir))
    written.append(write_roc_curves(sweep_results, baseline_rows, preset_rows, figures_dir))
    written.append(write_summary_table(sweep_results, figures_dir))
    if perf is not None:
        written.append(write_performance_scatter(perf, figures_dir, label=perf.get("mode", "")))
    return written
