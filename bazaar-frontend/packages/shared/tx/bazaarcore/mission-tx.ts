// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore Mission (MIS) TX builders — NoTribe + Easy (real-EVE) and the
 * SHARED lifecycle entries (accept / expire / try-expire) used by ALL bazaar
 * types. Advanced (tribe-token) variants live in
 * tx/bazaareconomy/mission-ledger-tx.ts and reuse the shared lifecycle builders.
 *
 * Move modules:
 *   bazaar_core::mission            — create_mission_notribe / create_mission_easy
 *   bazaar_core::mission_complete   — complete_mission_with_items[_as_ssu_owner] /
 *                                     complete_mission_other / confirm / reject
 *   bazaar_core::mission_lifecycle  — accept / expire_acceptance / try_expire /
 *                                     cancel[_as_ssu_owner] / collect_proof_to_main
 *
 * Storage routing (Slice 2c rule, reused via shop-escrow-helpers):
 *   - SSU owner signs  → Main Storage via OwnerCap<StorageUnit> (asOwner branch).
 *   - regular player   → Player Locker via OwnerCap<Character>.
 * Reward ITEMS are escrowed at creation as vector<vector<Item>> (one bundle per
 * run); the Move deposits proof / reward items to the correct character + tier
 * internally, so completion builders only withdraw the taker's proof items.
 *
 * EVE coins (reward escrow + listing fee) are pre-split exact by the caller via
 * splitEveCoin() — pass coin::zero<EVE> when the amount is 0 (mirrors the WTB
 * prepay / FREE prepay convention). Mission fee math: useMissionListingFee.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { PACKAGE_IDS, SHARED_OBJECTS, MODULES, MISSION_REGISTRY_ID, WORLD_PACKAGE_ID } from "../../constants";
import {
  type CharOwnerCapRef,
  borrowSSUOwnerCap,
  returnSSUOwnerCap,
  charBorrowOwnerCap,
  charReturnOwnerCap,
  ssuWithdrawByOwner,
  ssuWithdrawByOwnerSU,
} from "./shop-escrow-helpers";
import type { SSUOwnerCapRef } from "./ssu-receiving-tx";

const REG = () => MISSION_REGISTRY_ID;
const ITEM_TYPE = () => `${WORLD_PACKAGE_ID}::inventory::Item`;

/** Per-completion item-reward / proof requirement (a spec, not a withdrawn item). */
export interface MissionItemReqInput {
  typeId: number;
  amount: number;
}

/** A concrete item the taker submits as proof (withdrawn from their storage). */
export interface MissionProofItem {
  typeId: number;
  quantity: number;
}

// ── Reward-bundle escrow (create-time) ────────────────────────────────────────

/**
 * Withdraw the creator's reward items and assemble `vector<vector<Item>>` — one
 * bundle per run, each satisfying the reward spec. Borrows the creator's cap once
 * (Main Storage when asOwner, else Player Locker), withdraws maxRuns × rewardReqs
 * items, groups them by run, and returns the nested move-vec PTB argument.
 *
 * When there are no item rewards, returns an empty `vector<vector<Item>>` — the
 * Move asserts an empty bundle vector in that case (E_BUNDLE_COUNT_MISMATCH).
 */
