// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * tx/bazaarcore/shop-escrow-helpers.ts — Character-path PTB helpers for SSU item escrow.
 *
 * Issue 3 Stage B: Escrow flow during shop creation and buy operations.
 *
 * CC-001: borrowSSUOwnerCap / returnSSUOwnerCap imported from ssu-receiving-tx (no duplicates).
 * CC-002: BAZAR_AUTH_TYPE imported from ssu-receiving-tx (no redefinition).
 *
 * Helpers:
 * - charBorrowOwnerCap / charReturnOwnerCap — Character OwnerCap<Character> borrow/return
 * - ssuWithdrawByOwner / ssuWithdrawByOwnerSU — withdraw via Character / StorageUnit path
 * - ssuDepositToOpenInventory / ssuWithdrawFromOpenInventory — open-inventory escrow
 * - ssuDepositByOwner / ssuDepositToOwned — owner-path and BAZAR_AUTH deposit
 * - resolveCharOwnerCapRef — async RPC lookup for CharOwnerCapRef
 *
 * File limit: 500 lines | Constitution Article XIV.2 + Issue 3 Stage B
 */

import { Transaction } from "@mysten/sui/transactions";
import { WORLD_PACKAGE_ID, PACKAGE_ID } from "@bazaar/shared/constants";
import {
  borrowSSUOwnerCap,   // CC-001: reuse SSU cap helpers
  returnSSUOwnerCap,   // CC-001: reuse SSU cap helpers
  BAZAR_AUTH_TYPE,     // CC-002: reuse exported constant
  type SSUOwnerCapRef, // Phase 3: typed reference for escrowItemsForShopCreation param
} from "./ssu-receiving-tx";

// Re-export so callers can import from one place if needed.
export { borrowSSUOwnerCap, returnSSUOwnerCap };

const worldPkg = WORLD_PACKAGE_ID;
const pkg = PACKAGE_ID;

// ── Runtime guard ─────────────────────────────────────────────────────────────

function requireWorldPkg(): void {
  if (!worldPkg) throw new Error("[shop-escrow-helpers] WORLD_PACKAGE_ID is not set. Check your .env configuration.");
}

// ── Character OwnerCap reference ──────────────────────────────────────────────

/**
 * Ref object for a Character's own OwnerCap<Character>.
 * Analogous to SSUOwnerCapRef but for the Character object itself.
 */
export interface CharOwnerCapRef {
  charCapId:      string;
  charCapVersion: string;
  charCapDigest:  string;
}

// ── Character OwnerCap borrow / return ────────────────────────────────────────

/**
 * Borrow OwnerCap<Character> from the Character shared object via
 * Sui's Receiving pattern.  Must be returned via charReturnOwnerCap in the same PTB.
 *
 * Move target: world::character::borrow_owner_cap<Character>
 */
export function charBorrowOwnerCap(
  tx: Transaction,
  charId: string,
  capRef: CharOwnerCapRef,
): { ownerCap: ReturnType<Transaction["moveCall"]>[0]; receipt: ReturnType<Transaction["moveCall"]>[0] } {
  requireWorldPkg();
  const charType = `${worldPkg}::character::Character`;
  const receiving = tx.receivingRef({
    objectId: capRef.charCapId,
    version:  capRef.charCapVersion,
    digest:   capRef.charCapDigest,
  });
  const [ownerCap, receipt] = tx.moveCall({
    target: `${worldPkg}::character::borrow_owner_cap`,
    typeArguments: [charType],
    arguments: [tx.object(charId), receiving],
  });
  return { ownerCap, receipt };
}

/**
 * Return the borrowed OwnerCap<Character> back to the Character object.
 * Must be called exactly once per charBorrowOwnerCap in the same PTB.
 */
