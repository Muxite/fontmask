import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";
import type { MaskingPresetId } from "@fontmask/config";
import { MASKING_PRESETS } from "@fontmask/config";

export const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export type CohortArgv = {
  count: number;
  baselineOnly: boolean;
  extensionPath?: string;
  fixtureAbsolute: string;
  reportAbsolute: string;
  headed: boolean;
  preset: MaskingPresetId;
  parallel: number;
  noPlots: boolean;
};

/**
 * Drops `--` separators that pnpm may inject between the script and forwarded flags.
 */
export function stripArgv(entries: readonly string[]): string[] {
  return entries.filter((entry) => entry !== "--");
}

/**
 * Resolves cohort CLI switches into absolute paths anchored at the workspace root where possible.
 * :returns: Parsed cohort settings or throws when presets or filesystem paths fail validation.
 */
export async function parseCohortArgv(entries: readonly string[]): Promise<CohortArgv> {
  const sanitized = stripArgv(entries);
  const defaults = {
    count: 4,
    baselineOnly: false,
    headed: false,
    preset: "balanced" as MaskingPresetId,
    fixtureRelative: path.join("test-fixtures", "collector.html"),
    reportRelative: path.join(
      "reports",
      `cohort-${new Date().toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "")}`
    ),
    parallel: Math.min(Math.max(1, (cpus()?.length ?? 4) ?? 4), 8),
    extensionCli: undefined as string | undefined,
    noPlots: false,
  };
  let positionalCount: number | undefined;
  let scan = 0;
  while (scan < sanitized.length) {
    const token = sanitized[scan]!;
    if (/^\d+$/.test(token)) {
      positionalCount = Number.parseInt(token, 10);
      scan += 1;
      continue;
    }
    if (token === "--baseline") {
      defaults.baselineOnly = true;
      scan += 1;
      continue;
    }
    if (token === "--headed") {
      defaults.headed = true;
      scan += 1;
      continue;
    }
    if (token === "--no-plots") {
      defaults.noPlots = true;
      scan += 1;
      continue;
    }
    if (token.startsWith("--")) {
      if (token === "--preset") {
        const value = sanitized[scan + 1];
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value after --preset");
        }
        if (!(value in MASKING_PRESETS)) {
          throw new Error(`Unsupported preset ${value}`);
        }
        defaults.preset = value as MaskingPresetId;
        scan += 2;
        continue;
      }
      if (token === "--fixture") {
        const value = sanitized[scan + 1];
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value after --fixture");
        }
        defaults.fixtureRelative = value;
        scan += 2;
        continue;
      }
      if (token === "--report") {
        const value = sanitized[scan + 1];
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value after --report");
        }
        defaults.reportRelative = value;
        scan += 2;
        continue;
      }
      if (token === "--extension") {
        const value = sanitized[scan + 1];
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value after --extension");
        }
        defaults.extensionCli = value;
        scan += 2;
        continue;
      }
      if (token === "--parallel") {
        const value = sanitized[scan + 1];
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value after --parallel");
        }
        const parsedParallel = Number.parseInt(value, 10);
        if (!Number.isFinite(parsedParallel) || parsedParallel < 1 || parsedParallel > 64) {
          throw new Error(`Invalid --parallel value ${value}`);
        }
        defaults.parallel = parsedParallel;
        scan += 2;
        continue;
      }
      if (token === "--count") {
        const value = sanitized[scan + 1];
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value after --count");
        }
        const parsedCount = Number.parseInt(value, 10);
        if (!Number.isFinite(parsedCount) || parsedCount < 1 || parsedCount > 10_000) {
          throw new Error(`Invalid --count value ${value}`);
        }
        positionalCount = parsedCount;
        scan += 2;
        continue;
      }
      throw new Error(`Unexpected flag ${token}`);
    }
    throw new Error(`Unexpected argument ${token}`);
  }
  if (positionalCount !== undefined) {
    defaults.count = positionalCount;
  }
  const fixtureAbsolute = path.isAbsolute(defaults.fixtureRelative)
    ? path.normalize(defaults.fixtureRelative)
    : path.resolve(repoRoot, defaults.fixtureRelative);
  const reportAbsolute = path.isAbsolute(defaults.reportRelative)
    ? path.normalize(defaults.reportRelative)
    : path.resolve(repoRoot, defaults.reportRelative);
  await fs.stat(fixtureAbsolute);
  const explicitExtension = defaults.extensionCli
    ? path.isAbsolute(defaults.extensionCli)
      ? path.normalize(defaults.extensionCli)
      : path.resolve(process.cwd(), defaults.extensionCli)
    : undefined;
  const extensionResolved = await resolveExtension(explicitExtension);
  return {
    count: defaults.count,
    baselineOnly: defaults.baselineOnly,
    extensionPath: extensionResolved,
    fixtureAbsolute,
    reportAbsolute,
    headed: defaults.headed,
    preset: defaults.preset,
    parallel: defaults.parallel,
    noPlots: defaults.noPlots,
  };
}

/**
 * Confirms mv3 manifest wiring before loading an unpacked extension bundle.
 */
export async function manifestAt(extensionRoot: string): Promise<void> {
  const manifest = path.join(extensionRoot, "manifest.json");
  const stats = await fs.stat(manifest);
  if (!stats.isFile()) {
    throw new Error(`manifest.json missing inside ${extensionRoot}`);
  }
}

/**
 * Picks either the CLI override or `{repoRoot}/extension` whenever a manifest exists.
 */
export async function resolveExtension(cliPath?: string): Promise<string | undefined> {
  if (cliPath) {
    await manifestAt(cliPath);
    return cliPath;
  }
  const candidate = path.join(repoRoot, "extension");
  try {
    await manifestAt(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}
