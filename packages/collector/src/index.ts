import type { MaskingConfig } from "@fontmask/config";

export const FONT_SIGNALS_VERSION = 1 as const;

export type FontSignalsProbe = {
  familyFace: string;
  sizePx: number;
  weight: number;
  italic: boolean;
  sample: string;
};

export type FontSignalsPayload = {
  version: typeof FONT_SIGNALS_VERSION;
  origin: string;
  collectedAt: string;
  measureTextWidths: Record<string, number>;
  fontsCheckHits: string[];
  phantomProbeMetrics: Record<string, number>;
  probes: FontSignalsProbe[];
};

/**
 * Describes standard canvas/document.fonts probes powering lab fixtures.
 */
export const DEFAULT_FONT_PROBES: FontSignalsProbe[] = [
  {
    familyFace: "system-ui",
    sample: "fontmaskABCDEFGHIJ",
    sizePx: 16,
    weight: 400,
    italic: false,
  },
  {
    familyFace: "\"Segoe UI\"",
    sample: "fontmaskABCDEFGHIJ",
    sizePx: 16,
    weight: 400,
    italic: false,
  },
  {
    familyFace: "\"Georgia\", serif",
    sample: "The quick ƒΩ",
    sizePx: 22,
    weight: 600,
    italic: true,
  },
];

const phantomFamilies = (count: number): string[] =>
  Array.from({ length: count }).map((_, idx) => `PhantomMask Mono ${idx}`);

/**
 * Executes canvas measureText probes and records serialized metrics for statistical analysis.
 * :returns: Canonical record aligned with cohort hashing utilities.
 */
export const collectFontSignals = async (
  options: {
    probes?: FontSignalsProbe[];
    masking?: MaskingConfig;
  } = {}
): Promise<FontSignalsPayload> => {
  const probes = options.probes ?? DEFAULT_FONT_PROBES;
  const measureTextWidths: Record<string, number> = {};
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas unavailable for telemetry collection.");
  }

  probes.forEach((probe) => {
    const fontCss = composeFontCss(probe);
    ctx.font = fontCss;
    const measured = quantizeMetric(
      ctx.measureText(probe.sample).width,
      options.masking?.metrics.metricsQuantizeStepPx ?? 0.01
    );
    measureTextWidths[fontCss] = measured;
  });

  const phantomCount = options.masking?.fontSurface.phantomFontCount ?? 4;
  const maxFontsProbe = options.masking?.work.maxFontsChecksPerInvocation ?? 64;

  await document.fonts?.ready.catch(() => undefined);

  const phantomProbeMetrics: Record<string, number> = {};
  phantomFamilies(phantomCount).forEach((family) => {
    ctx.font = `15px '${family}', system-ui`;
    phantomProbeMetrics[family] = quantizeMetric(
      ctx.measureText("0123456789").width,
      options.masking?.metrics.metricsQuantizeStepPx ?? 0.01
    );
  });

  const fontsCheckHits: string[] = [];
  phantomFamilies(Math.min(phantomCount, maxFontsProbe)).forEach((family, idx) => {
    try {
      if (idx >= maxFontsProbe) {
        return;
      }
      if (document.fonts?.check?.(`12px '${family}', serif`)) {
        fontsCheckHits.push(family);
      }
    } catch {
      /* tolerate partial FontFace implementations */
    }
  });

  return {
    version: FONT_SIGNALS_VERSION,
    origin:
      typeof location !== "undefined" ? location.href : "unknown:fixture",
    collectedAt: new Date().toISOString(),
    measureTextWidths,
    phantomProbeMetrics,
    fontsCheckHits,
    probes,
  };
};

/**
 * Quantizes widths to tame floating fingerprints before hashing pipelines.
 */
const quantizeMetric = (width: float32, step: float32): float32 =>
  Math.round(width / Math.max(step, 0.0001)) *
  Math.max(step, 0.0001);

type float32 = number;

/**
 * Builds a deterministic CSS font string for canvas rendering.
 */
export const composeFontCss = (probe: FontSignalsProbe): string =>
  `${probe.italic ? "italic " : ""}${probe.weight} ${probe.sizePx}px ${probe.familyFace}`;

/**
 * Serializes payloads so labs can stringify without accidental key reorder bugs.
 */
export const serializeFontSignals = (payload: FontSignalsPayload): string =>
  JSON.stringify(payload);
