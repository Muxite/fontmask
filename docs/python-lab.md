# Python lab (`python/`)

## Package

Install editable from the repo root:

```powershell
pip install -e ./python
```

The import name is **`fontmask_lab`**. It provides:

- statistics helpers aligned with TypeScript (`summarize_pairwise_cosine`, entropy, collisions),
- matplotlib **dashboard** writers for cohort report directories,
- **experiment** harnesses: re-identification vs a baseline gallery, linkability-style metrics,
- **performance** helpers reading `performance.json`.

## Tests

```powershell
python python/run_tests.py
```

or `pytest` from `python/` with the same config as `pyproject.toml`.

Many tests use **synthetic** cohort JSON under `python/tests/` and do not need Playwright. Tests marked **`@pytest.mark.real`** expect cohort directories under **`reports/`** produced by the Node cohort CLI or **`python/run_experiments.py`**. They **skip** when data is missing.

Markers include **`slow`** for subprocess cohort invocations.

## Experiments orchestration

**`python/run_experiments.py`** coordinates:

1. Finding baseline cohort data in `reports/` (newest baseline `performance.json`).
2. Running **extension** cohort collection per preset via `node lab/dist/cli/cohort.js --extension …`.
3. Running analyses and writing figures (for example under `packages/viz/figures/`).

Requires a prior **`corepack pnpm -r build`** so `lab/dist/cli/cohort.js` exists, and **`pnpm build:extension`** so `extension/manifest.json` and bundles are valid.

## Relationship to TypeScript reporting

The cohort CLI calls **`python -m fontmask_lab`** (or equivalent) for the default matplotlib report unless **`--no-plots`** is set. Legacy SVG reporting remains available inside `@fontmask/lab` for benchmarks.

See [PERFORMANCE.md](PERFORMANCE.md) for timings and example `metrics.txt` shapes from large synthetic cohorts.
