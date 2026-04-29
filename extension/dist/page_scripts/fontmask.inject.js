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
      hookOffsetDimensions: true
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
        hookOffsetDimensions: true
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
        hookOffsetDimensions: true
      },
      work: {
        derivedStateCacheScope: "per_frame_tick",
        maxFontsChecksPerInvocation: 96
      }
    })
  };

  // src/inject/main.ts
  var TEXT_METRICS_NOISE_KEYS = [
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
    "ideographicBaseline"
  ];
  var bootstrap = () => {
    if (globalThis.__FONTMASK_ACTIVE__) {
      return;
    }
    globalThis.__FONTMASK_ACTIVE__ = true;
    const runtime = hydrateRuntimePayload();
    if (!runtime.masking.hooks.hookCanvasMeasureText && !runtime.masking.hooks.hookDocumentFontsCheck && !runtime.masking.hooks.hookOffsetDimensions) {
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
      const font = this.font;
      const baseKey = `${runtime.deterministicLabel}|${font}|${text}`;
      return new Proxy(metrics, {
        get(target, prop, receiver) {
          if (typeof prop === "string" && TEXT_METRICS_NOISE_KEYS.includes(prop)) {
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
        }
      });
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
  var nodeSeq = 0;
  var stableNodeKeys = /* @__PURE__ */ new WeakMap();
  var stableNodeKey = (node) => {
    let label = stableNodeKeys.get(node);
    if (!label) {
      nodeSeq += 1;
      label = `n${nodeSeq}`;
      stableNodeKeys.set(node, label);
    }
    return label;
  };
  var readFontHint = (el) => {
    try {
      return globalThis.getComputedStyle(el).fontFamily || "";
    } catch {
      return "";
    }
  };
  var readRangeFontHint = (range) => {
    const start = range.startContainer;
    const el = start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement;
    return el ? readFontHint(el) : "";
  };
  var rangeSeq = 0;
  var stableRangeKeys = /* @__PURE__ */ new WeakMap();
  var stableRangeKey = (range) => {
    let label = stableRangeKeys.get(range);
    if (!label) {
      rangeSeq += 1;
      label = `r${rangeSeq}`;
      stableRangeKeys.set(range, label);
    }
    return label;
  };
  var layoutNoise = (runtime, el, slot) => {
    const normalized = deterministicFnv(
      `${runtime.deterministicLabel}|${stableNodeKey(el)}|${slot}|${readFontHint(el)}`
    );
    const signed = normalized * 2 - 1;
    return signed * runtime.masking.metrics.measureTextMaxOffsetPx;
  };
  var rangeLayoutNoise = (runtime, range, slot) => {
    const normalized = deterministicFnv(
      `${runtime.deterministicLabel}|${stableRangeKey(range)}|${slot}|${readRangeFontHint(range)}`
    );
    const signed = normalized * 2 - 1;
    return signed * runtime.masking.metrics.measureTextMaxOffsetPx;
  };
  var quantizeLength = (value, quantizePx) => Math.round(value / Math.max(quantizePx, 1e-4)) * Math.max(quantizePx, 1e-4);
  var quantizeLayoutInteger = (value, quantizePx) => Math.max(
    0,
    Math.round(quantizeLength(value, quantizePx))
  );
  var noiseRectForElement = (runtime, el, rect, tag) => {
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
  var noiseRectForRange = (runtime, range, rect, tag) => {
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
  var wrapDomRectList = (rects) => {
    const list = {
      length: rects.length,
      item: (index) => rects[index] ?? null,
      [Symbol.iterator]: function* iterateRects() {
        for (const rect of rects) {
          yield rect;
        }
      }
    };
    return list;
  };
  var patchLayoutDimensions = (runtime) => {
    const elementProto = Element.prototype;
    const rectUp = elementProto.getBoundingClientRect;
    elementProto.getBoundingClientRect = function patchedElementRect() {
      const rect = rectUp.call(this);
      return noiseRectForElement(runtime, this, rect, "gbcr");
    };
    const rectsUp = elementProto.getClientRects;
    elementProto.getClientRects = function patchedElementRects() {
      const list = rectsUp.call(this);
      const next = [];
      for (let idx = 0; idx < list.length; idx += 1) {
        next.push(
          noiseRectForElement(
            runtime,
            this,
            list[idx],
            `gcr|${idx}`
          )
        );
      }
      return wrapDomRectList(next);
    };
    const rangeProto = Range.prototype;
    const rangeRectUp = rangeProto.getBoundingClientRect;
    rangeProto.getBoundingClientRect = function patchedRangeRect() {
      const rect = rangeRectUp.call(this);
      return noiseRectForRange(runtime, this, rect, "rgbcr");
    };
    const rangeRectsUp = rangeProto.getClientRects;
    rangeProto.getClientRects = function patchedRangeRects() {
      const list = rangeRectsUp.call(this);
      const next = [];
      for (let idx = 0; idx < list.length; idx += 1) {
        next.push(
          noiseRectForRange(
            runtime,
            this,
            list[idx],
            `rgcr|${idx}`
          )
        );
      }
      return wrapDomRectList(next);
    };
    const elementLayoutProps = [
      "clientWidth",
      "clientHeight",
      "scrollWidth",
      "scrollHeight"
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
        get: function patchedLayoutMetric() {
          const raw = upstream.call(this);
          if (typeof raw !== "number" || Number.isNaN(raw)) {
            return raw;
          }
          const jittered = raw + layoutNoise(runtime, this, prop);
          return quantizeLayoutInteger(
            jittered,
            runtime.masking.metrics.metricsQuantizeStepPx
          );
        }
      });
    }
    const htmlProto = HTMLElement.prototype;
    const offsetProps = ["offsetWidth", "offsetHeight"];
    for (const prop of offsetProps) {
      const desc = Object.getOwnPropertyDescriptor(htmlProto, prop);
      if (!desc?.get) {
        continue;
      }
      const upstream = desc.get;
      Object.defineProperty(htmlProto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get: function patchedOffsetMetric() {
          const raw = upstream.call(this);
          if (typeof raw !== "number" || Number.isNaN(raw)) {
            return raw;
          }
          const jittered = raw + layoutNoise(runtime, this, prop);
          return quantizeLayoutInteger(
            jittered,
            runtime.masking.metrics.metricsQuantizeStepPx
          );
        }
      });
    }
  };
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
