"use strict";
(() => {
  // ../packages/config/src/index.ts
  var duplicateMaskingConfig = (config) => JSON.parse(JSON.stringify(config));
  var DEFAULT_MASKING_CONFIG = {
    metrics: {
      measureTextMaxOffsetPx: 0.02,
      metricsQuantizeStepPx: 0.01
    },
    fontSurface: {
      phantomFontCount: 6,
      fontCheckFlipProbability: 0.12
    },
    epoch: {
      epochOnHardNavigationOnly: false,
      originScopedNoise: true
    },
    hooks: {
      hookCanvasMeasureText: true,
      hookDocumentFontsCheck: true,
      hookOffsetDimensions: false
    },
    work: {
      derivedStateCacheScope: "per_document",
      maxFontsChecksPerInvocation: 64
    }
  };
  var ALLOWED_SCOPE = [
    "per_document",
    "per_frame_tick",
    "per_call"
  ];
  var BOUNDS = {
    metrics: {
      measureTextMaxOffsetPx: [0, 0.25],
      metricsQuantizeStepPx: [5e-4, 0.05]
    },
    fontSurface: {
      phantomFontCount: [0, 32],
      fontCheckFlipProbability: [0, 0.55]
    },
    work: {
      maxFontsChecksPerInvocation: [4, 256]
    }
  };
  var clampNumeric = (scope, field, value) => {
    const bucket = BOUNDS[scope];
    const [min, max] = bucket[field] ?? [-Infinity, Infinity];
    return Math.min(Math.max(value, min), max);
  };
  var deepMerge = (base, patch) => {
    const out = { ...base };
    Object.entries(patch).forEach(([k, val]) => {
      if (val !== void 0 && val !== null && typeof val === "object" && !Array.isArray(val)) {
        out[k] = deepMerge(
          base[k] ?? {},
          val
        );
      } else if (val !== void 0) {
        out[k] = val;
      }
    });
    return out;
  };
  var sanitizeMaskingConfig = (config) => ({
    metrics: {
      measureTextMaxOffsetPx: clampNumeric(
        "metrics",
        "measureTextMaxOffsetPx",
        Number(config.metrics.measureTextMaxOffsetPx)
      ),
      metricsQuantizeStepPx: clampNumeric(
        "metrics",
        "metricsQuantizeStepPx",
        Number(config.metrics.metricsQuantizeStepPx)
      )
    },
    fontSurface: {
      phantomFontCount: Math.round(
        clampNumeric(
          "fontSurface",
          "phantomFontCount",
          Number(config.fontSurface.phantomFontCount)
        )
      ),
      fontCheckFlipProbability: clampNumeric(
        "fontSurface",
        "fontCheckFlipProbability",
        Number(config.fontSurface.fontCheckFlipProbability)
      )
    },
    epoch: {
      epochOnHardNavigationOnly: Boolean(config.epoch.epochOnHardNavigationOnly),
      originScopedNoise: Boolean(config.epoch.originScopedNoise)
    },
    hooks: {
      hookCanvasMeasureText: Boolean(config.hooks.hookCanvasMeasureText),
      hookDocumentFontsCheck: Boolean(config.hooks.hookDocumentFontsCheck),
      hookOffsetDimensions: Boolean(config.hooks.hookOffsetDimensions)
    },
    work: {
      derivedStateCacheScope: ALLOWED_SCOPE.includes(config.work.derivedStateCacheScope) ? config.work.derivedStateCacheScope : "per_document",
      maxFontsChecksPerInvocation: Math.round(
        clampNumeric(
          "work",
          "maxFontsChecksPerInvocation",
          Number(config.work.maxFontsChecksPerInvocation)
        )
      )
    }
  });
  var mergeMaskingConfig = (base, overrides) => {
    if (!overrides || Object.keys(overrides).length === 0) {
      return duplicateMaskingConfig(base);
    }
    let merged = deepMerge(
      base,
      overrides
    );
    merged = sanitizeMaskingConfig(merged);
    return merged;
  };
  var buildPreset = (partial) => mergeMaskingConfig(DEFAULT_MASKING_CONFIG, partial);
  var MASKING_PRESETS = {
    low: buildPreset({
      metrics: {
        measureTextMaxOffsetPx: 6e-3,
        metricsQuantizeStepPx: 0.02
      },
      fontSurface: {
        phantomFontCount: 2,
        fontCheckFlipProbability: 0.06
      },
      hooks: {
        hookCanvasMeasureText: true,
        hookDocumentFontsCheck: true,
        hookOffsetDimensions: false
      },
      work: {
        derivedStateCacheScope: "per_document",
        maxFontsChecksPerInvocation: 32
      }
    }),
    balanced: duplicateMaskingConfig(DEFAULT_MASKING_CONFIG),
    high_privacy: buildPreset({
      metrics: {
        measureTextMaxOffsetPx: 0.04,
        metricsQuantizeStepPx: 5e-3
      },
      fontSurface: {
        phantomFontCount: 12,
        fontCheckFlipProbability: 0.22
      },
      hooks: {
        hookCanvasMeasureText: true,
        hookDocumentFontsCheck: true,
        hookOffsetDimensions: false
      },
      work: {
        derivedStateCacheScope: "per_frame_tick",
        maxFontsChecksPerInvocation: 96
      }
    })
  };

  // src/inject/main.ts
  var bootstrap = () => {
    if (globalThis.__FONTMASK_ACTIVE__) {
      return;
    }
    globalThis.__FONTMASK_ACTIVE__ = true;
    const runtime = hydrateRuntimePayload();
    if (!runtime.masking.hooks.hookCanvasMeasureText && !runtime.masking.hooks.hookDocumentFontsCheck) {
      return;
    }
    if (runtime.masking.hooks.hookCanvasMeasureText) {
      patchCanvasMeasurements(runtime);
    }
    if (runtime.masking.hooks.hookDocumentFontsCheck) {
      patchFontFaceChecks(runtime);
    }
  };
  var hydrateRuntimePayload = () => {
    const envelope = globalThis.__FONTMASK_PAYLOAD__ ?? void 0;
    const masking = sanitizeMaskingConfig(
      envelope?.masking ?? DEFAULT_MASKING_CONFIG
    );
    const seed = envelope?.installSeed ?? "fallback-seed";
    const epoch = envelope?.epoch ?? 0;
    const originNoise = masking.epoch.originScopedNoise ? envelope?.registrableOrigin ?? "opaque://origin-unknown" : "global-scope";
    return {
      masking,
      envelope: envelope ?? {
        masking,
        epoch,
        installSeed: seed,
        registrableOrigin: originNoise
      },
      deterministicLabel: `${originNoise}|${epoch}|${seed}`
    };
  };
  var patchCanvasMeasurements = (runtime) => {
    const proto = CanvasRenderingContext2D.prototype;
    const upstream = proto.measureText;
    proto.measureText = function patchedMeasureText(text) {
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
  var patchFontFaceChecks = (runtime) => {
    const target = Reflect.get(globalThis, "FontFaceSet");
    if (!target?.prototype?.check || !document.fonts) {
      return;
    }
    const proto = target.prototype;
    let checksLogged = 0;
    const original = proto.check;
    proto.check = function patchedFontsCheck(font) {
      if (checksLogged >= runtime.masking.work.maxFontsChecksPerInvocation) {
        return original.apply(this, [font]);
      }
      checksLogged += 1;
      const reference = Boolean(original.apply(this, [font]));
      const flipDice = deterministicFnv(
        `${runtime.deterministicLabel}|fonts:${font}:${checksLogged}`
      );
      const shouldFlip = flipDice < runtime.masking.fontSurface.fontCheckFlipProbability;
      return shouldFlip ? !reference : reference;
    };
  };
  var proxyMetrics = (upstream, quantizedWidth) => new Proxy(upstream, {
    get(target, prop, receiver) {
      if (prop === "width") {
        return quantizedWidth;
      }
      return Reflect.get(target, prop, receiver);
    }
  });
  var quantizeWidth = (width, quantizePx) => Math.round(width / Math.max(quantizePx, 1e-4)) * Math.max(quantizePx, 1e-4);
  var deterministicFnv = (payload) => {
    let hash = 2166136263;
    for (let idx = 0; idx < payload.length; idx += 1) {
      hash ^= payload.charCodeAt(idx);
      hash = Math.imul(hash, 16777619);
      hash >>>= 0;
    }
    const normalized = (hash >>> 0) / 4294967295;
    return normalized;
  };
  bootstrap();
})();
