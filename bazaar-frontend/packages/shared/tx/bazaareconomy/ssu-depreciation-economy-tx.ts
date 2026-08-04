// bazaar-frontend | TX builders for the four Advanced tribe-token depreciated-SSU refund entries
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V41 SSU depreciation — Phase B economy-prune TX builders (Advanced tribe-token
 * side). Move: bazaar_economy::ssu_depreciation_economy::{
 *   prune_depreciated_wtb_token_page, prune_depreciated_free_token_page,
 *   prune_depreciated_mission_collateral_token_page, prune_depreciated_mission_reward_token }.
 * ALL permissionless (gated on gov.is_depreciated + is_advanced). Entry 4 additionally
 * requires the mission be SETTLED first (run bazaar_mission's reward/close entry,
 * ssu-depreciation-missions-tx.ts, before this one).
 *
 * Documentation/plans/implementation/ssu-depreciation-prune-plan.md §2.5.
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, SHARED_OBJECTS, MISSION_REGISTRY_ID, SUI_CLOCK_ID } from "../../constants";

// ── Entry 1: WTB token-pool residue page ──────────────────────────────────────

export interface PruneDepreciatedWtbTokenPageParams {
  ssuGovId: string;
  tribeTokenWtbPoolId: string;
  ledgerId: string;
  bazarRegistryId?: string;
  /** Page of shop ids (<=100) whose WTB tribe-token earmark to refund. */
  shopIds: string[];
}

/** Move: prune_depreciated_wtb_token_page(gov, registry, pool, ledger, shop_ids, clock, ctx). */
export function buildPruneDepreciatedWtbTokenPage(
  params: PruneDepreciatedWtbTokenPageParams,
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.SSU_DEPRECIATION_ECONOMY}::prune_depreciated_wtb_token_page`,
    arguments: [
      tx.object(params.ssuGovId),
      tx.object(params.bazarRegistryId ?? SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.object(params.tribeTokenWtbPoolId),
      tx.object(params.ledgerId),
      tx.pure.vector("address", params.shopIds),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ── Entry 2: Advanced FREE shop token-pool page ───────────────────────────────

export interface PruneDepreciatedFreeTokenPageParams {
  ssuGovId: string;
  ledgerId: string;
  bazarRegistryId?: string;
  /** Page of shop ids (<=100) whose Shop.tribe_token_pool residue to refund. */
  shopIds: string[];
}

/** Move: prune_depreciated_free_token_page(gov, registry, ledger, shop_ids, clock, ctx). */
export function buildPruneDepreciatedFreeTokenPage(
  params: PruneDepreciatedFreeTokenPageParams,
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.SSU_DEPRECIATION_ECONOMY}::prune_depreciated_free_token_page`,
    arguments: [
      tx.object(params.ssuGovId),
      tx.object(params.bazarRegistryId ?? SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.object(params.ledgerId),
      tx.pure.vector("address", params.shopIds),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ── Entry 3: mission token-collateral page ────────────────────────────────────

export interface PruneDepreciatedMissionCollateralTokenPageParams {
  ssuGovId: string;
  missionId: string;
  missionCollateralTokenPoolId: string;
  ledgerId: string;
  missionRegistryId?: string;
  economyCapStoreId?: string;
  /** Page of takers (<=100) whose token collateral to refund 100%. */
  takers: string[];
}

/** Move: prune_depreciated_mission_collateral_token_page(gov, mission_registry,
 *  pool, ledger, cap_store, mission_id, takers, clock, ctx). CR-DEP-05: needs the
 *  EconomyCapStore (cap-gated internal acceptance removal), unlike the EVE twin. */
export function buildPruneDepreciatedMissionCollateralTokenPage(
  params: PruneDepreciatedMissionCollateralTokenPageParams,
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.SSU_DEPRECIATION_ECONOMY}::prune_depreciated_mission_collateral_token_page`,
    arguments: [
      tx.object(params.ssuGovId),
      tx.object(params.missionRegistryId ?? MISSION_REGISTRY_ID),
      tx.object(params.missionCollateralTokenPoolId),
      tx.object(params.ledgerId),
      tx.object(params.economyCapStoreId ?? SHARED_OBJECTS.ECONOMY_CAP_STORE),
      tx.pure.id(params.missionId),
      tx.pure.vector("address", params.takers),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ── Entry 4 (P4b): mission reward-token residue ───────────────────────────────

export interface PruneDepreciatedMissionRewardTokenParams {
  ssuGovId: string;
  missionId: string;
  ledgerId: string;
  missionRegistryId?: string;
}

/** Move: prune_depreciated_mission_reward_token(gov, mission_registry, ledger,
 *  mission_id, clock, ctx). Single row, no pagination. Aborts
 *  E_MISSION_NOT_SETTLED(8) unless bazaar_mission's prune_depreciated_mission_reward
 *  has already settled this mission — run that entry first. */
export function buildPruneDepreciatedMissionRewardToken(
  params: PruneDepreciatedMissionRewardTokenParams,
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.SSU_DEPRECIATION_ECONOMY}::prune_depreciated_mission_reward_token`,
    arguments: [
      tx.object(params.ssuGovId),
      tx.object(params.missionRegistryId ?? MISSION_REGISTRY_ID),
      tx.object(params.ledgerId),
      tx.pure.id(params.missionId),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
