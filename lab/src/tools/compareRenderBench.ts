#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import type { CohortRow } from "../stats.js";
import { runMatplotlibDashboard } from "../reporting/pythonDashboard.js";
import { writeSvgLegacyDashboard } from "../reporting/svgLegacyDashboard.js";

type BenchResult = {
  reportDir: string;
  rowCount: number;
  originalMs: number;
  newMs: number;
  ratioNewOverOriginal: number;
  originalPipeline: "typescriptSvgFiveFigures";
  newPipeline: "pythonMatplotlibPngPlusMetricsTxt";
};

/**
 * Times the legacy `@fontmask/viz` SVG stack vs Python matplotlib (`PNG` + `metrics.txt`) on identical `cohort.json` rows.
 */
const main = async (): Promise<void> => {
  const reportDirArg = process.argv[2];
  if (!reportDirArg) {
    process.stderr.write(
      "usage: node compareRenderBench.js <report_dir_with_cohort.json>\n"
    );
    process.exitCode = 2;
    return;
  }
  const resolved = path.resolve(reportDirArg);
  const cohortPath = path.join(resolved, "cohort.json");
  const raw = JSON.parse(await fs.readFile(cohortPath, "utf8")) as {
    rows: CohortRow[];
  };
  const rows = raw.rows;
  const base = path.join(resolved, ".bench_compare_tmp");
  const dirSvg = path.join(base, "svg");
  const dirPy = path.join(base, "py");
  await fs.rm(base, { recursive: true, force: true });
  await fs.mkdir(dirSvg, { recursive: true });
  await fs.mkdir(dirPy, { recursive: true });
  const tSvg0 = performance.now();
  await writeSvgLegacyDashboard(dirSvg, rows);
  const tSvg1 = performance.now();
  await fs.writeFile(
    path.join(dirPy, "cohort.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), preset: "bench", rows },
      null,
      2
    ),
    "utf8"
  );
  const tPy0 = performance.now();
  runMatplotlibDashboard(dirPy, { stdio: "pipe" });
  const tPy1 = performance.now();
  await fs.rm(base, { recursive: true, force: true });
  const originalMs = tSvg1 - tSvg0;
  const newMs = tPy1 - tPy0;
  const ratio = originalMs > 0 ? newMs / originalMs : Number.NaN;
  const result: BenchResult = {
    reportDir: resolved,
    rowCount: rows.length,
    originalMs,
    newMs,
    ratioNewOverOriginal: ratio,
    originalPipeline: "typescriptSvgFiveFigures",
    newPipeline: "pythonMatplotlibPngPlusMetricsTxt",
  };
  await fs.writeFile(
    path.join(resolved, "bench-compare.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
