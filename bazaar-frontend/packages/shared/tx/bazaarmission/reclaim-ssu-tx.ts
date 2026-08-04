// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Update Ceremony V2 — Phase 2 (Slice 5): SSU reclaim TX builders.
 *
 * The SSU owner re-materialises their orphaned SSU on the NEW packages in TWO
 * PTBs (the landed two-PTB design — bazaar_mission::reclaim_ssu):
 *
 *   PTB 1  buildReclaimSsuShell    → reclaim_ssu_shell (consume record + Frontier
 *          ownership proof + tribe-first guard + register + bootstrap). The new
 *          SSUGovernance / MemberRegistry / SSUOwnerCap ids land on the
 *          SSUReclaimShellEvent + the bootstrap events — resolve them post-shell.
 *   PTB 2  buildReclaimSsuRestore  → reclaim_ssu_restore (roster + local bans +
 *          godot URL + mission fee + lazy-drained EVE), cap-gated on the new cap.
 *
 * LAZY EVE DRAIN (design §4.3): the restore PTB composes the OLD-version legacy
 * withdraws and feeds the resulting Coin<EVE> straight into the restore call —
 * `OLD_core::ssu_admin_drain::withdraw_legacy_ssu_eve → coin` (+ optional WTB
 * residual, merged) — with NO permanent cross-version Move dep. Neither OLD
 * withdraw is ceremony-gated. With no drain spec the builder deposits a fresh
 * `coin::zero<EVE>` (the restore entry tolerates a zero coin).
 *
 * The restore args (roster / bans / config) are decoded TS-side from the record's
 * SSUOwnerPayload blob (the shell CONSUMES the record, so the chain cannot re-read
 * the blob in PTB 2). Field order is pinned by `SSUOwnerPayloadBcs` (Slice 4).
 *
 * GATING: callers MUST check `reclaimEnabled()` before building — an empty
 * RECLAIM_REGISTRY_ID / package id resolves to `0x0 not found`.
 */

import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import {
  PACKAGE_IDS,
  MODULES,
  SHARED_OBJECTS,
  RECLAIM_REGISTRY_ID,
  OUTGOING_PACKAGE_IDS,
  EVE_COIN_TYPE,
  SUI_CLOCK_ID,
} from "../../constants";
import { SSUOwnerPayloadBcs } from "../../ceremony/reclaim/payloads";

// ───────────────────────── payload decode (restore args) ────────────────────────

export interface DecodedMemberRow { player: string; ssuRole: number; tribeRole: number; isBanned: boolean }
export interface DecodedBanRow { addr: string; expiresAtMs: bigint }

/** The SSUOwnerPayload fields the restore PTB needs (decoded from the record blob). */
export interface DecodedSsuOwnerPayload {
  originalSsuId: string;
  urlSlug: string;
  bazaarType: number;
  originalTribeId: bigint;
  godotUrl: string;
  missionListingFeePerHour: bigint;
  members: DecodedMemberRow[];
  localBanList: DecodedBanRow[];
  /** Raw inner blobs (decoded further only if role-tax / shop-limit restore is wired). */
  roleTaxTableBlob: Uint8Array;
  shopLimitsBlob: Uint8Array;
}

function toBytes(blob: Uint8Array | number[]): Uint8Array {
  return blob instanceof Uint8Array ? blob : Uint8Array.from(blob);
}

/** Decode an SSU_OWNER record payload into the typed restore args. */
export function decodeSsuOwnerPayload(blob: Uint8Array | number[]): DecodedSsuOwnerPayload {
  const p = SSUOwnerPayloadBcs.parse(toBytes(blob));
  return {
    originalSsuId: p.original_ssu_id,
    urlSlug: p.url_slug,
    bazaarType: p.bazaar_type,
    originalTribeId: BigInt(p.original_tribe_id),
    godotUrl: p.godot_url,
    missionListingFeePerHour: BigInt(p.mission_listing_fee_per_hour),
    members: p.members.map((m) => ({
      player: m.player,
      ssuRole: m.ssu_role,
      tribeRole: m.tribe_role,
      isBanned: m.is_banned,
    })),
    localBanList: p.local_ban_list.map((b) => ({ addr: b.addr, expiresAtMs: BigInt(b.expires_at_ms) })),
    roleTaxTableBlob: Uint8Array.from(p.role_tax_table_blob),
    shopLimitsBlob: Uint8Array.from(p.shop_limits_blob),
  };
}

