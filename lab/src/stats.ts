import type { FontSignalsPayload } from "@fontmask/collector";
import type { MaskingConfig, MaskingPresetId } from "@fontmask/config";
import { sanitizeMaskingConfig } from "@fontmask/config";
import crypto from "node:crypto";

/**
 * Describes one cohort fingerprint row annotated with hashing metadata plus engine labels.
 */
export type CohortRow = {
  id: number;
  label: string;
  payload: FontSignalsPayload;
  hashHex: string;
  enginePreset: MaskingPresetId | "unset";
};

/**
 * Flattens font metrics into numeric vectors powering cosine correlation estimates.
 */
export const vectorizePayload = (payload: FontSignalsPayload): number[] => {
  const widthValues = sortedKeys(payload.measureTextWidths).map(
    (key) => payload.measureTextWidths[key] ?? 0
  );
  const phantomValues = sortedKeys(payload.phantomProbeMetrics).map(
    (key) => payload.phantomProbeMetrics[key] ?? 0
  );
  return [...widthValues, ...phantomValues, payload.fontsCheckHits.length];
};

const sortedKeys = (record: Record<string, number>): string[] =>
  Object.keys(record).sort();

/**
 * Computes normalized cosine similarity treating missing dimensions as orthogonal noise.
 */
export const cosineSimilarity = (left: number[], right: number[]): number => {
  const length = Math.max(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let idx = 0; idx < length; idx += 1) {
    const l = left[idx] ?? 0;
    const r = right[idx] ?? 0;
    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

/**
 * Estimates pairwise cosine correlation statistics for uniqueness comparisons.
 */
export const summarizePairwiseCosine = (rows: CohortRow[]) => {
  const vectors = rows.map((row) => vectorizePayload(row.payload));
  const scores: number[] = [];
  for (let outer = 0; outer < rows.length; outer += 1) {
    for (
      let inner = outer + 1;
      inner < rows.length;
      inner += 1
    ) {
      scores.push(cosineSimilarity(vectors[outer]!, vectors[inner]!));
    }
  }
  scores.sort((a, b) => a - b);
  const mean =
    scores.length === 0
      ? 0
      : scores.reduce((acc, score) => acc + score, 0) / scores.length;
  const p95 =
    scores.length === 0
      ? 0
      : scores[Math.floor(0.95 * (scores.length - 1))] ?? scores.at(-1) ?? 0;
  const min = scores[0] ?? 0;
  const max = scores.at(-1) ?? 0;
  return {
    scores,
    mean,
    min,
    max,
    p95,
    countPairs: scores.length,
  };
};

/**
 * Calculates collision counts referencing stable SHA digests of payloads.
 */
export const analyzeCollisions = (rows: CohortRow[]) => {
  const tally = new Map<string, number>();
  rows.forEach((row) => {
    tally.set(row.hashHex, (tally.get(row.hashHex) ?? 0) + 1);
  });
  const collisions = [...tally.values()].filter((count) => count > 1).length;
  return {
    uniqueHashes: tally.size,
    collisions,
  };
};

/**
 * Estimates Shannon entropy on discretized metric streams per cohort column.
 */
export const estimateMetricEntropy = (rows: CohortRow[]): number => {
  if (rows.length === 0) {
    return 0;
  }
  const buckets = new Map<string, number>();
  rows.forEach((row) => {
    const vector = vectorizePayload(row.payload);
    const label = vector.map((value) => value.toFixed(4)).join("|");
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  });
  const total = rows.length;
  let entropy = 0;
  buckets.forEach((count) => {
    const p = count / total;
    entropy -= p * Math.log2(p);
  });
  return entropy;
};

/**
 * Serializes cohort artifacts for downstream visualization layers.
 */
export const serializeCohortSummary = (rows: CohortRow[]) => ({
  rows: rows.length,
  collisions: analyzeCollisions(rows),
  pairwiseCosine: summarizePairwiseCosine(rows),
  entropy: estimateMetricEntropy(rows),
});

/**
 * Serializes payloads into stable SHA-256 digests for collision tracking.
 */
export const hashPayload = (payload: FontSignalsPayload): string => {
  const stable = canonicalizePayload(payload);
  return crypto.createHash("sha256").update(stable).digest("hex");
};

const canonicalizePayload = (payload: FontSignalsPayload): string =>
  JSON.stringify(payload, Object.keys(payload).sort());

/**
 * Mirrors runtime masking clamps for lab-only synthetic experiments.
 */
export const labMask = (masking: MaskingConfig): MaskingConfig =>
  sanitizeMaskingConfig(masking);
