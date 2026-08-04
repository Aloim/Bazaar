// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore Mission lifecycle TX builders — accept / expire / try-expire /
 * cancel-acceptance. Split from mission-tx.ts to keep that file under 500 lines.
 *
 * V34 additions:
 *   buildAcceptMission       — takes optional tx? (for coin-split callers), collateral
 *                              Coin<EVE>, pool, members. When tx passed, moveCall is
 *                              appended to it and the same tx is returned.
 *   buildCancelMyAcceptance  — NEW (taker self-cancel, 50/50 split, anytime)
 *   buildExpireAcceptance    — now takes pool (100% forfeit to giver)
 *   buildTryExpireMission    — unchanged; re-exported here + from mission-tx.ts
 *
 * Move module: bazaar_mission::mission_lifecycle
 * Sweep-H: BAZAAR_MISSION_ORIGINAL_PACKAGE_ID is used ONLY for event/type-filter
 * strings in hooks — NOT in TX builders (entry-fn target uses rotating PACKAGE_IDS).
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, MISSION_REGISTRY_ID, v36Enabled } from "../../constants";

const REG = () => MISSION_REGISTRY_ID;

// ── Accept (V34 — collateral + members + EVE pool) ─────────────────────────────

/**
 * Accept a mission run. V34 signature:
 *   accept_mission(registry, mission_id, gov, members, pool, collateral:Coin<EVE>, clock, ctx)
 *
 * The optional `tx` parameter allows callers that need to pre-split a Coin<EVE>
 * (using splitEveCoin) to build the moveCall on the SAME Transaction that holds
 * the coin-split commands. When `tx` is omitted, a fresh Transaction is created.
 *
 * Caller's responsibility:
 *   - When collateral_eve_per_run > 0: call splitEveCoin(walletAddress, amount, tx)
 *     BEFORE calling this builder, then pass the returned coinArg as collateralEveCoin.
 *   - When collateral_eve_per_run == 0: pass tx.moveCall({ target: "0x2::coin::zero",
 *     typeArguments: [EVE_COIN_TYPE], arguments: [] }) as collateralEveCoin.
 *
 * Args order (verified against mission_lifecycle.move):
 *   registry, mission_id, gov, members, pool, collateral, clock
 */
export function buildAcceptMission(
  params: {
    missionId: string;
    ssuGovId: string;
    memberRegistryId: string;        // per-SSU MemberRegistry (from useSSUSharedObjects)
    missionCollateralPoolId: string; // per-SSU EVE collateral pool (from useMissionCollateralPoolId)
    collateralEveCoin: TransactionArgument; // Coin<EVE> == collateral_eve_per_run; zero if 0
    /** V36 only — mission bazaar type. When 1 (Easy) routes to accept_mission_easy. */
    bazaarType?: number;
    /** V36 only — Easy tribe's TribeGovernance id; required when bazaarType === 1. */
    tribeGovId?: string;
  },
  tx?: Transaction,
): Transaction {
  const _tx = tx ?? new Transaction();
  // V36 B2: accept_mission split into _notribe (bt 0) / _easy (bt 1, +tribe_gov at slot 3).
  // No advanced mission accept exists. V35 keeps the unified `accept_mission` entry.
  const isV36 = v36Enabled();
  const easyV36 = isV36 && params.bazaarType === 1;
  if (easyV36 && !params.tribeGovId) {
    throw new Error("accept_mission_easy (V36 Easy) requires tribeGovId");
  }
  const entry = !isV36 ? "accept_mission" : easyV36 ? "accept_mission_easy" : "accept_mission_notribe";
  _tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_LIFECYCLE}::${entry}`,
    arguments: [
      _tx.object(REG()),
      _tx.pure.id(params.missionId),
      _tx.object(params.ssuGovId),
      ...(easyV36 ? [_tx.object(params.tribeGovId!)] : []), // tribe_gov (slot 3, V36 Easy)
      _tx.object(params.memberRegistryId),        // V34: members visibility gate
      _tx.object(params.missionCollateralPoolId), // V34: EVE custody
      params.collateralEveCoin,                   // V34: exact Coin<EVE>; zero when C=0
      _tx.object("0x6"),
    ],
  });
  return _tx;
}

// ── Cancel acceptance (V34 NEW — taker self-cancel, anytime, 50/50 split) ─────

/**
 * Cancel the caller's active acceptance of a mission run.
 * Move handles the 50/50 split: giver gets floor(C/2), taker gets C - floor(C/2).
 * The Move entry transfers both coins directly — no character arg needed.
 *
 * Move: mission_lifecycle::cancel_my_acceptance
 * Args (verified against mission_lifecycle.move):
 *   registry, mission_id, gov, pool, clock
 *   tx sender = taker (asserted in Move)
 */
export function buildCancelMyAcceptance(params: {
  missionId: string;
  ssuGovId: string;
  missionCollateralPoolId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_LIFECYCLE}::cancel_my_acceptance`,
    arguments: [
      tx.object(REG()),
      tx.pure.id(params.missionId),
      tx.object(params.ssuGovId),
      tx.object(params.missionCollateralPoolId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Expire (V34 — now requires pool for 100% forfeit to giver) ─────────────────

/**
 * Expire a lapsed acceptance (permissionless — any caller).
 * V34: pool param added; Move does pool.take_full_for_forfeit → public_transfer(giver).
 *
 * Move: mission_lifecycle::expire_acceptance
 * Args: registry, mission_id, taker, pool, clock
 */
export function buildExpireAcceptance(params: {
  missionId: string;
  taker: string;
  missionCollateralPoolId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_LIFECYCLE}::expire_acceptance`,
    arguments: [
      tx.object(REG()),
      tx.pure.id(params.missionId),
      tx.pure.address(params.taker),
      tx.object(params.missionCollateralPoolId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Try-expire mission listing (unchanged) ──────────────────────────────────────

/**
 * Deactivate an expired mission listing (permissionless).
 * Move: mission_lifecycle::try_expire_mission (no collateral arg — listing-level expiry).
 */
export function buildTryExpireMission(params: { missionId: string }): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_LIFECYCLE}::try_expire_mission`,
    arguments: [tx.object(REG()), tx.pure.id(params.missionId), tx.object("0x6")],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
