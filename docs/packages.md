# Shared packages (`packages/`)

## `@fontmask/config` (`packages/config/`)

Single source of truth for:

- **`MaskingConfig`** — numeric tuning (metric jitter, phantom fonts, hook toggles, cache scope).
- **`MASKING_PRESETS`** — named presets: `low`, `balanced`, `high_privacy`.
- **`MaskingPresetId`** and schema version for storage merges.

The extension, lab masking helpers, and Python-side metadata use these identifiers consistently.

## `@fontmask/collector` (`packages/collector/`)

Browser-oriented library that:

- defines **`FontSignalsPayload`** and **`DEFAULT_FONT_PROBES`**,
- implements **`collectFontSignals`** — canvas and `document.fonts` style probes, quantization optional via masking config,
- ships a **browser bundle** (see `scripts/build-browser.mjs`) for injection contexts.

The cohort harness loads a **fixture HTML** page that runs collection logic; results are hashed and summarized into `cohort.json` rows.

## `@fontmask/viz` (`packages/viz/`)

TypeScript helpers for legacy SVG-style dashboards used by the lab’s optional TypeScript reporting path. Python + matplotlib is the default cohort visualization pipeline; experiment scripts may write PNG/HTML figures under `packages/viz/figures/` when you run `python/run_experiments.py`.

## Build

Each package builds with `tsc` from the workspace root:

```powershell
corepack pnpm -r build
```
