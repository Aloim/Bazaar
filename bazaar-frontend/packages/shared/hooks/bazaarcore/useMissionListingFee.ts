// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useMissionListingFee — aggregates the per-hour Mission (MIS) listing fee across
 * the applicable governance layers and computes the total for a chosen duration.
 *
 * Composition (mirrors the Move charge fns + the excludeDapp tax rule):
 *   NoTribe  = SSU + Dapp
 *   Easy     = SSU + Tribe + Dapp
 *   Advanced = SSU + Tribe            (no Dapp layer; tribe-token denominated)
 *
 * total_fee = Σ(applicable layer per-hour fee) × floor(hours). The wizard's
 * duration slider is 1h-stepped, so floor is exact and matches
 * mission_fees::duration_hours (ms / 3_600_000) on-chain. The PTB must fund the
 * listing fee to EXACTLY this total or the create call aborts (E_FEE_MISMATCH).
 *
 * Denomination is implied by bazaarType: raw MIST EVE for NoTribe/Easy,
 * tribe-token units for Advanced (the SSU/Tribe fee fields are the same struct
 * field for both Easy and Advanced).
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { BAZAAR_TYPE_NUM, type BazaarTypeNum } from "../../types/bazaarcore";
import { composeMissionFee } from "../../utils/mission";
import { useDAppFees } from "../dapp_hub/governance-config-hooks";
import { useSSUGovernanceConfig } from "./ssu-governance-hooks";
import { useTribeGovernanceConfig } from "./tribe-governance-hooks";

export interface MissionListingFeeInput {
  bazaarType: BazaarTypeNum;
  ssuGovId: string | null;
  /** Required for Easy + Advanced (the Tribe layer). Ignored for NoTribe. */
  tribeGovId?: string | null;
  /** Whole listing hours (1..168). Fractions are floored to match the Move. */
  hours: number;
}

export interface MissionListingFeeOutput {
  ssuFeePerHour: number;
  tribeFeePerHour: number;
  dappFeePerHour: number;
  totalFeePerHour: number;
  /** totalFeePerHour × floor(hours) — the exact amount the PTB must fund. */
  totalFee: number;
  isLoading: boolean;
}

/**
 * Aggregate the per-hour mission listing fee + total for the given duration.
 * Reads the SSU / Tribe / Dapp mission fee fields (bazaarType-gated) and applies
 * the excludeDapp rule for Advanced. Layers that don't apply contribute 0.
 */
export function useMissionListingFee(input: MissionListingFeeInput): MissionListingFeeOutput {
  const { bazaarType, ssuGovId, tribeGovId, hours } = input;

  const tribeApplies = bazaarType !== BAZAAR_TYPE_NUM.NOTRIBE;
  const excludeDapp = bazaarType === BAZAAR_TYPE_NUM.ADVANCED;

  const { data: ssuCfg, isLoading: ssuLoading } = useSSUGovernanceConfig(ssuGovId ?? null);
  const { data: tribeCfg, isLoading: tribeLoading } =
    useTribeGovernanceConfig(tribeApplies ? (tribeGovId ?? null) : null);
  const { data: dappFees, isLoading: dappLoading } = useDAppFees();

  // Pure composition (bazaar-type gating + hours floor) lives in utils/mission so it
  // is unit-testable without a live RPC; the hook just supplies the raw layer fees.
  const composed = composeMissionFee({
    bazaarType,
    ssuFeePerHour: ssuCfg?.missionListingFeePerHour ?? 0,
    tribeFeePerHour: tribeCfg?.missionListingFeePerHour ?? 0,
    dappFeePerHour: dappFees?.missionListingFeePerHour ?? 0,
    hours,
  });

  const isLoading =
    (!!ssuGovId && ssuLoading) ||
    (tribeApplies && !!tribeGovId && tribeLoading) ||
    (!excludeDapp && dappLoading);

  return { ...composed, isLoading };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
