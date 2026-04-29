import type { MaskingConfig } from "@fontmask/config";

/**
 * Describes runtime knobs synchronized from the service worker into the MAIN world bundle.
 */
export type FontmaskRuntimeEnvelope = {
  masking: MaskingConfig;
  epoch: number;
  installSeed: string;
  registrableOrigin: string;
};

declare global {
  interface Window {
    __FONTMASK_PAYLOAD__?: FontmaskRuntimeEnvelope | null;
  }
}