export function buildRewardBundles(
  tx: Transaction,
  params: {
    ssuId: string;
    characterId: string;
    rewardReqs: MissionItemReqInput[];
    maxRuns: number;
    asOwner: boolean;
    charCapRef?: CharOwnerCapRef;
    ssuOwnerCapRef?: SSUOwnerCapRef;
  },
): TransactionArgument {
  const innerType = `vector<${ITEM_TYPE()}>`;
  if (params.rewardReqs.length === 0) {
    return tx.makeMoveVec({ type: innerType, elements: [] });
  }
  const bundles: TransactionArgument[] = [];
  if (params.asOwner) {
    if (!params.ssuOwnerCapRef) {
      throw new Error("[buildRewardBundles] asOwner=true requires ssuOwnerCapRef (resolveSSUOwnerCap).");
    }
    const { ownerCap, receipt } = borrowSSUOwnerCap(
      tx, params.characterId,
      params.ssuOwnerCapRef.ssuCapId,
      params.ssuOwnerCapRef.ssuCapVersion,
      params.ssuOwnerCapRef.ssuCapDigest,
    );
    for (let run = 0; run < params.maxRuns; run++) {
      const items = params.rewardReqs.map((req) =>
        ssuWithdrawByOwnerSU(tx, params.ssuId, params.characterId, ownerCap, req.typeId, req.amount),
      );
      bundles.push(tx.makeMoveVec({ type: ITEM_TYPE(), elements: items }));
    }
    returnSSUOwnerCap(tx, params.characterId, ownerCap, receipt);
  } else {
    if (!params.charCapRef) {
      throw new Error("[buildRewardBundles] asOwner=false requires charCapRef (useCharacterOwnerCapRef).");
    }
    const { ownerCap, receipt } = charBorrowOwnerCap(tx, params.characterId, params.charCapRef);
    for (let run = 0; run < params.maxRuns; run++) {
      const items = params.rewardReqs.map((req) =>
        ssuWithdrawByOwner(tx, params.ssuId, params.characterId, ownerCap, req.typeId, req.amount),
      );
      bundles.push(tx.makeMoveVec({ type: ITEM_TYPE(), elements: items }));
    }
    charReturnOwnerCap(tx, params.characterId, ownerCap, receipt);
  }
  return tx.makeMoveVec({ type: innerType, elements: bundles });
}

// ── Create (NoTribe / Easy) ───────────────────────────────────────────────────

/** Shared create params (NoTribe + Easy). EVE coins pre-split exact by the caller. */
export interface CreateMissionParams {
  ssuGovId: string;
  ssuId: string;
  characterId: string;
  missionType: number;          // 0..3 (MISSION_TYPE)
  title: string;
  description: string;
  completionMode: number;       // 0 item-proof, 1 other
  proofItems: MissionItemReqInput[];
  rewardItems: MissionItemReqInput[];
  maxRuns: number;
  rewardEvePerRun: number;      // MIST; 0 when no EVE reward
  takerTimeLimitMs: number;
  durationMs: number;
  positionX: number;
  positionY: number;
  collateralEvePerRun: number;  // NEW V34 — MIST; 0 when no collateral
  visibilityRoles: number;       // NEW V34 — bitmask; VISIBILITY.EVERYONE (16) for public
  /** When the creator IS the SSU owner, escrow reward items from Main Storage. */
  asOwner?: boolean;
  charCapRef?: CharOwnerCapRef;
  ssuOwnerCapRef?: SSUOwnerCapRef;
  /** Coin<EVE> == rewardEvePerRun × maxRuns (exact). Pass coin::zero<EVE> if 0. */
  rewardEveCoin: TransactionArgument;
  /** Coin<EVE> == total listing fee (exact). Pass coin::zero<EVE> if 0. */
  listingFeeCoin: TransactionArgument;
}

