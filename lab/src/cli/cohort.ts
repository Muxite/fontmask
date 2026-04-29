#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { MASKING_PRESETS } from "@fontmask/config";

import { runMatplotlibDashboard } from "../reporting/pythonDashboard.js";
import { labMask, serializeCohortSummary } from "../stats.js";
import { parseCohortArgv, repoRoot } from "./cohortArgv.js";
import {
  assertPlaywrightChromiumInstalled,
  cohortBaselineBrowsers,
  cohortExtensionBrowsers,
} from "./cohortCollect.js";

/**
 * Executes the cohort Playwright harness, persists JSON payloads, then renders visualization assets.
 */
const main = async (): Promise<void> => {
  const argv = await parseCohortArgv(process.argv.slice(2));
  await assertPlaywrightChromiumInstalled();
  const masking = labMask(MASKING_PRESETS[argv.preset]);
  const startedAtEpochMs = Date.now();
  const labelPrefix = `${argv.baselineOnly ? "baseline" : "extension"}-${argv.preset}`;
  let outcome:
    | Awaited<ReturnType<typeof cohortBaselineBrowsers>>
    | Awaited<ReturnType<typeof cohortExtensionBrowsers>>;
  if (!argv.baselineOnly && !argv.extensionPath) {
    throw new Error(
      `No unpacked MV3 bundle found — build with pnpm build:extension or pass --extension /path/to/unpacked — expected manifest under ${path.join(repoRoot, "extension", "manifest.json")}. Baseline-only: --baseline`
    );
  }
  if (argv.baselineOnly) {
    outcome = await cohortBaselineBrowsers({
      count: argv.count,
      parallel: argv.parallel,
      headed: argv.headed,
      fixtureAbsolute: argv.fixtureAbsolute,
      masking,
      preset: argv.preset,
      labelPrefix,
      startedAtEpochMs,
    });
  } else {
    const unpacked = argv.extensionPath;
    if (!unpacked) {
      throw new Error("extensionPath missing despite guard — report this invariant.");
    }
    outcome = await cohortExtensionBrowsers({
      count: argv.count,
      headed: argv.headed,
      fixtureAbsolute: argv.fixtureAbsolute,
      extensionPath: unpacked,
      masking,
      preset: argv.preset,
      labelPrefix,
      startedAtEpochMs,
    });
  }
  await fs.mkdir(argv.reportAbsolute, { recursive: true });
  await fs.writeFile(
    path.join(argv.reportAbsolute, "cohort.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        preset: argv.preset,
        summary: serializeCohortSummary(outcome.rows),
        rows: outcome.rows,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(argv.reportAbsolute, "performance.json"),
    `${JSON.stringify(outcome.performance, null, 2)}\n`,
    "utf8"
  );
  if (!argv.noPlots) {
    runMatplotlibDashboard(argv.reportAbsolute);
  }
  process.stdout.write(
    `cohort complete → ${argv.reportAbsolute} (${outcome.performance.mode})\n`
  );
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