export function charReturnOwnerCap(
  tx: Transaction,
  charId: string,
  ownerCap: ReturnType<Transaction["moveCall"]>[0],
  receipt:  ReturnType<Transaction["moveCall"]>[0],
): void {
  requireWorldPkg();
  const charType = `${worldPkg}::character::Character`;
  tx.moveCall({
    target: `${worldPkg}::character::return_owner_cap`,
    typeArguments: [charType],
    arguments: [tx.object(charId), ownerCap, receipt],
  });
}

// ── SSU item withdraw (owner paths) ───────────────────────────────────────────

/**
 * Withdraw an item from the SSU by Character owner (Character path).
 * Move target: world::storage_unit::withdraw_by_owner<Character>
 * Returns the withdrawn Item PTB result.
 */
export function ssuWithdrawByOwner(
  tx: Transaction,
  ssuId:    string,
  charId:   string,
  ownerCap: ReturnType<Transaction["moveCall"]>[0],
  typeId:   number,
  quantity: number,
): ReturnType<Transaction["moveCall"]>[0] {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 0xFFFFFFFF) {
    throw new Error(`[ssuWithdrawByOwner] quantity must be a u32 integer (0–4294967295), got: ${quantity}`);
  }
  requireWorldPkg();
  const charType = `${worldPkg}::character::Character`;
  const [item] = tx.moveCall({
    target: `${worldPkg}::storage_unit::withdraw_by_owner`,
    typeArguments: [charType],
    arguments: [
      tx.object(ssuId),
      tx.object(charId),
      ownerCap,
      tx.pure.u64(BigInt(typeId)),
      tx.pure.u32(quantity),
    ],
  });
  return item;
}

/**
 * Withdraw an item from the SSU by StorageUnit owner path.
 * Move target: world::storage_unit::withdraw_by_owner<StorageUnit>
 * Returns the withdrawn Item PTB result.
 */
export function ssuWithdrawByOwnerSU(
  tx: Transaction,
  ssuId:    string,
  charId:   string,
  ownerCap: ReturnType<Transaction["moveCall"]>[0],
  typeId:   number,
  quantity: number,
): ReturnType<Transaction["moveCall"]>[0] {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 0xFFFFFFFF) {
    throw new Error(`[ssuWithdrawByOwnerSU] quantity must be a u32 integer (0–4294967295), got: ${quantity}`);
  }
  requireWorldPkg();
  const suType = `${worldPkg}::storage_unit::StorageUnit`;
  const [item] = tx.moveCall({
    target: `${worldPkg}::storage_unit::withdraw_by_owner`,
    typeArguments: [suType],
    arguments: [
      tx.object(ssuId),
      tx.object(charId),
      ownerCap,
      tx.pure.u64(BigInt(typeId)),
      tx.pure.u32(quantity),
    ],
  });
  return item;
}

// ── SSU open-inventory escrow ─────────────────────────────────────────────────

/**
 * Deposit an item to the SSU's open inventory (BazarAuth-gated).
 * Mints a fresh BazarAuth witness via bazar::new_bazar_auth then deposits.
 * Move targets:
 *   bazaar_core::bazar::new_bazar_auth → BazarAuth
 *   world::storage_unit::deposit_to_open_inventory<BazarAuth>
 */
export function ssuDepositToOpenInventory(
  tx: Transaction,
  ssuId:  string,
  charId: string,
  item:   ReturnType<Transaction["moveCall"]>[0],
): void {
  const [auth] = tx.moveCall({
    target: `${pkg}::bazar::new_bazar_auth`,
    arguments: [],
  });
  tx.moveCall({
    target: `${worldPkg}::storage_unit::deposit_to_open_inventory`,
    typeArguments: [BAZAR_AUTH_TYPE()],
    arguments: [tx.object(ssuId), tx.object(charId), item, auth],
  });
}

/**
 * Withdraw an item from the SSU's open inventory (BazarAuth-gated).
 * Mints a fresh BazarAuth witness then withdraws.
 * Move targets:
 *   bazaar_core::bazar::new_bazar_auth → BazarAuth
 *   world::storage_unit::withdraw_from_open_inventory<BazarAuth>
 * Returns the withdrawn Item PTB result.
 */
