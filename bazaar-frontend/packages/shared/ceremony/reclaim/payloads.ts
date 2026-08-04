// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Update Ceremony V2 — Phase 2 (Slice 4): reclaim payload BCS encoders.
 *
 * Turns a verified `BazaarSnapshot` (the Phase-1 generator output) into the
 * on-chain ReclaimRegistry record rows the admin populates pre-V38-cascade:
 * one `SSU_OWNER` record per SSU + one `TRIBE_LEADER` record per tribe.
 *
 * BCS field order is LOAD-BEARING. The on-chain decode peels a prefix of each
 * blob and ABORTS if the bytes don't match. The exact decode sites are:
 *   - SSU blob   → bazaar_mission::reclaim_ssu::reclaim_ssu_shell (peel_address,
 *                  peel_vec_u8, peel_u8, peel_u64 — fields 1-4).
 *   - TRIBE blob → bazaar_economy::reclaim_tribe::reclaim_tribe (peel_u64,
 *                  peel_vec_u8, peel_u8, peel_vec_u8, peel_vec_u8, peel_u8,
 *                  peel_u64, peel_u64 — fields 1-8; field 8 `original_total_supply`
 *                  is load-bearing: it bounds reclaim minting).
 * The full §6.4 payload is encoded for auditability/completeness; the chain only
 * enforces the prefix (it stops peeling after the binding header — there is NO
 * strict reject-leftover, by design, since this is the two-PTB header-only decode).
 *
 * `String` (Move) and `vector<u8>` both BCS-encode as `uleb-len || bytes`, so a
 * `bcs.string()` field decodes cleanly under `peel_vec_u8` (verified).
 *
 * Mirrors `Documentation/reports/UpdateCeremonyV2/Phase2-Move-Design.md` §6.4/§6.4a.
 */

import { bcs } from "@mysten/sui/bcs";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import type { BazaarSnapshot, SsuSnapshot, TribeSnapshot, AddressU64Map } from "../snapshot/types";

// ----- record-type discriminators (mirror reclaim_registry; 2 types — C2) -----
export const RECORD_TYPE_SSU_OWNER = 0;
export const RECORD_TYPE_TRIBE_LEADER = 1;

// ───────────────────────── BCS row sub-structs (§6.4a) ─────────────────────────
// Fixed field order — exported so the Slice-5 reclaim builders can re-decode.

export const MemberRowBcs = bcs.struct("MemberRowBcs", {
  player: bcs.Address,
  ssu_role: bcs.u8(),
  tribe_role: bcs.u8(),
  is_banned: bcs.bool(),
});

export const BanRowBcs = bcs.struct("BanRowBcs", {
  addr: bcs.Address,
  expires_at_ms: bcs.u64(),
});

export const BalanceRowBcs = bcs.struct("BalanceRowBcs", {
  addr: bcs.Address,
  amount: bcs.u64(),
});

export const RoleTaxRowBcs = bcs.struct("RoleTaxRowBcs", {
  role: bcs.u8(),
  wts_pct: bcs.u64(),
  wtb_pct: bcs.u64(),
  de_flat_fee: bcs.u64(),
});

export const ShopLimitRowBcs = bcs.struct("ShopLimitRowBcs", {
  role: bcs.u8(),
  limit: bcs.u64(),
});

// ─────────────────────────── BCS payload structs (§6.4) ────────────────────────

/** SSUOwnerPayload — 11 fields. Chain enforces fields 1-4 (the binding header). */
export const SSUOwnerPayloadBcs = bcs.struct("SSUOwnerPayload", {
  original_ssu_id: bcs.Address,                  // 1  (peel_address — load-bearing)
  url_slug: bcs.string(),                        // 2  (peel_vec_u8 — load-bearing)
  bazaar_type: bcs.u8(),                         // 3  (peel_u8 — load-bearing)
  original_tribe_id: bcs.u64(),                  // 4  (peel_u64 — load-bearing)
  godot_url: bcs.string(),                        // 5
  role_tax_table_blob: bcs.vector(bcs.u8()),     // 6  (vector<RoleTaxRowBcs> serialized)
  shop_limits_blob: bcs.vector(bcs.u8()),        // 7  (vector<ShopLimitRowBcs> serialized)
  mission_listing_fee_per_hour: bcs.u64(),       // 8
  members: bcs.vector(MemberRowBcs),             // 9
  local_ban_list: bcs.vector(BanRowBcs),         // 10
  ssu_eve_mist_at_snapshot: bcs.u64(),           // 11 (informational; real EVE lazy-drained)
});

