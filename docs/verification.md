# Verifying the real extension

Baseline cohort runs use plain Chromium and apply **lab-side masking** when serializing payloads for analysis. They do **not** exercise your MV3 service worker or injected scripts. To prove the **actual extension** changes behavior end-to-end, use the paths below.

## 1. Automated: Playwright loads the unpacked MV3 folder

The cohort CLI launches Chromium with **`--load-extension=<path>`** when you omit `--baseline` and provide a built extension directory (default: repository `extension/` if `manifest.json` exists).

**Steps**

1. Build the extension bundle: `corepack pnpm build:extension` (produces `extension/dist/` and other assets referenced by `manifest.json`).
2. Run cohort **without** `--baseline`:

   ```powershell
   corepack pnpm cohort -- --count 8 --report reports/verify-extension --preset balanced
   ```

   Optionally pass an explicit path: `--extension C:\path\to\unpacked`.

3. Inspect `reports/verify-extension/performance.json`: `mode` should be **`extension`**, not `baseline`, and `extensionPath` should point at the directory you loaded.
4. Inspect `reports/verify-extension/cohort.json`: rows contain payloads collected after the page signals extension readiness (the Playwright harness waits for the `__FONTMASK_ACTIVE__` flag before running `collectFontSignals`).

This is the primary **repeatable** proof that the same artifact you would sideload in Chrome is the one fingerprinting the fixture page.

## 2. Effectiveness experiments (Python)

`python/run_experiments.py` (after `lab` is built to `lab/dist/`) can:

- locate or assume baseline cohort data under `reports/`,
- invoke **`node lab/dist/cli/cohort.js`** with `--extension` pointing at `extension/`,
- run re-identification and linkability analyses across presets,
- write figures under `packages/viz/figures/`.

Pytest cases marked **`@pytest.mark.real`** (see `python/tests/test_effectiveness.py`) compare **baseline** galleries to **extension** cohorts on disk. They **skip** unless you have produced those reports (for example by running the experiments script). When data exists, **`test_extension_reduces_reidentification`** asserts that probes no longer match the baseline gallery at trivial cosine thresholds—statistical evidence that the loaded extension perturbs fingerprints relative to an unmasked baseline cohort.

**Interpretation:** These tests validate **measurable divergence** from a stored baseline under lab fixtures. They are not a guarantee against every tracker in production.

## 3. Contract between extension and lab

- **`@fontmask/config`** presets must match what the extension applies when users choose a preset; the cohort CLI uses the same preset IDs for labeling and optional lab masking metadata.
- **`@fontmask/collector`** defines the probe shape (`FontSignalsPayload`) hashed into cohort rows. The fixture page drives `collectFontSignals`; the extension’s job is to alter measureText, fonts, or layout APIs so those values differ from baseline in extension mode.

If automated cohort rows never change between baseline and extension runs, investigate injection registration, host permissions, or whether the fixture is actually hitting hooked APIs.

## 4. Manual checks (optional)

- **Chrome → Extensions → Load unpacked** → select the `extension` folder after build. Open the bundled fixture via the lab’s HTTP server or a served copy of `test-fixtures/collector.html`, and compare DevTools behavior with the extension on vs off.
- **Popup / options**: confirm `storage` reflects preset changes and that reload behavior matches expectations.

Manual steps complement automation but do not replace cohort JSON + pytest for regression detection.

## 5. What this does not prove

- Resistance to specific anti-extension or integrity checks on third-party sites.
- Behavior on every OS, GPU, or Chromium fork without repeating cohort runs there.
- Legal or policy compliance; verification here is **technical** (signals changed under controlled collection).

For throughput and distributional shape of cohort statistics (including synthetic dashboard fixtures), see [PERFORMANCE.md](PERFORMANCE.md).
