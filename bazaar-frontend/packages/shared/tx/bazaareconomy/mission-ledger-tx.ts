// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy Mission (MIS) TX builders — Advanced (tribe-token) twin.
 *
 * Move module: bazaar_economy::mission_ledger_ops. Each builder calls the
 * cap-gated bazaar_core advance fn (via the economy module) and the ledger
 * debit/credit happens atomically in the same Move call. NO Coin<EVE> — the
 * reward + listing fee are tribe-token amounts (u64) settled on the ledger.
 * Reward ITEMS still flow through the bazaar_core item paths, so creation still
 * escrows vector<vector<Item>> exactly like NoTribe/Easy (reuses buildRewardBundles).
 *
 * Accept / expire / try-expire are bazaar_type-agnostic — Advanced reuses the
 * shared builders in tx/bazaarcore/mission-tx.ts (buildAcceptMission, etc.).
 *
 * No dApp layer (Advanced). ECONOMY_CAP_STORE is the singleton EconomyCapStore.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, SHARED_OBJECTS, MODULES, MISSION_REGISTRY_ID, WORLD_PACKAGE_ID } from "../../constants";
import {
  type CharOwnerCapRef,
  borrowSSUOwnerCap,
  returnSSUOwnerCap,
  charBorrowOwnerCap,
  charReturnOwnerCap,
  ssuWithdrawByOwner,
  ssuWithdrawByOwnerSU,
} from "../bazaarcore/shop-escrow-helpers";
import type { SSUOwnerCapRef } from "../bazaarcore/ssu-receiving-tx";
import {
  buildRewardBundles,
  type MissionItemReqInput,
  type MissionProofItem,
} from "../bazaarcore/mission-tx";

const REG = () => MISSION_REGISTRY_ID;
const ITEM_TYPE = () => `${WORLD_PACKAGE_ID}::inventory::Item`;
const CAP_STORE = () => SHARED_OBJECTS.ECONOMY_CAP_STORE;

// ── Create (Advanced) ─────────────────────────────────────────────────────────

export interface CreateMissionAdvancedParams {
  ssuGovId: string;
  tribeGovId: string;
  ledgerId: string;
  /** MemberRegistry — required by create_mission_advanced for the static
   *  membership-ban check (AUD-ADV-12). Omitting it shifts the arg vector and
   *  the Move call aborts with ArityMismatch. */
  memberRegistryId: string;
  ssuId: string;
  characterId: string;
  missionType: number;
  title: string;
  description: string;
  completionMode: number;
  proofItems: MissionItemReqInput[];
  rewardItems: MissionItemReqInput[];
  maxRuns: number;
  rewardTokenPerRun: number;     // scaled tribe-token units; 0 when no token reward
  collateralTokenPerRun: number;  // NEW V34 — scaled token units; 0 when no collateral
  visibilityRoles: number;         // NEW V34 — bitmask
  takerTimeLimitMs: number;
  durationMs: number;
  positionX: number;
  positionY: number;
  /** Listing fee in tribe-token units == (ssu_fph + tribe_fph) × hours (exact). */
  listingFeeTokens: number;
  /** When the creator IS the SSU owner, escrow reward items from Main Storage. */
  asOwner?: boolean;
  charCapRef?: CharOwnerCapRef;
  ssuOwnerCapRef?: SSUOwnerCapRef;
}

