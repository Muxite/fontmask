import { collectFontSignals } from "./index";

/**
 * Exposes asynchronous collection hooks for static HTML fixtures without bundler awareness.
 */
const FontmaskCollector = {
  collectFontSignals,
};

declare global {
  interface Window {
    FontmaskCollector: typeof FontmaskCollector;
  }
}

window.FontmaskCollector = FontmaskCollector;
