# Extension (`extension/`)

## Purpose

The Fontmask browser extension implements probabilistic masking for font metrics and related surfaces (canvas `measureText`, `document.fonts`, layout dimensions—according to `MaskingConfig` hooks). It shares **`@fontmask/config`** with the lab so presets and bounds stay aligned.

## Manifest

`extension/manifest.json` declares **Manifest V3**: `service_worker` entry at `dist/background.js`, `action` popup, `options_ui`, and permissions including `storage`, `scripting`, `tabs`, `webNavigation`, plus broad host permissions for injection where allowed.

## Build

From the repository root:

```powershell
corepack pnpm build:extension
```

The build script bundles TypeScript sources (background, inject scripts, payload helpers) into `dist/` assets referenced by the manifest. Icons and HTML live under `extension/ui/`.

## Loading for development

Use **Load unpacked** in `chrome://extensions` and point at the **`extension`** directory (after build). The cohort CLI uses the same folder when you run fingerprint collection without `--baseline`.

## Relationship to the lab

The lab does not import React UI code; it loads this unpacked tree into Playwright’s Chromium. See [verification.md](verification.md) for the proof workflow.
