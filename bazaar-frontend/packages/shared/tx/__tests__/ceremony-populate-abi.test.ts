// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ceremony-populate-abi.test.ts — pins the populate builder against
 * dapp_hub::reclaim_registry::populate_reclaim_registry and the paging helper.
 *
 * Sig: (_cap, registry, holders: vector<address>, record_types: vector<u8>,
 *       sub_ids: vector<u256>, payload_blobs: vector<vector<u8>>,
 *       backup_anchor_id: u64, default_retention_ms: u64, clock, ctx)
 */

import { describe, it, expect } from "vitest";
import { ID, CLOCK, lastCall, expectArgs } from "./abi-snapshot-helpers";
import {
  buildPopulateReclaimRegistry,
  buildPopulateReclaimRegistryPages,
  RECLAIM_POPULATE_PAGE_SIZE,
} from "../dapp_hub/ceremony-populate-tx";
import type { ReclaimRecordRow } from "../../ceremony/reclaim/payloads";

const OWNER = ID(0x5e), REG = ID(0xc1);

function mkRow(i: number): ReclaimRecordRow {
  return {
    holder: ID(0xb0 + (i % 8)),
    recordType: i % 2,
    subId: BigInt(i + 1),
    payloadBlob: new Uint8Array([i & 0xff, (i + 1) & 0xff]),
    label: `row ${i}`,
  };
}

describe("buildPopulateReclaimRegistry ABI", () => {
  it("emits the exact ordered arg vector", () => {
    const tx = buildPopulateReclaimRegistry({
      ownerCapId: OWNER,
      reclaimRegistryId: REG,
      holders: [ID(0xb1), ID(0xb2)],
      recordTypes: [0, 1],
      subIds: [0xa6n, 3n],
      payloadBlobs: [new Uint8Array([1, 2]), new Uint8Array([3])],
      backupAnchorId: 7,
    });
    const call = lastCall(tx);
    expect(call.target).toMatch(/reclaim_registry::populate_reclaim_registry$/);
    expectArgs(call.args, [
      OWNER, REG,
      "pure", "pure", "pure", "pure", // holders, record_types, sub_ids, payload_blobs
      "pure", "pure",                 // backup_anchor_id, default_retention_ms
      CLOCK,
    ]);
  });
});

describe("buildPopulateReclaimRegistryPages", () => {
  it("splits records into pages of <= pageSize, one populate call each", () => {
    const records = Array.from({ length: 120 }, (_, i) => mkRow(i));
    const pages = buildPopulateReclaimRegistryPages(records, {
      ownerCapId: OWNER,
      backupAnchorId: 7,
      reclaimRegistryId: REG,
    });
    expect(pages.length).toBe(Math.ceil(120 / RECLAIM_POPULATE_PAGE_SIZE)); // 3 at size 50
    expect(pages.map((p) => p.rows.length)).toEqual([50, 50, 20]);
    pages.forEach((p, i) => {
      expect(p.index).toBe(i);
      expect(lastCall(p.tx).target).toMatch(/populate_reclaim_registry$/);
    });
  });

  it("clamps an oversized pageSize to the Move cap of 100", () => {
    const records = Array.from({ length: 250 }, (_, i) => mkRow(i));
    const pages = buildPopulateReclaimRegistryPages(records, {
      ownerCapId: OWNER, backupAnchorId: 1, reclaimRegistryId: REG, pageSize: 500,
    });
    expect(pages.map((p) => p.rows.length)).toEqual([100, 100, 50]);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
