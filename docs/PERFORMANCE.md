# Fontmask lab — performance evidence and empirical findings

This document records **measurable throughput and latency** from the toolchain (TypeScript cohort harness, Python test suite, matplotlib reporting) plus **statistical fingerprints** exported by cohort runs. Numbers below were captured on **2026-04-29** on a **Windows 10** developer machine using the commands listed in each section unless noted.

**Interpreter / runtime snapshot (same session as benchmarks):**

- Node.js **v22.22.0**
- Python **3.14.0**

Interpret all timings as **single-machine, non-isolated benchmarks**: antivirus, thermal throttling, and background processes will shift results; use the reproduced commands as a regression baseline rather than absolute capacity claims.

---

## 1. Original vs new visualization stack (paired A/B timings)

Two reporting layers exist:

| Aspect | **Original** | **Current default (“new”)** |
|--------|----------------|-----------------------------|
| Implementation | **`@fontmask/viz`** in TypeScript: custom SVG serializers (`figure` → `savefig`). | **Python + matplotlib**: five **PNG** figures at 120 DPI + **`metrics.txt`** (distribution percentiles, histogram bins, truncated raw pairwise arrays, correlation dump). |
| Primary goal | Extremely fast dashboards and tiny artifacts in pure Node | Publication-style plots plus a reproducible numeric dossier (`metrics.txt`) and pytest-driven statistical regressions |

The cohort CLI (**`pnpm cohort`**) uses the **new** path unless you pass **`--no-plots`**, which skips all rendering and leaves JSON only.

**Reproduce the apple-to-apple pair** after `pnpm -r build` and `pip install -e ./python`:

```powershell
corepack pnpm bench:compare -- reports/perf-evidence-baseline-8
corepack pnpm bench:compare -- reports/perf-evidence-baseline-32
```

The harness (`lab/src/tools/compareRenderBench.ts`) loads the **same `cohort.json`** rows, times **`writeSvgLegacyDashboard`** (`lab/src/reporting/svgLegacyDashboard.ts`) vs **`python -m fontmask_lab`**, writes **`bench-compare.json`** next to the report, and prints JSON to stdout.

**Measured render-only latency on this Windows session (rounded):**

| Cohort artifact used | Rows | **Original** TS SVG pipeline | **New** matplotlib + `metrics.txt` | New ÷ Original |
|----------------------|------|------------------------------:|-----------------------------------:|---------------:|
| `reports/perf-evidence-baseline-8` | 8 | **~17–19 ms** | **~1.91–1.93 s** | **~103–121×** (matplotlib dominates) |
| `reports/perf-evidence-baseline-32` | 32 | **~18 ms** | **~1.94 s** | **~109×** |

**Finding:** Legacy SVG serialization is roughly **two orders of magnitude faster** for **chart generation alone** because it avoids a Python subprocess, font discovery, Agg rasterization, and the larger **`metrics.txt`** write—so the migration trades **latency** for **richer empirical evidence** (histograms tied to pairwise arrays, percentile grid, truncation policy, PNG preview fidelity). Operational mitigation: run **`pnpm cohort … --no-plots`** when you only need JSON throughput, or generate plots offline once `cohort.json` exists.

**End-to-end cohort wall time** (`Measure-Command { corepack pnpm cohort … }`, §5) mixes Playwright fingerprinting with this reporting cost; interpreting **`performance.json`** keeps the browser harness isolated from plotting overhead.

---

## 2. Monorepo build (`pnpm -r build`)

Command:

```powershell
corepack pnpm -r build
```

**Observation:** Completed successfully. **Elapsed wall-clock time: approximately 9353 ms** (nine seconds rounded) measured with `Measure-Command` wrapping the same invocation.

**Finding:** Workspace TypeScript compilation and extension/collector bundles complete in roughly **single-digit seconds** on repeat runs after a warm install, which keeps the lab iteration loop workable for CI and local development.

---

## 3. TypeScript lab vector smoke (`test:lab`)

Command:

```powershell
corepack pnpm test:lab
```

Runs `node ./lab/dist/tests/smoke-tests.js` (vectorization cosine regression on a synthetic payload).

**Observation:** Completed successfully with printed similarity **≈ 0.999997** (high cosine between nearly identical synthetic vectors).

**Measured wall time:** Approximately **2994 ms** for the scripted root call (includes pnpm spawning and cold process startup overhead).

**Finding:** Numeric pipeline for `vectorizePayload` → cosine sanity check remains numerically stable for near-duplicate fingerprints in the benign fixture path.

---

## 4. Python statistical regiment (`pytest`)

Command:

```powershell
python python/run_tests.py -q --durations=15
```

**Observation:** **208 tests passed** in **8.85 s** as reported by pytest. A repeat wall-clock measurement on the same machine was approximately **11934 ms** including Python startup and warning output.

**Slowest pytest cases observed (calls):**

| Test | Approx. duration (s) |
|------|-------------------------|
| `test_extension_reduces_reidentification` | 1.32 |
| `test_dashboard_writes_only_png_and_metrics_txt` | 0.98 |
| `test_session_regiment_large_cohort` | 0.86 |
| `test_performance_figure_written` | 0.20 |
| `test_linkability_auc_decreases_with_preset` | 0.17 |
| Pairwise scaling parametrizations | ~0.04 each |

**Finding:** The current suite is still dominated by report generation and experiment-style effectiveness checks, but it now completes in well under **12 s** wall time on this hardware. Parametrized pairwise coverage remains broad: **107** cosine-mass tests, **90** pairwise/entropy/collision tests, and targeted dashboard/effectiveness/performance smoke coverage on top.

---