function createMissionArgsTail(tx: Transaction, p: CreateMissionParams, bundlesVec: TransactionArgument) {
  return [
    tx.pure.u8(p.missionType),
    tx.pure.vector("u8", Array.from(new TextEncoder().encode(p.title))),
    tx.pure.vector("u8", Array.from(new TextEncoder().encode(p.description))),
    tx.pure.u8(p.completionMode),
    tx.pure.vector("u64", p.proofItems.map((i) => BigInt(i.typeId))),
    tx.pure.vector("u64", p.proofItems.map((i) => BigInt(i.amount))),
    tx.pure.vector("u64", p.rewardItems.map((i) => BigInt(i.typeId))),
    tx.pure.vector("u64", p.rewardItems.map((i) => BigInt(i.amount))),
    tx.pure.u64(BigInt(p.maxRuns)),
    tx.pure.u64(BigInt(p.rewardEvePerRun)),
    p.rewardEveCoin,                                  // reward_eve: Coin<EVE>
    bundlesVec,                                       // reward_bundles: vector<vector<Item>>
    tx.pure.u64(BigInt(p.takerTimeLimitMs)),
    tx.pure.u64(BigInt(p.durationMs)),
    tx.pure.u64(BigInt(p.positionX)),
    tx.pure.u64(BigInt(p.positionY)),
    tx.pure.u64(BigInt(p.collateralEvePerRun)),  // NEW V34 (after position_y, before listing_fee per MA §3.1)
    tx.pure.u8(p.visibilityRoles),               // NEW V34
    p.listingFeeCoin,                                // listing_fee: Coin<EVE>
    tx.object("0x6"),
  ];
}

/** Create a NoTribe mission. Move: mission::create_mission_notribe. Fee = SSU + Dapp. */
export function buildCreateMissionNoTribe(params: CreateMissionParams, tx: Transaction): Transaction {
  const bundlesVec = buildRewardBundles(tx, {
    ssuId: params.ssuId, characterId: params.characterId, rewardReqs: params.rewardItems,
    maxRuns: params.maxRuns, asOwner: !!params.asOwner,
    charCapRef: params.charCapRef, ssuOwnerCapRef: params.ssuOwnerCapRef,
  });
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION}::create_mission_notribe`,
    arguments: [
      tx.object(REG()),                              // registry: &mut MissionRegistry
      tx.object(params.ssuGovId),                    // gov: &mut SSUGovernance
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),   // dapp_config: &GovernanceConfig
      tx.object(SHARED_OBJECTS.BAZAAR_CORE_ADMIN),   // admin: &BazaarCoreAdmin
      tx.object(SHARED_OBJECTS.TAX_WALLET),          // dapp_wallet: &mut DAppTaxWallet
      ...createMissionArgsTail(tx, params, bundlesVec),
    ],
  });
  return tx;
}

/** Create an Easy mission. Move: mission::create_mission_easy. Fee = SSU + Tribe + Dapp. */
export function buildCreateMissionEasy(
  params: CreateMissionParams & { tribeGovId: string },
  tx: Transaction,
): Transaction {
  const bundlesVec = buildRewardBundles(tx, {
    ssuId: params.ssuId, characterId: params.characterId, rewardReqs: params.rewardItems,
    maxRuns: params.maxRuns, asOwner: !!params.asOwner,
    charCapRef: params.charCapRef, ssuOwnerCapRef: params.ssuOwnerCapRef,
  });
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION}::create_mission_easy`,
    arguments: [
      tx.object(REG()),                              // registry: &mut MissionRegistry
      tx.object(params.ssuGovId),                    // gov: &mut SSUGovernance
      tx.object(params.tribeGovId),                  // tribe_gov: &mut TribeGovernance
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),   // dapp_config: &GovernanceConfig
      tx.object(SHARED_OBJECTS.BAZAAR_CORE_ADMIN),   // admin: &BazaarCoreAdmin
      tx.object(SHARED_OBJECTS.TAX_WALLET),          // dapp_wallet: &mut DAppTaxWallet
      ...createMissionArgsTail(tx, params, bundlesVec),
    ],
  });
  return tx;
}

// ── Accept / expire / try-expire / cancel (shared across ALL bazaar types) ───
// V34: accept/expire/try-expire/cancelMyAcceptance moved to mission-lifecycle-tx.ts.
// Re-exported here for backward-compatibility with callers using this path.
export {
  buildAcceptMission,
  buildExpireAcceptance,
  buildTryExpireMission,
  buildCancelMyAcceptance,
} from "./mission-lifecycle-tx";

// ── Complete (item-proof, mode 0) — NoTribe / Easy ────────────────────────────

