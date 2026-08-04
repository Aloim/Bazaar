// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * reclaim-ssu-abi.test.ts — pins the SSU reclaim builders against the landed
 * bazaar_mission::reclaim_ssu two-PTB ABIs + the lazy-drain composition.
 *
 * shell:   (reclaim_registry, ssu_registry, owner_cap, target_ssu_id, package_id, clock, ctx)
 * restore: (owner_cap, gov, registry, eve_coin, godot_url_bytes, mission_fee,
 *           member_players, member_ssu_roles, member_is_banned, ban_addrs, ban_expiries, clock, ctx)
 */

import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { ID, CLOCK, lastCall, callByTarget, describeCalls, expectArgs } from "./abi-snapshot-helpers";
import { SSUOwnerPayloadBcs } from "../../ceremony/reclaim/payloads";
import {
  buildReclaimSsuShell,
  buildReclaimSsuRestore,
  decodeSsuOwnerPayload,
} from "../bazaarmission/reclaim-ssu-tx";

const REG = ID(0xc1), SSUREG = ID(0x55), CAP = ID(0x0a);
const GOV = ID(0x6a), MEMREG = ID(0x6b), CORE = ID(0xc0);

// A minimal SSUOwnerPayload: 1 member, 2 local bans (one expired, one live at nowMs=5000).
const SSU_BLOB = SSUOwnerPayloadBcs.serialize({
  original_ssu_id: ID(0x5511),
  url_slug: "acme",
  bazaar_type: 1,
  original_tribe_id: 7n,
  godot_url: "https://x/",
  role_tax_table_blob: [],
  shop_limits_blob: [],
  mission_listing_fee_per_hour: 42n,
  members: [{ player: ID(0xaa), ssu_role: 5, tribe_role: 2, is_banned: false }],
  local_ban_list: [
    { addr: ID(0xbb), expires_at_ms: 1000n },             // expired @ now=5000 → filtered
    { addr: ID(0xcc), expires_at_ms: 9_000_000_000_000n },// live → kept
  ],
  ssu_eve_mist_at_snapshot: 0n,
}).toBytes();

describe("buildReclaimSsuShell ABI", () => {
  it("emits reclaim_ssu_shell with the exact ordered arg vector", () => {
    const tx = buildReclaimSsuShell({
      ownerCapId: CAP, targetSsuId: ID(0x5511),
      reclaimRegistryId: REG, ssuRegistryId: SSUREG, packageId: CORE,
    });
    const call = lastCall(tx);
    expect(call.target).toMatch(/reclaim_ssu::reclaim_ssu_shell$/);
    expectArgs(call.args, [REG, SSUREG, CAP, "pure", "pure", CLOCK]);
  });
});

describe("buildReclaimSsuRestore ABI", () => {
  it("deposits a fresh coin::zero when no drain is supplied", () => {
    const tx = buildReclaimSsuRestore({
      ssuOwnerCapId: CAP, ssuGovId: GOV, memberRegistryId: MEMREG,
      payloadBlob: SSU_BLOB, nowMs: 5000,
    });
    const targets = describeCalls(tx).map((c) => c.target);
    expect(targets).toContain("coin::zero");
    const restore = callByTarget(tx, "reclaim_ssu::reclaim_ssu_restore");
    expectArgs(restore.args, [
      CAP, GOV, MEMREG,
      "result",                                  // eve_coin = coin::zero result
      "pure", "pure",                            // godot_url_bytes, mission_fee
      "pure", "pure", "pure",                    // players, roles, is_banned
      "pure", "pure",                            // ban_addrs, ban_expiries
      CLOCK,
    ]);
  });

  it("composes OLD ssu drain + WTB residual → merged coin → restore", () => {
    const tx = buildReclaimSsuRestore({
      ssuOwnerCapId: CAP, ssuGovId: GOV, memberRegistryId: MEMREG,
      payloadBlob: SSU_BLOB, nowMs: 5000,
      drain: {
        oldSsuOwnerCapId: ID(0xd1), oldSsuGovId: ID(0xd2), outgoingBazaarCorePkg: ID(0xc0),
        wtb: { oldWtbPoolId: ID(0xd3), oldBazarRegistryId: ID(0xd4), shopIds: [ID(0xe1), ID(0xe2)] },
      },
    });
    const targets = describeCalls(tx).map((c) => c.target);
    expect(targets).toContain("ssu_admin_drain::withdraw_legacy_ssu_eve");
    expect(targets).toContain("wtb_escrow_pool::withdraw_legacy_wtb_pool_residual");
    expect(targets).not.toContain("coin::zero");

    const drain = callByTarget(tx, "ssu_admin_drain::withdraw_legacy_ssu_eve");
    expectArgs(drain.args, [ID(0xd1), ID(0xd2), CLOCK]);
    const wtb = callByTarget(tx, "wtb_escrow_pool::withdraw_legacy_wtb_pool_residual");
    expectArgs(wtb.args, [ID(0xd3), ID(0xd4), "pure", CLOCK]);

    const restore = callByTarget(tx, "reclaim_ssu::reclaim_ssu_restore");
    expect(restore.args[3]).toBe("result"); // eve_coin = the drained+merged coin
  });

  it("can append to an existing PTB (tx passthrough)", () => {
    const tx = new Transaction();
    const out = buildReclaimSsuRestore(
      { ssuOwnerCapId: CAP, ssuGovId: GOV, memberRegistryId: MEMREG, payloadBlob: SSU_BLOB, nowMs: 0 },
      tx,
    );
    expect(out).toBe(tx);
  });
});

describe("decodeSsuOwnerPayload", () => {
  it("round-trips the binding header + restore args", () => {
    const d = decodeSsuOwnerPayload(SSU_BLOB);
    expect(d.originalSsuId).toMatch(/0*5511$/);
    expect(d.bazaarType).toBe(1);
    expect(d.originalTribeId).toBe(7n);
    expect(d.godotUrl).toBe("https://x/");
    expect(d.missionListingFeePerHour).toBe(42n);
    expect(d.members).toHaveLength(1);
    expect(d.members[0].ssuRole).toBe(5);
    expect(d.localBanList).toHaveLength(2);
    expect(d.localBanList[0].expiresAtMs).toBe(1000n);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
