from __future__ import annotations

import math

import numpy as np
import pytest

from fontmask_lab.stats import cosine_similarity

_PAIR_SAMPLES = 25_000
_DIM_RANGE = (4, 48)


@pytest.mark.parametrize("seed", list(range(40)))
def test_cosine_similarity_bounded_for_uniform_signed_vectors(seed: int) -> None:
    rng = np.random.default_rng(seed)
    for _ in range(_PAIR_SAMPLES // 40):
        dim = int(rng.integers(_DIM_RANGE[0], _DIM_RANGE[1] + 1))
        left = rng.normal(0.0, 1.0, size=dim).tolist()
        right = rng.normal(0.0, 1.0, size=dim).tolist()
        c = cosine_similarity(left, right)
        assert -1.0 - 1e-9 <= c <= 1.0 + 1e-9


@pytest.mark.parametrize("seed", list(range(40)))
def test_cosine_non_negative_vectors_stays_in_unit_interval(seed: int) -> None:
    rng = np.random.default_rng(10_000 + seed)
    for _ in range(_PAIR_SAMPLES // 40):
        dim = int(rng.integers(6, 36))
        left = rng.uniform(0.0, 500.0, size=dim).tolist()
        right = rng.uniform(0.0, 500.0, size=dim).tolist()
        c = cosine_similarity(left, right)
        assert -1e-9 <= c <= 1.0 + 1e-9


def test_cosine_identical_is_one() -> None:
    vec = [1.0, 2.0, 3.0, 0.5]
    assert abs(cosine_similarity(vec, vec) - 1.0) < 1e-12


def test_cosine_zero_vector_returns_zero() -> None:
    assert cosine_similarity([], [1.0, 2.0]) == 0.0
    assert cosine_similarity([0.0, 0.0], [1.0, 2.0]) == 0.0


def test_cosine_orthogonal_numeric() -> None:
    left = [1.0, 0.0]
    right = [0.0, 1.0]
    assert abs(cosine_similarity(left, right)) < 1e-12


@pytest.mark.parametrize("seed", list(range(24)))
def test_cosine_matches_naive_reference(seed: int) -> None:
    rng = np.random.default_rng(99_000 + seed)
    for _ in range(800):
        dim = int(rng.integers(2, 20))
        left = rng.uniform(-10, 10, size=dim).tolist()
        right = rng.uniform(-10, 10, size=dim).tolist()
        dot = sum(a * b for a, b in zip(left, right, strict=False))
        ln = math.sqrt(sum(a * a for a in left))
        rn = math.sqrt(sum(b * b for b in right))
        expected = 0.0 if ln == 0 or rn == 0 else dot / (ln * rn)
        got = cosine_similarity(left, right)
        assert abs(got - expected) < 1e-9