/** TribeLeaderPayload — 14 fields. Chain enforces fields 1-8 (binding + supply). */
export const TribeLeaderPayloadBcs = bcs.struct("TribeLeaderPayload", {
  original_tribe_id: bcs.u64(),                  // 1  (peel_u64 — load-bearing)
  name: bcs.string(),                            // 2  (peel_vec_u8 — load-bearing)
  bazaar_type: bcs.u8(),                         // 3  (peel_u8 — load-bearing)
  token_name: bcs.string(),                      // 4  (peel_vec_u8 — load-bearing)
  token_symbol: bcs.string(),                    // 5  (peel_vec_u8 — load-bearing)
  token_decimals: bcs.u8(),                      // 6  (peel_u8 — load-bearing)
  token_supply_cap: bcs.u64(),                   // 7  (peel_u64 — load-bearing)
  original_total_supply: bcs.u64(),              // 8  (peel_u64 — LOAD-BEARING: bounds mint)
  role_tax_table_blob: bcs.vector(bcs.u8()),     // 9
  mission_listing_fee_per_hour: bcs.u64(),       // 10
  global_bans: bcs.vector(BanRowBcs),            // 11
  token_balances: bcs.vector(BalanceRowBcs),     // 12
  gov_eve_mist_at_snapshot: bcs.u64(),           // 13 (informational)
  vault_eve_mist_at_snapshot: bcs.u64(),         // 14 (informational)
});

// ──────────────────────────────── normalizers ──────────────────────────────────

/** Coerce a JSON-safe u64 (string | number | bigint | undefined) → bigint, default 0. */
function toBig(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string" && v.trim() !== "") {
    try { return BigInt(v.trim()); } catch { return 0n; }
  }
  return 0n;
}

/** addr→u64 map → BCS ban rows (addr, expires_at_ms). Order-stable by insertion. */
function toBanRows(map: AddressU64Map): { addr: string; expires_at_ms: bigint }[] {
  return Object.entries(map ?? {}).map(([addr, expiry]) => ({
    addr: normalizeSuiAddress(addr),
    expires_at_ms: toBig(expiry),
  }));
}

/** addr→u64 map → BCS balance rows (addr, amount). */
function toBalanceRows(map: AddressU64Map): { addr: string; amount: bigint }[] {
  return Object.entries(map ?? {}).map(([addr, amount]) => ({
    addr: normalizeSuiAddress(addr),
    amount: toBig(amount),
  }));
}

/**
 * `roleTaxTable` is captured raw as `Record<roleIndex, RoleTaxConfig>` where each
 * value is the on-chain `{ wts_pct, wtb_pct, de_flat_fee }` struct (strings via RPC).
 * Normalize into the typed BCS row shape, sorted by role for determinism.
 */
