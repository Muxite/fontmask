# Fontmask documentation

## Getting oriented

- **[Root README](../README.md)** — clone, build, and common commands.
- **[Verification](verification.md)** — how automated runs prove behavior when the **real unpacked extension** is loaded in Chromium (and how that differs from baseline-only lab runs).

## Project areas

| Document | Contents |
|----------|----------|
| [extension.md](extension.md) | MV3 layout, build pipeline, loading the unpacked folder in Chrome. |
| [packages.md](packages.md) | `@fontmask/config`, `@fontmask/collector`, `@fontmask/viz`. |
| [lab.md](lab.md) | Cohort CLI, Playwright modes, `cohort.json` / `performance.json`. |
| [python-lab.md](python-lab.md) | `fontmask_lab`, pytest, experiments, matplotlib outputs. |
| [PERFORMANCE.md](PERFORMANCE.md) | Throughput, timings, and statistical notes from lab runs. |

## Proof and limitations

- **[verification.md](verification.md)** is the right place for “does the extension actually run and change fingerprints?” It ties together extension builds, `pnpm cohort` without `--baseline`, Python effectiveness tests, and optional manual verification.