/** Create an Advanced mission. Move: mission_ledger_ops::create_mission_advanced. */
export function buildCreateMissionAdvanced(params: CreateMissionAdvancedParams, tx: Transaction): Transaction {
  const bundlesVec = buildRewardBundles(tx, {
    ssuId: params.ssuId, characterId: params.characterId, rewardReqs: params.rewardItems,
    maxRuns: params.maxRuns, asOwner: !!params.asOwner,
    charCapRef: params.charCapRef, ssuOwnerCapRef: params.ssuOwnerCapRef,
  });
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MISSION_LEDGER_OPS}::create_mission_advanced`,
    arguments: [
      tx.object(REG()),                              // registry: &mut MissionRegistry
      tx.object(params.ssuGovId),                    // ssu_gov: &SSUGovernance
      tx.object(params.tribeGovId),                  // tribe_gov: &mut TribeGovernance
      tx.object(params.ledgerId),                    // ledger: &mut TribeTokenLedger
      tx.object(CAP_STORE()),                        // cap_store: &EconomyCapStore
      tx.object(params.memberRegistryId),            // members: &MemberRegistry (AUD-ADV-12 ban check)
      tx.pure.u8(params.missionType),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.title))),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.description))),
      tx.pure.u8(params.completionMode),
      tx.pure.vector("u64", params.proofItems.map((i) => BigInt(i.typeId))),
      tx.pure.vector("u64", params.proofItems.map((i) => BigInt(i.amount))),
      tx.pure.vector("u64", params.rewardItems.map((i) => BigInt(i.typeId))),
      tx.pure.vector("u64", params.rewardItems.map((i) => BigInt(i.amount))),
      tx.pure.u64(BigInt(params.maxRuns)),
      tx.pure.u64(BigInt(params.rewardTokenPerRun)),
      tx.pure.u64(BigInt(params.collateralTokenPerRun)),  // NEW V34 (after reward_token_per_run per MA §3.1)
      tx.pure.u8(params.visibilityRoles),                  // NEW V34
      bundlesVec,                                    // reward_bundles: vector<vector<Item>>
      tx.pure.u64(BigInt(params.takerTimeLimitMs)),
      tx.pure.u64(BigInt(params.durationMs)),
      tx.pure.u64(BigInt(params.positionX)),
      tx.pure.u64(BigInt(params.positionY)),
      tx.pure.u64(BigInt(params.listingFeeTokens)), // listing_fee_tokens: u64
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Complete (item-proof, Advanced) ───────────────────────────────────────────

/**
 * Item-proof completion (Advanced; taker signs). Token reward settles atomically.
 *   asTakerSsuOwner === true → proof from Main + reward routing to Main
 *     (complete_mission_with_items_advanced_as_ssu_owner; OwnerCap held across call).
 *   else → proof from the taker's Player Locker.
 */
export function buildCompleteMissionWithItemsAdvanced(params: {
  missionId: string;
  ssuGovId: string;
  tribeGovId: string;
  ledgerId: string;
  ssuId: string;
  giverCharacterId: string;
  takerCharacterId: string;
  proofItems: MissionProofItem[];
  asTakerSsuOwner?: boolean;
  charCapRef?: CharOwnerCapRef;
  ssuOwnerCapRef?: SSUOwnerCapRef;
  missionCollateralTokenPoolId: string;  // NEW V34 — token pool for collateral settlement
}): Transaction {
  const tx = new Transaction();
  if (params.asTakerSsuOwner) {
    if (!params.ssuOwnerCapRef) {
      throw new Error("[buildCompleteMissionWithItemsAdvanced] asTakerSsuOwner=true requires ssuOwnerCapRef.");
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
      target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MISSION_LEDGER_OPS}::complete_mission_with_items_advanced_as_ssu_owner`,
      arguments: [
        tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
        tx.object(params.tribeGovId), tx.object(params.ledgerId), tx.object(CAP_STORE()),
        tx.object(params.ssuId), itemsVec,
        tx.object(params.giverCharacterId), tx.object(params.takerCharacterId),
        ownerCap,
        tx.object(params.missionCollateralTokenPoolId),  // NEW V34: after ownerCap
        tx.object("0x6"),
      ],
    });
    returnSSUOwnerCap(tx, params.takerCharacterId, ownerCap, receipt);
  } else {
    if (!params.charCapRef) {
      throw new Error("[buildCompleteMissionWithItemsAdvanced] non-owner taker requires charCapRef.");
    }
    const { ownerCap, receipt } = charBorrowOwnerCap(tx, params.takerCharacterId, params.charCapRef);
    const items = params.proofItems.map((it) =>
      ssuWithdrawByOwner(tx, params.ssuId, params.takerCharacterId, ownerCap, it.typeId, it.quantity),
    );
    charReturnOwnerCap(tx, params.takerCharacterId, ownerCap, receipt);
    const itemsVec = tx.makeMoveVec({ type: ITEM_TYPE(), elements: items });
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MISSION_LEDGER_OPS}::complete_mission_with_items_advanced`,
      arguments: [
        tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
        tx.object(params.tribeGovId), tx.object(params.ledgerId), tx.object(CAP_STORE()),
        tx.object(params.ssuId), itemsVec, tx.object(params.giverCharacterId),
        tx.object(params.missionCollateralTokenPoolId),  // NEW V34: after giverCharacterId
        tx.object("0x6"),
      ],
    });
  }
  return tx;
}

// ── Other-mode submit / confirm / reject (Advanced) ───────────────────────────

/** Submit an "other" Advanced mission for the giver's review (taker signs). */
export function buildCompleteMissionOtherAdvanced(params: {
  missionId: string;
  ssuGovId: string;
  tribeGovId: string;
  ledgerId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MISSION_LEDGER_OPS}::complete_mission_other_advanced`,
    arguments: [
      tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
      tx.object(params.tribeGovId), tx.object(params.ledgerId), tx.object(CAP_STORE()),
      tx.object("0x6"),
    ],
  });
  return tx;
}

