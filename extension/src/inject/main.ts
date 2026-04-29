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
    !runtime.masking.hooks.hookDocumentFontsCheck
  ) {
    return;
  }
  if (runtime.masking.hooks.hookCanvasMeasureText) {
    patchCanvasMeasurements(runtime);
  }
  if (runtime.masking.hooks.hookDocumentFontsCheck) {
    patchFontFaceChecks(runtime);
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
 * Mixes seeded offsets into canvases-derived TextMetric widths safely.
 */
const patchCanvasMeasurements = (runtime: MaskingRuntimeContext): void => {
  const proto = CanvasRenderingContext2D.prototype;
  const upstream = proto.measureText;
  proto.measureText = function patchedMeasureText(text: string) {
    const metrics = upstream.call(this, text);
    const normalized = deterministicFnv(
      `${runtime.deterministicLabel}|${this.font}|${text}`
    );
    const signed = normalized * 2 - 1;
    const offset = signed * runtime.masking.metrics.measureTextMaxOffsetPx;
    const noisyWidth = metrics.width + offset;
    const quantizedWidth = quantizeWidth(
      noisyWidth,
      runtime.masking.metrics.metricsQuantizeStepPx
    );
    return proxyMetrics(metrics, quantizedWidth);
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

const proxyMetrics = (
  upstream: TextMetrics,
  quantizedWidth: number
): TextMetrics =>
  new Proxy(upstream, {
    get(target, prop, receiver) {
      if (prop === "width") {
        return quantizedWidth;
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as TextMetrics;

const quantizeWidth = (width: number, quantizePx: number): number =>
  Math.round(width / Math.max(quantizePx, 0.0001)) *
  Math.max(quantizePx, 0.0001);

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
