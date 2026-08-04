// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useWTBTaxConfig — Phase 5 (EconomyFixplan, 2026-05-08)
// Extracted from CreateShopModal/index.tsx to keep the parent ≤500 LOC.
// Aggregates the 3-layer WTB tax (SSU + Tribe + DApp) into surcharge-form prepay
// math. Mirrors the Move-side compute_taxes floor rounding semantics
// (single-step floor; surplus reclaimable via withdraw_escrow).

import { useTribeGovId } from "./governance-resolution-hooks";
import { useTribeRoleTaxTable } from "./tribe-governance-hooks";
import { useDAppTaxConfig } from "../dapp_hub/governance-config-hooks";
import { resolveDAppTaxBps } from "../../utils/dappTaxResolution";

export interface WTBTaxConfigInput {
  /**
   * SSU-role wtb pct for the creator's SSU role (stored ×100; 525 = 5.25%).
   * Already looked up by the caller via useSSURoleTaxTable[creatorSsuRole].
   */
  ssuBps: number;
  /** Numeric tribe id from useSSUGovernanceConfig.tribeId. 0 means NoTribe. */
  tribeId: number;
  /**
   * V16: tribe-role index of the WTB creator (0..7). Used to key into the
   * per-tribe role tax Table for the tribe layer. Ignored when tribeId === 0.
   */
  tribeRole?: number;
  /** Items total in scaled mist (sum of price*qty across listings). */
  itemsCostScaled: number;
  /**
   * Advanced bazaars (bazaarType === 2) settle shop taxes through the tribe-token
   * ledger, which charges SSU + Tribe ONLY — the DApp tax applies solely at the
   * Exchange. Pass true to drop the DApp layer from the breakdown. Default false
   * (NoTribe/Easy keep the 3-layer SSU + Tribe + DApp model).
   */
  excludeDapp?: boolean;
}

export interface WTBTaxConfigOutput {
  ssuBps: number;
  tribeBps: number;
  dappBps: number;
  totalBps: number;
  taxAmountScaled: number;
  totalDepositScaled: number;
  /** True while tribe (when tribeId !== 0) or dApp tax config is still loading. */
  isLoading: boolean;
}

/**
 * Aggregate the 3-layer WTB surcharge prepay math.
 *
 * Filler receives full listed price (Move-side Phase 5 surcharge model);
 * pool is over-funded by total tax at create time; per-fill drain releases
 * `gross + sum_of_taxes` so residual after 3 splits == gross.
 *
 * NoTribe (tribeId === 0) skips the tribe layer with no extra fetch cost.
 */
export function useWTBTaxConfig(input: WTBTaxConfigInput): WTBTaxConfigOutput {
  const { ssuBps, tribeId, tribeRole = 0, itemsCostScaled, excludeDapp = false } = input;
  const tribeIdStr = tribeId > 0 ? String(tribeId) : null;
  const { data: tribeGovId } = useTribeGovId(tribeIdStr);
  const { data: tribeRoleTaxes } = useTribeRoleTaxTable(tribeGovId ?? null);
  const { data: dappTaxConfig } = useDAppTaxConfig();
  const tribeRow = tribeRoleTaxes?.[tribeRole] ?? null;
  const tribeBps = tribeId > 0 ? (tribeRow?.wtbPct ?? 0) : 0;
  // Advanced (excludeDapp) charges SSU + Tribe only; the DApp tax is Exchange-only.
  // Phase 8 A4 (Phase-5 deferral): per-type resolution (notribe/easy → global
  // fallback) instead of the flat global read — keeps the WTB prepay in sync
  // with the V36 per-type rates while staying V35-safe (fields absent → global).
  const dappBps = resolveDAppTaxBps({ kind: "wtb", excludeDapp, tribeId, config: dappTaxConfig });
  const totalBps = ssuBps + tribeBps + dappBps;
  const taxAmountScaled = Math.floor(itemsCostScaled * totalBps / 10_000);
  const totalDepositScaled = itemsCostScaled + taxAmountScaled;
  const isLoading = (tribeId > 0 && !tribeRoleTaxes) || (!excludeDapp && !dappTaxConfig);
  return { ssuBps, tribeBps, dappBps, totalBps, taxAmountScaled, totalDepositScaled, isLoading };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