/**
 * Item-proof completion (taker signs). The taker withdraws the proof items from
 * their own storage and the Move routes proof → giver and reward → taker.
 *   asTakerSsuOwner === true  → taker IS the SSU owner: proof from Main Storage +
 *     reward to Main (complete_mission_with_items_as_ssu_owner, OwnerCap held
 *     across the call so the Move can deposit the reward to Main).
 *   else → proof from the taker's Player Locker; reward to their Player Locker.
 */
export function buildCompleteMissionWithItems(params: {
  missionId: string;
  ssuGovId: string;
  ssuId: string;
  /** Mission owner's Character shared-object ID (giver). */
  giverCharacterId: string;
  /** Taker's (signer's) Character shared-object ID. */
  takerCharacterId: string;
  proofItems: MissionProofItem[];
  asTakerSsuOwner?: boolean;
  charCapRef?: CharOwnerCapRef;
  ssuOwnerCapRef?: SSUOwnerCapRef;
  missionCollateralPoolId: string;  // NEW V34 — EVE custody pool
}): Transaction {
  const tx = new Transaction();
  if (params.asTakerSsuOwner) {
    if (!params.ssuOwnerCapRef) {
      throw new Error("[buildCompleteMissionWithItems] asTakerSsuOwner=true requires ssuOwnerCapRef.");
    }
    const { ownerCap, receipt } = borrowSSUOwnerCap(
      tx, params.takerCharacterId,
      params.ssuOwnerCapRef.ssuCapId,
      params.ssuOwnerCapRef.ssuCapVersion,
      params.ssuOwnerCapRef.ssuCapDigest,
    );
    const items = params.proofItems.map((it) =>
      ssuWithdrawByOwnerSU(tx, params.ssuId, params.takerCharacterId, ownerCap, it.typeId, it.quantity),
    );
    const itemsVec = tx.makeMoveVec({ type: ITEM_TYPE(), elements: items });
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_COMPLETE}::complete_mission_with_items_as_ssu_owner`,
      arguments: [
        tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
        tx.object(params.ssuId), itemsVec,
        tx.object(params.giverCharacterId), tx.object(params.takerCharacterId),
        ownerCap,                                    // taker_owner_cap: &OwnerCap<StorageUnit>
        tx.object(params.missionCollateralPoolId),   // NEW V34: after ownerCap, before clock
        tx.object("0x6"),
      ],
    });
    returnSSUOwnerCap(tx, params.takerCharacterId, ownerCap, receipt);
  } else {
    if (!params.charCapRef) {
      throw new Error("[buildCompleteMissionWithItems] non-owner taker requires charCapRef.");
    }
    const { ownerCap, receipt } = charBorrowOwnerCap(tx, params.takerCharacterId, params.charCapRef);
    const items = params.proofItems.map((it) =>
      ssuWithdrawByOwner(tx, params.ssuId, params.takerCharacterId, ownerCap, it.typeId, it.quantity),
    );
    charReturnOwnerCap(tx, params.takerCharacterId, ownerCap, receipt);
    const itemsVec = tx.makeMoveVec({ type: ITEM_TYPE(), elements: items });
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_COMPLETE}::complete_mission_with_items`,
      arguments: [
        tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
        tx.object(params.ssuId), itemsVec,
        tx.object(params.giverCharacterId), tx.object(params.takerCharacterId),
        tx.object(params.missionCollateralPoolId),  // NEW V34: before clock
        tx.object("0x6"),
      ],
    });
  }
  return tx;
}

// ── Other-mode submit / confirm / reject — NoTribe / Easy ─────────────────────

