// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * dappTaxResolution — Phase 5 per-type DApp tax rate resolver.
 *
 * Pure helper used by useShopTaxBreakdown and (later) useWTBTaxConfig.
 * Extracted so the resolution logic can be unit-tested without mocking hooks.
 *
 * Resolution precedence (mirrors Move dapp_governance.move logic):
 *  - excludeDapp (Advanced shop taxes): always 0
 *  - NoTribe (tribeId === 0): notribeDappBps ?? globalTaxBps
 *  - Easy (tribeId > 0):     easyDappBps ?? globalTaxBps
 *
 * DE note (AUD-NT-16/ET-03): the DE DApp share is REAL — Move carves
 * `flat × dapp_bps / 10000` out of the SSU/Tribe flats (shop_ops_de) rather
 * than adding it on top. DE therefore resolves the same per-type rate; the
 * caller attributes it as a carve, not a payer surcharge.
 */

import type { DAppTaxConfig } from "../types";

export type TaxLayerKind = "wts" | "wtb" | "de";

export interface DAppTaxResolutionInput {
  kind:        TaxLayerKind;
  excludeDapp: boolean;
  tribeId:     number;
  config:      DAppTaxConfig | null | undefined;
}

/**
 * Resolve the effective DApp tax rate in basis points.
 * Returns 0 when the layer is suppressed (excludeDapp) or when config is unavailable.
 * On V35 (per-type fields absent → null), falls back to globalTaxBps.
 */
export function resolveDAppTaxBps(input: DAppTaxResolutionInput): number {
  const { excludeDapp, tribeId, config } = input;
  if (excludeDapp) return 0;
  if (!config) return 0;
  if (tribeId === 0) {
    return config.notribeDappBps ?? config.globalTaxBps;
  }
  return config.easyDappBps ?? config.globalTaxBps;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
