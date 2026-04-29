/** Schema revision for persisted settings and lab engine_config payloads. */
export const CONFIG_SCHEMA_VERSION = 1 as const;

/** Preset identifiers composed from MaskingConfig values. */
export type MaskingPresetId = "low" | "balanced" | "high_privacy";

/**
 * Describes cache scope for derived noise state keyed by origin plus epoch.
 * :param value: coarse lifetime of caches inside the inject bundle.
 */
export type DerivedStateCacheScope =
  | "per_document"
  | "per_frame_tick"
  | "per_call";

/** Root tuning object for masking; shared by extension, storage, and lab. */
export type MaskingConfig = {
  metrics: {
    measureTextMaxOffsetPx: number;
    metricsQuantizeStepPx: number;
  };
  fontSurface: {
    phantomFontCount: number;
    fontCheckFlipProbability: number;
  };
  epoch: {
    epochOnHardNavigationOnly: boolean;
    originScopedNoise: boolean;
  };
  hooks: {
    hookCanvasMeasureText: boolean;
    hookDocumentFontsCheck: boolean;
    hookOffsetDimensions: boolean;
  };
  work: {
    derivedStateCacheScope: DerivedStateCacheScope;
    maxFontsChecksPerInvocation: number;
  };
};

export const duplicateMaskingConfig = (config: MaskingConfig): MaskingConfig =>
  JSON.parse(JSON.stringify(config)) as MaskingConfig;

/**
 * Conservative defaults emphasizing balanced privacy and reasonable CPU use.
 */
export const DEFAULT_MASKING_CONFIG: MaskingConfig = {
  metrics: {
    measureTextMaxOffsetPx: 0.02,
    metricsQuantizeStepPx: 0.01,
  },
  fontSurface: {
    phantomFontCount: 6,
    fontCheckFlipProbability: 0.12,
  },
  epoch: {
    epochOnHardNavigationOnly: false,
    originScopedNoise: true,
  },
  hooks: {
    hookCanvasMeasureText: true,
    hookDocumentFontsCheck: true,
    hookOffsetDimensions: true,
  },
  work: {
    derivedStateCacheScope: "per_document",
    maxFontsChecksPerInvocation: 64,
  },
};

export type PersistedMaskingState = {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  preset: MaskingPresetId;
  overrides: PartialMaskingTree;
};

/**
 * Loose partial aligned with MaskingConfig nested fields for structured storage merges.
 */
export type PartialMaskingTree = {
  metrics?: Partial<MaskingConfig["metrics"]>;
  fontSurface?: Partial<MaskingConfig["fontSurface"]>;
  epoch?: Partial<MaskingConfig["epoch"]>;
  hooks?: Partial<MaskingConfig["hooks"]>;
  work?: Partial<MaskingConfig["work"]>;
};

const ALLOWED_SCOPE: DerivedStateCacheScope[] = [
  "per_document",
  "per_frame_tick",
  "per_call",
];

const BOUNDS: {
  metrics: Record<keyof MaskingConfig["metrics"], readonly [number, number]>;
  fontSurface: Record<keyof MaskingConfig["fontSurface"], readonly [number, number]>;
  work: Record<
    Exclude<keyof MaskingConfig["work"], "derivedStateCacheScope">,
    readonly [number, number]
  >;
} = {
  metrics: {
    measureTextMaxOffsetPx: [0, 0.25],
    metricsQuantizeStepPx: [0.0005, 0.05],
  },
  fontSurface: {
    phantomFontCount: [0, 32],
    fontCheckFlipProbability: [0, 0.55],
  },
  work: {
    maxFontsChecksPerInvocation: [4, 256],
  },
};

/**
 * Coerces primitives into safe ranges derived from MaskingConfig bounds tables.
 */
const clampNumeric = <
  Scope extends keyof typeof BOUNDS,
  Key extends keyof (typeof BOUNDS)[Scope],
>(
  scope: Scope,
  field: Key,
  value: number
): number => {
  const bucket = BOUNDS[scope] as Record<string, readonly [number, number]>;
  const [min, max] = bucket[field as string] ?? [-Infinity, Infinity];
  return Math.min(Math.max(value, min), max);
};

const deepMerge = <T extends Record<string, unknown>>(
  base: T,
  patch: Partial<T>
): T => {
  const out = { ...base } as T;
  (Object.entries(patch) as [keyof T, unknown][]).forEach(([k, val]) => {
    if (
      val !== undefined &&
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val)
    ) {
      out[k] = deepMerge(
        (base[k] as Record<string, unknown>) ?? {},
        val as Partial<Record<string, unknown>>
      ) as T[keyof T];
    } else if (val !== undefined) {
      out[k] = val as T[keyof T];
    }
  });
  return out;
};

