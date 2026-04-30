# Lab (`lab/`)

## Role

The **`@fontmask/lab`** package implements the **cohort CLI**: Playwright opens Chromium, loads the test fixture over a tiny local HTTP server (so the page is `http://` rather than `file://`), runs font signal collection, and writes JSON artifacts for analysis and plotting.

## CLI entry

After build, the executable is `lab/dist/cli/cohort.js`, wrapped by the root script:

```powershell
corepack pnpm cohort -- [flags]
```

Use `--` so flags pass through `pnpm` to the Node process.

## Modes

| Mode | Flag | Behavior |
|------|------|----------|
| Baseline | `--baseline` | No extension; uses a shared browser and **`--parallel`** worker pool. Lab still applies **lab masking** when invoking collection (see `labMask` in sources). |
| Extension | default when manifest exists | Chromium loads the unpacked MV3 directory (`--extension` override or `extension/` under repo root). Each sample runs in a **new persistent profile** with the extension loaded; **`--parallel` is ignored**. The harness waits for extension readiness on the page before collecting signals. |

If neither `--baseline` nor a resolvable extension path exists, the CLI errors with instructions to build or pass `--extension`.

## Common flags

- **`--count N`** — number of fingerprint samples.
- **`--parallel N`** — baseline mode only: pool width for concurrent contexts. No effect in extension mode (samples run sequentially).
- **`--preset low|balanced|high_privacy`** — masking preset label and config lookup.
- **`--fixture path`** — HTML fixture (default `test-fixtures/collector.html` relative to repo root).
- **`--report path`** — output directory for `cohort.json`, `performance.json`, and optional plots.
- **`--no-plots`** — skip Python matplotlib subprocess (JSON only, faster).
- **`--headed`** — visible browser for debugging.

## Outputs

- **`cohort.json`** — timestamp, preset, summary, and per-row payloads and hashes.
- **`performance.json`** — elapsed time, `samplesPerSecond`, per-row timings; includes `mode`: `baseline` or `extension`.

## Other scripts

- **`pnpm test:lab`** — runs compiled smoke tests (vector/cosine sanity).
- **`pnpm bench:compare`** — compares legacy TS SVG dashboard timing vs Python matplotlib for the same `cohort.json`.

## Dependencies

Uses **`@fontmask/collector`**, **`@fontmask/config`**, **`@fontmask/viz`**, and **Playwright**. Install browsers once: `corepack pnpm browsers`.