/** Giver confirms a pending "other" Advanced completion (token reward settles atomically). */
export function buildConfirmCompletionAdvanced(params: {
  missionId: string;
  ssuGovId: string;
  tribeGovId: string;
  ledgerId: string;
  taker: string;
  ssuId: string;
  takerCharacterId: string;
  missionCollateralTokenPoolId: string;  // NEW V34 — 100% refund to taker on confirm
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MISSION_LEDGER_OPS}::confirm_completion_advanced`,
    arguments: [
      tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
      tx.object(params.tribeGovId), tx.object(params.ledgerId), tx.object(CAP_STORE()),
      tx.pure.address(params.taker), tx.object(params.ssuId), tx.object(params.takerCharacterId),
      tx.object(params.missionCollateralTokenPoolId),  // NEW V34: after takerCharacterId
      tx.object("0x6"),
    ],
  });
  return tx;
}

/** Giver rejects a pending "other" Advanced completion (frees the run). */
export function buildRejectCompletionAdvanced(params: {
  missionId: string;
  ssuGovId: string;
  tribeGovId: string;
  ledgerId: string;
  taker: string;
  missionCollateralTokenPoolId: string;  // NEW V34 — 100% refund to taker on reject
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MISSION_LEDGER_OPS}::reject_completion_advanced`,
    arguments: [
      tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
      tx.object(params.tribeGovId), tx.object(params.ledgerId), tx.object(CAP_STORE()),
      tx.pure.address(params.taker),
      tx.object(params.missionCollateralTokenPoolId),  // NEW V34: after taker
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Cancel (Advanced) ─────────────────────────────────────────────────────────

/**
 * Cancel an Advanced mission (owner only) — refunds remaining token escrow +
 * unpaid item bundles. Owner-as-SSU-owner routes the bundle refund to Main Storage.
 * Move: mission_ledger_ops::cancel_mission_advanced[_as_ssu_owner].
 */
export function buildCancelMissionAdvanced(params: {
  missionId: string;
  ssuGovId: string;
  tribeGovId: string;
  ledgerId: string;
  ssuId: string;
  ownerCharacterId: string;
  asSsuOwner?: boolean;
  ssuOwnerCapRef?: SSUOwnerCapRef;
}): Transaction {
  const tx = new Transaction();
  if (params.asSsuOwner) {
    if (!params.ssuOwnerCapRef) {
      throw new Error("[buildCancelMissionAdvanced] asSsuOwner=true requires ssuOwnerCapRef.");
    }
    const { ownerCap, receipt } = borrowSSUOwnerCap(
      tx, params.ownerCharacterId,
      params.ssuOwnerCapRef.ssuCapId,
      params.ssuOwnerCapRef.ssuCapVersion,
      params.ssuOwnerCapRef.ssuCapDigest,
    );
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MISSION_LEDGER_OPS}::cancel_mission_advanced_as_ssu_owner`,
      arguments: [
        tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
        tx.object(params.tribeGovId), tx.object(params.ledgerId), tx.object(CAP_STORE()),
        tx.object(params.ssuId), tx.object(params.ownerCharacterId), ownerCap, tx.object("0x6"),
      ],
    });
    returnSSUOwnerCap(tx, params.ownerCharacterId, ownerCap, receipt);
  } else {
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MISSION_LEDGER_OPS}::cancel_mission_advanced`,
      arguments: [
        tx.object(REG()), tx.pure.id(params.missionId), tx.object(params.ssuGovId),
        tx.object(params.tribeGovId), tx.object(params.ledgerId), tx.object(CAP_STORE()),
        tx.object(params.ssuId), tx.object(params.ownerCharacterId), tx.object("0x6"),
      ],
    });
  }
  return tx;
}

// ── Accept (Advanced, V34) ────────────────────────────────────────────────────

/**
 * Accept an Advanced mission run. Debits taker's tribe-token ledger by
 * collateral_token_per_run and credits the token collateral pool atomically.
 *
 * Move: mission_ledger_ops::accept_mission_advanced
 * Args (verified against BazaarEconomy/sources/mission_ledger_ops.move:262-272):
 *   registry, mission_id, ssu_gov, tribe_gov, members, ledger, coll_pool, cap_store, clock
 */
export function buildAcceptMissionAdvanced(params: {
  missionId: string;
  ssuGovId: string;
  tribeGovId: string;
  ledgerId: string;
  memberRegistryId: string;
  missionCollateralTokenPoolId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MISSION_LEDGER_OPS}::accept_mission_advanced`,
    arguments: [
      tx.object(REG()),
      tx.pure.id(params.missionId),
      tx.object(params.ssuGovId),
      tx.object(params.tribeGovId),
      tx.object(params.memberRegistryId),
      tx.object(params.ledgerId),
      tx.object(params.missionCollateralTokenPoolId),
      tx.object(CAP_STORE()),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Cancel acceptance (Advanced, V34 NEW) ──────────────────────────────────────

/**
 * Cancel an Advanced mission acceptance (taker self-cancel, anytime).
 * 50/50 split credited to giver + taker rows in the ledger.
 *
 * Move: mission_ledger_ops::cancel_my_acceptance_advanced
 * Args (verified against mission_ledger_ops.move:293-299):
 *   registry, mission_id, ssu_gov, tribe_gov, ledger, coll_pool, cap_store, clock
 */
export function buildCancelMyAcceptanceAdvanced(params: {
  missionId: string;
  ssuGovId: string;
  tribeGovId: string;
  ledgerId: string;
  missionCollateralTokenPoolId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.MISSION_LEDGER_OPS}::cancel_my_acceptance_advanced`,
    arguments: [
      tx.object(REG()),
      tx.pure.id(params.missionId),
      tx.object(params.ssuGovId),
      tx.object(params.tribeGovId),
      tx.object(params.ledgerId),
      tx.object(params.missionCollateralTokenPoolId),
      tx.object(CAP_STORE()),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
