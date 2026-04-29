import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { repoRoot } from "../cli/cohortArgv.js";

export type DashboardSpawnOptions = {
  stdio?: "inherit" | "pipe";
};

/**
 * Invokes the matplotlib dashboard pipeline against an on-disk cohort bundle.
 * :param reportDirectory: Absolute directory containing cohort.json output by the TS cohort CLI.
 */
export function runMatplotlibDashboard(
  reportDirectory: string,
  options: DashboardSpawnOptions = {}
): void {
  const mode = options.stdio ?? "inherit";
  const pythonSrc = path.join(repoRoot, "python");
  const mergedPath = [pythonSrc, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
  const env = {
    ...process.env,
    PYTHONPATH: mergedPath,
  };
  const argvSuffix = ["-m", "fontmask_lab", reportDirectory];
  const attempts: Array<{ cmd: string; args: string[] }> = [];
  const push = (cmd: string, args: string[]) => {
    attempts.push({ cmd, args });
  };
  if (process.env.FONTMASK_PYTHON) {
    push(process.env.FONTMASK_PYTHON, argvSuffix);
  }
  if (process.platform === "win32") {
    push("py", ["-3", ...argvSuffix]);
  }
  push("python3", argvSuffix);
  push("python", argvSuffix);
  const seen = new Set<string>();
  for (const attempt of attempts) {
    const signature = `${attempt.cmd}\t${attempt.args.join("\t")}`;
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    const outcome = spawnSync(attempt.cmd, attempt.args, {
      cwd: repoRoot,
      env,
      stdio: mode,
    });
    if (outcome.status === 0) {
      return;
    }
  }
  throw new Error(
    "Matplotlib dashboard failed — install Python deps: pip install -e ./python (matplotlib). Or set FONTMASK_PYTHON to a capable interpreter."
  );
}