export function ssuWithdrawFromOpenInventory(
  tx: Transaction,
  ssuId:    string,
  charId:   string,
  typeId:   number,
  quantity: number,
): ReturnType<Transaction["moveCall"]>[0] {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 0xFFFFFFFF) {
    throw new Error(`[ssuWithdrawFromOpenInventory] quantity must be a u32 integer (0–4294967295), got: ${quantity}`);
  }
  const [auth] = tx.moveCall({
    target: `${pkg}::bazar::new_bazar_auth`,
    arguments: [],
  });
  const [item] = tx.moveCall({
    target: `${worldPkg}::storage_unit::withdraw_from_open_inventory`,
    typeArguments: [BAZAR_AUTH_TYPE()],
    arguments: [
      tx.object(ssuId),
      tx.object(charId),
      auth,
      tx.pure.u64(BigInt(typeId)),
      tx.pure.u32(quantity),
    ],
  });
  return item;
}

// ── SSU deposit helpers ───────────────────────────────────────────────────────

/**
 * Deposit an item to the SSU by Character owner (owner-path deposit).
 * Move target: world::storage_unit::deposit_by_owner<Character>
 */
export function ssuDepositByOwner(
  tx: Transaction,
  ssuId:    string,
  charId:   string,
  ownerCap: ReturnType<Transaction["moveCall"]>[0],
  item:     ReturnType<Transaction["moveCall"]>[0],
): void {
  requireWorldPkg();
  const charType = `${worldPkg}::character::Character`;
  tx.moveCall({
    target: `${worldPkg}::storage_unit::deposit_by_owner`,
    typeArguments: [charType],
    arguments: [tx.object(ssuId), item, tx.object(charId), ownerCap],
  });
}

/**
 * Deposit an item to the SSU's Main Storage via StorageUnit owner-cap path.
 * Move target: world::storage_unit::deposit_by_owner<StorageUnit>
 *
 * Sender invariant (storage_unit.move:420 deposit_by_owner): the calling wallet
 * MUST own the character passed in (character.character_address() === ctx.sender()).
 * This restricts this path to self-deposits where the sender is both the SSU owner
 * AND the character owner — typically a WTS self-buy where buyer == SSU owner.
 * Arg order per Run-#10 invariant 5: (ssu, item, character, owner_cap).
 */
export function ssuDepositByOwnerSU(
  tx: Transaction,
  ssuId:    string,
  charId:   string,
  ownerCap: ReturnType<Transaction["moveCall"]>[0],
  item:     ReturnType<Transaction["moveCall"]>[0],
): void {
  requireWorldPkg();
  const suType = `${worldPkg}::storage_unit::StorageUnit`;
  tx.moveCall({
    target: `${worldPkg}::storage_unit::deposit_by_owner`,
    typeArguments: [suType],
    arguments: [tx.object(ssuId), item, tx.object(charId), ownerCap],
  });
}

/**
 * Deposit an item to the SSU's owned inventory (BazarAuth-gated).
 * Mints a fresh BazarAuth witness then deposits.
 * Move targets:
 *   bazaar_core::bazar::new_bazar_auth → BazarAuth
 *   world::storage_unit::deposit_to_owned<BazarAuth>
 */
export function ssuDepositToOwned(
  tx: Transaction,
  ssuId:  string,
  charId: string,
  item:   ReturnType<Transaction["moveCall"]>[0],
): void {
  const [auth] = tx.moveCall({
    target: `${pkg}::bazar::new_bazar_auth`,
    arguments: [],
  });
  tx.moveCall({
    target: `${worldPkg}::storage_unit::deposit_to_owned`,
    typeArguments: [BAZAR_AUTH_TYPE()],
    arguments: [tx.object(ssuId), tx.object(charId), item, auth],
  });
}

// ── CharOwnerCapRef RPC resolver ──────────────────────────────────────────────

