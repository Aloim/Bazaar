// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — DappHub admin TX builders.
 *
 * Targets `dapp_hub::anchor_registry`, `dapp_hub::announcements`, and
 * `dapp_hub::tax_wallet::drain_dapp_tax_wallet`. Each builder follows the
 * canonical EconomyFixplan Phase 11 shape `(params, tx?: Transaction) → Transaction`
 * — caller may pass a Transaction to chain into a PTB (used by
 * `<LegacySSUWithdrawButton />` analogues + the UpdateCeremonyTab step buttons),
 * otherwise a fresh Transaction is created.
 *
 * All DAppOwnerCap-gated; FE component owners route through dAppKit directly
 * (DappHub is EXEMPT from `useGatedTransaction`).
 *
 * File limit: 500 lines | Constitution Article XIV.4 (exempt under UpdateCeremonyPlan).
 */

import { Transaction } from "@mysten/sui/transactions";
import {
  PACKAGE_IDS,
  MODULES,
  SHARED_OBJECTS,
  ANCHOR_REGISTRY_ID,
  DAPP_ANNOUNCEMENTS_ID,
  SUI_CLOCK_ID,
} from "@bazaar/shared/constants";

// ─── post_anchor ─────────────────────────────────────────────────────────────

/**
 * Append a SHA-256 fingerprint of a Phase A backup snapshot to the on-chain
 * AnchorRegistry. Hash must be exactly 32 bytes (HASH_BYTES); checkpoint > 0.
 *
 * Move: dapp_hub::anchor_registry::post_anchor
 * Sig:  (_cap: &DAppOwnerCap, registry: &mut AnchorRegistry,
 *        checkpoint: u64, hash: vector<u8>, schema_version: String,
 *        ipfs_cid: String, note: String, clock: &Clock, ctx: &mut TxContext)
 */
export function buildPostAnchor(
  params: {
    ownerCapId: string;
    anchorRegistryId?: string;
    checkpoint: number | bigint;
    hash: Uint8Array;          // SHA-256, 32 bytes
    schemaVersion: string;
    ipfsCid: string;
    note: string;
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.ANCHOR_REGISTRY}::post_anchor`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.anchorRegistryId ?? ANCHOR_REGISTRY_ID),
      tx.pure.u64(typeof params.checkpoint === "bigint" ? params.checkpoint : BigInt(params.checkpoint)),
      tx.pure.vector("u8", Array.from(params.hash)),
      tx.pure.string(params.schemaVersion),
      tx.pure.string(params.ipfsCid),
      tx.pure.string(params.note),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── init_v1_ceremony_objects (one-shot post-upgrade init) ───────────────────

/**
 * ONE-SHOT post-upgrade init. Creates BOTH AnchorRegistry AND DAppAnnouncements
 * shared objects in a single PTB. Deployer calls exactly once after the v1
 * `sui client upgrade` lands. Double-call creates a second pair (harmless;
 * env vars record the first only).
 *
 * Move: dapp_hub::announcements::init_v1_ceremony_objects
 * Sig:  (_cap: &DAppOwnerCap, ctx: &mut TxContext)
 */
export function buildInitV1CeremonyObjects(
  params: {
    ownerCapId: string;
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.ANNOUNCEMENTS}::init_v1_ceremony_objects`,
    arguments: [tx.object(params.ownerCapId)],
  });
  return tx;
}

// ─── post_announcement ───────────────────────────────────────────────────────

/**
 * Post a tier-0 (Info) or tier-1 (Warning) announcement to DAppAnnouncements.
 * Warning rows lock mutating FE actions in NoTribe/Easy/Advanced while
 * `now_ms ∈ [show_from_ms, show_until_ms]`. DappHub remains unaffected.
 *
 * Move: dapp_hub::announcements::post_announcement
 */
export function buildPostAnnouncement(
  params: {
    ownerCapId: string;
    announcementsId?: string;
    tier: 0 | 1;
    title: string;
    body: string;
    showFromMs: number | bigint;
    showUntilMs: number | bigint;
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.ANNOUNCEMENTS}::post_announcement`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.announcementsId ?? DAPP_ANNOUNCEMENTS_ID),
      tx.pure.u8(params.tier),
      tx.pure.string(params.title),
      tx.pure.string(params.body),
      tx.pure.u64(typeof params.showFromMs === "bigint" ? params.showFromMs : BigInt(params.showFromMs)),
      tx.pure.u64(typeof params.showUntilMs === "bigint" ? params.showUntilMs : BigInt(params.showUntilMs)),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── clear_announcement ──────────────────────────────────────────────────────

/**
 * Remove a specific announcement row by id. Aborts E_ANNOUNCEMENT_NOT_FOUND (1)
 * if no row matches.
 *
 * Move: dapp_hub::announcements::clear_announcement
 */
export function buildClearAnnouncement(
  params: {
    ownerCapId: string;
    announcementsId?: string;
    id: number | bigint;
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.ANNOUNCEMENTS}::clear_announcement`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.announcementsId ?? DAPP_ANNOUNCEMENTS_ID),
      tx.pure.u64(typeof params.id === "bigint" ? params.id : BigInt(params.id)),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── prune_expired_announcements ─────────────────────────────────────────────

/**
 * Remove every row whose `show_until_ms < now_ms`. Safe to call when no rows
 * are expired (emits AnnouncementPruned with `pruned_count = 0`).
 *
 * Move: dapp_hub::announcements::prune_expired_announcements
 */
export function buildPruneAnnouncements(
  params: {
    ownerCapId: string;
    announcementsId?: string;
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.ANNOUNCEMENTS}::prune_expired_announcements`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.announcementsId ?? DAPP_ANNOUNCEMENTS_ID),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── drain_dapp_tax_wallet (Variant B global drain) ──────────────────────────

/**
 * Variant B emergency drain — pulls the entire DAppTaxWallet balance to
 * `recipient`. DAppOwnerCap-gated. Emits EmergencyDrainEvent UNCONDITIONALLY
 * for audit, even when amount is zero.
 *
 * Move: dapp_hub::tax_wallet::drain_dapp_tax_wallet
 */
export function buildDrainDappTaxWallet(
  params: {
    ownerCapId: string;
    taxWalletId?: string;
    recipient: string;
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.TAX_WALLET}::drain_dapp_tax_wallet`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.taxWalletId ?? SHARED_OBJECTS.TAX_WALLET),
      tx.pure.address(params.recipient),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
