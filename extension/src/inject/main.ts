import {
  DEFAULT_MASKING_CONFIG,
  sanitizeMaskingConfig,
  type MaskingConfig,
} from "@fontmask/config";
import type { FontmaskRuntimeEnvelope } from "../payload.ts";

declare global {
  interface Window {
    __FONTMASK_PAYLOAD__?: FontmaskRuntimeEnvelope | null;
    __FONTMASK_ACTIVE__?: boolean;
  }
}

/**
 * Numeric TextMetrics fields surfaced by browsers that encode glyph geometry for fingerprints.
 */
const TEXT_METRICS_NOISE_KEYS = [
  "width",
  "actualBoundingBoxLeft",
  "actualBoundingBoxRight",
  "actualBoundingBoxAscent",
  "actualBoundingBoxDescent",
  "fontBoundingBoxAscent",
  "fontBoundingBoxDescent",
  "emHeightAscent",
  "emHeightDescent",
  "hangingBaseline",
  "alphabeticBaseline",
  "ideographicBaseline",
] as const;

/**
 * Applies deterministic perturbations to canvases/fonts APIs using seeded noise lanes.
 */
const bootstrap = (): void => {
  if (globalThis.__FONTMASK_ACTIVE__) {
    return;
  }
  globalThis.__FONTMASK_ACTIVE__ = true;
  const runtime = hydrateRuntimePayload();
  if (
    !runtime.masking.hooks.hookCanvasMeasureText &&
    !runtime.masking.hooks.hookDocumentFontsCheck &&
    !runtime.masking.hooks.hookOffsetDimensions
  ) {
    return;
  }
  if (runtime.masking.hooks.hookCanvasMeasureText) {
    patchCanvasMeasurements(runtime);
  }
  if (runtime.masking.hooks.hookDocumentFontsCheck) {
    patchFontFaceChecks(runtime);
  }
  if (runtime.masking.hooks.hookOffsetDimensions) {
    patchLayoutDimensions(runtime);
  }
};

type MaskingRuntimeContext = {
  masking: MaskingConfig;
  envelope: FontmaskRuntimeEnvelope;
  deterministicLabel: string;
};

const hydrateRuntimePayload = (): MaskingRuntimeContext => {
  const envelope =
    (globalThis as typeof globalThis & { __FONTMASK_PAYLOAD__?: FontmaskRuntimeEnvelope })
      .__FONTMASK_PAYLOAD__ ?? undefined;
  const masking = sanitizeMaskingConfig(
    envelope?.masking ?? DEFAULT_MASKING_CONFIG
  );
  const seed = envelope?.installSeed ?? "fallback-seed";
  const epoch = envelope?.epoch ?? 0;
  const originNoise = masking.epoch.originScopedNoise
    ? envelope?.registrableOrigin ?? "opaque://origin-unknown"
    : "global-scope";
  return {
    masking,
    envelope:
      envelope ??
      ({
        masking,
        epoch,
        installSeed: seed,
        registrableOrigin: originNoise,
      } satisfies FontmaskRuntimeEnvelope),
    deterministicLabel: `${originNoise}|${epoch}|${seed}`,
  };
};

/**
 * Mixes seeded offsets into canvases-derived TextMetrics fields used by glyph hashing probes.
 */