/**
 * Resolve the OwnerCap<Character> reference for a given ownerCapId via sui_getObject.
 * Returns CharOwnerCapRef (id, version, digest) needed for tx.receivingRef().
 * Returns null if the object cannot be fetched or lacks required fields.
 */
export async function resolveCharOwnerCapRef(
  ownerCapId: string,
  rpcUrl?: string,
): Promise<CharOwnerCapRef | null> {
  const url =
    rpcUrl ??
    (import.meta.env.VITE_SUI_RPC_URL as string | undefined) ??
    "https://api.zan.top/public/sui-testnet";

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sui_getObject",
      params: [ownerCapId, { showType: true, showContent: false }],
    }),
  });

  if (!r.ok) return null;

  const json = await r.json();
  if (json.error) return null;

  const obj = json?.result?.data;
  if (!obj?.objectId || !obj?.version || !obj?.digest) return null;

  return {
    charCapId:      obj.objectId as string,
    charCapVersion: String(obj.version),
    charCapDigest:  obj.digest as string,
  };
}

// ── Phase 3: bifurcated escrow loop for shop creation ────────────────────────

/**
 * Bifurcated pre-move escrow loop for WTS / FREE / DE shop creation.
 *
 * Owner branch (asOwner === true):
 *   Borrows OwnerCap<StorageUnit> via Sui Receiving pattern (borrowSSUOwnerCap).
 *   Withdraws each item from Main Storage (world::storage_unit::withdraw_by_owner<StorageUnit>).
 *   Deposits each item into Open Storage for downstream Shop.listings escrow.
 *   Returns OwnerCap<StorageUnit> at end of block.
 *
 * Non-owner branch (asOwner === false / undefined):
 *   Borrows OwnerCap<Character> via Sui Receiving pattern (charBorrowOwnerCap).
 *   Withdraws each item from Player Locker (world::storage_unit::withdraw_by_owner<Character>).
 *   Deposits each item into Open Storage.
 *   Returns OwnerCap<Character> at end of block.
 *
 * Both branches use ssuDepositToOpenInventory (BazarAuth-gated) for the deposit step.
 * Caller (shop-tx.ts builder) is responsible for passing the correct cap ref branch.
 *
 * Preconditions (enforced at runtime, throw synchronously):
 *   asOwner === true  → ssuOwnerCapRef MUST be non-null.
 *   asOwner === false → charCapRef MUST be non-null.
 *
 * Move source (withdraw):
 *   world::storage_unit::withdraw_by_owner<StorageUnit> (Main Storage path)
 *   world::storage_unit::withdraw_by_owner<Character>   (Player Locker path)
 *   storage_unit.move:448–475; quantity: u32 (Gotcha #1 in primer §2a).
 *
 * Phase 3 / EconomyFixplan. Activates the dormant ssuWithdrawByOwnerSU path.
 */
export function escrowItemsForShopCreation(
  tx: Transaction,
  params: {
    ssuId: string;
    characterId: string;
    escrowItems: Array<{ typeId: number; quantity: number }>;
    asOwner: boolean;
    charCapRef?: CharOwnerCapRef;
    ssuOwnerCapRef?: SSUOwnerCapRef;
  },
): void {
  if (params.asOwner) {
    if (!params.ssuOwnerCapRef) {
      throw new Error(
        "[escrowItemsForShopCreation] asOwner=true requires ssuOwnerCapRef. " +
        "Ensure resolveSSUOwnerCap resolved successfully before calling the builder.",
      );
    }
    const { ownerCap, receipt } = borrowSSUOwnerCap(
      tx,
      params.characterId,
      params.ssuOwnerCapRef.ssuCapId,
      params.ssuOwnerCapRef.ssuCapVersion,
      params.ssuOwnerCapRef.ssuCapDigest,
    );
    for (const slot of params.escrowItems) {
      const item = ssuWithdrawByOwnerSU(
        tx, params.ssuId, params.characterId, ownerCap, slot.typeId, slot.quantity,
      );
      ssuDepositToOpenInventory(tx, params.ssuId, params.characterId, item);
    }
    returnSSUOwnerCap(tx, params.characterId, ownerCap, receipt);
  } else {
    if (!params.charCapRef) {
      throw new Error(
        "[escrowItemsForShopCreation] asOwner=false requires charCapRef. " +
        "Ensure useCharacterOwnerCapRef resolved successfully before calling the builder.",
      );
    }
    const { ownerCap, receipt } = charBorrowOwnerCap(tx, params.characterId, params.charCapRef);
    for (const slot of params.escrowItems) {
      const item = ssuWithdrawByOwner(
        tx, params.ssuId, params.characterId, ownerCap, slot.typeId, slot.quantity,
      );
      ssuDepositToOpenInventory(tx, params.ssuId, params.characterId, item);
    }
    charReturnOwnerCap(tx, params.characterId, ownerCap, receipt);
  }
}