function toRoleTaxRows(
  table: Record<string, unknown>,
): { role: number; wts_pct: bigint; wtb_pct: bigint; de_flat_fee: bigint }[] {
  const rows: { role: number; wts_pct: bigint; wtb_pct: bigint; de_flat_fee: bigint }[] = [];
  for (const [k, v] of Object.entries(table ?? {})) {
    const role = Number(k);
    if (!Number.isInteger(role) || role < 0 || role > 255) continue;
    const cfg = (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
    // Some RPC shapes nest the struct under `.fields`.
    const f = (cfg.fields && typeof cfg.fields === "object" ? (cfg.fields as Record<string, unknown>) : cfg);
    rows.push({
      role,
      wts_pct: toBig(f.wts_pct),
      wtb_pct: toBig(f.wtb_pct),
      de_flat_fee: toBig(f.de_flat_fee),
    });
  }
  rows.sort((a, b) => a.role - b.role);
  return rows;
}

/** `shopLimitsByRole` is `Record<roleIndex, limit>` → typed BCS rows, sorted. */
function toShopLimitRows(table: Record<string, string>): { role: number; limit: bigint }[] {
  const rows: { role: number; limit: bigint }[] = [];
  for (const [k, v] of Object.entries(table ?? {})) {
    const role = Number(k);
    if (!Number.isInteger(role) || role < 0 || role > 255) continue;
    rows.push({ role, limit: toBig(v) });
  }
  rows.sort((a, b) => a.role - b.role);
  return rows;
}

/** Serialize a sub-vector to a raw byte array (the inner blob carried by a vector<u8> field). */
function roleTaxBlob(table: Record<string, unknown>): number[] {
  return Array.from(bcs.vector(RoleTaxRowBcs).serialize(toRoleTaxRows(table)).toBytes());
}
function shopLimitsBlob(table: Record<string, string>): number[] {
  return Array.from(bcs.vector(ShopLimitRowBcs).serialize(toShopLimitRows(table)).toBytes());
}

// ──────────────────────────────── sub_id helpers ───────────────────────────────

/** SSU sub_id = `sui::address::to_u256(ssu_id)` — the 32-byte address read big-endian. */
export function ssuSubId(ssuId: string): bigint {
  return BigInt(normalizeSuiAddress(ssuId));
}

/** TRIBE sub_id = `original_tribe_id as u256` (the tribe id widened). */
export function tribeSubId(tribeId: number | bigint): bigint {
  return BigInt(tribeId);
}

// ──────────────────────────────── encoders ─────────────────────────────────────

/** Encode the full SSUOwnerPayload (§6.4) from an `SsuSnapshot`. */
export function encodeSsuOwnerPayload(ssu: SsuSnapshot): Uint8Array {
  return SSUOwnerPayloadBcs.serialize({
    original_ssu_id: normalizeSuiAddress(ssu.ssuId),
    url_slug: "",                                  // no snapshot source; informational + chain-skipped
    bazaar_type: ssu.bazaarType,
    original_tribe_id: BigInt(ssu.tribeId),
    godot_url: ssu.godotUrl ?? "",
    role_tax_table_blob: roleTaxBlob(ssu.roleTaxTable),
    shop_limits_blob: shopLimitsBlob(ssu.shopLimitsByRole),
    mission_listing_fee_per_hour: 0n,              // not captured in the v2.0 snapshot → 0
    members: ssu.members.map((m) => ({
      player: normalizeSuiAddress(m.address),
      ssu_role: m.ssuRole,
      tribe_role: m.tribeRole,
      is_banned: m.isBanned,
    })),
    local_ban_list: toBanRows(ssu.localBanList),
    ssu_eve_mist_at_snapshot: toBig(ssu.taxWalletEveMist),
  }).toBytes();
}

/** Encode the full TribeLeaderPayload (§6.4) from a `TribeSnapshot`. */
export function encodeTribeLeaderPayload(tribe: TribeSnapshot): Uint8Array {
  return TribeLeaderPayloadBcs.serialize({
    original_tribe_id: BigInt(tribe.tribeId),
    name: tribe.name ?? "",
    bazaar_type: tribe.bazaarType,
    token_name: tribe.tokenName ?? "",
    token_symbol: tribe.tokenSymbol ?? "",
    token_decimals: tribe.tokenDecimals ?? 0,
    token_supply_cap: toBig(tribe.tokenSupplyCap),
    original_total_supply: toBig(tribe.tokenTotalSupply),
    role_tax_table_blob: [],                       // no tribe role-tax in the v2.0 snapshot → empty
    mission_listing_fee_per_hour: 0n,              // not captured → 0
    global_bans: toBanRows(tribe.globalBans),
    token_balances: toBalanceRows(tribe.tokenBalances),
    gov_eve_mist_at_snapshot: toBig(tribe.tribeGovTaxWalletEveMist),
    vault_eve_mist_at_snapshot: toBig(tribe.tribeVaultEveMist),
  }).toBytes();
}

// ──────────────────────── snapshot → reclaim record rows ────────────────────────

/** One ReclaimRegistry row to populate (parallel-vector element). */
export interface ReclaimRecordRow {
  holder: string;         // wallet that will reclaim (SSU owner / tribe leader)
  recordType: number;     // 0 = SSU_OWNER, 1 = TRIBE_LEADER
  subId: bigint;          // u256: SSU = to_u256(ssu_id); TRIBE = tribe_id
  payloadBlob: Uint8Array;
  label: string;          // human label for the populate-tool review table
}

export interface SnapshotRecordsResult {
  records: ReclaimRecordRow[];
  ssuCount: number;
  tribeCount: number;
  skipped: string[];      // rows omitted (malformed) — surfaced in the UI
}

/**
 * Build the full record set from a verified snapshot: one SSU_OWNER per SSU and
 * one TRIBE_LEADER per Easy/Advanced tribe. Order = tribes first then SSUs (the
 * admin populates a single registry; reclaim ordering is enforced on-chain via the
 * tribe-remap, not by populate order). Malformed rows (missing owner/leader, bad
 * bazaar_type) are skipped + reported rather than aborting the whole batch.
 */
export function snapshotToReclaimRecords(snapshot: BazaarSnapshot): SnapshotRecordsResult {
  const records: ReclaimRecordRow[] = [];
  const skipped: string[] = [];

  // Tribe records (only Easy=1 / Advanced=2; the on-chain decode aborts otherwise).
  let tribeCount = 0;
  for (const t of snapshot.tribes ?? []) {
    if (t.bazaarType !== 1 && t.bazaarType !== 2) {
      skipped.push(`Tribe #${t.tribeId}: bazaar_type ${t.bazaarType} not Easy/Advanced`);
      continue;
    }
    if (!t.leaderAddress) {
      skipped.push(`Tribe #${t.tribeId}: no leader address`);
      continue;
    }
    records.push({
      holder: normalizeSuiAddress(t.leaderAddress),
      recordType: RECORD_TYPE_TRIBE_LEADER,
      subId: tribeSubId(t.tribeId),
      payloadBlob: encodeTribeLeaderPayload(t),
      label: `Tribe #${t.tribeId} (${t.bazaarType === 2 ? "Advanced" : "Easy"})`,
    });
    tribeCount += 1;
  }

  // SSU records.
  let ssuCount = 0;
  for (const s of snapshot.ssus ?? []) {
    if (!s.ownerAddress) {
      skipped.push(`SSU ${s.ssuId}: no owner address`);
      continue;
    }
    records.push({
      holder: normalizeSuiAddress(s.ownerAddress),
      recordType: RECORD_TYPE_SSU_OWNER,
      subId: ssuSubId(s.ssuId),
      payloadBlob: encodeSsuOwnerPayload(s),
      label: `SSU ${s.ssuId.slice(0, 10)}… (${["NoTribe", "Easy", "Advanced"][s.bazaarType] ?? "?"})`,
    });
    ssuCount += 1;
  }

  return { records, ssuCount, tribeCount, skipped };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
