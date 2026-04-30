# Fontmask

Fontmask is a monorepo for a **Chromium MV3 extension** that defends against font- and canvas-adjacent fingerprinting with tunable masking, plus a **Playwright-based lab** and **Python tooling** to measure cohort statistics and privacy-effectiveness experiments.

## Repository layout

| Area | Role |
|------|------|
| [`extension/`](extension/) | Manifest V3 extension (service worker, content injection, UI). |
| [`packages/config/`](packages/config/) | Shared masking presets and schema (`MaskingConfig`). |
| [`packages/collector/`](packages/collector/) | In-page font/canvas signal collection used by the lab and browser bundle. |
| [`packages/viz/`](packages/viz/) | TypeScript visualization helpers; experiment figures may also land under `packages/viz/figures/`. |
| [`lab/`](lab/) | Cohort CLI: Playwright launches Chromium with or without the unpacked extension, writes `cohort.json` and `performance.json`, optional matplotlib reports. |
| [`python/`](python/) | `fontmask_lab` package: stats, dashboards, pytest suite, `run_experiments.py` orchestration. |
| [`docs/`](docs/) | Lab performance notes, architecture guides, and [how we verify the real extension](docs/verification.md). |

## Prerequisites

- **Node.js** and **pnpm** (the repo pins `packageManager` in the root `package.json`).
- **Python 3.10+** for the lab package and tests.
- **Chromium for Playwright** after install: `corepack pnpm browsers`.

## Quick start

```powershell
corepack pnpm install
corepack pnpm -r build
pip install -e ./python
```

Run the TypeScript lab smoke test:

```powershell
corepack pnpm test:lab
```

Run Python tests (synthetic fixtures; no browser reports required for most cases):

```powershell
python python/run_tests.py
```

Collect a **baseline** cohort (no extension) for timing and fingerprint shape:

```powershell
corepack pnpm cohort -- --baseline 8 --parallel 8 --report reports/my-baseline
```

Collect an **extension** cohort (uses the built unpacked tree under `extension/` by default):

```powershell
corepack pnpm build:extension
corepack pnpm cohort -- --count 8 --report reports/my-extension-run
```

## Documentation map

- **[Documentation index](docs/README.md)** — links to every guide.
- **[Verifying the real extension](docs/verification.md)** — automated proof paths (Playwright + cohort), effectiveness experiments, optional manual checks.
- **[Extension](docs/extension.md)** — build, load unpacked, permissions.
- **[Shared packages](docs/packages.md)** — config, collector, viz.
- **[Lab (cohort CLI)](docs/lab.md)** — Playwright harness, flags, reports.
- **[Python lab](docs/python-lab.md)** — pytest, dashboards, `run_experiments.py`.
- **[Performance and empirical findings](docs/PERFORMANCE.md)** — benchmarks and cohort statistics from the lab dossier.

## License

See repository licensing files if present; this README does not substitute for legal terms.
