import fs from "node:fs/promises";
import path from "node:path";
import {
  bar,
  ecdf,
  figure,
  hist,
  imshow,
  savefig,
} from "@fontmask/viz";

import type { CohortRow } from "../stats.js";
import {
  analyzeCollisions,
  cosineSimilarity,
  estimateMetricEntropy,
  summarizePairwiseCosine,
  vectorizePayload,
} from "../stats.js";

const LEGACY_FIGURES = [
  "01_pairwise_similarity_hist.svg",
  "02_corr_heatmap.svg",
  "04_entropy_by_feature.svg",
  "05_ecdf_neighbor_distance.svg",
  "06_collision_rate_vs_n.svg",
];

/**
 * Original TypeScript `@fontmask/viz` rendering path (five SVG artifacts) retained for benchmarking against Python matplotlib outputs.
 */
export const writeSvgLegacyDashboard = async (
  reportDirectory: string,
  cohort: CohortRow[]
): Promise<void> => {
  const figuresDirectory = path.join(reportDirectory, "figures");
  await fs.mkdir(figuresDirectory, { recursive: true });
  const pairwise = summarizePairwiseCosine(cohort);
  const entropy = estimateMetricEntropy(cohort);
  const collisions = analyzeCollisions(cohort);

  const histFig = figure({ width: 960, height: 540 });
  hist(histFig, pairwise.scores, { bins: 18, label: "pairwise_cosine" });
  await savefig(
    histFig,
    path.join(figuresDirectory, LEGACY_FIGURES[0]),
    { title: "Pairwise cosine similarities" }
  );

  const corr = legacyCorrelationMatrix(cohort);
  const heatFig = figure({ width: 720, height: 720 });
  imshow(heatFig, corr, { label: "corr" });
  await savefig(
    heatFig,
    path.join(figuresDirectory, LEGACY_FIGURES[1]),
    { title: "Cosine sketch" }
  );

  const barFig = figure({ width: 960, height: 540 });
  bar(barFig, ["unique", "collisions"], [collisions.uniqueHashes, collisions.collisions], {
    fill: "#ff6b6b",
  });
  await savefig(barFig, path.join(figuresDirectory, LEGACY_FIGURES[2]), {
    title: `Unique vs collisions (entropy ${entropy.toFixed(3)})`,
  });

  const ecdfFig = figure({ width: 960, height: 540 });
  ecdf(ecdfFig, pairwise.scores, { label: "ecdf_cosine", stroke: "#4dabf7" });
  await savefig(
    ecdfFig,
    path.join(figuresDirectory, LEGACY_FIGURES[3]),
    { title: "ECDF cosine" }
  );

  const summaryFig = figure({ width: 960, height: 540 });
  bar(summaryFig, ["mean", "p95"], [pairwise.mean, pairwise.p95], {
    fill: "#ffa94d",
  });
  await savefig(
    summaryFig,
    path.join(figuresDirectory, LEGACY_FIGURES[4]),
    {
      title: `Collision pairs ${pairwise.countPairs}`,
    }
  );

  const summaryPayload = {
    collisions,
    pairwise,
    entropy,
    figurePaths: LEGACY_FIGURES,
    pipeline: "legacyTypescriptSvg",
  };
  await fs.writeFile(
    path.join(reportDirectory, "summary.legacy-svg.json"),
    JSON.stringify(summaryPayload, null, 2),
    "utf8"
  );
};

function legacyCorrelationMatrix(rows: CohortRow[]): number[][] {
  const vectors = rows.map((row) => vectorizePayload(row.payload));
  const size = Math.min(vectors.length, 12);
  const grid: number[][] = [];
  for (let outer = 0; outer < size; outer += 1) {
    const line: number[] = [];
    for (let inner = 0; inner < size; inner += 1) {
      line.push(
        cosineSimilarity(vectors[outer] ?? [], vectors[inner] ?? [])
      );
    }
    grid.push(line);
  }
  return grid;
}
