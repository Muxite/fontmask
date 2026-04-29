import {
  CONFIG_SCHEMA_VERSION,
  duplicateMaskingConfig,
  parsePersistedState,
  resolveMaskedConfigFromState,
  sanitizeMaskingConfig,
  type MaskingConfig,
  type MaskingPresetId,
  type PartialMaskingTree,
  type PersistedMaskingState,
} from "@fontmask/config";
import type { FontmaskRuntimeEnvelope } from "./payload.ts";

/**
 * Persisted chrome.storage.local keys bridging popup/options surfaces with masking logic.
 */
const STORAGE_KEYS = {
  installSeed: "installSeedHex",
  persisted: "persistedMaskingState",
} as const;

const epochCounters = new Map<number, number>();

const encodeHexSeed = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Seeds install secrets once extensions deploy so hashes remain stable per profile.
 */
const persistInstallSeed = async (): Promise<string> => {
  const bucket = await chrome.storage.local.get(STORAGE_KEYS.installSeed);
  const existing = bucket[STORAGE_KEYS.installSeed];
  if (typeof existing === "string" && existing.length >= 16) {
    return existing;
  }
  const next = encodeHexSeed();
  await chrome.storage.local.set({ [STORAGE_KEYS.installSeed]: next });
  return next;
};

const defaultPersisted = (): PersistedMaskingState => ({
  schemaVersion: CONFIG_SCHEMA_VERSION,
  preset: "balanced",
  overrides: {},
});

/**
 * Reads persisted user selections or seeds defaults lazily once first opened.
 */
const readPersisted = async (): Promise<PersistedMaskingState> => {
  const blob = await chrome.storage.local.get(STORAGE_KEYS.persisted);
  const parsed = parsePersistedState(blob[STORAGE_KEYS.persisted]);
  if (parsed) {
    return parsed;
  }
  const fresh = defaultPersisted();
  await chrome.storage.local.set({ [STORAGE_KEYS.persisted]: fresh });
  return fresh;
};

const resolveMasking = async (): Promise<MaskingConfig> =>
  sanitizeMaskingConfig(resolveMaskedConfigFromState(await readPersisted()));

/**
 * Advances per-tab entropy budgets whenever navigations reload committed documents.
 */
const bumpEpochForTab = (tabId: number): number => {
  const epoch = (epochCounters.get(tabId) ?? 0) + 1;
  epochCounters.set(tabId, epoch);
  return epoch;
};

const peekEpochForTab = (tabId: number): number =>
  epochCounters.get(tabId) ?? 1;

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

const buildEnvelope = async (
  tabId: number,
  href: string | undefined,
  reuseEpoch = false
): Promise<FontmaskRuntimeEnvelope> => {
  const [seed, masking] = await Promise.all([
    persistInstallSeed(),
    resolveMasking(),
  ]);
  const epoch = reuseEpoch ? peekEpochForTab(tabId) : bumpEpochForTab(tabId);
  return {
    masking: duplicateMaskingConfig(masking),
    epoch,
    installSeed: seed,
    registrableOrigin: deriveOrigin(href),
  };
};

/**
 * Guards URL parsing when Service Workers omit host metadata on opaque navigations.
 */
const deriveOrigin = (href?: string): string => {
  if (!href) {
    return "opaque://unknown-origin";
  }
  try {
    return new URL(href).origin;
  } catch {
    return "opaque://invalid-origin";
  }
};

const hydrateTab = async (
  tabId: number,
  href: string | undefined,
  reuseEpoch = false
): Promise<void> => {
  const envelope = await buildEnvelope(tabId, href, reuseEpoch);
  await chrome.scripting.executeScript({
    target: { tabId },
    injectImmediately: true,
    world: "MAIN",
    func: assignPayloadToMain,
    args: [JSON.stringify(envelope)],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    injectImmediately: true,
    world: "MAIN",
    files: ["dist/page_scripts/fontmask.inject.js"],
  });
};

const assignPayloadToMain = (payload: unknown): void => {
  try {
    const parsed =
      typeof payload === "string" ? JSON.parse(payload as string) : payload;
    (globalThis as typeof globalThis & { __FONTMASK_PAYLOAD__?: FontmaskRuntimeEnvelope | null }).__FONTMASK_PAYLOAD__ =
      parsed as FontmaskRuntimeEnvelope;
  } catch {
    (
      globalThis as typeof globalThis & {
        __FONTMASK_PAYLOAD__?: FontmaskRuntimeEnvelope | null;
      }
    ).__FONTMASK_PAYLOAD__ = null;
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
    url: ["http://*/*", "https://*/*", "file://*/*"],
  });
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url) {
        return;
      }
      try {
        await hydrateTab(tab.id, tab.url, true);
      } catch {
        /* Tabs may disallow scripting intermittently during reload transitions. */
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
    readPersisted()
      .then((state) => sendResponse?.({ ok: true, state }))
      .catch(() => sendResponse?.({ ok: false }));
    return true;
  }
  if (message.type === "fontmask/write-state") {
    persistStateFromIncoming(message)
      .then((state) => sendResponse?.({ ok: true, state }))
      .catch(() => sendResponse?.({ ok: false }));
    return true;
  }
  return false;
});

const coercePreset = (candidate?: string | MaskingPresetId): MaskingPresetId => {
  if (candidate === "low" || candidate === "balanced" || candidate === "high_privacy") {
    return candidate;
  }
  return "balanced";
};

type IncomingPreferences = {
  preset?: MaskingPresetId | string;
  overrides?: PartialMaskingTree;
};

/**
 * Validates UI merges before persisting them so overrides cannot bypass clamping unintentionally downstream.
 */
const persistStateFromIncoming = async (
  incoming: IncomingPreferences
): Promise<PersistedMaskingState> => {
  const prev = await readPersisted();
  const next: PersistedMaskingState = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    preset: coercePreset(incoming.preset ?? prev.preset),
    overrides: mergeOverrides(prev.overrides, incoming.overrides),
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.persisted]: next });
  return next;
};

const mergeOverrides = (
  left?: PersistedMaskingState["overrides"],
  patch?: PersistedMaskingState["overrides"]
): PersistedMaskingState["overrides"] => {
  if (!patch) {
    return { ...(left ?? {}) };
  }
  return {
    ...(left ?? {}),
    ...patch,
    metrics: { ...(left?.metrics ?? {}), ...(patch.metrics ?? {}) },
    fontSurface: { ...(left?.fontSurface ?? {}), ...(patch.fontSurface ?? {}) },
    epoch: { ...(left?.epoch ?? {}), ...(patch.epoch ?? {}) },
    hooks: { ...(left?.hooks ?? {}), ...(patch.hooks ?? {}) },
    work: { ...(left?.work ?? {}), ...(patch.work ?? {}) },
  };
};