/** Submit an "other" (manual-confirm) mission for the giver's review (taker signs). */
export function buildCompleteMissionOther(params: { missionId: string; ssuGovId: string }): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_COMPLETE}::complete_mission_other`,
    arguments: [tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId), tx.object("0x6")],
  });
  return tx;
}

/** Giver confirms a pending "other" completion (reward → taker Player Locker + EVE). */
export function buildConfirmCompletion(params: {
  missionId: string;
  ssuGovId: string;
  taker: string;
  ssuId: string;
  takerCharacterId: string;
  missionCollateralPoolId: string;  // NEW V34 — 100% refund to taker on confirm
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_COMPLETE}::confirm_completion`,
    arguments: [
      tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
      tx.pure.address(params.taker), tx.object(params.ssuId), tx.object(params.takerCharacterId),
      tx.object(params.missionCollateralPoolId),  // NEW V34: after takerCharacterId, before clock
      tx.object("0x6"),
    ],
  });
  return tx;
}

/** Giver rejects a pending "other" completion (frees the run; reward stays escrowed). */
export function buildRejectCompletion(params: {
  missionId: string;
  ssuGovId: string;
  taker: string;
  missionCollateralPoolId: string;  // NEW V34 — 100% refund to taker on reject (giver declined)
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_COMPLETE}::reject_completion`,
    arguments: [
      tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
      tx.pure.address(params.taker),
      tx.object(params.missionCollateralPoolId),  // NEW V34: after taker, before clock
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Collect proof → Main / Cancel — NoTribe / Easy ────────────────────────────

/**
 * SSU-owner giver collects escrowed proof items into Main Storage.
 * Move: mission_lifecycle::collect_proof_to_main (borrows OwnerCap<StorageUnit>).
 */
export function buildCollectProofToMain(params: {
  missionId: string;
  ssuGovId: string;
  ssuId: string;
  giverCharacterId: string;
  ssuOwnerCapRef: SSUOwnerCapRef;
}): Transaction {
  const tx = new Transaction();
  const { ownerCap, receipt } = borrowSSUOwnerCap(
    tx, params.giverCharacterId,
    params.ssuOwnerCapRef.ssuCapId,
    params.ssuOwnerCapRef.ssuCapVersion,
    params.ssuOwnerCapRef.ssuCapDigest,
  );
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_LIFECYCLE}::collect_proof_to_main`,
    arguments: [
      tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
      tx.object(params.ssuId), tx.object(params.giverCharacterId), ownerCap, tx.object("0x6"),
    ],
  });
  returnSSUOwnerCap(tx, params.giverCharacterId, ownerCap, receipt);
  return tx;
}

/**
 * Cancel a mission (owner only) — refunds remaining reward EVE + unpaid item
 * bundles. Owner-as-SSU-owner routes the bundle refund to Main Storage.
 * Move: mission_lifecycle::cancel_mission[_as_ssu_owner].
 */
export function buildCancelMission(params: {
  missionId: string;
  ssuGovId: string;
  ssuId: string;
  ownerCharacterId: string;
  asSsuOwner?: boolean;
  ssuOwnerCapRef?: SSUOwnerCapRef;
}): Transaction {
  const tx = new Transaction();
  if (params.asSsuOwner) {
    if (!params.ssuOwnerCapRef) {
      throw new Error("[buildCancelMission] asSsuOwner=true requires ssuOwnerCapRef.");
    }
    const { ownerCap, receipt } = borrowSSUOwnerCap(
      tx, params.ownerCharacterId,
      params.ssuOwnerCapRef.ssuCapId,
      params.ssuOwnerCapRef.ssuCapVersion,
      params.ssuOwnerCapRef.ssuCapDigest,
    );
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_LIFECYCLE}::cancel_mission_as_ssu_owner`,
      arguments: [
        tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
        tx.object(params.ssuId), tx.object(params.ownerCharacterId), ownerCap, tx.object("0x6"),
      ],
    });
    returnSSUOwnerCap(tx, params.ownerCharacterId, ownerCap, receipt);
  } else {
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.MISSION_LIFECYCLE}::cancel_mission`,
      arguments: [
        tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
        tx.object(params.ssuId), tx.object(params.ownerCharacterId), tx.object("0x6"),
      ],
    });
  }
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
