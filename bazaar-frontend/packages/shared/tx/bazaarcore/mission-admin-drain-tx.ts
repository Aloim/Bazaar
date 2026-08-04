// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Update Ceremony — Mission admin force-cancel TX builders (DAppOwnerCap-gated).
 *
 * EVE path (NoTribe / Easy) → bazaar_mission::mission_admin_drain:
 *   buildAdminForceSettleMissionAcceptances — refund collateral 100% to each
 *     taker (no-fault). Page `takers` in ≤100 chunks. Call BEFORE cancel.
 *   buildAdminForceCancelMission — close a fully-settled mission (reward bundles
 *     → giver Player Locker, EVE reward → giver). runs_in_progress must be 0.
 *
 * Advanced path (token) → bazaar_economy::mission_ledger_ops:
 *   buildAdminForceSettleMissionAcceptancesAdvanced
 *   buildAdminForceCancelMissionAdvanced
 *
 * Per-(mission,giver) + per-taker iteration is driven by the ceremony UI: the
 * giverCharacter MUST be the mission owner's Character (Move pins recipient ==
 * mission.owner); `takers` come from MissionAcceptedEvent minus cancelled/
 * expired/completed.
 *
 * File limit: 500 lines | mission-batch convention.
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, MISSION_REGISTRY_ID } from "../../constants";

const REG = () => MISSION_REGISTRY_ID;
const CLOCK = "0x6";

// ── EVE path (NoTribe / Easy) ─────────────────────────────────────────────────

/**
 * Refund collateral 100% to each taker. Idempotent + pageable.
 * Move: bazaar_mission::mission_admin_drain::admin_force_settle_acceptances
 */
export function buildAdminForceSettleMissionAcceptances(
  params: {
    ownerCapId: string;
    missionId: string;
    ssuGovId: string;
    missionCollateralPoolId: string; // per-SSU EVE pool
    takers: string[];
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_ADMIN_DRAIN}::admin_force_settle_acceptances`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(REG()),
      tx.pure.id(params.missionId),
      tx.object(params.ssuGovId),
      tx.object(params.missionCollateralPoolId),
      tx.pure.vector("address", params.takers),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/**
 * Close a fully-settled mission (runs_in_progress == 0). giverCharacter MUST be
 * the mission owner's Character object.
 * Move: bazaar_mission::mission_admin_drain::admin_force_cancel_mission
 */
export function buildAdminForceCancelMission(
  params: {
    ownerCapId: string;
    missionId: string;
    ssuGovId: string;
    ssuId: string;            // StorageUnit shared object
    giverCharacterId: string; // mission owner's Character
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_ADMIN_DRAIN}::admin_force_cancel_mission`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(REG()),
      tx.pure.id(params.missionId),
      tx.object(params.ssuGovId),
      tx.object(params.ssuId),
      tx.object(params.giverCharacterId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

// ── Advanced path (tribe-token) ───────────────────────────────────────────────

/**
 * Refund token collateral 100% to each taker (Advanced). Idempotent + pageable.
 * Move: bazaar_economy::mission_ledger_ops::admin_force_settle_acceptances_advanced
 */
export function buildAdminForceSettleMissionAcceptancesAdvanced(
  params: {
    ownerCapId: string;
    missionId: string;
    ssuGovId: string;
    tribeGovId: string;
    ledgerId: string;
    economyCapStoreId: string;
    missionCollateralTokenPoolId: string;
    takers: string[];
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MISSION_LEDGER_OPS}::admin_force_settle_acceptances_advanced`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(REG()),
      tx.pure.id(params.missionId),
      tx.object(params.ssuGovId),
      tx.object(params.tribeGovId),
      tx.object(params.ledgerId),
      tx.object(params.economyCapStoreId),
      tx.object(params.missionCollateralTokenPoolId),
      tx.pure.vector("address", params.takers),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/**
 * Close a fully-settled Advanced mission (token reward → giver ledger row).
 * Move: bazaar_economy::mission_ledger_ops::admin_force_cancel_mission_advanced
 */
export function buildAdminForceCancelMissionAdvanced(
  params: {
    ownerCapId: string;
    missionId: string;
    ssuGovId: string;
    tribeGovId: string;
    ledgerId: string;
    economyCapStoreId: string;
    ssuId: string;
    giverCharacterId: string;
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MISSION_LEDGER_OPS}::admin_force_cancel_mission_advanced`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(REG()),
      tx.pure.id(params.missionId),
      tx.object(params.ssuGovId),
      tx.object(params.tribeGovId),
      tx.object(params.ledgerId),
      tx.object(params.economyCapStoreId),
      tx.object(params.ssuId),
      tx.object(params.giverCharacterId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
