import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type BrowserContext, type Browser } from "playwright";

import type { FontSignalsPayload } from "@fontmask/collector";
import type { MaskingConfig, MaskingPresetId } from "@fontmask/config";

import type { CohortRow } from "../stats.js";
import { hashPayload, labMask } from "../stats.js";

/**
 * Starts a minimal static HTTP server rooted at the repo root so the extension
 * can inject into http:// pages instead of restricted file:// URLs.
 * :returns: Object with the server instance, base URL, and a stop() helper.
 */
async function startFixtureServer(repoRoot: string): Promise<{ baseUrl: string; stop: () => void }> {
  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".woff2": "font/woff2",
    ".png": "image/png",
  };
  const server = http.createServer((req, res) => {
    const urlPath = (req.url ?? "/").split("?")[0]!;
    const filePath = path.join(repoRoot, urlPath);
    fs.readFile(filePath)
      .then((data) => {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" });
        res.end(data);
      })
      .catch(() => {
        res.writeHead(404);
        res.end("not found");
      });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    stop: () => server.close(),
  };
}

/**
 * Converts an absolute fixture path to a localhost URL served by the fixture server.
 * :param baseUrl: the http://127.0.0.1:PORT prefix.
 * :param repoRoot: absolute repo root path.
 * :param fixtureAbsolute: absolute path to the fixture file.
 * :returns: http URL string.
 */
function fixtureHttpUrl(baseUrl: string, repoRoot: string, fixtureAbsolute: string): string {
  const rel = path.relative(repoRoot, fixtureAbsolute).replaceAll(path.sep, "/");
  return `${baseUrl}/${rel}`;
}

/**
 * Guards browser startup so missing Playwright chromium installs fail with an actionable hint.
 */
export async function assertPlaywrightChromiumInstalled(): Promise<void> {
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    throw new Error("Playwright chromium missing — run `pnpm browsers` then retry cohort.");
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function pooledSamples<T>(
  total: number,
  limit: number,
  mapper: (index: number) => Promise<T>
): Promise<T[]> {
  const results: T[] = new Array(total);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= total) {
        return;
      }
      results[index] = await mapper(index);
    }
  }
  const workers = Math.min(Math.max(1, limit), total);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function collectFromFixture(
  context: BrowserContext,
  fixtureUrl: string,
  masking: MaskingConfig,
  preset: MaskingPresetId | "unset"
): Promise<{ row: Omit<CohortRow, "id" | "label">; timingsMs: { goto: number; collect: number } }> {
  const page = await context.newPage();
  const startedGoto = performance.now();
  await page.goto(fixtureUrl, {
    waitUntil: "load",
    timeout: 120_000,
  });
  await page.waitForFunction(
    () =>
      typeof (window as Window & { FontmaskCollector?: { collectFontSignals: unknown } }).FontmaskCollector !==
      "undefined",
    { timeout: 120_000 }
  );
  const gotoMs = performance.now() - startedGoto;
  const maskingPayload = structuredCloneJSON(labMask(masking));

  const collectStart = performance.now();
  const payload = await page.evaluate(
    async (mask) => {
      const shell = window as unknown as {
        FontmaskCollector: {
          collectFontSignals: (opts: {
            masking?: MaskingConfig;
          }) => Promise<FontSignalsPayload>;
        };
      };
      return shell.FontmaskCollector.collectFontSignals({ masking: mask });
    },
    maskingPayload
  );
  const collectMs = performance.now() - collectStart;
  await page.close().catch(() => undefined);
  return {
    row: {
      payload,
      hashHex: hashPayload(payload),
      enginePreset: preset,
    },
    timingsMs: { goto: gotoMs, collect: collectMs },
  };
}

function structuredCloneJSON<T extends object>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type PerformanceRecord = {
  mode: "baseline" | "extension";
  preset: MaskingPresetId;
  fixture: string;
  samples: number;
  parallel?: number;
  extensionPath?: string;
  elapsedMsTotal: number;
  samplesPerSecond: number;
  perSampleAvgMs?: number;
  rows: Array<{
    id: number;
    label: string;
    gotoMs?: number;
    collectMs?: number;
    iterationMsTotal?: number;
  }>;
};

/**
 * Executes cohort collection without the unpacked extension using pooled browser contexts.
 * :returns: Rows plus timings suitable for dashboards and persisted performance payloads.
 */