// ────────────────────────────── PTB 1 — shell ──────────────────────────────────

export interface ReclaimSsuShellParams {
  /** Frontier OwnerCap<StorageUnit> proving live ownership of the SSU (owned). */
  ownerCapId: string;
  targetSsuId: string;
  reclaimRegistryId?: string;
  ssuRegistryId?: string;
  /** Authorized-package binding for the bootstrapped governance (the NEW bazaar_core). */
  packageId?: string;
}

/**
 * Build PTB 1 — `bazaar_mission::reclaim_ssu::reclaim_ssu_shell`.
 * Sig: (reclaim_registry: &mut, ssu_registry: &mut, owner_cap: &OwnerCap<StorageUnit>,
 *       target_ssu_id: address, package_id: address, clock, ctx)
 */
export function buildReclaimSsuShell(
  params: ReclaimSsuShellParams,
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.RECLAIM_SSU}::reclaim_ssu_shell`,
    arguments: [
      tx.object(params.reclaimRegistryId ?? RECLAIM_REGISTRY_ID),
      tx.object(params.ssuRegistryId ?? SHARED_OBJECTS.SSU_REGISTRY),
      tx.object(params.ownerCapId),
      tx.pure.address(params.targetSsuId),
      tx.pure.address(params.packageId ?? PACKAGE_IDS.BAZAAR_CORE),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─────────────────────── PTB 2 — lazy-drain coin composition ─────────────────────

/** OLD-version legacy-withdraw spec for the SSU EVE lazy-drain (design §4.3). */
export interface SsuLazyDrainSpec {
  /** OLD SSUOwnerCap (defense-in-depth, SSUOwnerCap-gated, NOT ceremony-gated). */
  oldSsuOwnerCapId: string;
  /** OLD SSUGovernance whose tax wallet is drained. */
  oldSsuGovId: string;
  /** OUTGOING bazaar_core package id (defaults to OUTGOING_PACKAGE_IDS.BAZAAR_CORE). */
  outgoingBazaarCorePkg?: string;
  /** Optional WTB-escrow residual drain (Easy/NoTribe legacy custody). */
  wtb?: {
    oldWtbPoolId: string;
    oldBazarRegistryId: string;
    /** Shop ids (vector<ID>) whose residuals to sweep. */
    shopIds: string[];
  };
}

/**
 * Append the OLD-version legacy withdraws and return the merged Coin<EVE> handle.
 * Returns `coin::zero<EVE>` when no drain is supplied (the restore entry tolerates
 * a zero coin). Pure PTB composition — no async wallet lookup.
 */
function appendSsuLazyDrain(tx: Transaction, drain?: SsuLazyDrainSpec) {
  if (!drain) {
    const [zero] = tx.moveCall({ target: "0x2::coin::zero", typeArguments: [EVE_COIN_TYPE], arguments: [] });
    return zero;
  }
  const oldCore = drain.outgoingBazaarCorePkg ?? OUTGOING_PACKAGE_IDS.BAZAAR_CORE;
  const [ssuCoin] = tx.moveCall({
    target: `${oldCore}::${MODULES.SSU_ADMIN_DRAIN}::withdraw_legacy_ssu_eve`,
    arguments: [
      tx.object(drain.oldSsuOwnerCapId),
      tx.object(drain.oldSsuGovId),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  if (drain.wtb) {
    const [wtbCoin] = tx.moveCall({
      target: `${oldCore}::${MODULES.WTB_ESCROW_POOL}::withdraw_legacy_wtb_pool_residual`,
      arguments: [
        tx.object(drain.wtb.oldWtbPoolId),
        tx.object(drain.wtb.oldBazarRegistryId),
        tx.pure(bcs.vector(bcs.Address).serialize(drain.wtb.shopIds).toBytes()),
        tx.object(SUI_CLOCK_ID),
      ],
    });
    tx.mergeCoins(ssuCoin, [wtbCoin]);
  }
  return ssuCoin;
}

// ────────────────────────────── PTB 2 — restore ─────────────────────────────────

export interface ReclaimSsuRestoreParams {
  /** The NEW SSUOwnerCap from the shell (owned). */
  ssuOwnerCapId: string;
  /** The NEW SSUGovernance (shared, resolved from the shell event). */
  ssuGovId: string;
  /** The NEW MemberRegistry (shared, resolved from the shell event). */
  memberRegistryId: string;
  /** The consumed record's SSUOwnerPayload blob (decoded TS-side for the restore args). */
  payloadBlob: Uint8Array | number[];
  /** Reclaim time (ms) — bans whose expiry <= now are pre-filtered (Move asserts expiry > now). */
  nowMs: number;
  /** Optional lazy EVE drain; omitted ⇒ a zero coin is deposited. */
  drain?: SsuLazyDrainSpec;
}

/**
 * Build PTB 2 — `bazaar_mission::reclaim_ssu::reclaim_ssu_restore`, composing the
 * lazy EVE drain into the same PTB.
 * Sig: (owner_cap: &SSUOwnerCap, gov: &mut SSUGovernance, registry: &mut MemberRegistry,
 *       eve_coin: Coin<EVE>, godot_url_bytes: vector<u8>, mission_listing_fee_per_hour: u64,
 *       member_players: vector<address>, member_ssu_roles: vector<u8>,
 *       member_is_banned: vector<bool>, ban_addrs: vector<address>,
 *       ban_expiries: vector<u64>, clock, ctx)
 */
export function buildReclaimSsuRestore(
  params: ReclaimSsuRestoreParams,
  tx: Transaction = new Transaction(),
): Transaction {
  const p = decodeSsuOwnerPayload(params.payloadBlob);

  // Roster parallel vectors.
  const players = p.members.map((m) => m.player);
  const roles = p.members.map((m) => m.ssuRole);
  const banned = p.members.map((m) => m.isBanned);

  // Pre-filter timed bans already expired (set_ban_internal asserts expiry > now).
  const now = BigInt(params.nowMs);
  const liveBans = p.localBanList.filter((b) => b.expiresAtMs > now);
  const banAddrs = liveBans.map((b) => b.addr);
  const banExpiries = liveBans.map((b) => b.expiresAtMs);

  const godotBytes = Array.from(new TextEncoder().encode(p.godotUrl));

  // Lazy EVE drain (or a fresh zero coin) → restore.
  const eveCoin = appendSsuLazyDrain(tx, params.drain);

  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${MODULES.RECLAIM_SSU}::reclaim_ssu_restore`,
    arguments: [
      tx.object(params.ssuOwnerCapId),
      tx.object(params.ssuGovId),
      tx.object(params.memberRegistryId),
      eveCoin,
      tx.pure(bcs.vector(bcs.u8()).serialize(godotBytes).toBytes()),
      tx.pure.u64(p.missionListingFeePerHour),
      tx.pure(bcs.vector(bcs.Address).serialize(players).toBytes()),
      tx.pure(bcs.vector(bcs.u8()).serialize(roles).toBytes()),
      tx.pure(bcs.vector(bcs.bool()).serialize(banned).toBytes()),
      tx.pure(bcs.vector(bcs.Address).serialize(banAddrs).toBytes()),
      tx.pure(bcs.vector(bcs.u64()).serialize(banExpiries).toBytes()),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