## 5. Playwright cohort harness — throughput (`performance.json`)

The cohort CLI writes **`performance.json`** beside **`cohort.json`**. Metrics there measure the **browser collection phase** (single shared Chromium launch for baseline pooled contexts, timings per worker). End-to-end **shell** timings include **`pnpm`/Node startup** and optional **matplotlib** rendering unless `--no-plots` is passed.

Below, **instrumented throughput** refers to **`samplesPerSecond`** and **`elapsedMsTotal`** from `performance.json`. **Outer wall ms** refers to **`Measure-Command { corepack pnpm cohort ... }`** on Windows PowerShell during this evidence run.

### 5.1 Baseline cohort — eight samples, eight parallel workers

```powershell
corepack pnpm cohort -- --baseline 8 --parallel 8 --report reports/perf-evidence-baseline-8
```

Generated artifacts: **`reports/perf-evidence-baseline-8/`** (relative to repo root).

| Metric (instrumented) | Value |
|------------------------|-------|
| `elapsedMsTotal` | **1303** ms |
| `samplesPerSecond` | ≈ **6.14** 1/s |
| `parallel` | 8 |

| Metric (outer timing) | Value |
|------------------------|-------|
| Wall time (pnpm + cohort + matplotlib) | ≈ **7645** ms |

**Finding:** Eight parallel fingerprint samples complete the **instrumented cohort segment in about 1.3 s**. The remainder of outer wall time is dominated by CLI overhead and matplotlib report emission (five PNG surfaces plus **`metrics.txt`** generation).

### 5.2 Baseline cohort — thirty-two samples, eight parallel workers

```powershell
corepack pnpm cohort -- --baseline 32 --parallel 8 --report reports/perf-evidence-baseline-32
```

| Metric (instrumented) | Value |
|------------------------|-------|
| `elapsedMsTotal` | **2416** ms |
| `samplesPerSecond` | ≈ **13.25** 1/s |
| `perSampleAvgMs` | ≈ **513** ms |

| Metric (outer timing) | Value |
|------------------------|-------|
| Wall time | ≈ **7823** ms |

**Finding:** Throughput rises with larger batches because the pooled browser amortizes Chromium startup costs; **`samplesPerSecond` more than doubles** compared to the 8-sample run on this machine when moving from eight to thirty-two queued samples under the same worker cap.

### 5.3 Baseline cohort — eight samples, sequential workers (`parallel` 1)

```powershell
corepack pnpm cohort -- --baseline 8 --parallel 1 --report reports/perf-evidence-seq-p1-8
```

| Metric (instrumented) | Value |
|------------------------|-------|
| `elapsedMsTotal` | **1947** ms |
| `samplesPerSecond` | ≈ **4.11** 1/s |

| Metric (outer timing) | Value |
|------------------------|-------|
| Wall time | ≈ **6790** ms |

**Finding:** Sequential pool width **reduces instrumented throughput** versus `parallel 8`, demonstrating that **`--parallel`** is an effective knob for shortening wall time when CPUs are available.

---

## 6. Statistical findings from the Python session regiment

The pytest run also writes a larger synthetic dashboard artifact under **`python/tests/output/session_regiment/large_run`**. Its **`metrics.txt`** captures the numeric shape that the Python reporting stack is currently expected to handle.

### 6.1 Large-run cohort shape

From **`python/tests/output/session_regiment/large_run/metrics.txt`**:

- **`rowCount`**: **165**
- **`pairwisePairCount`**: **13530**
- **`uniqueHashes`**: **140**
- **`collisionBucketCount`**: **20**
- **`shannonEntropyBits`**: **7.034474411**

**Interpretation:** The large synthetic session used by the dashboard tests is intentionally not a deterministic all-identical baseline. It exercises meaningful diversity plus duplicate payload injection, producing both non-trivial entropy and observable collision buckets.

### 6.2 Pairwise cosine distribution in the large run

The same report records:

- **mean cosine**: **0.8945341123**
- **min**: **0.621350819**
- **max**: **1.0**
- **p95**: **0.9899838462**
- **stdDev**: **0.07091820225**
- **p50**: **0.9070090387**
- **p99**: **0.9973948102**

Histogram tails span from roughly **0.62** to **1.0**, with the densest bins between about **0.89** and **0.96**.

**Interpretation:** Current Python dashboard fixtures are validating a mixed cohort where many rows remain strongly related, but not identical. That is a better stress case for histogram, percentile, and correlation rendering than the earlier near-constant baseline examples.

---

## 7. Reproducing this dossier

1. Install browsers once: **`corepack pnpm browsers`**.
2. Build: **`corepack pnpm -r build`**.
3. Python env: **`pip install -e ./python`** (matplotlib, numpy, pytest).
4. Re-run timings with your shell’s **`time`**/`Measure-Command` equivalents.
5. cohort evidence: rerun the **`pnpm cohort`** lines in §5 with fresh **`--report`** paths.
6. Comparative render evidence: rerun **`pnpm bench:compare`** (§1).

Archiving tip: **`reports/` may be git-ignored**. Copy **`performance.json`**, **`cohort.json`** (or the **`summary`** slice only), and the first page of **`metrics.txt`** alongside this file when attaching evidence to tickets.

---

## 8. Limitations

- **`performance.json` does not include matplotlib** when produced by the cohort CLI unless you extend instrumentation; subtract instrumented **`elapsedMsTotal`** from outer wall deltas to approximate Node + launcher + plotting overhead during ad-hoc analysis.
- Fingerprint cosine near **1** and entropy **0** in these runs stem from deterministic lab conditions; extension runs with entropy-injecting content scripts or networked fixtures expect different summaries—compare against this baseline deliberately.
