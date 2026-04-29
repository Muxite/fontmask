// ../packages/config/src/index.ts
var CONFIG_SCHEMA_VERSION = 1;
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
var resolveMaskedConfigFromState = (state) => {
  if (!state) {
    return duplicateMaskingConfig(DEFAULT_MASKING_CONFIG);
  }
  const base = MASKING_PRESETS[state.preset] ?? duplicateMaskingConfig(DEFAULT_MASKING_CONFIG);
  return mergeMaskingConfig(base, state.overrides);
};
var parsePersistedState = (raw) => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const maybe = raw;
  if (maybe.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    return null;
  }
  if (typeof maybe.preset !== "string" || !(maybe.preset in MASKING_PRESETS)) {
    return null;
  }
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    preset: maybe.preset,
    overrides: maybe.overrides ?? {}
  };
};

// src/background.ts
var STORAGE_KEYS = {
  installSeed: "installSeedHex",
  persisted: "persistedMaskingState"
};
var epochCounters = /* @__PURE__ */ new Map();
var encodeHexSeed = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
};
var persistInstallSeed = async () => {
  const bucket = await chrome.storage.local.get(STORAGE_KEYS.installSeed);
  const existing = bucket[STORAGE_KEYS.installSeed];
  if (typeof existing === "string" && existing.length >= 16) {
    return existing;
  }
  const next = encodeHexSeed();
  await chrome.storage.local.set({ [STORAGE_KEYS.installSeed]: next });
  return next;
};
var defaultPersisted = () => ({
  schemaVersion: CONFIG_SCHEMA_VERSION,
  preset: "balanced",
  overrides: {}
});
var readPersisted = async () => {
  const blob = await chrome.storage.local.get(STORAGE_KEYS.persisted);
  const parsed = parsePersistedState(blob[STORAGE_KEYS.persisted]);
  if (parsed) {
    return parsed;
  }
  const fresh = defaultPersisted();
  await chrome.storage.local.set({ [STORAGE_KEYS.persisted]: fresh });
  return fresh;
};
var resolveMasking = async () => sanitizeMaskingConfig(resolveMaskedConfigFromState(await readPersisted()));
var bumpEpochForTab = (tabId) => {
  const epoch = (epochCounters.get(tabId) ?? 0) + 1;
  epochCounters.set(tabId, epoch);
  return epoch;
};
var peekEpochForTab = (tabId) => epochCounters.get(tabId) ?? 1;
chrome.tabs.onRemoved.addListener((tabId) => {
  epochCounters.delete(tabId);
});
chrome.runtime.onInstalled.addListener(async () => {
  await persistInstallSeed();
  const persisted = await chrome.storage.local.get(STORAGE_KEYS.persisted);
  const parsed = parsePersistedState(persisted[STORAGE_KEYS.persisted]);
  if (!parsed) {
    await chrome.storage.local.set({ [STORAGE_KEYS.persisted]: defaultPersisted() });
  }
});
chrome.runtime.onStartup.addListener(async () => {
  await persistInstallSeed();
});
var buildEnvelope = async (tabId, href, reuseEpoch = false) => {
  const [seed, masking] = await Promise.all([
    persistInstallSeed(),
    resolveMasking()
  ]);
  const epoch = reuseEpoch ? peekEpochForTab(tabId) : bumpEpochForTab(tabId);
  return {
    masking: duplicateMaskingConfig(masking),
    epoch,
    installSeed: seed,
    registrableOrigin: deriveOrigin(href)
  };
};
var deriveOrigin = (href) => {
  if (!href) {
    return "opaque://unknown-origin";
  }
  try {
    return new URL(href).origin;
  } catch {
    return "opaque://invalid-origin";
  }
};
var hydrateTab = async (tabId, href, reuseEpoch = false) => {
  const envelope = await buildEnvelope(tabId, href, reuseEpoch);
  await chrome.scripting.executeScript({
    target: { tabId },
    injectImmediately: true,
    world: "MAIN",
    func: assignPayloadToMain,
    args: [JSON.stringify(envelope)]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    injectImmediately: true,
    world: "MAIN",
    files: ["dist/page_scripts/fontmask.inject.js"]
  });
};
var assignPayloadToMain = (payload) => {
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    globalThis.__FONTMASK_PAYLOAD__ = parsed;
  } catch {
    globalThis.__FONTMASK_PAYLOAD__ = null;
  }
};
chrome.webNavigation.onCommitted.addListener(async (details) => {
  try {
    if (details.frameId !== 0) {
      return;
    }
    if (!/^https?:|^file:|^blob:/u.test(details.url)) {
      return;
    }
    if (details.url.startsWith("chrome-extension://")) {
      return;
    }
    await hydrateTab(details.tabId, details.url);
  } catch (error) {
    console.warn("Fontmask navigation pipeline failed", error);
  }
});
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEYS.persisted]) {
    return;
  }
  const tabs = await chrome.tabs.query({
    url: ["http://*/*", "https://*/*", "file://*/*"]
  });
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url) {
        return;
      }
      try {
        await hydrateTab(tab.id, tab.url, true);
      } catch {
      }
    })
  );
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void _sender;
  if (typeof message?.type !== "string") {
    return;
  }
  if (message.type === "fontmask/read-state") {
    readPersisted().then((state) => sendResponse?.({ ok: true, state })).catch(() => sendResponse?.({ ok: false }));
    return true;
  }
  if (message.type === "fontmask/write-state") {
    persistStateFromIncoming(message).then((state) => sendResponse?.({ ok: true, state })).catch(() => sendResponse?.({ ok: false }));
    return true;
  }
  return false;
});
var coercePreset = (candidate) => {
  if (candidate === "low" || candidate === "balanced" || candidate === "high_privacy") {
    return candidate;
  }
  return "balanced";
};
var persistStateFromIncoming = async (incoming) => {
  const prev = await readPersisted();
  const next = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    preset: coercePreset(incoming.preset ?? prev.preset),
    overrides: mergeOverrides(prev.overrides, incoming.overrides)
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.persisted]: next });
  return next;
};
var mergeOverrides = (left, patch) => {
  if (!patch) {
    return { ...left ?? {} };
  }
  return {
    ...left ?? {},
    ...patch,
    metrics: { ...left?.metrics ?? {}, ...patch.metrics ?? {} },
    fontSurface: { ...left?.fontSurface ?? {}, ...patch.fontSurface ?? {} },
    epoch: { ...left?.epoch ?? {}, ...patch.epoch ?? {} },
    hooks: { ...left?.hooks ?? {}, ...patch.hooks ?? {} },
    work: { ...left?.work ?? {}, ...patch.work ?? {} }
  };
};
