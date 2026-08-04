// bazaar-frontend | TX builders for the three depreciated-mission EVE refund and close entries
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V41 SSU depreciation — Phase B mission-prune TX builders (EVE side).
 * Move: bazaar_mission::ssu_depreciation_missions::{
 *   prune_depreciated_mission_collateral_page, prune_depreciated_mission_reward,
 *   prune_depreciated_mission_items_page }.
 * ALL permissionless (gated on gov.is_depreciated). CR-DEP-06 ORDERING (binding,
 * enforced Move-side): entry 1 (collateral) must fully drain a mission's takers
 * BEFORE entry 2 (reward/close) — entry 2 asserts runs_in_progress==0. Entry 3
 * (items) is order-independent (CR-P3-01/P3b) and may run any time.
 *
 * Documentation/plans/implementation/ssu-depreciation-prune-plan.md §2.4.
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, MISSION_REGISTRY_ID, SUI_CLOCK_ID } from "../../constants";

// ── Entry 1: collateral page (EVE only, bt 0/1) — runs FIRST per mission ──────

export interface PruneDepreciatedMissionCollateralPageParams {
  ssuGovId: string;
  missionId: string;
  missionCollateralPoolId: string;
  missionRegistryId?: string;
  /** Page of takers (<=100) whose collateral to refund 100%. */
  takers: string[];
}

/** Move: prune_depreciated_mission_collateral_page(registry, gov, mission_id,
 *  pool, takers, clock, ctx). Aborts E_INVALID_BAZAAR_TYPE(5) if the mission is
 *  Advanced (bt==2) — use the token twin in ssu-depreciation-economy-tx.ts instead. */
export function buildPruneDepreciatedMissionCollateralPage(
  params: PruneDepreciatedMissionCollateralPageParams,
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.SSU_DEPRECIATION_MISSIONS}::prune_depreciated_mission_collateral_page`,
    arguments: [
      tx.object(params.missionRegistryId ?? MISSION_REGISTRY_ID),
      tx.object(params.ssuGovId),
      tx.pure.id(params.missionId),
      tx.object(params.missionCollateralPoolId),
      tx.pure.vector("address", params.takers),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ── Entry 2: reward + close (ALL bazaar types) — runs SECOND per mission ─────

export interface PruneDepreciatedMissionRewardParams {
  ssuGovId: string;
  missionId: string;
  missionRegistryId?: string;
}

/** Move: prune_depreciated_mission_reward(registry, gov, mission_id, clock, ctx).
 *  Idempotent no-op if already settled. Aborts E_RUNS_STILL_IN_PROGRESS(6) unless
 *  entry 1 (or the Advanced token twin) has drained every taker first. */
export function buildPruneDepreciatedMissionReward(
  params: PruneDepreciatedMissionRewardParams,
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.SSU_DEPRECIATION_MISSIONS}::prune_depreciated_mission_reward`,
    arguments: [
      tx.object(params.missionRegistryId ?? MISSION_REGISTRY_ID),
      tx.object(params.ssuGovId),
      tx.pure.id(params.missionId),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ── Entry 3: items recovery (ALL bazaar types, ORDER-INDEPENDENT) ────────────

export interface PruneDepreciatedMissionItemsPageParams {
  ssuGovId: string;
  missionId: string;
  missionRegistryId?: string;
  /** Max DF-pop count this call (<=100; default 100 — a full page). */
  maxPops?: number;
}

/** Move: prune_depreciated_mission_items_page(registry, gov, mission_id,
 *  max_pops, clock, ctx). Paginated by DF-pop count, not item count. Idempotent —
 *  a re-run after both DF classes are exhausted mutates nothing. */
export function buildPruneDepreciatedMissionItemsPage(
  params: PruneDepreciatedMissionItemsPageParams,
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.SSU_DEPRECIATION_MISSIONS}::prune_depreciated_mission_items_page`,
    arguments: [
      tx.object(params.missionRegistryId ?? MISSION_REGISTRY_ID),
      tx.object(params.ssuGovId),
      tx.pure.id(params.missionId),
      tx.pure.u64(params.maxPops ?? 100),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