const patchCanvasMeasurements = (runtime: MaskingRuntimeContext): void => {
  const proto = CanvasRenderingContext2D.prototype;
  const upstream = proto.measureText;
  proto.measureText = function patchedMeasureText(text: string) {
    const metrics = upstream.call(this, text);
    const font = this.font;
    const baseKey = `${runtime.deterministicLabel}|${font}|${text}`;
    return new Proxy(metrics, {
      get(target, prop, receiver) {
        if (
          typeof prop === "string" &&
          (TEXT_METRICS_NOISE_KEYS as readonly string[]).includes(prop)
        ) {
          const raw = Reflect.get(target, prop, receiver);
          if (typeof raw !== "number" || Number.isNaN(raw)) {
            return raw;
          }
          const normalized = deterministicFnv(`${baseKey}|${prop}`);
          const signed = normalized * 2 - 1;
          const offset = signed * runtime.masking.metrics.measureTextMaxOffsetPx;
          return quantizeLength(
            raw + offset,
            runtime.masking.metrics.metricsQuantizeStepPx
          );
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as TextMetrics;
  };
};

/**
 * Mirrors FontFace checks with stochastic flips respecting invocation ceilings.
 */
const patchFontFaceChecks = (runtime: MaskingRuntimeContext): void => {
  const target = Reflect.get(globalThis as object, "FontFaceSet") as
    | typeof FontFaceSet
    | undefined;
  if (!target?.prototype?.check || !document.fonts) {
    return;
  }
  const proto = target.prototype as FontFaceSet;
  let checksLogged = 0;
  const original = proto.check;
  proto.check = function patchedFontsCheck(this: FontFaceSet, font: string): boolean {
    if (checksLogged >= runtime.masking.work.maxFontsChecksPerInvocation) {
      return original.apply(this, [font] as []);
    }
    checksLogged += 1;
    const reference = Boolean(original.apply(this, [font] as []));
    const flipDice = deterministicFnv(
      `${runtime.deterministicLabel}|fonts:${font}:${checksLogged}`
    );
    const shouldFlip =
      flipDice <
      runtime.masking.fontSurface.fontCheckFlipProbability;
    return shouldFlip ? !reference : reference;
  };
};

let nodeSeq = 0;
const stableNodeKeys = new WeakMap<Node, string>();

/**
 * Assigns an opaque stable label per DOM node so repeated reads stay coherent while font-aware noise can diverge across faces.
 */
const stableNodeKey = (node: Node): string => {
  let label = stableNodeKeys.get(node);
  if (!label) {
    nodeSeq += 1;
    label = `n${nodeSeq}`;
    stableNodeKeys.set(node, label);
  }
  return label;
};

/**
 * Reads computed font-family so layout noise shifts when a probe swaps candidate faces on the same element.
 */
const readFontHint = (el: Element): string => {
  try {
    return globalThis.getComputedStyle(el).fontFamily || "";
  } catch {
    return "";
  }
};

/**
 * Derives range-adjacent font context for Range geometry probes on text nodes.
 */
const readRangeFontHint = (range: Range): string => {
  const start = range.startContainer;
  const el =
    start.nodeType === Node.ELEMENT_NODE
      ? (start as Element)
      : start.parentElement;
  return el ? readFontHint(el) : "";
};

let rangeSeq = 0;
const stableRangeKeys = new WeakMap<Range, string>();

/**
 * Links stable noise lanes to Range instances used by selection-based measurement APIs.
 */
const stableRangeKey = (range: Range): string => {
  let label = stableRangeKeys.get(range);
  if (!label) {
    rangeSeq += 1;
    label = `r${rangeSeq}`;
    stableRangeKeys.set(range, label);
  }
  return label;
};

/**
 * Combines install scope entropy with node identity and active font so Arial-vs-Times deltas do not cancel additive masking.
 */
const layoutNoise = (
  runtime: MaskingRuntimeContext,
  el: Element,
  slot: string
): number => {
  const normalized = deterministicFnv(
    `${runtime.deterministicLabel}|${stableNodeKey(el)}|${slot}|${readFontHint(el)}`
  );
  const signed = normalized * 2 - 1;
  return signed * runtime.masking.metrics.measureTextMaxOffsetPx;
};

/**
 * Applies the same noise policy to Range-bound measurements where font context follows the covered text.
 */
const rangeLayoutNoise = (
  runtime: MaskingRuntimeContext,
  range: Range,
  slot: string
): number => {
  const normalized = deterministicFnv(
    `${runtime.deterministicLabel}|${stableRangeKey(range)}|${slot}|${readRangeFontHint(range)}`
  );
  const signed = normalized * 2 - 1;
  return signed * runtime.masking.metrics.measureTextMaxOffsetPx;
};

const quantizeLength = (value: number, quantizePx: number): number =>
  Math.round(value / Math.max(quantizePx, 0.0001)) *
  Math.max(quantizePx, 0.0001);

/**
 * Quantizes positive layout integers after jitter so brute-force DOM width ladders lose stable rungs.
 */
const quantizeLayoutInteger = (
  value: number,
  quantizePx: number
): number =>
  Math.max(
    0,
    Math.round(quantizeLength(value, quantizePx))
  );

/**
 * Emits a noisy DOMRect while preserving axis anchors so hit-testing edges stay roughly aligned.
 */
const noiseRectForElement = (
  runtime: MaskingRuntimeContext,
  el: Element,
  rect: DOMRectReadOnly,
  tag: string
): DOMRect => {
  const w = quantizeLength(
    rect.width + layoutNoise(runtime, el, `${tag}|w`),
    runtime.masking.metrics.metricsQuantizeStepPx
  );
  const h = quantizeLength(
    rect.height + layoutNoise(runtime, el, `${tag}|h`),
    runtime.masking.metrics.metricsQuantizeStepPx
  );
  return new DOMRect(rect.x, rect.y, w, h);
};

/**
 * Mirrors noiseRectForElement for Range APIs without an Element receiver.
 */
const noiseRectForRange = (
  runtime: MaskingRuntimeContext,
  range: Range,
  rect: DOMRectReadOnly,
  tag: string
): DOMRect => {
  const w = quantizeLength(
    rect.width + rangeLayoutNoise(runtime, range, `${tag}|w`),
    runtime.masking.metrics.metricsQuantizeStepPx
  );
  const h = quantizeLength(
    rect.height + rangeLayoutNoise(runtime, range, `${tag}|h`),
    runtime.masking.metrics.metricsQuantizeStepPx
  );
  return new DOMRect(rect.x, rect.y, w, h);
};

/**
 * Builds a DOMRectList-compatible wrapper over jittered geometry boxes.
 */
const wrapDomRectList = (rects: DOMRect[]): DOMRectList => {
  const list = {
    length: rects.length,
    item: (index: number) => rects[index] ?? null,
    [Symbol.iterator]: function* iterateRects() {
      for (const rect of rects) {
        yield rect;
      }
    },
  };
  return list as unknown as DOMRectList;
};

/**
 * Patches DOM layout readers used by font dictionary probes and unicode glyph ladders.
 */
const patchLayoutDimensions = (runtime: MaskingRuntimeContext): void => {
  const elementProto = Element.prototype;
  const rectUp = elementProto.getBoundingClientRect;
  elementProto.getBoundingClientRect = function patchedElementRect(
    this: Element
  ) {
    const rect = rectUp.call(this);
    return noiseRectForElement(runtime, this, rect, "gbcr");
  };

  const rectsUp = elementProto.getClientRects;
  elementProto.getClientRects = function patchedElementRects(this: Element) {
    const list = rectsUp.call(this);
    const next: DOMRect[] = [];
    for (let idx = 0; idx < list.length; idx += 1) {
      next.push(
        noiseRectForElement(
          runtime,
          this,
          list[idx] as DOMRectReadOnly,
          `gcr|${idx}`
        )
      );
    }
    return wrapDomRectList(next);
  };

  const rangeProto = Range.prototype;
  const rangeRectUp = rangeProto.getBoundingClientRect;
  rangeProto.getBoundingClientRect = function patchedRangeRect(this: Range) {
    const rect = rangeRectUp.call(this);
    return noiseRectForRange(runtime, this, rect, "rgbcr");
  };
  const rangeRectsUp = rangeProto.getClientRects;
  rangeProto.getClientRects = function patchedRangeRects(this: Range) {
    const list = rangeRectsUp.call(this);
    const next: DOMRect[] = [];
    for (let idx = 0; idx < list.length; idx += 1) {
      next.push(
        noiseRectForRange(
          runtime,
          this,
          list[idx] as DOMRectReadOnly,
          `rgcr|${idx}`
        )
      );
    }
    return wrapDomRectList(next);
  };

  type LayoutProp =
    | "clientWidth"
    | "clientHeight"
    | "scrollWidth"
    | "scrollHeight";
  const elementLayoutProps: LayoutProp[] = [
    "clientWidth",
    "clientHeight",
    "scrollWidth",
    "scrollHeight",
  ];
  for (const prop of elementLayoutProps) {
    const desc = Object.getOwnPropertyDescriptor(elementProto, prop);
    if (!desc?.get) {
      continue;
    }
    const upstream = desc.get;
    Object.defineProperty(elementProto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: function patchedLayoutMetric(this: Element) {
        const raw = upstream.call(this);
        if (typeof raw !== "number" || Number.isNaN(raw)) {
          return raw;
        }
        const jittered =
          raw + layoutNoise(runtime, this, prop);
        return quantizeLayoutInteger(
          jittered,
          runtime.masking.metrics.metricsQuantizeStepPx
        );
      },
    });
  }

  type OffsetProp = "offsetWidth" | "offsetHeight";
  const htmlProto = HTMLElement.prototype;
  const offsetProps: OffsetProp[] = ["offsetWidth", "offsetHeight"];
  for (const prop of offsetProps) {
    const desc = Object.getOwnPropertyDescriptor(htmlProto, prop);
    if (!desc?.get) {
      continue;
    }
    const upstream = desc.get;
    Object.defineProperty(htmlProto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: function patchedOffsetMetric(this: HTMLElement) {
        const raw = upstream.call(this);
        if (typeof raw !== "number" || Number.isNaN(raw)) {
          return raw;
        }
        const jittered =
          raw + layoutNoise(runtime, this, prop);
        return quantizeLayoutInteger(
          jittered,
          runtime.masking.metrics.metricsQuantizeStepPx
        );
      },
    });
  }
};

/**
 * Projects strings into repeatable floating scalars constrained to `[0,1)`.
 */
const deterministicFnv = (payload: string): number => {
  let hash = 0x811c9dc7;
  for (let idx = 0; idx < payload.length; idx += 1) {
    hash ^= payload.charCodeAt(idx);
    hash = Math.imul(hash, 0x01000193);
    hash >>>= 0;
  }
  const normalized = (hash >>> 0) / 0xffffffff;
  return normalized;
};

bootstrap();
