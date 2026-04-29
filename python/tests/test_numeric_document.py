from __future__ import annotations

import numpy as np

from fontmask_lab.numeric_document import format_metrics_document
from fontmask_lab.stats import (
    analyze_collisions,
    build_correlation_matrix,
    estimate_metric_entropy,
    summarize_pairwise_cosine,
)
from fontmask_lab.synthetic import random_cohort


def test_metrics_document_contains_distribution_lines() -> None:
    rng = np.random.default_rng(314159)
    rows = random_cohort(rng, 36, distribution="uniform")
    pairwise = summarize_pairwise_cosine(rows)
    entropy = estimate_metric_entropy(rows)
    collisions = analyze_collisions(rows)
    corr = build_correlation_matrix(rows)
    text = format_metrics_document(
        rows=rows,
        pairwise=pairwise,
        entropy=entropy,
        collisions=collisions,
        correlation_matrix=corr,
        cohort_generated_at="2020-01-01T00:00:00Z",
        hist_bins=18,
    )
    assert "percentile_p50" in text
    assert "histogram" in text.lower()
    assert "correlation submatrix" in text.lower()
    assert "2020-01-01" in text
