/**
 * @bazaar/shared/utils — BCS decoding, formatters, and helper functions.
 *
 * Pure utility functions with no React dependencies. Includes number/address
 * formatters and unit converters used across all 4 apps.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

/** Truncate a Sui address for display: 0x1234...abcd */
export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 4) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/** Alias used in FrontendAPI.md spec. */
export const formatAddress = truncateAddress;

/** Format a MIST amount to SUI with specified decimals. */
export function formatSui(mist: bigint | string | number, decimals = 4): string {
  const value = typeof mist === "bigint" ? mist : BigInt(String(mist));
  const sui = Number(value) / 1_000_000_000;
  return sui.toFixed(decimals);
}

/** Convert basis points to a human-readable percentage string.
 *  e.g. bpsToPercent(200) => "2.00%" */
export function bpsToPercent(bps: number, places = 2): string {
  return (bps / 100).toFixed(places) + "%";
}

/** Format a raw on-chain u64 timestamp (milliseconds) to a locale date string. */
export function formatTimestamp(ms: number | bigint): string {
  const n = typeof ms === "bigint" ? Number(ms) : ms;
  return new Date(n).toLocaleString();
}

// DEV-only debug logger (no-op in production; see debug.ts)
export { debug } from "./debug";

/**
 * Translate a Move abort error into a human-readable message where the
 * abort code and module are known to have a safe UX meaning.
 */
