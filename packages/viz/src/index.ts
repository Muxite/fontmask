import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type FigureHandle = {
  width: number;
  height: number;
  layers: SvgLayer[];
};

type SvgLayer = {
  id: string;
  svg: string;
};

/**
 * Creates a matplotlib-style figure container used by downstream savefig utilities.
 */
export const figure = (options: { width?: number; height?: number } = {}): FigureHandle => ({
  width: options.width ?? 960,
  height: options.height ?? 540,
  layers: [],
});

export type SubplotGrid = {
  rows: number;
  cols: number;
  figures: FigureHandle[];
};

/**
 * Allocates a grid of figure handles mirroring matplotlib subplots ergonomics.
 */
export const subplots = (
  rows: number,
  cols: number,
  size: { width?: number; height?: number } = {}
): SubplotGrid => ({
  rows,
  cols,
  figures: Array.from({ length: rows * cols }).map(() => figure(size)),
});

/**
 * Serializes simple line charts into inline SVG path commands.
 */
export const plot = (
  fig: FigureHandle,
  xs: number[],
  ys: number[],
  options: { stroke?: string; label?: string } = {}
): void => {
  if (xs.length !== ys.length || xs.length === 0) {
    return;
  }
  const padding = 32;
  const width = fig.width - padding * 2;
  const height = fig.height - padding * 2;
  const maxX = Math.max(...xs);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const minY = Math.min(...ys);
  const scaleX = (value: number) =>
    padding + ((value - minX) / Math.max(maxX - minX, 1e-6)) * width;
  const scaleY = (value: number) =>
    fig.height -
    padding -
    ((value - minY) / Math.max(maxY - minY, 1e-6)) * height;
  const points = xs
    .map((x, idx) => `${scaleX(x)},${scaleY(ys[idx] ?? 0)}`)
    .join(" ");
  const layer = `<polyline fill="none" stroke="${options.stroke ?? "#4c6ef5"}" stroke-width="2" points="${points}" />`;
  fig.layers.push({
    id: options.label ?? "plot",
    svg: `<g>${layer}</g>`,
  });
};

/**
 * Draws overlaid histograms by binning samples into normalized columns.
 */
export const hist = (
  fig: FigureHandle,
  samples: number[],
  options: { bins?: number; fill?: string; label?: string } = {}
): void => {
  const bins = options.bins ?? 12;
  if (samples.length === 0) {
    return;
  }
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const step = Math.max((max - min) / bins, 1e-6);
  const bucket = new Array<number>(bins).fill(0);
  samples.forEach((value) => {
    const idx = Math.min(
      bins - 1,
      Math.max(0, Math.floor((value - min) / step))
    );
    bucket[idx] += 1;
  });
  const maxCount = Math.max(...bucket, 1);
  const barWidth = (fig.width - 64) / bins;
  const svg = bucket
    .map((count, idx) => {
      const x = 32 + idx * barWidth;
      const height = ((count / maxCount) * (fig.height - 80)) | 0;
      const y = fig.height - 40 - height;
      return `<rect x="${x}" y="${y}" width="${barWidth - 2}" height="${height}" fill="${
        options.fill ?? "#51cf66"
      }" opacity="0.65" />`;
    })
    .join("");
  fig.layers.push({
    id: options.label ?? "hist",
    svg: `<g>${svg}</g>`,
  });
};

/**
 * Produces a heatmap grid for correlation matrices or sweep outputs.
 */
export const imshow = (
  fig: FigureHandle,
  matrix: number[][],
  options: { label?: string } = {}
): void => {
  if (matrix.length === 0) {
    return;
  }
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const cellX = (fig.width - 64) / cols;
  const cellY = (fig.height - 64) / rows;
  const flat = matrix.flat();
  const max = Math.max(...flat, 1e-6);
  const min = Math.min(...flat);
  const span = Math.max(max - min, 1e-6);
  const rects = matrix
    .flatMap((row, r) =>
      row.map((value, c) => {
        const norm = (value - min) / span;
        const color = `rgb(${Math.round(255 * norm)},80,${Math.round(
          255 * (1 - norm)
        )})`;
        return `<rect x="${32 + c * cellX}" y="${32 + r * cellY}" width="${cellX - 1}" height="${cellY - 1}" fill="${color}" />`;
      })
    )
    .join("");
  fig.layers.push({
    id: options.label ?? "heatmap",
    svg: `<g>${rects}</g>`,
  });
};

/**
 * Renders vertical bar charts with optional error whiskers.
 */
export const bar = (
  fig: FigureHandle,
  labels: string[],
  values: number[],
  options: { errors?: number[]; fill?: string; label?: string } = {}
): void => {
  if (labels.length !== values.length) {
    return;
  }
  const max = Math.max(...values.map((v) => Math.abs(v)), 1e-6);
  const slot = (fig.width - 80) / labels.length;
  const bars = values
    .map((value, idx) => {
      const height = ((value / max) * (fig.height - 120)) | 0;
      const x = 40 + idx * slot;
      const y = fig.height - 60 - height;
      const err = options.errors?.[idx] ?? 0;
      const errHeight = ((err / max) * (fig.height - 120)) | 0;
      return `<rect x="${x}" y="${y}" width="${slot - 6}" height="${height}" fill="${
        options.fill ?? "#339af0"
      }" />
      <line x1="${x + slot / 2 - 3}" x2="${x + slot / 2 - 3}" y1="${
        y - errHeight
      }" y2="${y}" stroke="#ced4da" />`;
    })
    .join("");
  fig.layers.push({
    id: options.label ?? "bar",
    svg: `<g>${bars}</g>`,
  });
};

/**
 * Approximates empirical CDF curves for distance-to-neighbor diagnostics.
 */
export const ecdf = (
  fig: FigureHandle,
  samples: number[],
  options: { stroke?: string; label?: string } = {}
): void => {
  const sorted = [...samples].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return;
  }
  const ys = sorted.map((_, idx) => (idx + 1) / sorted.length);
  plot(fig, sorted, ys, { stroke: options.stroke ?? "#ff922b", label: options.label });
};

/**
 * Persists SVG figures to disk for HTML dashboards and CI artifacts.
 */
export const savefig = async (
  fig: FigureHandle,
  target: string,
  options: { title?: string } = {}
): Promise<void> => {
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true });
  const body = fig.layers.map((layer) => layer.svg).join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fig.width}" height="${fig.height}" viewBox="0 0 ${fig.width} ${fig.height}">
  <rect width="100%" height="100%" fill="#0b0f14" />
  <text x="16" y="28" fill="#e9ecef" font-size="18" font-family="Inter, system-ui">${options.title ?? ""}</text>
  ${body}
</svg>`;
  await writeFile(target, svg, "utf8");
};