// ── Phase 4: filler-side withdraw loop for WTB fill ──────────────────────────

/**
 * Borrows OwnerCap<Character> for the filler, withdraws each fillItem from their
 * Player Locker via world::storage_unit::withdraw_by_owner<Character>, and returns
 * the OwnerCap<Character>. Returns the array of Item PTB results for tx.makeMoveVec.
 *
 * Caller (buildWTBFill) converts the returned array via tx.makeMoveVec({ elements: items })
 * and passes the resulting vector<Item> into the wtb_fill_* Move call.
 *
 * Sender invariant (storage_unit.move:456): the calling wallet MUST own the filler's
 * character (character.character_address() === ctx.sender()). Enforced by world Move;
 * this helper does not re-validate on the FE side.
 *
 * Quantity is u32 per Pre-Phase 0 hotfix (ssuWithdrawByOwner validates internally).
 *
 * EconomyFixplan Phase 4. Replaces the pre-move Open-Storage deposit loop (DC-FE2).
 */
export function buildFillerWithdrawLoop(
  tx: Transaction,
  params: {
    ssuId:      string;
    characterId: string;
    fillItems:  Array<{ typeId: number; quantity: number }>;
    charCapRef: CharOwnerCapRef;
    /** V27 Wave 3 W3-4 (filler side): when the filler IS the SSU owner, withdraw
     *  from Main Storage via OwnerCap<StorageUnit> instead of Player Locker. */
    asSSUOwner?:    boolean;
    ssuOwnerCapRef?: SSUOwnerCapRef;
  },
): Array<ReturnType<Transaction["moveCall"]>[0]> {
  const items: Array<ReturnType<Transaction["moveCall"]>[0]> = [];
  if (params.asSSUOwner) {
    if (!params.ssuOwnerCapRef) {
      throw new Error(
        "[buildFillerWithdrawLoop] asSSUOwner=true requires ssuOwnerCapRef. " +
        "Resolve via resolveSSUOwnerCap before calling buildWTBFill.",
      );
    }
    const { ownerCap, receipt } = borrowSSUOwnerCap(
      tx, params.characterId,
      params.ssuOwnerCapRef.ssuCapId,
      params.ssuOwnerCapRef.ssuCapVersion,
      params.ssuOwnerCapRef.ssuCapDigest,
    );
    for (const slot of params.fillItems) {
      const item = ssuWithdrawByOwnerSU(
        tx, params.ssuId, params.characterId, ownerCap, slot.typeId, slot.quantity,
      );
      items.push(item);
    }
    returnSSUOwnerCap(tx, params.characterId, ownerCap, receipt);
    return items;
  }
  const { ownerCap, receipt } = charBorrowOwnerCap(tx, params.characterId, params.charCapRef);
  for (const slot of params.fillItems) {
    const item = ssuWithdrawByOwner(
      tx, params.ssuId, params.characterId, ownerCap, slot.typeId, slot.quantity,
    );
    items.push(item);
  }
  charReturnOwnerCap(tx, params.characterId, ownerCap, receipt);
  return items;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