export function translateMoveAbort(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  // E_SHOP_NOT_ACTIVE = 5 (bazar_close.move:33, bazar.move) / legacy = 2 (shop_moderation.move:25)
  const shopInactivePattern =
    /MoveAbort\b.*\babort code:\s*(?:2(?!\d)|5(?!\d)).*\b(?:shop_moderation|bazar|bazar_close|shop_ops_wts|shop_ops_wtb|shop_ops_de|ledger_shop_ops)\b/i;
  if (shopInactivePattern.test(msg)) {
    return "This shop is already closed.";
  }

  // E_NOT_SHOP_OWNER = 3 (bazar.move, bazar_close.move:31)
  const notOwnerPattern =
    /MoveAbort\b.*\babort code:\s*3(?!\d).*\b(?:bazar|bazar_close)\b/i;
  if (notOwnerPattern.test(msg)) {
    return "Only the shop owner can close this shop.";
  }

  // E_RECIPIENT_NOT_SHOP_OWNER = 16 (bazar_close.move:35, shop_moderation.move:36)
  const wrongRecipientPattern =
    /MoveAbort\b.*\babort code:\s*16(?!\d).*\b(?:bazar_close|shop_moderation|shop_moderation_tribe|shop_ops_wtb)\b/i;
  if (wrongRecipientPattern.test(msg)) {
    return "Refund recipient must match the shop owner's character.";
  }

  // E_WRONG_OWNER_CAP_FOR_SSU = 18 (bazar_close.move:40)
  const wrongCapPattern =
    /MoveAbort\b.*\babort code:\s*18(?!\d).*\b(?:bazar_close|bazar)\b/i;
  if (wrongCapPattern.test(msg)) {
    return "OwnerCap doesn't match this shop's SSU.";
  }

  // E_CHARACTER_NOT_SENDER = 19 (bazar_close.move:43)
  const charNotSenderPattern =
    /MoveAbort\b.*\babort code:\s*19(?!\d).*\bbazar_close\b/i;
  if (charNotSenderPattern.test(msg)) {
    return "The character you provided is not owned by your wallet.";
  }

  // E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP = 20 (bazar_close.move:47, shop_moderation.move:32, shop_moderation_tribe.move:36)
  const ssuOwnerShopPattern =
    /MoveAbort\b.*\babort code:\s*20(?!\d).*\b(?:bazar_close|shop_moderation|shop_moderation_tribe)\b/i;
  if (ssuOwnerShopPattern.test(msg)) {
    return "This shop belongs to the SSU owner — only they can close it via the owner path.";
  }

  // E_TOO_MANY_LISTINGS = 21 (bazar.move:55) — CC-309: max count omitted to avoid drift
  const tooManyPattern =
    /MoveAbort\b.*\babort code:\s*21(?!\d).*\bbazar\b/i;
  if (tooManyPattern.test(msg)) {
    return "Shop has too many active listings. Remove some before closing.";
  }

  // E_PARTIAL_LOT = 11 (bazar_listings.move) — bundle DE: units not a whole number of
  // bundles. Module-scoped so it never collides with bazar.move's 11 (E_WRONG_SSU).
  // The FE always sends whole-bundle units, so this is a defensive fallback.
  const partialLotPattern =
    /MoveAbort\b.*\babort code:\s*11(?!\d).*\bbazar_listings\b/i;
  if (partialLotPattern.test(msg)) {
    return "This exchange sells in whole bundles — pick a whole number of bundles.";
  }

  // E_INVALID_LOT = 12 (bazar_listings.move) — bundle DE: stock isn't a whole number of
  // bundles at creation (module-scoped; distinct from bazar.move's 12).
  const invalidLotPattern =
    /MoveAbort\b.*\babort code:\s*12(?!\d).*\bbazar_listings\b/i;
  if (invalidLotPattern.test(msg)) {
    return "Bundle stock must be a whole number of bundles (deposit amount ÷ bundle size).";
  }

  // ── V41 SSU depreciation / dead-bazaar prune (Documentation/plans/implementation/
  // ssu-depreciation-prune-plan.md) — every code below is module-scoped; none of
  // these module names collide with bazar/bazar_close/shop_moderation/bazar_listings.

  // E_NOT_REVEALED = 1 (ssu_depreciation.move)
  const notRevealedPattern =
    /MoveAbort\b.*\babort code:\s*1(?!\d).*\bssu_depreciation\b/i;
  if (notRevealedPattern.test(msg)) {
    return "This SSU has never been recorded as revealed in-world — try \"Mark revealed\" first (or it may still be anchored).";
  }

  // E_STILL_ANCHORED = 2 (ssu_depreciation.move)
  const stillAnchoredPattern =
    /MoveAbort\b.*\babort code:\s*2(?!\d).*\bssu_depreciation\b/i;
  if (stillAnchoredPattern.test(msg)) {
    return "This SSU still has a live in-game location — it cannot be marked depreciated while it's still anchored.";
  }

  // E_WRONG_REGISTRY = 3 (ssu_depreciation.move) — hard-pinned constant mismatch;
  // a configuration issue, not a user error.
  const wrongRegistryPattern =
    /MoveAbort\b.*\babort code:\s*3(?!\d).*\bssu_depreciation\b/i;
  if (wrongRegistryPattern.test(msg)) {
    return "Wrong world LocationRegistry object provided — this is a configuration issue, please report it.";
  }

  // E_SSU_DEPRECIATED = 2 (ssu_guarded_ops.move) — reachable from the EXISTING
  // "Activate SSU" button: bazaar_mission::ssu_lifecycle::activate_ssu_governance
  // calls this hardened callee internally (CR-DEP-07).
  const ssuPermanentlyDeadPattern =
    /MoveAbort\b.*\babort code:\s*2(?!\d).*\bssu_guarded_ops\b/i;
  if (ssuPermanentlyDeadPattern.test(msg)) {
    return "This SSU has been permanently marked depreciated (its in-game assembly no longer exists) and can never be reactivated.";
  }

  // E_NOT_DEPRECIATED = 1 — SAME code + message across all 3 Phase-B prune modules:
  // the certificate (mark_ssu_depreciated) must run before any refund/delist page.
  const notDepreciatedPattern =
    /MoveAbort\b.*\babort code:\s*1(?!\d).*\b(?:ssu_depreciation_ops|ssu_depreciation_missions|ssu_depreciation_economy)\b/i;
  if (notDepreciatedPattern.test(msg)) {
    return "This SSU has not been certified as depreciated yet — run \"Mark depreciated\" first.";
  }

  // E_SHOP_WRONG_SSU — ssu_depreciation_ops=2, ssu_depreciation_economy=3.
  const pruneShopWrongSsuPattern =
    /MoveAbort\b.*\babort code:\s*(?:2(?!\d).*\bssu_depreciation_ops\b|3(?!\d).*\bssu_depreciation_economy\b)/i;
  if (pruneShopWrongSsuPattern.test(msg)) {
    return "One of the selected shops does not belong to this SSU.";
  }

  // E_MISSION_WRONG_SSU — ssu_depreciation_missions=2, ssu_depreciation_economy=4.
  const pruneMissionWrongSsuPattern =
    /MoveAbort\b.*\babort code:\s*(?:2(?!\d).*\bssu_depreciation_missions\b|4(?!\d).*\bssu_depreciation_economy\b)/i;
  if (pruneMissionWrongSsuPattern.test(msg)) {
    return "This mission does not belong to this SSU.";
  }

  // E_PAGINATION_ZERO — ops=3, missions=3, economy=6.
  const prunePaginationZeroPattern =
    /MoveAbort\b.*\babort code:\s*(?:3(?!\d).*\b(?:ssu_depreciation_ops|ssu_depreciation_missions)\b|6(?!\d).*\bssu_depreciation_economy\b)/i;
  if (prunePaginationZeroPattern.test(msg)) {
    return "Select at least one entry to prune.";
  }

  // E_BATCH_TOO_LARGE — ops=4, missions=4, economy=7.
  const pruneBatchTooLargePattern =
    /MoveAbort\b.*\babort code:\s*(?:4(?!\d).*\b(?:ssu_depreciation_ops|ssu_depreciation_missions)\b|7(?!\d).*\bssu_depreciation_economy\b)/i;
  if (pruneBatchTooLargePattern.test(msg)) {
    return "Too many entries selected at once — prune in batches of 100 or fewer.";
  }

  // E_POOL_WRONG_SSU = 5 (ssu_depreciation_ops.move)
  const poolWrongSsuPattern =
    /MoveAbort\b.*\babort code:\s*5(?!\d).*\bssu_depreciation_ops\b/i;
  if (poolWrongSsuPattern.test(msg)) {
    return "The WTB escrow pool provided does not belong to this SSU.";
  }

  // E_INVALID_BAZAAR_TYPE = 5 (ssu_depreciation_missions.move) — Advanced mission
  // collateral is token-pooled in bazaar_economy, not this EVE-only entry.
  const missionsInvalidBazaarTypePattern =
    /MoveAbort\b.*\babort code:\s*5(?!\d).*\bssu_depreciation_missions\b/i;
  if (missionsInvalidBazaarTypePattern.test(msg)) {
    return "Advanced-tribe mission collateral is refunded from the token pool — use the token prune action instead.";
  }

  // E_RUNS_STILL_IN_PROGRESS = 6 (ssu_depreciation_missions.move)
  const runsStillInProgressPattern =
    /MoveAbort\b.*\babort code:\s*6(?!\d).*\bssu_depreciation_missions\b/i;
  if (runsStillInProgressPattern.test(msg)) {
    return "This mission still has takers with collateral escrowed — refund their collateral first.";
  }

  // E_NOT_ADVANCED = 2 (ssu_depreciation_economy.move)
  const pruneNotAdvancedPattern =
    /MoveAbort\b.*\babort code:\s*2(?!\d).*\bssu_depreciation_economy\b/i;
  if (pruneNotAdvancedPattern.test(msg)) {
    return "This action only applies to Advanced-tribe SSUs.";
  }

  // E_WRONG_TRIBE = 5 (ssu_depreciation_economy.move) — CR-DEP-02 binding.
  const pruneWrongTribePattern =
    /MoveAbort\b.*\babort code:\s*5(?!\d).*\bssu_depreciation_economy\b/i;
  if (pruneWrongTribePattern.test(msg)) {
    return "The tribe token ledger provided does not match this shop/mission's tribe.";
  }

  // E_MISSION_NOT_SETTLED = 8 (ssu_depreciation_economy.move) — run the mission
  // reward/close prune step (bazaar_mission) before draining its reward-token row.
  const missionNotSettledPattern =
    /MoveAbort\b.*\babort code:\s*8(?!\d).*\bssu_depreciation_economy\b/i;
  if (missionNotSettledPattern.test(msg)) {
    return "This mission's reward must be closed first — run the mission prune step, then retry the token refund.";
  }

  return msg;
}
