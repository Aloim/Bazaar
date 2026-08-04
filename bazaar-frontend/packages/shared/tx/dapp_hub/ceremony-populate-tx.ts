// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Update Ceremony V2 — Phase 2 (Slice 4): ReclaimRegistry populate TX builder.
 *
 * `buildPopulateReclaimRegistry` targets `dapp_hub::reclaim_registry::
 * populate_reclaim_registry` (DAppOwnerCap-gated). The admin assembles records
 * from the verified snapshot (`snapshotToReclaimRecords`) and pages them through
 * (the entry asserts 1..=MAX_BATCH_ROWS = 100; idempotent + replay-safe — it skips
 * keys already live OR already in the permanent `consumed` table, so re-running a
 * partial batch is safe).
 *
 * Vectors are serialized explicitly via `@mysten/sui/bcs` (version-robust; the
 * four parallel vectors must be byte-exact: address / u8 / u256 / vector<u8>).
 *
 * DappHub is EXEMPT from `useGatedTransaction` — the admin signs via dAppKit
 * directly. Mirrors the canonical `(params, tx?) → Transaction` builder shape.
 *
 * GATING: callers MUST check `reclaimEnabled()` before building — with an empty
 * `RECLAIM_REGISTRY_ID` the registry object arg would resolve to `0x0 not found`.
 */

import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { PACKAGE_IDS, MODULES, RECLAIM_REGISTRY_ID, SUI_CLOCK_ID } from "../../constants";
import type { ReclaimRecordRow } from "../../ceremony/reclaim/payloads";

/** Default record retention (365 days). Long enough to outlast the ceremony window. */
export const DEFAULT_RECLAIM_RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 31_536_000_000

/** FE page size — the Move cap is 100; 50 keeps tx size + gas comfortable. */
export const RECLAIM_POPULATE_PAGE_SIZE = 50;

export interface PopulateReclaimParams {
  ownerCapId: string;
  reclaimRegistryId?: string;
  holders: string[];          // wallet that will reclaim (SSU owner / tribe leader)
  recordTypes: number[];      // 0 = SSU_OWNER, 1 = TRIBE_LEADER
  subIds: bigint[];           // u256: SSU = to_u256(ssu_id); TRIBE = tribe_id
  payloadBlobs: Uint8Array[]; // BCS-encoded per record type
  backupAnchorId: number | bigint;   // AnchorRegistry row id on the OUTGOING version
  defaultRetentionMs?: number | bigint;
}

/**
 * Build ONE `populate_reclaim_registry` call. The four data vectors MUST be equal
 * length (the entry asserts `E_LEN_MISMATCH`) and 1..=100 rows.
 *
 * Move: dapp_hub::reclaim_registry::populate_reclaim_registry
 * Sig:  (_cap, registry, holders: vector<address>, record_types: vector<u8>,
 *        sub_ids: vector<u256>, payload_blobs: vector<vector<u8>>,
 *        backup_anchor_id: u64, default_retention_ms: u64, clock, ctx)
 */
export function buildPopulateReclaimRegistry(
  params: PopulateReclaimParams,
  tx: Transaction = new Transaction(),
): Transaction {
  const retention = params.defaultRetentionMs ?? DEFAULT_RECLAIM_RETENTION_MS;
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.RECLAIM_REGISTRY}::populate_reclaim_registry`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.reclaimRegistryId ?? RECLAIM_REGISTRY_ID),
      tx.pure(bcs.vector(bcs.Address).serialize(params.holders).toBytes()),
      tx.pure(bcs.vector(bcs.u8()).serialize(params.recordTypes).toBytes()),
      tx.pure(bcs.vector(bcs.u256()).serialize(params.subIds).toBytes()),
      tx.pure(
        bcs.vector(bcs.vector(bcs.u8()))
          .serialize(params.payloadBlobs.map((b) => Array.from(b)))
          .toBytes(),
      ),
      tx.pure.u64(BigInt(params.backupAnchorId)),
      tx.pure.u64(BigInt(retention)),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export interface PopulatePage {
  /** 0-based page index. */
  index: number;
  /** The record rows in this page (for the UI review/progress table). */
  rows: ReclaimRecordRow[];
  /** A ready-to-sign single-call Transaction for this page. */
  tx: Transaction;
}

/**
 * Split a full record set into signed pages of `pageSize` rows (≤ Move cap of 100).
 * Each page is one `populate_reclaim_registry` call. The admin signs them
 * sequentially; the entry is idempotent so a retried/partial page is safe.
 */
export function buildPopulateReclaimRegistryPages(
  records: ReclaimRecordRow[],
  opts: {
    ownerCapId: string;
    backupAnchorId: number | bigint;
    reclaimRegistryId?: string;
    defaultRetentionMs?: number | bigint;
    pageSize?: number;
  },
): PopulatePage[] {
  const size = Math.min(Math.max(1, opts.pageSize ?? RECLAIM_POPULATE_PAGE_SIZE), 100);
  const pages: PopulatePage[] = [];
  for (let i = 0; i < records.length; i += size) {
    const rows = records.slice(i, i + size);
    const tx = buildPopulateReclaimRegistry({
      ownerCapId: opts.ownerCapId,
      reclaimRegistryId: opts.reclaimRegistryId,
      holders: rows.map((r) => r.holder),
      recordTypes: rows.map((r) => r.recordType),
      subIds: rows.map((r) => r.subId),
      payloadBlobs: rows.map((r) => r.payloadBlob),
      backupAnchorId: opts.backupAnchorId,
      defaultRetentionMs: opts.defaultRetentionMs,
    });
    pages.push({ index: pages.length, rows, tx });
  }
  return pages;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