export const sanitizeMaskingConfig = (config: MaskingConfig): MaskingConfig => ({
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
    ),
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
    ),
  },
  epoch: {
    epochOnHardNavigationOnly: Boolean(config.epoch.epochOnHardNavigationOnly),
    originScopedNoise: Boolean(config.epoch.originScopedNoise),
  },
  hooks: {
    hookCanvasMeasureText: Boolean(config.hooks.hookCanvasMeasureText),
    hookDocumentFontsCheck: Boolean(config.hooks.hookDocumentFontsCheck),
    hookOffsetDimensions: Boolean(config.hooks.hookOffsetDimensions),
  },
  work: {
    derivedStateCacheScope: ALLOWED_SCOPE.includes(config.work
      .derivedStateCacheScope as DerivedStateCacheScope)
      ? (config.work.derivedStateCacheScope as DerivedStateCacheScope)
      : "per_document",
    maxFontsChecksPerInvocation: Math.round(
      clampNumeric(
        "work",
        "maxFontsChecksPerInvocation",
        Number(config.work.maxFontsChecksPerInvocation)
      )
    ),
  },
});

/**
 * Applies partial overrides atop a canonical MaskingConfig with numeric clamping.
 * :param base: authoritative configuration such as preset output.
 * :param overrides: subtree saved from chrome.storage merges.
 */
export const mergeMaskingConfig = (
  base: MaskingConfig,
  overrides?: PartialMaskingTree
): MaskingConfig => {
  if (!overrides || Object.keys(overrides).length === 0) {
    return duplicateMaskingConfig(base);
  }
  let merged = deepMerge(
    base as unknown as Record<string, unknown>,
    overrides as unknown as Record<string, unknown>
  ) as unknown as MaskingConfig;
  merged = sanitizeMaskingConfig(merged);
  return merged;
};

const buildPreset = (partial?: PartialMaskingTree): MaskingConfig =>
  mergeMaskingConfig(DEFAULT_MASKING_CONFIG, partial);

/**
 * Published presets surfaced in popup/options alongside user overrides.
 */
export const MASKING_PRESETS: Record<MaskingPresetId, MaskingConfig> = {
  low: buildPreset({
    metrics: {
      measureTextMaxOffsetPx: 0.006,
      metricsQuantizeStepPx: 0.02,
    },
    fontSurface: {
      phantomFontCount: 2,
      fontCheckFlipProbability: 0.06,
    },
    hooks: {
      hookCanvasMeasureText: true,
      hookDocumentFontsCheck: true,
      hookOffsetDimensions: true,
    },
    work: {
      derivedStateCacheScope: "per_document",
      maxFontsChecksPerInvocation: 32,
    },
  }),
  balanced: duplicateMaskingConfig(DEFAULT_MASKING_CONFIG),
  high_privacy: buildPreset({
    metrics: {
      measureTextMaxOffsetPx: 0.04,
      metricsQuantizeStepPx: 0.005,
    },
    fontSurface: {
      phantomFontCount: 12,
      fontCheckFlipProbability: 0.22,
    },
    hooks: {
      hookCanvasMeasureText: true,
      hookDocumentFontsCheck: true,
      hookOffsetDimensions: true,
    },
    work: {
      derivedStateCacheScope: "per_frame_tick",
      maxFontsChecksPerInvocation: 96,
    },
  }),
};

/**
 * Applies preset canonicalization atop stored presets to pick up tightened bounds releases.
 */
export const presetConfig = (preset: MaskingPresetId): MaskingConfig =>
  duplicateMaskingConfig(sanitizeMaskingConfig(MASKING_PRESETS[preset]));

/**
 * Applies preset plus optional subtree overrides persisted from storage utilities.
 */
export const resolveMaskedConfigFromState = (
  state?: PersistedMaskingState | null
): MaskingConfig => {
  if (!state) {
    return duplicateMaskingConfig(DEFAULT_MASKING_CONFIG);
  }
  const base =
    MASKING_PRESETS[state.preset] ??
    duplicateMaskingConfig(DEFAULT_MASKING_CONFIG);
  return mergeMaskingConfig(base, state.overrides);
};

/**
 * Imports JSON payloads saved via options/export with schema validation safeguards.
 */
export const parsePersistedState = (raw: unknown): PersistedMaskingState | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const maybe = raw as Partial<PersistedMaskingState>;
  if (maybe.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    return null;
  }
  if (
    typeof maybe.preset !== "string" ||
    !(maybe.preset in MASKING_PRESETS)
  ) {
    return null;
  }
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    preset: maybe.preset as MaskingPresetId,
    overrides: (maybe.overrides ?? {}) as PartialMaskingTree,
  };
};
