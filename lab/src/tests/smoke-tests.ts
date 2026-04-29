/**
 * Executes minimal Node-level smoke checks that vectorization math remains stable across releases.
 */

import assert from "node:assert/strict";
import { DEFAULT_FONT_PROBES, FONT_SIGNALS_VERSION } from "@fontmask/collector";
import { vectorizePayload, cosineSimilarity } from "../stats.js";

const syntheticPayload = {
  version: FONT_SIGNALS_VERSION,
  origin: "https://fixture.local",
  collectedAt: new Date().toISOString(),
  measureTextWidths: { "16px system-ui": 120.4 },
  fontsCheckHits: ["PhantomMask Mono 0"],
  phantomProbeMetrics: { "PhantomMask Mono 0": 60 },
  probes: DEFAULT_FONT_PROBES,
};

const vectorA = vectorizePayload(syntheticPayload);
const vectorB = vectorizePayload({
  ...syntheticPayload,
  measureTextWidths: { "16px system-ui": 121.1 },
});
const similarity = cosineSimilarity(vectorA, vectorB);
assert.ok(similarity > 0.9);
console.log("smoke vector ok", similarity);
