// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useShopTaxBreakdown — EconomyFixplan Phase 6 (2026-05-08)
// Generalized 3-layer (or 2-layer for DE) tax breakdown for any shop kind.
// V16 (Session 3C): tribe tier read via per-role Table; caller passes the
// taxed party's role at trade time (buyer for WTS, filler for WTB, exchanger for DE).
// Wraps useTribeGovId + useTribeRoleTaxTable + useDAppTaxConfig.
// NoTribe (tribeId === 0) skips the tribe layer with no extra fetch.

import { useTribeGovId } from "./governance-resolution-hooks";
import { useTribeRoleTaxTable } from "./tribe-governance-hooks";
import { useDAppTaxConfig } from "../dapp_hub/governance-config-hooks";
import { computeTaxBreakdownBps, computeTaxBreakdownFlat } from "../../utils/computeTaxBreakdown";
import { resolveDAppTaxBps } from "../../utils/dappTaxResolution";

export type ShopTaxKind = "wts" | "wtb" | "de";

export interface ShopTaxBreakdownInput {
  kind:         ShopTaxKind;
  /**
   * SSU pct (wts/wtb stored ×100; 525 = 5.25%) or SSU flat fee in mist (de).
   * Caller resolves via useSSURoleTaxTable[ssuRole] before calling.
   */
  ssuBpsOrFee:  number;
  /** Numeric tribe id from useSSUGovernanceConfig.tribeId. 0 = NoTribe. */
  tribeId:      number;
  /**
   * V16: tribe-role index of the taxed party (0..7). Used to key into the
   * per-tribe role tax Table. Ignored when tribeId === 0 (NoTribe).
   */
  tribeRole?:   number;
  /** Items-cost mist for wts/wtb; units count (1 per exchange) for de. */
  grossOrUnits: number;
  /**
   * Advanced bazaars (bazaarType === 2) settle shop taxes through the tribe-token
   * ledger (SSU + Tribe only); the DApp tax applies solely at the Exchange. Pass
   * true to drop the DApp layer. Ignored for `de` (already 0). Default false.
   */
  excludeDapp?: boolean;
}

export interface ShopTaxBreakdownOutput {
  kind:         ShopTaxKind;
  ssuBpsOrFee:  number;
  tribeBpsOrFee: number;
  dappBps:      number;
  totalBpsOrFee: number;
  /** Total tax/fee in mist (single-step floor for bps; ssu+tribe flat for de — the DE DApp share is carved OUT of the flats, not added). */
  totalAmount:  number;
  /** Per-layer mist amount (bps: sum may be ≤ totalAmount by ≤2 mist; de: ssu/tribe are recipient NETS after the DApp carve). */
  ssuAmount:    number;
  tribeAmount:  number;
  dappAmount:   number;
  isLoading:    boolean;
}

export function useShopTaxBreakdown(input: ShopTaxBreakdownInput): ShopTaxBreakdownOutput {
  const { kind, ssuBpsOrFee, tribeId, tribeRole = 0, grossOrUnits, excludeDapp = false } = input;
  const tribeIdStr = tribeId > 0 ? String(tribeId) : null;
  const { data: tribeGovId } = useTribeGovId(tribeIdStr);
  const { data: tribeRoleTaxes } = useTribeRoleTaxTable(tribeGovId ?? null);
  const { data: dappTaxConfig } = useDAppTaxConfig();

  const tribeRow = tribeRoleTaxes?.[tribeRole] ?? null;
  const tribeFromCfg =
    kind === "wts" ? (tribeRow?.wtsPct ?? 0)
  : kind === "wtb" ? (tribeRow?.wtbPct ?? 0)
  :                  (tribeRow?.deFlatFee ?? 0);
  const tribeBpsOrFee = tribeId > 0 ? tribeFromCfg : 0;
  // Advanced (excludeDapp) drops the DApp layer — shop taxes settle on the token
  // ledger; the DApp tax applies only at the Exchange for tribe-token shops.
  // Phase 5: type-aware resolution with V35-safe fallback (absent per-type fields → null → global).
  // Phase 8 (AUD-NT-16/ET-03): DE resolves the rate too — Move CARVES the DApp
  // share out of the SSU/Tribe flats; payer total is unchanged, attribution isn't.
  const dappBps = resolveDAppTaxBps({ kind, excludeDapp, tribeId, config: dappTaxConfig });

  const isLoading = (tribeId > 0 && !tribeRoleTaxes) || (!excludeDapp && !dappTaxConfig);

  if (kind === "de") {
    const flat = computeTaxBreakdownFlat(grossOrUnits, ssuBpsOrFee, tribeBpsOrFee, dappBps);
    return {
      kind, ssuBpsOrFee, tribeBpsOrFee, dappBps,
      totalBpsOrFee: ssuBpsOrFee + tribeBpsOrFee,
      totalAmount: flat.totalAmount,
      ssuAmount: flat.ssuAmount, tribeAmount: flat.tribeAmount, dappAmount: flat.dappAmount,
      isLoading,
    };
  }
  const b = computeTaxBreakdownBps(grossOrUnits, ssuBpsOrFee, tribeBpsOrFee, dappBps);
  return {
    kind, ssuBpsOrFee, tribeBpsOrFee, dappBps,
    totalBpsOrFee: b.totalBps,
    totalAmount: b.totalAmount,
    ssuAmount: b.ssuTax, tribeAmount: b.tribeTax, dappAmount: b.dappTax,
    isLoading,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