export async function cohortBaselineBrowsers(options: {
  count: number;
  parallel: number;
  headed: boolean;
  fixtureAbsolute: string;
  masking: MaskingConfig;
  preset: MaskingPresetId;
  labelPrefix: string;
  startedAtEpochMs: number;
}): Promise<{ rows: CohortRow[]; performance: PerformanceRecord }> {
  const repoRoot = path.resolve(path.dirname(options.fixtureAbsolute), "..");
  const server = await startFixtureServer(repoRoot);
  const fixtureHref = fixtureHttpUrl(server.baseUrl, repoRoot, options.fixtureAbsolute);
  const browser = await chromium.launch({
    headless: !options.headed,
  });
  const totals: number[] = new Array<number>(options.count);
  const timings: Array<{ goto?: number; collect?: number }> = [];
  try {
    const built = await pooledSamples(options.count, options.parallel, async (index) => {
      const iterationStarted = performance.now();
      const context = await browser.newContext();
      const result = await collectFromFixture(
        context,
        fixtureHref,
        options.masking,
        options.preset
      ).finally(() => context.close().catch(() => undefined));
      totals[index] = performance.now() - iterationStarted;
      timings[index] = result.timingsMs;
      return result.row;
    });
    const elapsedMsTotal = Math.max(Number.EPSILON, Date.now() - options.startedAtEpochMs);
    const rows: CohortRow[] = built.map((entry, idx) => ({
      id: idx + 1,
      label: `${options.labelPrefix}-${idx}`,
      payload: entry.payload,
      hashHex: entry.hashHex,
      enginePreset: entry.enginePreset,
    }));
    return {
      rows,
      performance: {
        mode: "baseline",
        preset: options.preset,
        fixture: options.fixtureAbsolute,
        samples: options.count,
        parallel: options.parallel,
        elapsedMsTotal,
        samplesPerSecond: rows.length / (elapsedMsTotal / 1000),
        perSampleAvgMs:
          totals.reduce((accumulator, ms) => accumulator + (ms ?? 0), 0) / Math.max(1, options.count),
        rows: rows.map((row, idx) => ({
          id: row.id,
          label: row.label,
          gotoMs: timings[idx]?.goto,
          collectMs: timings[idx]?.collect,
          iterationMsTotal: totals[idx],
        })),
      },
    };
  } finally {
    await browser.close().catch(() => undefined);
    server.stop();
  }
}

/**
 * Launches unpacked MV3 bundles per cohort member to capture fingerprints with extension hooks applied.
 */
export async function cohortExtensionBrowsers(options: {
  count: number;
  headed: boolean;
  fixtureAbsolute: string;
  extensionPath: string;
  masking: MaskingConfig;
  preset: MaskingPresetId;
  labelPrefix: string;
  startedAtEpochMs: number;
}): Promise<{ rows: CohortRow[]; performance: PerformanceRecord }> {
  const repoRoot = path.resolve(path.dirname(options.fixtureAbsolute), "..");
  const server = await startFixtureServer(repoRoot);
  const fixtureHref = fixtureHttpUrl(server.baseUrl, repoRoot, options.fixtureAbsolute);
  const extArg = normalizeExtensionArgument(options.extensionPath);
  const rows: CohortRow[] = [];
  const perfRows: PerformanceRecord["rows"] = [];
  const totals = new Array<number>(options.count);
  for (let idx = 0; idx < options.count; idx += 1) {
    const iterationStart = Date.now();
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), "fontmask-cohort-"));
    let iterationMsTotal = 0;
    try {
      const persistent = await chromium.launchPersistentContext(profile, {
        headless: false,
        args: [
          `--disable-extensions-except=${extArg}`,
          `--load-extension=${extArg}`,
          "--headless=old",
        ],
      });
      const page = persistent.pages()[0] ?? (await persistent.newPage());
      const maskingPayload = structuredCloneJSON(labMask(options.masking));
      const gotoStart = performance.now();
      await page.goto(fixtureHref, { waitUntil: "load", timeout: 120_000 });
      await page.waitForFunction(
        () =>
          typeof (
            window as Window & {
              FontmaskCollector?: unknown;
            }
          ).FontmaskCollector !== "undefined",
        { timeout: 120_000 }
      );
      await page
        .waitForFunction(
          () => Boolean((globalThis as typeof globalThis & { __FONTMASK_ACTIVE__?: boolean }).__FONTMASK_ACTIVE__),
          { timeout: 10_000 }
        )
        .catch(() => undefined);
      const gotoMs = performance.now() - gotoStart;
      const collectStarted = performance.now();
      const payload = await page.evaluate(
        async (mask) => {
          const shell = window as unknown as {
            FontmaskCollector: {
              collectFontSignals: (opts: {
                masking?: MaskingConfig;
              }) => Promise<FontSignalsPayload>;
            };
          };
          return shell.FontmaskCollector.collectFontSignals({ masking: mask });
        },
        maskingPayload
      );
      const collectMs = performance.now() - collectStarted;
      await persistent.close().catch(() => undefined);
      iterationMsTotal = Date.now() - iterationStart;
      totals[idx] = iterationMsTotal;
      perfRows[idx] = {
        id: idx + 1,
        label: `${options.labelPrefix}-${idx}`,
        gotoMs,
        collectMs,
        iterationMsTotal,
      };
      rows.push({
        id: idx + 1,
        label: `${options.labelPrefix}-${idx}`,
        payload,
        hashHex: hashPayload(payload),
        enginePreset: options.preset,
      });
    } finally {
      await fs.rm(profile, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  const elapsedMsTotal = Math.max(
    Number.EPSILON,
    Date.now() - options.startedAtEpochMs
  );
  const performancePayload: PerformanceRecord = {
    mode: "extension",
    preset: options.preset,
    fixture: options.fixtureAbsolute,
    samples: options.count,
    extensionPath: options.extensionPath,
    elapsedMsTotal,
    samplesPerSecond: rows.length / (elapsedMsTotal / 1000),
    perSampleAvgMs:
      totals.reduce((acc, ms) => acc + (ms ?? 0), 0) / Math.max(1, totals.length),
    rows: perfRows,
  };
  server.stop();
  return { rows, performance: performancePayload };
}

function normalizeExtensionArgument(extensionRoot: string): string {
  if (path.sep !== "/") {
    return extensionRoot.replaceAll(path.sep, "/");
  }
  return extensionRoot;
}
